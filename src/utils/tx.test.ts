import { describe, it, expect } from 'vitest';
import {
  DUST_LIMIT_SATS,
  estimateFee,
  selectCoins,
  buildTipOutputs,
  deriveTxidFromRawTxHex,
} from './tx';
import { buildOpReturnBytecode } from '../services/fulcrum';

function utxo(txHash: string, value: number, pos = 0) {
  return { tx_hash: txHash, tx_pos: pos, value };
}

describe('estimateFee', () => {
  it('scales with inputs and adds the memo cost', () => {
    expect(estimateFee(1, false)).toBe(180 + 148);
    expect(estimateFee(1, true)).toBe(180 + 148 + 60);
    expect(estimateFee(3, false)).toBe(180 + 3 * 148);
  });
});

describe('selectCoins', () => {
  it('rejects outputs below the dust limit', () => {
    expect(() => selectCoins([utxo('a', 100_000)], DUST_LIMIT_SATS - 1)).toThrow('dust limit');
  });

  it.each([0, -1, 546.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid tip amount %s before coin selection',
    (amount) => {
      expect(() => selectCoins([utxo('a', 100_000)], amount)).toThrow('whole number of satoshis');
    }
  );

  it('rejects invalid UTXO values before selecting coins', () => {
    expect(() => selectCoins([utxo('a', 1.5)], 1_000)).toThrow('invalid UTXO value');
  });

  it('selects largest-first until the amount plus fee is covered', () => {
    const selection = selectCoins(
      [utxo('a', 10_000), utxo('b', 50_000), utxo('c', 30_000)],
      20_000,
      true
    );
    // Largest first: b (50k) covers the 20k tip and estimated fee (388).
    expect(selection.selected.map((u) => u.tx_hash)).toEqual(['b']);
    expect(selection.inputTotal).toBe(50_000);
    expect(selection.fee).toBe(estimateFee(1, true));
    expect(selection.changeSats).toBe(50_000 - 20_000 - estimateFee(1, true));
  });

  it('keeps pulling UTXOs until the target is met', () => {
    const selection = selectCoins(
      [utxo('a', 10_000), utxo('b', 12_000), utxo('c', 11_000)],
      30_000,
      false
    );
    // All three inputs total 33k; one or two inputs do not cover tip + fee.
    expect(selection.selected).toHaveLength(3);
    expect(selection.inputTotal).toBe(33_000);
  });

  it('does not select an extra input when the exact estimated fee is covered', () => {
    const selection = selectCoins([utxo('a', 1_400), utxo('b', 1_350)], 1_000, true);
    expect(selection.selected.map((u) => u.tx_hash)).toEqual(['a']);
    expect(selection.fee).toBe(estimateFee(1, true));
  });

  it('throws with a readable message when the balance is insufficient', () => {
    expect(() => selectCoins([utxo('a', 5_000)], 20_000, false)).toThrow(
      'Insufficient wallet balance (5,000 sats available, need 20,328 sats)'
    );
  });

  it('drops change below the dust limit', () => {
    // input 21,000; amount 20,000; fee = 328 -> change 672 >= 546
    const withChange = selectCoins([utxo('a', 21_000)], 20_000, false);
    expect(withChange.changeSats).toBe(672);

    // input 20,800 -> change 472 < 546 -> dropped
    const noChange = selectCoins([utxo('a', 20_800)], 20_000, false);
    expect(noChange.changeSats).toBe(0);
  });
});

describe('buildTipOutputs', () => {
  const recipient = new Uint8Array([1, 2, 3]);
  const change = new Uint8Array([9, 8, 7]);

  it('emits only the recipient when there is no memo and no change', () => {
    const outputs = buildTipOutputs({
      recipientLockingBytecode: recipient,
      amountSats: 10_000,
      selection: { selected: [], inputTotal: 10_000 + 328, fee: 328, changeSats: 0 },
    });
    expect(outputs).toEqual([{ lockingBytecode: recipient, valueSatoshis: 10_000n }]);
  });

  it('rejects a fractional or unsafe amount instead of coercing it to bigint', () => {
    expect(() => buildTipOutputs({
      recipientLockingBytecode: recipient,
      amountSats: 1_000.5,
      selection: { selected: [], inputTotal: 2_000, fee: 328, changeSats: 0 },
    })).toThrow('whole number of satoshis');
  });

  it('appends the OP_RETURN memo output with 0 sats', () => {
    const memo = buildOpReturnBytecode('BLAZE tip');
    const outputs = buildTipOutputs({
      recipientLockingBytecode: recipient,
      amountSats: 10_000,
      memoLockingBytecode: memo,
      selection: { selected: [], inputTotal: 10_000 + 388, fee: 388, changeSats: 0 },
    });
    expect(outputs).toHaveLength(2);
    expect(outputs[1].lockingBytecode).toBe(memo);
    expect(outputs[1].valueSatoshis).toBe(0n);
  });

  it('appends change back to the wallet address', () => {
    const outputs = buildTipOutputs({
      recipientLockingBytecode: recipient,
      amountSats: 10_000,
      changeLockingBytecode: change,
      selection: { selected: [], inputTotal: 20_000, fee: 328, changeSats: 9_672 },
    });
    expect(outputs).toHaveLength(2);
    expect(outputs[1]).toEqual({ lockingBytecode: change, valueSatoshis: 9672n });
  });
});

describe('deriveTxidFromRawTxHex', () => {
  // Regression vector: double SHA-256, byte-reversed, of the hex '0100000001abcdef'.
  it('derives the double-SHA256 reversed txid of a raw transaction', async () => {
    expect(await deriveTxidFromRawTxHex('0100000001abcdef')).toBe(
      'ed712045851cc6a099d205c5103109431a6823b16885d0ececef7a95ea433b16'
    );
  });

  it('is deterministic and 64 hex chars long', async () => {
    const a = await deriveTxidFromRawTxHex('0200000002aaaabbbb0000');
    const b = await deriveTxidFromRawTxHex('0200000002aaaabbbb0000');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
