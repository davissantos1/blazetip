import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  buildOpReturnBytecode,
  extractOpReturnFromTxHex,
  extractPaymentInfoFromTxHex,
  addressToScripthash,
} from './fulcrum';
import { encodeTransactionBCH, binToHex } from '@bitauth/libauth';
import { FulcrumClient } from './fulcrum';

class FakeWebSocket {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Array<Record<string, unknown>> = [];

  constructor(_url: string) {
    queueMicrotask(() => this.onopen?.());
  }

  send(raw: string) {
    const request = JSON.parse(raw);
    this.sent.push(request);
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: request.id, result: 'initial' }) }));
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  notify(scripthash: string, status: string) {
    this.onmessage?.({
      data: JSON.stringify({ method: 'blockchain.scripthash.subscribe', params: [scripthash, status] }),
    });
  }
}

const originalWebSocket = globalThis.WebSocket;
afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  vi.restoreAllMocks();
});

describe('FulcrumClient subscriptions', () => {
  it('shares one in-flight connection across concurrent requests', async () => {
    const sockets: FakeWebSocket[] = [];
    globalThis.WebSocket = class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;

    const client = new FulcrumClient('chipnet');
    await Promise.all([client.connect(), client.connect(), client.connect()]);
    expect(sockets).toHaveLength(1);
    client.disconnect();
  });

  it('keeps same-address listeners independent and removes only the requested listener', async () => {
    const sockets: FakeWebSocket[] = [];
    globalThis.WebSocket = class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;

    const client = new FulcrumClient('chipnet');
    const first = vi.fn();
    const second = vi.fn();
    const address = 'bitcoincash:qqrswpc8qurswpc8qurswpc8qurswpc8qutdt3aw7w';
    const { scripthash } = await addressToScripthash(address);

    await Promise.all([
      client.subscribeAddress(address, first),
      client.subscribeAddress(address, second),
    ]);
    sockets[0].notify(scripthash, 'updated');
    expect(first).toHaveBeenLastCalledWith('updated');
    expect(second).toHaveBeenLastCalledWith('updated');

    await client.unsubscribeAddress(address, first);
    expect(sockets[0].sent.some((request) => request.method === 'blockchain.scripthash.unsubscribe')).toBe(false);
    sockets[0].notify(scripthash, 'updated-again');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith('updated-again');

    await client.unsubscribeAddress(address, second);
    expect(sockets[0].sent.filter((request) => request.method === 'blockchain.scripthash.unsubscribe')).toHaveLength(1);
    client.disconnect();
  });
});

describe('buildOpReturnBytecode', () => {
  it('builds OP_RETURN + pushdata + "BLAZE:" prefix for short memos', () => {
    const bc = buildOpReturnBytecode('hi');
    // OP_RETURN (0x6a), push length 8 ("BLAZE:hi"), payload
    expect(bc[0]).toBe(0x6a);
    expect(bc[1]).toBe(8);
    expect(Array.from(bc.slice(2))).toEqual(Array.from(new TextEncoder().encode('BLAZE:hi')));
    expect(bc).toHaveLength(10);
  });

  it('uses OP_PUSHDATA1 when the payload exceeds 75 bytes', () => {
    const memo = 'x'.repeat(80);
    const bc = buildOpReturnBytecode(memo);
    expect(bc[0]).toBe(0x6a);
    expect(bc[1]).toBe(0x4c);
    expect(bc[2]).toBe(6 + 80); // "BLAZE:" + 80 chars
  });

  it('caps the UTF-8 payload at 223 bytes without splitting multibyte characters', () => {
    const bc = buildOpReturnBytecode('y'.repeat(500));
    const payloadLength = bc[1] === 0x4c ? bc[2] : bc[1];
    expect(payloadLength).toBe(223);
    expect(bc).toHaveLength(226);
    const emojiBc = buildOpReturnBytecode('😀'.repeat(100));
    const start = emojiBc[1] === 0x4c ? 3 : 2;
    const byteLength = emojiBc[1] === 0x4c ? emojiBc[2] : emojiBc[1];
    expect(byteLength).toBeLessThanOrEqual(223);
    expect(new TextDecoder().decode(emojiBc.slice(start))).toBe(`BLAZE:${'😀'.repeat(54)}`);
  });
});

