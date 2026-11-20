import { useState, useEffect, useCallback, useRef } from 'react';
import { useWizardConnect } from '@wizardconnect/react';
import { PATH_RECEIVE, PATH_CHANGE } from '@wizardconnect/core';
import {
  publicKeyToP2pkhCashAddress,
  publicKeyToP2pkhLockingBytecode,
  cashAddressToLockingBytecode,
  hexToBin,
} from '@bitauth/libauth';
import { BchUtxo, NetworkType } from '../types';
import { FulcrumClient, buildOpReturnBytecode } from '../services/fulcrum';
import { selectCoins, buildTipOutputs, deriveTxidFromRawTxHex } from '../utils/tx';

export function useBchWallet(network: NetworkType, fulcrum: FulcrumClient) {
  const wc = useWizardConnect({
    dappName: 'BlazeTip — BCH Creator Checkout',
    dappIcon: `${window.location.origin}/favicon.svg`,
    persistSession: true,
  });

  const [walletAddresses, setWalletAddresses] = useState<string[]>([]);
  const [changeAddress, setChangeAddress] = useState<{ address: string; lockingBytecode: Uint8Array } | null>(null);
  const [utxos, setUtxos] = useState<BchUtxo[]>([]);
  const [balanceSats, setBalanceSats] = useState<number>(0);
  const [loadingUtxos, setLoadingUtxos] = useState<boolean>(false);
  const [utxoScanError, setUtxoScanError] = useState<string | null>(null);
  const scanGeneration = useRef(0);

  const prefix = network === 'chipnet' ? 'bchtest' : 'bitcoincash';

  const refreshWalletUtxos = useCallback(async () => {
    if (wc.state !== 'connected' || !wc.manager) return;
    const generation = ++scanGeneration.current;
    // Never expose UTXOs from the previous network while this scan is running.
    setWalletAddresses([]);
    setUtxos([]);
    setBalanceSats(0);
    setChangeAddress(null);
    setUtxoScanError(null);
    setLoadingUtxos(true);
    try {
      const derivedUtxos: BchUtxo[] = [];
      const addrs: string[] = [];
      let nextChangeAddress: { address: string; lockingBytecode: Uint8Array } | null = null;

      // Scan first 5 receive addresses (childIndex 0) and first 2 change addresses (childIndex 1)
      const pathsToScan: Array<{ childIndex: number; pathName: string; count: number }> = [
        { childIndex: 0, pathName: PATH_RECEIVE, count: 5 },
        { childIndex: 1, pathName: PATH_CHANGE, count: 2 },
      ];

      for (const pathInfo of pathsToScan) {
        if (!wc.manager.hasPath(pathInfo.childIndex)) continue;
        for (let idx = 0; idx < pathInfo.count; idx++) {
          const pubkey = wc.manager.getPubkey(pathInfo.childIndex, BigInt(idx));
          if (!pubkey) continue;
          const addrRes = publicKeyToP2pkhCashAddress({ publicKey: pubkey, prefix, tokenSupport: false });
          if (typeof addrRes === 'string') continue;
          const lockBytecode = publicKeyToP2pkhLockingBytecode({ publicKey: pubkey });
          if (typeof lockBytecode === 'string') continue;

          if (pathInfo.childIndex === 0) addrs.push(addrRes.address);
          if (pathInfo.childIndex === 1 && idx === 0) {
            nextChangeAddress = { address: addrRes.address, lockingBytecode: lockBytecode };
          }

          const unspent = await fulcrum.listUnspent(addrRes.address);
          for (const u of unspent) {
            // Skip token-bearing UTXOs so we never burn CashTokens
            if (u.token_data) continue;
            derivedUtxos.push({
              tx_hash: u.tx_hash,
              tx_pos: u.tx_pos,
              value: u.value,
              height: u.height,
              address: addrRes.address,
              lockingBytecode: lockBytecode,
              childIndex: pathInfo.childIndex,
              addressIndex: idx,
              pathName: pathInfo.pathName,
            });
          }
        }
      }

      if (generation === scanGeneration.current) {
        setWalletAddresses(addrs);
        setUtxos(derivedUtxos);
        setBalanceSats(derivedUtxos.reduce((acc, item) => acc + item.value, 0));
        setChangeAddress(nextChangeAddress);
        setUtxoScanError(null);
      }
    } catch (err) {
      console.error('Error scanning WizardConnect wallet UTXOs:', err);
      if (generation === scanGeneration.current) {
        setWalletAddresses([]);
        setUtxos([]);
        setBalanceSats(0);
        setChangeAddress(null);
        setUtxoScanError('Could not read wallet balance from Fulcrum. Check the network connection and reconnect the wallet before sending.');
      }
    } finally {
      if (generation === scanGeneration.current) setLoadingUtxos(false);
    }
  }, [wc.state, wc.manager, prefix, fulcrum]);

  useEffect(() => {
    if (wc.state === 'connected') {
      refreshWalletUtxos();
    } else {
      scanGeneration.current++;
      setLoadingUtxos(false);
      setWalletAddresses([]);
      setUtxos([]);
      setBalanceSats(0);
      setChangeAddress(null);
      setUtxoScanError(null);
    }
  }, [wc.state, refreshWalletUtxos]);

  const sendTipWithWizardConnect = async (
    recipientAddress: string,
    amountSats: number,
    memo?: string
  ): Promise<string> => {
    if (!wc.manager || wc.state !== 'connected') {
      throw new Error('Wallet is not connected via WizardConnect.');
    }

    const cleanRecipient = recipientAddress.includes(':') ? recipientAddress : `${prefix}:${recipientAddress}`;
    const recipientLock = cashAddressToLockingBytecode(cleanRecipient);
    if (typeof recipientLock === 'string') {
      throw new Error(`Invalid recipient address: ${recipientLock}`);
    }

    // Coin selection (greedy largest-first, pure helper from utils/tx.ts)
    const trimmedMemo = memo?.trim() ?? '';
    const selection = selectCoins(utxos, amountSats, trimmedMemo.length > 0);

    const outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint }> = buildTipOutputs({
      recipientLockingBytecode: recipientLock.bytecode,
      amountSats,
      memoLockingBytecode: trimmedMemo.length > 0 ? buildOpReturnBytecode(trimmedMemo) : undefined,
      changeLockingBytecode: changeAddress?.lockingBytecode || selection.selected[0].lockingBytecode,
      selection,
    });

    const selected = selection.selected;
    const inputs = selected.map((u) => ({
      outpointTransactionHash: hexToBin(u.tx_hash),
      outpointIndex: u.tx_pos,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: new Uint8Array(0),
    }));

    const sourceOutputs = selected.map((u, idx) => ({
      ...inputs[idx],
      lockingBytecode: u.lockingBytecode,
      valueSatoshis: BigInt(u.value),
    }));

    const inputPaths: [number, string, number][] = selected.map((u, idx) => [
      idx,
      u.pathName,
      u.addressIndex,
    ]);

    const unsignedTx = {
      version: 2,
      inputs,
      outputs,
      locktime: 0,
    };

    const signRes = await wc.manager.signTransaction({
      transaction: {
        transaction: unsignedTx,
        sourceOutputs,
        broadcast: true,
        userPrompt: `BlazeTip: Send ${amountSats.toLocaleString()} sats to creator`,
      },
      inputPaths,
    });

    if (signRes.error) {
      throw new Error(signRes.error);
    }

    // Broadcast via Fulcrum as well to guarantee network propagation and obtain txid
    try {
      const txid = await fulcrum.broadcastTx(signRes.signedTransaction);
      return txid;
    } catch {
      // The wallet may have broadcast it already, in which case Fulcrum can
      // reject our duplicate broadcast. A locally derived txid is only shown
      // if Fulcrum can retrieve the exact same transaction from the network.
      try {
        const txid = await deriveTxidFromRawTxHex(signRes.signedTransaction);
        const networkTxHex = await fulcrum.getRawTransaction(txid);
        if (networkTxHex.toLowerCase() === signRes.signedTransaction.toLowerCase()) {
          return txid;
        }
      } catch {
        // Fall through to the explicit unverifiable-broadcast error.
      }
      throw new Error(
        'The wallet signed the transaction, but network broadcast could not be verified. Check your wallet and the transaction explorer before trying again.'
      );
    }
  };

  return {
    ...wc,
    walletAddresses,
    balanceSats,
    loadingUtxos,
    utxoScanError,
    refreshWalletUtxos,
    sendTipWithWizardConnect,
  };
}
