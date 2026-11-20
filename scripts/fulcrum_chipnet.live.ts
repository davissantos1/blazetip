import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'node:crypto';
import {
  FulcrumClient,
  addressToScripthash,
} from '../src/services/fulcrum';
import {
  decodeTransactionBCH,
  hexToBin,
  binToHex,
  lockingBytecodeToCashAddress,
} from '@bitauth/libauth';

/**
 * VALIDAÇÃO AO VIVO — Fulcrum Chipnet, SOMENTE LEITURA.
 * Não faz broadcast, não usa chave privada, não depende de carteira própria.
 * Usa apenas dados públicos da rede: transações mineradas de blocos recentes.
 * Executado manualmente: `npx vitest run --config scripts/vitest.live.config.ts`
 */

function sha256ReversedHex(bytes: Uint8Array): string {
  const h = crypto.createHash('sha256').update(bytes).digest();
  return binToHex(new Uint8Array(h.reverse()));
}

describe('Fulcrum Chipnet — validação ao vivo (read-only)', () => {
  const client = new FulcrumClient('chipnet');
  let tipHeight = 0;
  let derivedAddress: string | null = null;
  let directScripthash: string | null = null;

  it('conecta ao servidor público de Chipnet (wss://chipnet.imaginary.cash:50004)', async () => {
    await client.connect();
    expect(client.connectedUrl).toBe('wss://chipnet.imaginary.cash:50004');
    expect(client.latencyMs).not.toBeNull();
    const version = await client.request<[string, string]>('server.version', ['blazetip-probe', '1.4']);
    expect(version[0]).toContain('Fulcrum');
  }, 20000);

  it('assina headers e recebe a dica da blockchain (tip > 0)', async () => {
    const result = await client.request<{ height: number; hex: string }>('blockchain.headers.subscribe', []);
    expect(result).toBeTruthy();
    tipHeight = Number(result.height);
    expect(tipHeight).toBeGreaterThan(0);
    expect(typeof result.hex).toBe('string');
    expect(result.hex.length).toBeGreaterThanOrEqual(160);
  }, 20000);

  it('deriva endereço e scripthash a partir de um output real minerado', async () => {
    // Seleção resiliente: mineradores podem achar blocos durante a validação e
    // algumas transações têm só a coinbase. Varre alturas/posições recentes
    // procurando um output P2PKH/P2SH padrão em transação minerada.
    let rawHex: string | null = null;
    for (const height of [tipHeight - 1, tipHeight - 2, tipHeight - 3]) {
      for (const pos of [1, 0]) {
        try {
          const txid = await client.request<string>('blockchain.transaction.id_from_pos', [height, pos]);
          const hex = await client.getRawTransaction(txid);
          const decoded = decodeTransactionBCH(hexToBin(hex));
          if (typeof decoded === 'string') continue;
          const outputs = (decoded as { outputs: Array<{ lockingBytecode: Uint8Array }> }).outputs;
          if (
            outputs.some(
              (o) =>
                (o.lockingBytecode.length === 25 &&
                  o.lockingBytecode[0] === 0x76 &&
                  o.lockingBytecode[1] === 0xa9 &&
                  o.lockingBytecode[24] === 0xac) ||
                (o.lockingBytecode.length === 23 && o.lockingBytecode[0] === 0xa9)
            )
          ) {
            rawHex = hex;
            break;
          }
        } catch {
          // "No transaction at position N" — tenta a próxima posição/altura.
        }
      }
      if (rawHex) break;
    }
    expect(rawHex).toBeTruthy();
    const decoded = decodeTransactionBCH(hexToBin(rawHex!));
    expect(typeof decoded).not.toBe('string');
    const outputs = (decoded as { outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint }> }).outputs;
    const candidate = outputs.find(
      (o) =>
        (o.lockingBytecode.length === 25 &&
          o.lockingBytecode[0] === 0x76 &&
          o.lockingBytecode[1] === 0xa9 &&
          o.lockingBytecode[24] === 0xac) ||
        (o.lockingBytecode.length === 23 && o.lockingBytecode[0] === 0xa9)
    );
    expect(candidate).toBeTruthy();
    directScripthash = sha256ReversedHex(candidate!.lockingBytecode);
    expect(directScripthash).toMatch(/^[0-9a-f]{64}$/);

    const maybeAddressResult = lockingBytecodeToCashAddress({
      bytecode: candidate!.lockingBytecode,
      prefix: 'bchtest',
    });
    expect(typeof maybeAddressResult).not.toBe('string');
    const maybeAddress = (maybeAddressResult as { address: string }).address;
    derivedAddress = maybeAddress;
    expect(derivedAddress.startsWith('bchtest:')).toBe(true);

    // Rota do app: endereço cashaddr → lockingBytecode → sha256 reversed.
    // Deve reproduzir exatamente o scripthash derivado direto do bytecode real.
    const { scripthash } = await addressToScripthash(derivedAddress);
    expect(scripthash).toBe(directScripthash);
  }, 30000);

  it('get_balance do app responde com valores coerentes para o endereço real', async () => {
    const balance = await client.getAddressBalance(derivedAddress!);
    expect(Number.isFinite(balance.confirmed)).toBe(true);
    expect(Number.isFinite(balance.unconfirmed)).toBe(true);
    expect(balance.confirmed).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('getRecentTransactions do app parseia tx reais sem erros', async () => {
    const txs = await client.getRecentTransactions(derivedAddress!, 6);
    expect(Array.isArray(txs)).toBe(true);
    for (const tx of txs) {
      expect(tx.txid).toMatch(/^[0-9a-f]{64}$/);
      expect(tx.height !== undefined).toBe(true);
      if (tx.amountSats !== undefined) {
        expect(tx.amountSats).toBeGreaterThanOrEqual(0);
      }
    }
  }, 40000);

  it('listunspent responde para o endereço real', async () => {
    const utxos = await client.listUnspent(derivedAddress!);
    expect(Array.isArray(utxos)).toBe(true);
    for (const utxo of utxos) {
      expect(utxo.tx_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(utxo.value).toBeGreaterThan(0);
    }
  }, 30000);

  it('ciclo subscribe/unsubscribe por endereço funciona no servidor real', async () => {
    const seen: Array<string | null> = [];
    const onUpdate = (status: string | null) => seen.push(status);
    const status = await client.subscribeAddress(derivedAddress!, onUpdate);
    expect(status).toBeTypeOf('string');
    await client.unsubscribeAddress(derivedAddress!, onUpdate);
    // Callback registrado/desregistrado sem exceção contra o servidor de verdade.
    expect(true).toBe(true);
  }, 30000);

  afterAll(() => {
    client.disconnect();
  });
});
