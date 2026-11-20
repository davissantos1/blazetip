import {
  cashAddressToLockingBytecode,
  encodeTransactionBCH,
  decodeTransactionBCH,
  binToHex,
  hexToBin,
} from '@bitauth/libauth';
import { NetworkType, OnChainTx } from '../types';

const ENDPOINTS: Record<NetworkType, string[]> = {
  mainnet: [
    'wss://bch.imaginary.cash:50004',
    'wss://fulcrum.greyh.at:50004',
  ],
  chipnet: [
    'wss://chipnet.imaginary.cash:50004',
  ],
};

export async function addressToScripthash(address: string): Promise<{ scripthash: string; lockingBytecode: Uint8Array }> {
  const clean = address.includes(':') ? address : `bitcoincash:${address}`;
  const decoded = cashAddressToLockingBytecode(clean);
  if (typeof decoded === 'string') {
    throw new Error(`Invalid BCH address: ${decoded}`);
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', decoded.bytecode as unknown as BufferSource);
  const reversed = new Uint8Array(hashBuffer).reverse();
  return {
    scripthash: binToHex(reversed),
    lockingBytecode: decoded.bytecode,
  };
}

export function buildOpReturnBytecode(memo: string): Uint8Array {
  const encoder = new TextEncoder();
  const prefix = encoder.encode('BLAZE:');
  // Keep the complete OP_RETURN push within the commonly relayed 223-byte
  // data-carrier limit, truncating by UTF-8 bytes without splitting a codepoint.
  const maxPayloadBytes = 223;
  const textParts: Uint8Array[] = [];
  let textLength = 0;
  for (const character of memo) {
    const bytes = encoder.encode(character);
    if (prefix.length + textLength + bytes.length > maxPayloadBytes) break;
    textParts.push(bytes);
    textLength += bytes.length;
  }
  const textBytes = new Uint8Array(textLength);
  let offset = 0;
  for (const part of textParts) {
    textBytes.set(part, offset);
    offset += part.length;
  }
  const payload = new Uint8Array(prefix.length + textBytes.length);
  payload.set(prefix, 0);
  payload.set(textBytes, prefix.length);

  // OP_RETURN (0x6a) + pushdata length
  if (payload.length < 76) {
    const out = new Uint8Array(2 + payload.length);
    out[0] = 0x6a;
    out[1] = payload.length;
    out.set(payload, 2);
    return out;
  } else {
    const out = new Uint8Array(3 + payload.length);
    out[0] = 0x6a;
    out[1] = 0x4c; // OP_PUSHDATA1
    out[2] = payload.length;
    out.set(payload, 3);
    return out;
  }
}

function byteArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export interface PaymentInfo {
  memo?: string;
  /**
   * Satoshis actually paid TO the target locking bytecode in this transaction.
   * This excludes the sender's change and any other outputs, so the supporter
   * wall never reports an inflated tip amount. 0 for outgoing transactions.
   */
  receivedSats: number;
  /** Sum of every output value (kept for diagnostics only). */
  totalOutputSats: number;
}

/**
 * Decodes a raw transaction and reports the value received by a specific
 * locking bytecode (the creator's address) plus any `BLAZE:` OP_RETURN memo.
 * When no target locking bytecode is given, `receivedSats` stays 0.
 */
export function extractPaymentInfoFromTxHex(
  txHex: string,
  targetLockingBytecode?: Uint8Array
): PaymentInfo {
  try {
    const decoded = decodeTransactionBCH(hexToBin(txHex));
    if (typeof decoded === 'string') return { receivedSats: 0, totalOutputSats: 0 };
    let memo: string | undefined;
    let receivedSats = 0;
    let totalOutputSats = 0;

    for (const out of decoded.outputs) {
      const value = Number(out.valueSatoshis);
      totalOutputSats += value;
      const bc = out.lockingBytecode;
      if (targetLockingBytecode && byteArraysEqual(bc, targetLockingBytecode)) {
        receivedSats += value;
      }
      if (bc.length > 2 && bc[0] === 0x6a) {
        const opcode = bc[1];
        const start = opcode < 0x4c ? 2 : opcode === 0x4c ? 3 : opcode === 0x4d ? 4 : -1;
        if (start < 0 || start > bc.length) continue;
        const length = opcode < 0x4c ? opcode : opcode === 0x4c ? bc[2] : bc[2] + (bc[3] << 8);
        if (start + length > bc.length) continue;
        const text = new TextDecoder().decode(bc.slice(start, start + length));
        // Only display memos created by this app. Arbitrary OP_RETURN data is
        // not a supporter note and may contain binary/non-user-facing payloads.
        if (text.startsWith('BLAZE:')) memo = text.slice(6);
      }
    }
    return { memo, receivedSats, totalOutputSats };
  } catch {
    return { receivedSats: 0, totalOutputSats: 0 };
  }
}

/** Backwards-compatible wrapper: memo + total output value of a transaction. */
export function extractOpReturnFromTxHex(txHex: string): { memo?: string; totalOutputSats: number } {
  const { memo, totalOutputSats } = extractPaymentInfoFromTxHex(txHex);
  return { memo, totalOutputSats };
}

export class FulcrumClient {
  private ws: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private network: NetworkType;
  private reqId = 1;
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private subscriptions = new Map<string, Set<(status: string | null) => void>>();
  public connectedUrl: string | null = null;
  public latencyMs: number | null = null;

  constructor(network: NetworkType = 'mainnet') {
    this.network = network;
  }

  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectionPromise) return this.connectionPromise;
    this.connectionPromise = this.connectToAvailableUrl().finally(() => {
      this.connectionPromise = null;
    });
    return this.connectionPromise;
  }

  private async connectToAvailableUrl(): Promise<void> {
    const urls = ENDPOINTS[this.network];
    for (const url of urls) {
      try {
        await this.connectToUrl(url);
        return;
      } catch (err) {
        console.warn(`Fulcrum connection failed for ${url}:`, err);
      }
    }
    throw new Error('Could not connect to any Fulcrum Electrum server');
  }

  private connectToUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout'));
      }, 4500);

      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        this.connectedUrl = url;
        this.latencyMs = Math.round(performance.now() - start);
        resolve();
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.pending.has(msg.id)) {
            const handler = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            if (msg.error) handler.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            else handler.resolve(msg.result);
          } else if (msg.method === 'blockchain.scripthash.subscribe' && Array.isArray(msg.params)) {
            const [scripthash, status] = msg.params;
            const callbacks = this.subscriptions.get(scripthash);
            callbacks?.forEach((callback) => callback(status));
          }
        } catch (e) {
          console.error('Fulcrum parse error:', e);
        }
      };

      ws.onclose = () => {
        // A stale socket closing must not clear a newer active connection.
        if (this.ws === ws) {
          this.ws = null;
          this.connectedUrl = null;
        }
      };
    });
  }

  async request<T = any>(method: string, params: any[] = []): Promise<T> {
    await this.connect();
    const id = this.reqId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 8000);

      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  async getAddressBalance(address: string): Promise<{ confirmed: number; unconfirmed: number }> {
    const { scripthash } = await addressToScripthash(address);
    return this.request('blockchain.scripthash.get_balance', [scripthash]);
  }

  async listUnspent(address: string): Promise<Array<{ tx_hash: string; tx_pos: number; value: number; height: number; token_data?: any }>> {
    const { scripthash } = await addressToScripthash(address);
    return this.request('blockchain.scripthash.listunspent', [scripthash]);
  }

  async getRecentTransactions(address: string, limit = 6): Promise<OnChainTx[]> {
    const { scripthash, lockingBytecode } = await addressToScripthash(address);
    const history: Array<{ tx_hash: string; height: number }> = await this.request(
      'blockchain.scripthash.get_history',
      [scripthash]
    );
    const recent = history.slice(-limit).reverse();
    const results: OnChainTx[] = [];

    for (const item of recent) {
      try {
        const rawHex: string = await this.request('blockchain.transaction.get', [item.tx_hash, false]);
        // Report only the value actually received by this address (a tip), so a
        // sender's change never inflates the amount shown to the creator.
        const { memo, receivedSats } = extractPaymentInfoFromTxHex(rawHex, lockingBytecode);
        results.push({
          txid: item.tx_hash,
          height: item.height,
          amountSats: receivedSats,
          memo,
        });
      } catch {
        results.push({
          txid: item.tx_hash,
          height: item.height,
        });
      }
    }
    return results;
  }

  async subscribeAddress(address: string, onUpdate: (status: string | null) => void): Promise<string | null> {
    const { scripthash } = await addressToScripthash(address);
    const callbacks = this.subscriptions.get(scripthash) ?? new Set();
    callbacks.add(onUpdate);
    this.subscriptions.set(scripthash, callbacks);
    return this.request('blockchain.scripthash.subscribe', [scripthash]);
  }

  async unsubscribeAddress(address: string, onUpdate: (status: string | null) => void): Promise<void> {
    const { scripthash } = await addressToScripthash(address);
    const callbacks = this.subscriptions.get(scripthash);
    callbacks?.delete(onUpdate);
    if (callbacks?.size) return;
    this.subscriptions.delete(scripthash);
    if (!this.ws) return;
    await this.request('blockchain.scripthash.unsubscribe', [scripthash]);
  }

  async broadcastTx(rawTxHex: string): Promise<string> {
    return this.request<string>('blockchain.transaction.broadcast', [rawTxHex]);
  }

  async getRawTransaction(txid: string): Promise<string> {
    return this.request<string>('blockchain.transaction.get', [txid, false]);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export { encodeTransactionBCH, hexToBin, binToHex };
