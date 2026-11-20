import { describe, it, expect } from 'vitest';
import {
  SATOSHIS_PER_BCH,
  formatBch,
  buildBip21Uri,
  parseBip21Uri,
  getExplorerUrl,
  getAddressExplorerUrl,
  convertCashAddressPrefix,
  validateBchAddressForNetwork,
  usdToSatoshis,
  parseUsdAmount,
  parseBchUsdQuote,
} from './bch';

describe('parseBchUsdQuote', () => {
  it('accepts only finite positive numeric quotes', () => {
    expect(parseBchUsdQuote({ 'bitcoin-cash': { usd: 500 } })).toBe(500);
    for (const usd of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '500', null]) {
      expect(parseBchUsdQuote({ 'bitcoin-cash': { usd } })).toBeNull();
    }
  });

  it('rejects malformed provider payloads', () => {
    expect(parseBchUsdQuote(null)).toBeNull();
    expect(parseBchUsdQuote({})).toBeNull();
    expect(parseBchUsdQuote({ 'bitcoin-cash': null })).toBeNull();
  });
});

describe('usdToSatoshis', () => {
  it('converts USD from a valid live quote and applies the BCH dust floor', () => {
    expect(usdToSatoshis(5, 500)).toBe(1_000_000);
    expect(usdToSatoshis(0.05, 500)).toBe(10_000);
    expect(usdToSatoshis(0.01, 1_000_000)).toBe(546);
  });

  it('does not invent a value when the amount or quote is unavailable', () => {
    expect(usdToSatoshis(5, 0)).toBeNull();
    expect(usdToSatoshis(5, Number.NaN)).toBeNull();
    expect(usdToSatoshis(0, 500)).toBeNull();
    expect(usdToSatoshis(-1, 500)).toBeNull();
  });

  it('rejects USD conversions outside the safe integer satoshi range', () => {
    expect(usdToSatoshis(Number.MAX_VALUE, 1)).toBeNull();
  });
});

describe('parseUsdAmount', () => {
  it('accepts plain USD decimals with at most two fractional digits', () => {
    expect(parseUsdAmount('0.05')).toBe(0.05);
    expect(parseUsdAmount(' 12.3 ')).toBe(12.3);
  });

  it('rejects suffixes, exponents, excess precision and non-positive amounts', () => {
    for (const value of ['0.05abc', '1e2', '1.005', '0', '-1']) {
      expect(parseUsdAmount(value)).toBeNull();
    }
  });
});

describe('formatBch', () => {
  it('converts satoshis to BCH without trailing zeros', () => {
    expect(formatBch(SATOSHIS_PER_BCH)).toBe('1');
    expect(formatBch(150_000_000)).toBe('1.5');
    expect(formatBch(546)).toBe('0.00000546');
    expect(formatBch(1_234_567_890)).toBe('12.3456789');
    expect(formatBch(0)).toBe('0');
  });
});

describe('buildBip21Uri', () => {
  it('builds a mainnet URI with amount, label and message', () => {
    const uri = buildBip21Uri(
      'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy',
      0.00001,
      'Davi',
      'Tip from BlazeTip'
    );
    expect(uri).toBe(
      'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy?amount=0.00001&label=Davi&message=Tip%20from%20BlazeTip'
    );
  });

  it('keeps the bchtest prefix for chipnet addresses', () => {
    expect(buildBip21Uri('bchtest:qq37s3n8gl7acj22qvh3d6uwkl79w39rjqv5p2kwtl', 0.1)).toBe(
      'bchtest:qq37s3n8gl7acj22qvh3d6uwkl79w39rjqv5p2kwtl?amount=0.1'
    );
  });

  it('defaults to bitcoincash prefix when none is present', () => {
    expect(buildBip21Uri('qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy', 0)).toBe(
      'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy'
    );
  });

  it('omits the amount param when amountBch is 0', () => {
    expect(buildBip21Uri('bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy', 0)).toBe(
      'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy'
    );
  });
});

