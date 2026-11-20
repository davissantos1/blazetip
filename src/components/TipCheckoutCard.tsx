import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Copy, 
  Check, 
  Zap, 
  QrCode, 
  Smartphone, 
  ExternalLink,
  MessageSquare,
  DollarSign,
  Loader2,
  Wallet,
  Radio
} from 'lucide-react';
import { CreatorProfile, PaymentState } from '../types';
import { buildBip21Uri, formatBch, formatUsd, SATOSHIS_PER_BCH, getAddressExplorerUrl, parseUsdAmount, usdToSatoshis, validateBchAddressForNetwork } from '../utils/bch';

interface TipCheckoutCardProps {
  creator: CreatorProfile;
  bchPriceUsd: number;
  fulcrumAvailable: boolean;
  walletState: {
    state: string;
    walletName: string | null;
    balanceSats: number;
    loadingUtxos: boolean;
    utxoScanError: string | null;
  };
  onConnectWallet: () => void;
  onRefreshWalletUtxos: () => void;
  onNetworkChange: (network: 'mainnet' | 'chipnet') => void;
  onSendWizardConnectTip: (amountSats: number, memo?: string) => Promise<string>;
  onPaymentSuccess: (payment: PaymentState) => void;
}

export const TipCheckoutCard: React.FC<TipCheckoutCardProps> = ({
  creator,
  bchPriceUsd,
  fulcrumAvailable,
  walletState,
  onConnectWallet,
  onRefreshWalletUtxos,
  onNetworkChange,
  onSendWizardConnectTip,
  onPaymentSuccess,
}) => {
  const [selectedUsd, setSelectedUsd] = useState<number>(5);
  const [customUsd, setCustomUsd] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [senderNote, setSenderNote] = useState<string>('');
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'wizard' | 'qr'>('wizard');
  const [isSendingWc, setIsSendingWc] = useState<boolean>(false);
  const [wcError, setWcError] = useState<string | null>(null);

  const effectiveUsd = isCustom ? (parseUsdAmount(customUsd) ?? 0) : selectedUsd;
  const hasAddressText = creator.bchAddress.trim().length > 0;
  const addressError = hasAddressText
    ? validateBchAddressForNetwork(creator.bchAddress, creator.network)
    : null;
  const hasReceivingAddress = hasAddressText && addressError === null;
  const satsQuote = usdToSatoshis(effectiveUsd, bchPriceUsd);
  const satsAmount = satsQuote ?? 0;
  const bchAmount = satsAmount / SATOSHIS_PER_BCH;

  const bip21Uri = buildBip21Uri(creator.bchAddress, bchAmount, creator.name, senderNote);

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(creator.bchAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleJudgePreset = () => {
    onNetworkChange('chipnet');
    setIsCustom(true);
    setCustomUsd('0.05');
  };

  const handleSendViaWizardConnect = async () => {
    if (!hasReceivingAddress) {
      setWcError(addressError ?? 'Add a valid BCH receiving address in Customize before starting a payment.');
      return;
    }
    if (walletState.state !== 'connected') {
      onConnectWallet();
      return;
    }

    setWcError(null);
    setIsSendingWc(true);
    try {
      const txid = await onSendWizardConnectTip(satsAmount, senderNote.trim() || undefined);
      onPaymentSuccess({
        status: 'detected_mempool',
        usdAmount: effectiveUsd,
        bchAmount,
        satsAmount,
        recipientAddress: creator.bchAddress,
        txid,
        timestamp: Date.now(),
        senderNote: senderNote.trim() || undefined,
        isRealMainnetTx: creator.network === 'mainnet',
      });
    } catch (err: any) {
      console.error('WizardConnect send error:', err);
      setWcError(err.message || 'Transaction was rejected or failed.');
    } finally {
      setIsSendingWc(false);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative">
      {/* Judge Quick-Test Preset Banner */}
      <div className="mb-6 p-3 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-amber-500/15 border border-emerald-500/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Zap className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
          <span className="text-slate-200 font-medium">
            <strong>Safe demo:</strong> switch to Chipnet to test the on-chain flow without real funds
          </span>
        </div>
        <button
          onClick={handleJudgePreset}
          className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-sm"
        >
          Switch to Chipnet · $0.05
        </button>
      </div>

      {/* Amount Selector */}
      <div>
        <label className="text-xs font-semibold text-slate-300 block mb-2.5">
          Select Tip Amount
        </label>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {creator.suggestedAmountsUsd.map((amt) => (
            <button
              key={amt}
              onClick={() => {
                setSelectedUsd(amt);
                setIsCustom(false);
              }}
              className={`py-3 px-2 rounded-xl text-sm font-bold transition-all ${
                !isCustom && selectedUsd === amt
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25 scale-[1.02]'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/50'
              }`}
            >
              ${amt}
            </button>
          ))}
        </div>

        {/* Custom Amount input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <DollarSign className="w-4 h-4" />
          </div>
          <input
            type="number"
            min="0.01"
            step="0.05"
            placeholder="Or enter custom USD amount..."
            value={customUsd}
            onChange={(e) => {
              setCustomUsd(e.target.value);
              setIsCustom(true);
            }}
            className={`w-full pl-9 pr-4 py-2.5 bg-slate-950/80 border rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition ${
              isCustom ? 'border-emerald-500/60 ring-1 ring-emerald-500/40' : 'border-slate-800'
            }`}
          />
        </div>
      </div>

      {/* BCH Calculation Summary */}
      <div className="mt-4 p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 flex items-center justify-between">
        <div>
          <span className="text-[11px] text-slate-400 block font-medium">BCH Amount (Satoshis)</span>
          <div className="text-xl font-extrabold text-white flex items-center gap-1.5 font-mono">
            {satsQuote === null ? (
              <span className="text-sm text-amber-300">
                {isCustom && !customUsd.trim()
                  ? 'Enter a USD amount to continue'
                  : isCustom && parseUsdAmount(customUsd) === null
                    ? 'Enter a valid USD amount with up to 2 decimal places'
                    : 'Amount unavailable — waiting for live BCH/USD rate'}
              </span>
            ) : <>
              <span>{formatBch(satsAmount)}</span>
              <span className="text-emerald-400 text-sm font-bold">BCH</span>
              <span className="text-xs text-slate-500 font-normal">({satsAmount.toLocaleString()} sats)</span>
            </>}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-slate-400 block font-medium">Current Rate</span>
          <span className="text-xs text-slate-300 font-mono">
            {bchPriceUsd > 0 ? `1 BCH = ${formatUsd(bchPriceUsd)}` : 'Live BCH/USD rate unavailable'}
          </span>
        </div>
      </div>

      {/* On-Chain Note / OP_RETURN Input */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span>On-Chain Supporter Memo (OP_RETURN)</span>
          </label>
          <span className="text-[10px] font-mono text-slate-500">{senderNote.length}/180 chars</span>
        </div>
        <input
          type="text"
          maxLength={180}
          placeholder="e.g. Keep building awesome BCH tools!"
          value={senderNote}
          onChange={(e) => setSenderNote(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition"
        />
        <p className="text-[10px] text-slate-500 mt-1">
          Written permanently on the Bitcoin Cash blockchain using standard OP_RETURN (0x6a).
        </p>
      </div>

      {/* Dual Rail Tabs (WizardConnect vs Direct QR) */}
      <div className="mt-6">
        <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800 mb-4">
          <button
            onClick={() => setActiveTab('wizard')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
              activeTab === 'wizard'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>WizardConnect 1-Click</span>
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
              activeTab === 'qr'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Direct QR Code</span>
          </button>
        </div>

        {/* Tab 1: WizardConnect Rail */}
        {activeTab === 'wizard' && (
          <div className="space-y-3">
            {walletState.state === 'connected' ? (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-white font-semibold block">
                      Connected: {walletState.walletName || 'HD Wallet'}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      Balance: {walletState.loadingUtxos ? 'Scanning UTXOs...' : walletState.utxoScanError ? 'Unavailable' : `${(walletState.balanceSats / SATOSHIS_PER_BCH).toFixed(6)} BCH (${walletState.balanceSats.toLocaleString()} sats)`}
                    </span>
                  </div>
                </div>
                <button
                  onClick={onConnectWallet}
                  className="text-[11px] text-emerald-400 hover:underline"
                >
                  Switch
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                Connect Paytaca, Selene or Cashonize via encrypted Nostr relay.
              </div>
            )}

            {walletState.utxoScanError && (
              <div role="alert" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
                <span>{walletState.utxoScanError}</span>
                <button
                  type="button"
                  onClick={onRefreshWalletUtxos}
                  disabled={walletState.loadingUtxos}
                  className="shrink-0 px-2.5 py-1 rounded-lg border border-amber-400/40 hover:bg-amber-400/10 disabled:opacity-50"
                >
                  {walletState.loadingUtxos ? 'Retrying…' : 'Retry balance scan'}
                </button>
              </div>
            )}

            {wcError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {wcError}
              </div>
            )}

            {addressError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                {addressError}
              </div>
            )}

            <button
              onClick={handleSendViaWizardConnect}
              disabled={isSendingWc || satsQuote === null || !hasReceivingAddress}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/25 active:scale-[0.99] disabled:opacity-50"
            >
              {!hasReceivingAddress ? (
                <span>Set Receiving Address to Enable Checkout</span>
              ) : isSendingWc ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Requesting Wallet Signature...</span>
                </>
              ) : walletState.state === 'connected' ? (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Sign &amp; Broadcast {creator.network === 'chipnet' ? 'Chipnet' : 'Mainnet'} Tip ({formatBch(satsAmount)} BCH)</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4" />
                  <span>Connect Wallet to Pay ({formatBch(satsAmount)} BCH)</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Tab 2: Direct QR Code with 0-Conf Radar */}
        {activeTab === 'qr' && (
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-center">
            {!hasReceivingAddress ? (
              <p className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs mb-3">
                {addressError ?? 'Add a valid BCH receiving address in Customize before creating a payment QR.'}
              </p>
            ) : satsQuote === null ? (
              <p className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs mb-3">
                Payment QR is unavailable until a live BCH/USD rate is fetched. No amount has been encoded.
              </p>
            ) : <div className="inline-block p-3 bg-white rounded-xl shadow-md mb-3">
              <QRCodeSVG
                value={bip21Uri}
                size={180}
                level="M"
                fgColor="#020617"
                bgColor="#ffffff"
              />
            </div>}

            {/* Live 0-Conf Radar Indicator */}
            {hasReceivingAddress && <div className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-full border text-[11px] font-mono mb-3 w-fit mx-auto ${fulcrumAvailable ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'}`}>
              <Radio className={`w-3.5 h-3.5 ${fulcrumAvailable ? 'animate-pulse' : ''}`} />
              <span>{fulcrumAvailable ? 'Fulcrum connected · 0-conf updates' : 'Fulcrum unavailable · live detection paused'}</span>
            </div>}

            {hasReceivingAddress && <p className="text-[11px] text-slate-400 mb-2">
              Scan with any BCH mobile wallet. Payment auto-detects on this screen!
            </p>}

            {hasReceivingAddress && <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <span className="truncate font-mono text-slate-300 text-[11px] select-all">
                {creator.bchAddress}
              </span>
              <button
                onClick={handleCopyAddress}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition shrink-0 flex items-center gap-1"
              >
                {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
              </button>
            </div>}

            {hasReceivingAddress && <div className="mt-3 flex justify-center">
              <a
                href={getAddressExplorerUrl(creator.bchAddress, creator.network)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
              >
                <span>View address history on {creator.network === 'chipnet' ? 'chipnet.imaginary.cash' : 'Blockchair'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>}
          </div>
        )}
      </div>

    </div>
  );
};
