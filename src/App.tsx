import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
const WizardConnectQRDialog = React.lazy(() =>
  import('@wizardconnect/react').then(({ WizardConnectQRDialog }) => ({
    default: WizardConnectQRDialog,
  })),
);
import { HackathonBanner } from './components/HackathonBanner';
import { TipCheckoutCard } from './components/TipCheckoutCard';
import { SupporterWall } from './components/SupporterWall';
import { ReceiptModal } from './components/ReceiptModal';
import { EditProfileModal } from './components/EditProfileModal';
import { CreatorProfile, PaymentState, NetworkType, OnChainTx } from './types';
import { convertCashAddressPrefix, fetchBchUsdPrice, formatBch, formatUsd, SATOSHIS_PER_BCH } from './utils/bch';
import { FulcrumClient } from './services/fulcrum';
import { useBchWallet } from './hooks/useBchWallet';
import { playPaymentChime } from './utils/sound';
import { 
  ShieldCheck, 
  Zap, 
  Globe, 
  Coins, 
  Heart, 
  Settings2, 
  Flame, 
  Volume2 
} from 'lucide-react';

const DEFAULT_CREATOR: CreatorProfile = {
  id: 'creator',
  name: 'Your Creator Page',
  handle: '@creator',
  avatarUrl: '',
  bio: 'Configure your profile and BCH receiving address to get started.',
  bchAddress: '',
  network: 'mainnet',
  goalUsd: undefined,
  suggestedAmountsUsd: [2, 5, 15, 50],
};

