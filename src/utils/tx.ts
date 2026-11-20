/**
 * Pure helpers for BlazeTip transaction assembly.
 *
 * Extracted from `useBchWallet.ts` so the coin-selection, fee and output
 * assembly logic can be unit-tested without a wallet connection.
 * All functions here are side-effect free.
 */
import { hexToBin, binToHex } from '@bitauth/libauth';

export const DUST_LIMIT_SATS = 546;

/** Input size contribution in bytes for a P2PKH input (used for fee estimation). */
export const INPUT_SIZE_SATS = 148;

/** Base tx size cost (version + locktime + output overheads). */
export const BASE_TX_SIZE_SATS = 180;

/** Extra size cost of an OP_RETURN memo output. */
export const MEMO_TX_SIZE_SATS = 60;

export interface SelectableUtxo {
  tx_hash: string;
  tx_pos: number;
  value: number;
}

export interface CoinSelection<T extends SelectableUtxo = SelectableUtxo> {
  selected: T[];
  /** Sum of the selected UTXO values, in satoshis. */
  inputTotal: number;
  /** Final fee estimate for the assembled transaction, in satoshis. */
  fee: number;
  /** Change returned to the wallet; 0 when below the dust limit. */
  changeSats: number;
}

export function estimateFee(numInputs: number, hasMemo: boolean): number {
  return BASE_TX_SIZE_SATS + numInputs * INPUT_SIZE_SATS + (hasMemo ? MEMO_TX_SIZE_SATS : 0);
}

/**
 * Greedy largest-first coin selection that never spends below the dust limit
 * and always leaves enough room for the fee.
 *
 * Throws with a user-facing message when the request is impossible.
 */
export function selectCoins<T extends SelectableUtxo>(
  utxos: T[],
  amountSats: number,
  hasMemo: boolean = false
): CoinSelection<T> {
  if (!Number.isSafeInteger(amountSats) || amountSats < DUST_LIMIT_SATS) {
    throw new Error(`Tip amount must be a whole number of satoshis at or above the ${DUST_LIMIT_SATS} satoshi dust limit.`);
  }
  if (utxos.some((u) => !Number.isSafeInteger(u.value) || u.value <= 0)) {
    throw new Error('Wallet contains an invalid UTXO value; refresh the wallet balance before trying again.');
  }
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected: T[] = [];
  let accumulated = 0;

  for (const u of sorted) {
    selected.push(u);
    accumulated += u.value;
    if (accumulated >= amountSats + estimateFee(selected.length, hasMemo)) break;
  }

  const fee = estimateFee(selected.length, hasMemo);
  if (accumulated < amountSats + fee) {
    throw new Error(
      `Insufficient wallet balance (${accumulated.toLocaleString()} sats available, need ${(
        amountSats + fee
      ).toLocaleString()} sats).`
    );
  }

  const changeSats = accumulated - amountSats - fee;
  return {
    selected,
    inputTotal: accumulated,
    fee,
    changeSats: changeSats >= DUST_LIMIT_SATS ? changeSats : 0,
  };
}

export interface TipOutput {
  lockingBytecode: Uint8Array;
  valueSatoshis: bigint;
}

/**
 * Assembles the transaction outputs for a tip: recipient first, optional
 * OP_RETURN memo, optional change back to the wallet's change address.
 */
export function buildTipOutputs(params: {
  recipientLockingBytecode: Uint8Array;
  amountSats: number;
  /** Fully-encoded OP_RETURN bytecode from `buildOpReturnBytecode`, if the memo is set. */
  memoLockingBytecode?: Uint8Array;
  changeLockingBytecode?: Uint8Array;
  selection: CoinSelection<any>;
}): TipOutput[] {
  const { recipientLockingBytecode, amountSats, memoLockingBytecode, changeLockingBytecode, selection } = params;

  if (!Number.isSafeInteger(amountSats) || amountSats < DUST_LIMIT_SATS) {
    throw new Error(`Tip amount must be a whole number of satoshis at or above the ${DUST_LIMIT_SATS} satoshi dust limit.`);
  }

  const outputs: TipOutput[] = [
    {
      lockingBytecode: recipientLockingBytecode,
      valueSatoshis: BigInt(amountSats),
    },
  ];

  if (memoLockingBytecode && memoLockingBytecode.length > 0) {
    outputs.push({
      lockingBytecode: memoLockingBytecode,
      valueSatoshis: 0n,
    });
  }

  if (selection.changeSats >= DUST_LIMIT_SATS && changeLockingBytecode) {
    outputs.push({
      lockingBytecode: changeLockingBytecode,
      valueSatoshis: BigInt(selection.changeSats),
    });
  }

  return outputs;
}

/**
 * Derives the txid (double SHA-256, byte-reversed) of a raw signed transaction
 * hex string. Used as a fallback when the wallet already broadcast the
 * transaction and Fulcrum cannot confirm it.
 */
export async function deriveTxidFromRawTxHex(rawTxHex: string): Promise<string> {
  const rawBytes = hexToBin(rawTxHex);
  const hash1 = await crypto.subtle.digest('SHA-256', rawBytes as unknown as BufferSource);
  const hash2 = await crypto.subtle.digest('SHA-256', new Uint8Array(hash1) as unknown as BufferSource);
  return binToHex(new Uint8Array(hash2).reverse());
}
