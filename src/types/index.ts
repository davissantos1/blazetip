export type NetworkType = 'mainnet' | 'chipnet';

export interface CreatorProfile {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string;
  bio: string;
  bchAddress: string;
  network: NetworkType;
  suggestedAmountsUsd: number[];
  goalUsd?: number;
}

export interface OnChainTx {
  txid: string;
  height: number; // <= 0 means unconfirmed in mempool (0-conf)
  amountSats?: number;
  memo?: string;
  timestamp?: number;
}

export interface BchUtxo {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
  address: string;
  lockingBytecode: Uint8Array;
  childIndex: number;
  addressIndex: number;
  pathName: string;
}

export interface PaymentState {
  status: 'idle' | 'signing' | 'broadcasting' | 'detected_mempool' | 'confirmed' | 'failed';
  usdAmount: number;
  bchAmount: number;
  satsAmount: number;
  recipientAddress: string;
  txid?: string;
  explorerUrl?: string;
  timestamp?: number;
  senderNote?: string;
  isRealMainnetTx?: boolean;
}