describe('parseBip21Uri', () => {
  it('round-trips a URI built by buildBip21Uri', () => {
    const uri = buildBip21Uri('bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy', 0.25, 'Davi', 'hello');
    const parsed = parseBip21Uri(uri);
    expect(parsed.prefix).toBe('bitcoincash:');
    expect(parsed.address).toBe('qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy');
    expect(parsed.amountBch).toBe(0.25);
    expect(parsed.label).toBe('Davi');
    expect(parsed.message).toBe('hello');
  });

  it('parses a chipnet URI with no query string', () => {
    const parsed = parseBip21Uri('bchtest:qq37s3n8gl7acj22qvh3d6uwkl79w39rjqv5p2kwtl');
    expect(parsed.prefix).toBe('bchtest:');
    expect(parsed.address).toBe('qq37s3n8gl7acj22qvh3d6uwkl79w39rjqv5p2kwtl');
    expect(parsed.amountBch).toBeUndefined();
  });

  it('rejects malformed URIs', () => {
    expect(() => parseBip21Uri('not-a-uri')).toThrow('Invalid BIP-21 URI');
    expect(() => parseBip21Uri('bitcoin:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy')).toThrow('Invalid BIP-21 URI');
  });

  it('rejects invalid amounts', () => {
    expect(() =>
      parseBip21Uri('bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy?amount=abc')
    ).toThrow('Invalid BIP-21 amount');
    for (const amount of ['0.1junk', '1e-3', '0.000000001', '-0.1', '01']) {
      expect(() =>
        parseBip21Uri(`bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy?amount=${amount}`)
      ).toThrow('Invalid BIP-21 amount');
    }
  });

  it('accepts BCH decimal amounts with up to 8 fractional digits', () => {
    expect(parseBip21Uri('bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy?amount=0.00000001').amountBch)
      .toBe(0.00000001);
  });
});

describe('explorer URLs', () => {
  it('uses Blockchair for mainnet and chipnet.imaginary.cash for chipnet', () => {
    expect(getExplorerUrl('abc', 'mainnet')).toBe('https://blockchair.com/bitcoin-cash/transaction/abc');
    expect(getExplorerUrl('abc', 'chipnet')).toBe('https://chipnet.imaginary.cash/tx/abc');
    expect(getAddressExplorerUrl('bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy', 'mainnet')).toBe(
      'https://blockchair.com/bitcoin-cash/address/qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy'
    );
    expect(getAddressExplorerUrl('bchtest:qq37s3n8gl7acj22qvh3d6uwkl79w39rjqv5p2kwtl', 'chipnet')).toBe(
      'https://chipnet.imaginary.cash/address/qq37s3n8gl7acj22qvh3d6uwkl79w39rjqv5p2kwtl'
    );
  });
});

describe('convertCashAddressPrefix', () => {
  const mainnetAddr = 'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy';

  it('re-encodes the payload with the chipnet prefix and a valid checksum', () => {
    const chipnet = convertCashAddressPrefix(mainnetAddr, 'chipnet');
    // Not a naive prefix swap: the checksum changes with the prefix.
    expect(chipnet).not.toBe('bchtest:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy');
    expect(chipnet).toMatch(/^bchtest:q/);
    // Round-trip back to mainnet must reproduce the original address.
    expect(convertCashAddressPrefix(chipnet!, 'mainnet')).toBe(mainnetAddr);
  });

  it('returns the same address when the prefix already matches', () => {
    expect(convertCashAddressPrefix(mainnetAddr, 'mainnet')).toBe(mainnetAddr);
  });

  it('accepts an address without prefix and assumes mainnet', () => {
    const chipnet = convertCashAddressPrefix('qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy', 'chipnet');
    expect(chipnet).toMatch(/^bchtest:/);
  });

  it('returns null for an invalid CashAddr', () => {
    expect(convertCashAddressPrefix('bitcoincash:qinvalidaddress1234567890', 'chipnet')).toBeNull();
    expect(convertCashAddressPrefix('not-an-address', 'chipnet')).toBeNull();
  });
});

describe('validateBchAddressForNetwork', () => {
  const mainnetAddr = 'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy';
  const chipnetAddr = convertCashAddressPrefix(mainnetAddr, 'chipnet')!;

  it('accepts an address whose prefix matches the network', () => {
    expect(validateBchAddressForNetwork(mainnetAddr, 'mainnet')).toBeNull();
    expect(validateBchAddressForNetwork(chipnetAddr, 'chipnet')).toBeNull();
  });

  it('rejects a mainnet address on chipnet and vice versa', () => {
    const chipnetError = validateBchAddressForNetwork(mainnetAddr, 'chipnet');
    expect(chipnetError).toMatch(/mainnet address/i);
    const mainnetError = validateBchAddressForNetwork(chipnetAddr, 'mainnet');
    expect(mainnetError).toMatch(/Chipnet/i);
  });

  it('rejects an invalid CashAddr with a clear error', () => {
    expect(validateBchAddressForNetwork('bitcoincash:qbadaddress', 'mainnet')).toMatch(/Invalid BCH CashAddr/);
  });
});
