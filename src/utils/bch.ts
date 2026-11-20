import { decodeCashAddress, encodeCashAddress } from '@bitauth/libauth';
import { NetworkType } from '../types';

export const SATOSHIS_PER_BCH = 100_000_000;

/** Convert a USD tip using a live BCH/USD quote; null means no valid quote. */
export function usdToSatoshis(usd: number, bchPriceUsd: number): number | null {
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(bchPriceUsd) || bchPriceUsd <= 0) {
    return null;
  }
  const sats = Math.round((usd / bchPriceUsd) * SATOSHIS_PER_BCH);
  if (!Number.isSafeInteger(sats)) return null;
  return Math.max(546, sats);
}

/** Parse a user-entered USD amount without accepting suffixes or exponents. */
export function parseUsdAmount(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function formatBch(satoshis: number): string {
  return (satoshis / SATOSHIS_PER_BCH).toFixed(8).replace(/\.?0+$/, '');
}

export function formatUsd(usd: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(usd);
}

export function buildBip21Uri(address: string, amountBch: number, label?: string, message?: string): string {
  const cleanAddress = address.replace(/^(bitcoincash:|bchtest:)/i, '');
  const prefix = address.startsWith('bchtest:') ? 'bchtest:' : 'bitcoincash:';

  // BIP-21 requires percent-encoding (spaces as %20), not form encoding (spaces as +).
  const parts: string[] = [];
  if (amountBch > 0) {
    parts.push(`amount=${amountBch.toFixed(8).replace(/\.?0+$/, '')}`);
  }
  if (label) {
    parts.push(`label=${encodeURIComponent(label)}`);
  }
  if (message) {
    parts.push(`message=${encodeURIComponent(message)}`);
  }

  return `${prefix}${cleanAddress}${parts.length > 0 ? `?${parts.join('&')}` : ''}`;
}

export interface Bip21Uri {
  prefix: string;
  address: string;
  amountBch?: number;
  label?: string;
  message?: string;
}

/**
 * Parses a BIP-21 payment URI such as
 * `bitcoincash:qr...?amount=0.01&label=X&message=Y` (also accepts `bchtest:`).
 * Throws when the URI is malformed.
 */
export function parseBip21Uri(uri: string): Bip21Uri {
  const match = /^((?:bitcoincash|bchtest):)([^?]+)(?:\?(.*))?$/i.exec(uri.trim());
  if (!match) {
    throw new Error(`Invalid BIP-21 URI: ${uri}`);
  }

  const [, prefix, address, queryString] = match;
  const result: Bip21Uri = { prefix: prefix.toLowerCase(), address };

  if (queryString) {
    const params = new URLSearchParams(queryString);
    const amount = params.get('amount');
    if (amount !== null) {
      // BIP-21 amounts are plain decimal coin values (up to 8 decimal
      // places). parseFloat alone accepts misleading suffixes like `1junk`
      // and exponent notation, which can hide the amount shown to a payer.
      if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(amount)) {
        throw new Error(`Invalid BIP-21 amount: ${amount}`);
      }
      const parsed = Number(amount);
      if (!Number.isFinite(parsed)) throw new Error(`Invalid BIP-21 amount: ${amount}`);
      result.amountBch = parsed;
    }
    const label = params.get('label');
    if (label !== null) result.label = label;
    const message = params.get('message');
    if (message !== null) result.message = message;
  }

  return result;
}

export function getExplorerUrl(txid: string, network: NetworkType = 'mainnet'): string {
  if (network === 'chipnet') {
    return `https://chipnet.imaginary.cash/tx/${txid}`;
  }
  return `https://blockchair.com/bitcoin-cash/transaction/${txid}`;
}

export function getAddressExplorerUrl(address: string, network: NetworkType = 'mainnet'): string {
  const clean = address.replace(/^(bitcoincash:|bchtest:)/i, '');
  if (network === 'chipnet') {
    return `https://chipnet.imaginary.cash/address/${clean}`;
  }
  return `https://blockchair.com/bitcoin-cash/address/${clean}`;
}

/**
 * Converts a BCH CashAddr between networks (mainnet <-> Chipnet) by decoding
 * the payload and re-encoding it with the target prefix, recomputing the
 * CashAddr checksum. Simply swapping the prefix in the string produces an
 * INVALID address (the checksum covers the prefix). Returns null when the
 * input is not a valid CashAddr.
 */
export function convertCashAddressPrefix(address: string, network: NetworkType): string | null {
  const targetPrefix = network === 'chipnet' ? 'bchtest' : 'bitcoincash';
  const withPrefix = address.includes(':') ? address : `bitcoincash:${address}`;
  const decoded = decodeCashAddress(withPrefix);
  if (typeof decoded === 'string') return null;
  if (decoded.prefix === targetPrefix) {
    return `${targetPrefix}:${address.split(':')[1] ?? address}`;
  }
  const encoded = encodeCashAddress({
    payload: decoded.payload,
    type: decoded.type,
    prefix: targetPrefix,
    throwErrors: false,
  });
  if (typeof encoded === 'string') return null;
  return encoded.address;
}

/**
 * Validates a BCH CashAddr for a given network. Returns an error message, or
 * null when the address is valid and its prefix matches the network.
 */
export function validateBchAddressForNetwork(address: string, network: NetworkType): string | null {
  const withPrefix = address.includes(':') ? address : `bitcoincash:${address}`;
  const decoded = decodeCashAddress(withPrefix);
  if (typeof decoded === 'string') {
    return `Invalid BCH CashAddr (${decoded}). Use an address like bitcoincash:qr...`;
  }
  const expected = network === 'chipnet' ? 'bchtest' : 'bitcoincash';
  if (decoded.prefix !== expected) {
    return network === 'chipnet'
      ? 'This is a mainnet address — use a Chipnet (bchtest:) address or switch to Mainnet.'
      : 'This is a Chipnet (bchtest:) address — use a mainnet (bitcoincash:) address or switch to Chipnet.';
  }
  return null;
}

let cachedPrice = 0;
let lastFetch = 0;
const MAX_STALE_PRICE_MS = 5 * 60_000;

/** Accept only a finite, positive USD quote from the provider response. */
export function parseBchUsdQuote(data: unknown): number | null {
  if (typeof data !== 'object' || data === null || !('bitcoin-cash' in data)) return null;
  const quote = (data as { 'bitcoin-cash'?: { usd?: unknown } })['bitcoin-cash']?.usd;
  return typeof quote === 'number' && Number.isFinite(quote) && quote > 0 ? quote : null;
}

export async function fetchBchUsdPrice(): Promise<number> {
  const now = Date.now();
  if (now - lastFetch < 60_000 && cachedPrice > 0) {
    return cachedPrice;
  }

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd');
    if (res.ok) {
      const quote = parseBchUsdQuote(await res.json());
      if (quote !== null) {
        cachedPrice = quote;
        lastFetch = now;
        return cachedPrice;
      }
    }
  } catch (err) {
    console.warn('Could not fetch live BCH price:', err);
  }

  return now - lastFetch <= MAX_STALE_PRICE_MS ? cachedPrice : 0;
}