describe('extractOpReturnFromTxHex', () => {
  it('round-trips a memo through a serialized transaction', () => {
    const memoBc = buildOpReturnBytecode('Round trip test');
    const tx = {
      version: 2,
      locktime: 0,
      inputs: [
        {
          outpointTransactionHash: new Uint8Array(32).fill(1),
          outpointIndex: 0,
          unlockingBytecode: new Uint8Array(0),
        },
      ],
      outputs: [
        { lockingBytecode: new Uint8Array([0x76, 0xa9, 0x88, 0xac]), valueSatoshis: 1000n },
        { lockingBytecode: memoBc, valueSatoshis: 0n },
      ],
    };
    const encoded = encodeTransactionBCH(tx as never);
    expect(encoded).toBeInstanceOf(Uint8Array);
    const { memo, totalOutputSats } = extractOpReturnFromTxHex(binToHex(encoded as Uint8Array));
    expect(memo).toBe('Round trip test');
    expect(totalOutputSats).toBe(1000);
  });

  it('returns an empty result for undecodable hex', () => {
    expect(extractOpReturnFromTxHex('zzzz')).toEqual({ totalOutputSats: 0 });
  });
});

describe('extractPaymentInfoFromTxHex', () => {
  // Distinct P2PKH-shaped locking bytecodes so the target check is meaningful.
  const p2pkh = (fill: number) =>
    new Uint8Array([0x76, 0xa9, 0x14, ...new Array(20).fill(fill), 0x88, 0xac]);

  function encodeTx(outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint }>) {
    const tx = {
      version: 2,
      locktime: 0,
      inputs: [
        {
          outpointTransactionHash: new Uint8Array(32).fill(1),
          outpointIndex: 0,
          unlockingBytecode: new Uint8Array(0),
        },
      ],
      outputs,
    };
    return binToHex(encodeTransactionBCH(tx as never) as Uint8Array);
  }

  const creator = p2pkh(0xab);
  const change = p2pkh(0xcd);

  it('counts only outputs paid to the target address (not the sender change)', () => {
    const hex = encodeTx([
      { lockingBytecode: creator, valueSatoshis: 1000n },
      { lockingBytecode: change, valueSatoshis: 5000n },
    ]);
    const info = extractPaymentInfoFromTxHex(hex, creator);
    expect(info.receivedSats).toBe(1000);
    expect(info.totalOutputSats).toBe(6000);
  });

  it('sums multiple outputs to the target address', () => {
    const hex = encodeTx([
      { lockingBytecode: creator, valueSatoshis: 1000n },
      { lockingBytecode: creator, valueSatoshis: 750n },
      { lockingBytecode: change, valueSatoshis: 5000n },
    ]);
    expect(extractPaymentInfoFromTxHex(hex, creator).receivedSats).toBe(1750);
  });

  it('extracts the BLAZE memo alongside the received amount', () => {
    const hex = encodeTx([
      { lockingBytecode: creator, valueSatoshis: 2000n },
      { lockingBytecode: buildOpReturnBytecode('nice work'), valueSatoshis: 0n },
    ]);
    const info = extractPaymentInfoFromTxHex(hex, creator);
    expect(info.memo).toBe('nice work');
    expect(info.receivedSats).toBe(2000);
  });

  it('does not present unrelated OP_RETURN payloads as supporter memos', () => {
    const unrelated = new Uint8Array([0x6a, 0x05, ...new TextEncoder().encode('hello')]);
    const hex = encodeTx([
      { lockingBytecode: creator, valueSatoshis: 2000n },
      { lockingBytecode: unrelated, valueSatoshis: 0n },
    ]);
    expect(extractPaymentInfoFromTxHex(hex, creator)).toMatchObject({
      receivedSats: 2000,
      totalOutputSats: 2000,
    });
    expect(extractPaymentInfoFromTxHex(hex, creator).memo).toBeUndefined();
  });

  it('reports 0 received for an outgoing tx with no output to the address', () => {
    const hex = encodeTx([{ lockingBytecode: change, valueSatoshis: 900n }]);
    expect(extractPaymentInfoFromTxHex(hex, creator).receivedSats).toBe(0);
  });

  it('reports 0 received when no target locking bytecode is given', () => {
    const hex = encodeTx([{ lockingBytecode: creator, valueSatoshis: 1000n }]);
    expect(extractPaymentInfoFromTxHex(hex).receivedSats).toBe(0);
  });

  it('returns zeros for undecodable hex', () => {
    expect(extractPaymentInfoFromTxHex('zzzz', creator)).toEqual({
      receivedSats: 0,
      totalOutputSats: 0,
    });
  });
});

describe('addressToScripthash', () => {
  it('derives a deterministic 64-char hex scripthash', async () => {
    // Deterministic test address: cashaddr P2PKH over hash160 = 20 × 0x07.
    const a = await addressToScripthash('bitcoincash:qqrswpc8qurswpc8qurswpc8qurswpc8qutdt3aw7w');
    const b = await addressToScripthash('bitcoincash:qqrswpc8qurswpc8qurswpc8qurswpc8qutdt3aw7w');
    expect(a.scripthash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.scripthash).toBe(b.scripthash);
  });

  it('throws for invalid addresses', async () => {
    await expect(addressToScripthash('bitcoincash:notvalid')).rejects.toThrow('Invalid BCH address');
  });
});