// Dedicated OBS Streamer Overlay Component
const ObsOverlayView: React.FC<{
  creator: CreatorProfile;
  network: NetworkType;
  fulcrum: FulcrumClient;
  bchPrice: number;
}> = ({ creator, network, fulcrum, bchPrice }) => {
  const [activeAlert, setActiveAlert] = useState<{
    txid: string | null;
    amountSats: number;
    memo?: string;
    isTest?: boolean;
  } | null>(null);
  const [fulcrumStatus, setFulcrumStatus] = useState<'connecting' | 'live' | 'error'>('connecting');

  useEffect(() => {
    let active = true;
    let baselineReady = false;
    let updatePending = false;
    const knownTxids = new Set<string>();
    const onAddressUpdate = async () => {
      if (!baselineReady) {
        updatePending = true;
        return;
      }
      if (!active) return;
      try {
        const txs = await fulcrum.getRecentTransactions(creator.bchAddress, 8);
        const fresh = txs.filter((tx) => !knownTxids.has(tx.txid));
        txs.forEach((tx) => knownTxids.add(tx.txid));
        // Show only a newly observed incoming payment. Outgoing activity
        // and older incoming items in the same history page are ignored.
        const tip = fresh.find((tx) => (tx.amountSats ?? 0) > 0);
        if (!tip || !active) return;
        playPaymentChime();
        setActiveAlert({ txid: tip.txid, amountSats: tip.amountSats!, memo: tip.memo });
        setFulcrumStatus('live');
      } catch {
        // Never fabricate a tip when Fulcrum is unreachable.
        setFulcrumStatus('error');
      }
    };

    // Subscribe before taking the baseline so updates arriving during startup
    // are queued and refreshed after existing transactions have been marked.
    const startSubscription = async () => {
      try {
        await fulcrum.subscribeAddress(creator.bchAddress, onAddressUpdate);
        const existing = await fulcrum.getRecentTransactions(creator.bchAddress, 8);
        if (!active) return;
        existing.forEach((tx) => knownTxids.add(tx.txid));
        baselineReady = true;
        if (active) setFulcrumStatus('live');
        if (updatePending) void onAddressUpdate();
      } catch {
        if (active) setFulcrumStatus('error');
      }
    };

    void startSubscription();

    return () => {
      active = false;
      void fulcrum.unsubscribeAddress(creator.bchAddress, onAddressUpdate).catch(() => {
        // The socket may already be closed while the overlay is being removed.
      });
    };
  }, [creator.bchAddress, fulcrum]);

  useEffect(() => {
    if (!activeAlert) return;
    const timer = setTimeout(() => {
      setActiveAlert(null);
    }, 9000);
    return () => clearTimeout(timer);
  }, [activeAlert]);

  // Explicitly-labeled demo trigger; the alert is clearly marked as a test.
  const triggerTestAlert = () => {
    playPaymentChime();
    setActiveAlert({
      txid: null,
      amountSats: 22000,
      memo: 'Test alert — demo, not a real transaction',
      isTest: true,
    });
  };

  const sats = activeAlert?.amountSats || 0;
  const bch = sats / SATOSHIS_PER_BCH;
  const usd = bch * bchPrice;

  return (
    <div className="min-h-screen w-full bg-transparent p-6 sm:p-10 flex flex-col justify-between select-none font-sans overflow-hidden">
      {/* Top Banner Alert */}
      <div className="w-full flex justify-center">
        {activeAlert ? (
          <div className="animate-in slide-in-from-top-6 fade-in zoom-in-95 duration-500 max-w-xl w-full bg-slate-900/95 border-2 border-emerald-400 rounded-3xl p-5 shadow-2xl shadow-emerald-500/30 backdrop-blur-md flex items-center gap-4 text-left">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg animate-bounce">
                <Flame className="w-8 h-8 fill-slate-950" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-slate-900 animate-ping" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 ${activeAlert.isTest ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : ''}`}>
                  {activeAlert.isTest ? '🧪 TEST ALERT (DEMO)' : '⚡ 0-CONF TIP RECEIVED'}
                </span>
                {activeAlert.txid && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {activeAlert.txid.slice(0, 8)}...
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white font-mono">
                  +{formatBch(bch)} BCH
                </span>
                {bchPrice > 0 && <span className="text-sm font-semibold text-emerald-400">(~{formatUsd(usd)})</span>}
              </div>

              {activeAlert.memo && (
                <p className="mt-1.5 text-xs text-slate-200 bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 italic font-sans break-words">
                  "{activeAlert.memo}"
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="opacity-0 transition-opacity">BlazeTip OBS Waiting</div>
        )}
      </div>

      {/* Bottom Telemetry & Test Trigger */}
      <div className="w-full flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
          <div className={`w-2 h-2 rounded-full ${fulcrumStatus === 'error' ? 'bg-amber-400' : fulcrumStatus === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400 animate-pulse'}`} />
          <span className="font-medium text-slate-300">BlazeTip Streamer Overlay</span>
          <span className={`text-[10px] uppercase font-bold ${fulcrumStatus === 'error' ? 'text-amber-400' : fulcrumStatus === 'live' ? 'text-emerald-400' : 'text-slate-400'}`}>
            {fulcrumStatus === 'error' ? 'Fulcrum connection error' : fulcrumStatus === 'live' ? 'Fulcrum live' : 'Connecting to Fulcrum'}
          </span>
          <span>•</span>
          <span className="text-[10px] uppercase font-bold text-slate-400">{network}</span>
          <span>•</span>
          <span className="font-mono text-[11px] text-emerald-400">{creator.handle}</span>
        </div>

        <button
          onClick={triggerTestAlert}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-white transition shadow-sm"
        >
          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Test Alert</span>
        </button>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  // Query parameters parsing
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isOverlayMode = queryParams.get('overlay') === '1' || queryParams.get('overlay') === 'true';

  const initialNetwork: NetworkType = (queryParams.get('net') === 'chipnet' ? 'chipnet' : 'mainnet');
  const [network, setNetwork] = useState<NetworkType>(initialNetwork);

  const [creator, setCreator] = useState<CreatorProfile>(() => {
    const to = queryParams.get('to');
    const name = queryParams.get('name');
    const handle = queryParams.get('handle');
    const bio = queryParams.get('bio');
    const goal = queryParams.get('goal');

    return {
      ...DEFAULT_CREATOR,
      bchAddress: to
        ? convertCashAddressPrefix(to, initialNetwork) ?? to
        : DEFAULT_CREATOR.bchAddress,
      network: initialNetwork,
      name: name || DEFAULT_CREATOR.name,
      handle: handle || DEFAULT_CREATOR.handle,
      bio: bio || DEFAULT_CREATOR.bio,
      goalUsd: goal ? parseFloat(goal) || undefined : DEFAULT_CREATOR.goalUsd,
    };
  });

  // Keep USD conversion unavailable until a live quote is fetched.
  const [bchPrice, setBchPrice] = useState<number>(0);
  const [balanceSats, setBalanceSats] = useState<{ confirmed: number; unconfirmed: number }>({ confirmed: 0, unconfirmed: 0 });
  const [recentTxs, setRecentTxs] = useState<OnChainTx[]>([]);
  const [fulcrumStatus, setFulcrumStatus] = useState<{ connectedUrl: string | null; latencyMs: number | null }>({
    connectedUrl: null,
    latencyMs: null,
  });
  const [fulcrumError, setFulcrumError] = useState(false);
  const addressScanGeneration = useRef(0);

  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [completedPayment, setCompletedPayment] = useState<PaymentState | null>(null);

  // Initialize Fulcrum Electrum RPC client
  const fulcrum = useMemo(() => new FulcrumClient(network), [network]);

  // Connect native WizardConnect HD wallet hook
  const wallet = useBchWallet(network, fulcrum);

  // Poll BCH/USD market price
  useEffect(() => {
    fetchBchUsdPrice().then(setBchPrice);
    const interval = setInterval(() => {
      fetchBchUsdPrice().then(setBchPrice);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch On-Chain address balance & transactions via Fulcrum
  const refreshAddressData = useCallback(async () => {
    const generation = ++addressScanGeneration.current;
    if (!creator.bchAddress.trim()) {
      setBalanceSats({ confirmed: 0, unconfirmed: 0 });
      setRecentTxs([]);
      setFulcrumStatus({ connectedUrl: null, latencyMs: null });
      setFulcrumError(false);
      return;
    }
    try {
      await fulcrum.connect();
      if (generation !== addressScanGeneration.current) return;
      setFulcrumStatus({
        connectedUrl: fulcrum.connectedUrl,
        latencyMs: fulcrum.latencyMs,
      });

      const bal = await fulcrum.getAddressBalance(creator.bchAddress);
      if (generation !== addressScanGeneration.current) return;
      setBalanceSats(bal);

      const txs = await fulcrum.getRecentTransactions(creator.bchAddress, 8);
      if (generation !== addressScanGeneration.current) return;
      setRecentTxs(txs);
      setFulcrumError(false);
    } catch (err) {
      if (generation !== addressScanGeneration.current) return;
      console.warn('Fulcrum query fallback (offline or network rate-limit):', err);
      // Never leave a previous address/network's balance looking current.
      setBalanceSats({ confirmed: 0, unconfirmed: 0 });
      setRecentTxs([]);
      setFulcrumStatus({ connectedUrl: null, latencyMs: null });
      setFulcrumError(true);
    }
  }, [creator.bchAddress, fulcrum]);

  useEffect(() => {
    // Invalidate in-flight responses and clear the prior address/network view.
    addressScanGeneration.current++;
    setBalanceSats({ confirmed: 0, unconfirmed: 0 });
    setRecentTxs([]);
    setFulcrumStatus({ connectedUrl: null, latencyMs: null });
    setFulcrumError(false);
    if (!creator.bchAddress.trim()) return;
    refreshAddressData();

    // Subscribe to real-time 0-conf scripthash notifications
    let isSubscribed = true;
    const onAddressUpdate = (status: string | null) => {
      if (!isSubscribed) return;
      if (status) {
        // A scripthash status changes for any address activity, including
        // outgoing transactions. Refresh the wall, but let the overlay play
        // its chime only after it verifies a positive received amount.
        refreshAddressData();
      }
    };
    fulcrum.subscribeAddress(creator.bchAddress, onAddressUpdate).catch((err) => {
      console.warn('Fulcrum subscription notice:', err);
    });

    const pollInterval = setInterval(refreshAddressData, 30000);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      void fulcrum.unsubscribeAddress(creator.bchAddress, onAddressUpdate).catch(() => {
        // The shared socket may already be closed while this view unmounts.
      });
    };
  }, [creator.bchAddress, fulcrum, refreshAddressData]);

  const handleNetworkChange = (newNet: NetworkType) => {
    setNetwork(newNet);
    setCreator((prev) => ({
      ...prev,
      network: newNet,
      // CashAddr checksum covers the prefix: swapping the prefix in the string
      // alone produces an invalid address. Re-encode payload with the target
      // prefix (recomputed checksum); keep the old address if conversion fails.
      bchAddress: convertCashAddressPrefix(prev.bchAddress, newNet) ?? prev.bchAddress,
    }));
  };

  const handleSaveProfile = (updated: CreatorProfile) => {
    setCreator(updated);
  };

  const handlePaymentSuccess = (payment: PaymentState) => {
    setCompletedPayment(payment);
    playPaymentChime();
    setTimeout(refreshAddressData, 1500);
  };

  // OBS Streamer Overlay Route
  if (isOverlayMode) {
    return (
      <ObsOverlayView
        creator={creator}
        network={network}
        fulcrum={fulcrum}
        bchPrice={bchPrice}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-900 font-sans">
      <HackathonBanner
        network={network}
        onNetworkChange={handleNetworkChange}
        // BLAZE rubrica (Mainnet Track): banner precisa de link dos slides,
        // link do repo público e endereço CashTokens real para EMBER2026.
        // Definir com os valores REAIS do Davi antes do deploy — sem placeholder.
        // slidesUrl="https://..."
        // githubRepoUrl="https://github.com/<davi>/BlazeTip"
        // emberTokenAddress="<cashaddr do Davi, wallet com suporte a CashTokens>"
      />

      <main className="flex-1 flex flex-col justify-center px-4 py-8 sm:py-12">
        {/* Hero Header */}
        <div className="max-w-4xl mx-auto w-full text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
            <Zap className="w-3.5 h-3.5" />
            <span>Instant 0-Conf • Sub-cent Fees • Direct Peer-to-Peer</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Support with <span className="text-emerald-400">Bitcoin Cash</span>
          </h1>

          <p className="text-sm sm:text-base text-slate-400 mt-2 max-w-xl mx-auto">
            Direct, non-custodial checkout & supporter wall for creators, streamers, and developers. No 30% platform cuts.
          </p>

          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setIsEditProfileOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition shadow-sm"
            >
              <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Customize Creator Profile & Embed</span>
            </button>
          </div>

          {!creator.bchAddress.trim() && (
            <p className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-semibold">
              ⚠️ Add and validate your BCH receiving address in “Customize” before accepting tips.
            </p>
          )}
        </div>

        {/* Bento Grid 2-Column Desktop Layout */}
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Supporter Wall & Live Goal (lg:col-span-5) */}
          <div className="lg:col-span-5 w-full">
            <SupporterWall
              creator={creator}
              balanceSats={balanceSats}
              recentTxs={recentTxs}
              bchPriceUsd={bchPrice}
              network={network}
              fulcrumStatus={fulcrumStatus}
              fulcrumError={fulcrumError}
              onOpenEdit={() => setIsEditProfileOpen(true)}
            />
          </div>

          {/* Right Column: Interactive Tip Checkout Card (lg:col-span-7) */}
          <div className="lg:col-span-7 w-full">
            <TipCheckoutCard
              creator={creator}
              bchPriceUsd={bchPrice}
              fulcrumAvailable={Boolean(fulcrumStatus.connectedUrl) && !fulcrumError}
              walletState={wallet}
              onConnectWallet={wallet.connect}
              onRefreshWalletUtxos={wallet.refreshWalletUtxos}
              onNetworkChange={handleNetworkChange}
              onSendWizardConnectTip={async (amountSats, memo) => {
                return wallet.sendTipWithWizardConnect(creator.bchAddress, amountSats, memo);
              }}
              onPaymentSuccess={handlePaymentSuccess}
            />
          </div>
        </div>

        {/* Value Proposition Features */}
        <div className="max-w-5xl mx-auto w-full mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-white">100% Non-Custodial</h4>
            <p className="text-xs text-slate-400 mt-1">
              Funds go straight from the donor's wallet to your address. The platform never holds or controls your coins.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-3">
              <Globe className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-white">WizardConnect Native</h4>
            <p className="text-xs text-slate-400 mt-1">
              Frictionless pairing with Paytaca, Selene, Cashonize and other HD wallets over encrypted relay.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
              <Coins className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-white">CashTokens Ready</h4>
            <p className="text-xs text-slate-400 mt-1">
              Coin selection protects CashToken UTXOs from being burned, and memos are committed on-chain via OP_RETURN.
            </p>
          </div>
        </div>
      </main>

      {/* Official WizardConnect QR Dialog */}
      {wallet.state === 'connecting' && (
        <React.Suspense fallback={null}>
          <WizardConnectQRDialog
            show
            onClose={wallet.disconnect}
            uri={wallet.uri || ''}
            qrUri={wallet.qrUri || ''}
            title="Connect Bitcoin Cash Wallet"
            subtitle="Scan with Paytaca, Selene or Cashonize"
            theme={{
              dialogBackground: '#090d16',
              headerBackground: '#0d1322',
              borderColor: '#1e293b',
              qrForeground: '#022c22',
              qrBackground: '#ffffff',
              titleColor: '#ffffff',
              subtitleColor: '#94a3b8',
            }}
          />
        </React.Suspense>
      )}

      {/* Profile Customization Modal */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        profile={creator}
        onSave={handleSaveProfile}
        onClose={() => setIsEditProfileOpen(false)}
      />

      {/* Payment Receipt & Proof of Payment Modal */}
      {completedPayment && (
        <ReceiptModal
          payment={completedPayment}
          network={network}
          creatorName={creator.name}
          onClose={() => setCompletedPayment(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Built with</span>
            <Heart className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
            <span>for BCH BLAZE 2026 Hackathon</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Bitcoin Cash Mainnet & Chipnet Compliant • Open Source MIT
          </div>
        </div>
      </footer>
    </div>
  );
};
