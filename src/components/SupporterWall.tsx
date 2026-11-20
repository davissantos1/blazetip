import React, { useState } from 'react';
import { 
  Sparkles, 
  ExternalLink, 
  Share2, 
  Tv, 
  Settings2, 
  Check, 
  Radio, 
  Coins, 
  Target,
  MessageCircle
} from 'lucide-react';
import { CreatorProfile, OnChainTx, NetworkType } from '../types';
import { formatBch, formatUsd, getExplorerUrl, SATOSHIS_PER_BCH } from '../utils/bch';

interface SupporterWallProps {
  creator: CreatorProfile;
  balanceSats: { confirmed: number; unconfirmed: number };
  recentTxs: OnChainTx[];
  bchPriceUsd: number;
  network: NetworkType;
  fulcrumStatus: { connectedUrl: string | null; latencyMs: number | null };
  fulcrumError: boolean;
  onOpenEdit: () => void;
}

export const SupporterWall: React.FC<SupporterWallProps> = ({
  creator,
  balanceSats,
  recentTxs,
  bchPriceUsd,
  network,
  fulcrumStatus,
  fulcrumError,
  onOpenEdit,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedObs, setCopiedObs] = useState(false);
  const hasReceivingAddress = creator.bchAddress.trim().length > 0;

  const totalSats = balanceSats.confirmed + balanceSats.unconfirmed;
  const totalBch = totalSats / SATOSHIS_PER_BCH;
  const totalUsd = totalBch * bchPriceUsd;

  // Only show transactions that actually paid this address (amountSats is the
  // value received, not the sum of every output). Outgoing txs from the
  // creator's own address are not tips and are hidden.
  const tips = recentTxs.filter((tx) => (tx.amountSats ?? 0) > 0);

  const goalUsd = creator.goalUsd;
  const hasGoal = goalUsd !== undefined && Number.isFinite(goalUsd) && goalUsd > 0;
  const hasUsdQuote = bchPriceUsd > 0;
  const progressPercent = hasUsdQuote && hasGoal
    ? Math.min(100, Math.round((totalUsd / (goalUsd as number)) * 100))
    : null;

  const handleCopyLink = () => {
    const params = new URLSearchParams({
      net: network,
      to: creator.bchAddress,
      name: creator.name,
      handle: creator.handle,
      bio: creator.bio,
      goal: goalUsd?.toString() ?? '',
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyObsUrl = () => {
    const params = new URLSearchParams({
      net: network,
      overlay: '1',
      to: creator.bchAddress,
      name: creator.name,
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url);
    setCopiedObs(true);
    setTimeout(() => setCopiedObs(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Creator Profile & Live Goal Card */}
      <div className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-6 sm:p-7 backdrop-blur-xl shadow-xl relative overflow-hidden">
        <div className="flex items-start gap-4">
          {creator.avatarUrl ? (
            <img
              src={creator.avatarUrl}
              alt={creator.name}
              className="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-500/30 p-0.5 bg-slate-800 shrink-0"
            />
          ) : (
            <div aria-hidden="true" className="w-16 h-16 rounded-2xl ring-2 ring-emerald-500/30 bg-slate-800 shrink-0 flex items-center justify-center text-emerald-400 font-bold">BT</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-display text-white truncate">{creator.name}</h2>
              <span className="p-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{creator.handle}</p>
            <p className="text-xs text-slate-300 mt-2 line-clamp-2 leading-relaxed">{creator.bio}</p>
          </div>
        </div>

        {/* Live On-Chain Crowdfunding Goal Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <span>On-Chain Goal</span>
            </span>
            <span className="font-mono text-emerald-400 font-bold">
              {!hasReceivingAddress ? 'Address not configured' : !hasGoal ? 'Goal not configured' : progressPercent === null ? 'USD rate unavailable' : `${progressPercent}% Funded`}
            </span>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-3.5 border border-slate-800/80 overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 h-full rounded-full transition-all duration-700 shadow-sm shadow-emerald-500/50"
              style={{ width: `${hasReceivingAddress ? progressPercent ?? 0 : 0}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 font-mono">
            <span>
              Raised: <strong className="text-slate-200">{!hasReceivingAddress ? 'Set a receiving address' : hasUsdQuote ? formatUsd(totalUsd) : 'USD rate unavailable'}</strong> {hasReceivingAddress && `(${totalBch.toFixed(4)} BCH)`}
            </span>
            <span>
              Goal: <strong className="text-slate-200">{hasGoal ? formatUsd(goalUsd) : 'Not configured'}</strong>
            </span>
          </div>
        </div>

        {/* Action Buttons for Creator */}
        <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
          <button
            onClick={handleCopyLink}
            disabled={!hasReceivingAddress}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-200 font-medium transition"
            title="Copy shareable link with creator parameters"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-slate-400" />}
            <span className="truncate">{copiedLink ? 'Copied' : 'Share Link'}</span>
          </button>

          <button
            onClick={handleCopyObsUrl}
            disabled={!hasReceivingAddress}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-200 font-medium transition"
            title="Copy OBS Studio Browser Source Overlay URL"
          >
            {copiedObs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Tv className="w-3.5 h-3.5 text-amber-400" />}
            <span className="truncate">{copiedObs ? 'Copied' : 'OBS Overlay'}</span>
          </button>

          <button
            onClick={onOpenEdit}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-200 font-medium transition"
            title="Edit address and profile"
          >
            <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate">Edit Profile</span>
          </button>
        </div>
      </div>

      {/* Live Supporter Wall (On-Chain Txs with OP_RETURN) */}
      <div className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-6 sm:p-7 backdrop-blur-xl shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold font-display text-white flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span>On-Chain Supporter Wall</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-400">Live Blockchain Feed</span>
        </div>

        {tips.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800/80 rounded-2xl">
            <p>No recent tips found on this address yet.</p>
            <p className="text-[11px] text-slate-600 mt-1">Be the first to leave an on-chain note!</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tips.map((tx) => {
              const isUnconfirmed = tx.height <= 0;
              const bchVal = (tx.amountSats || 0) / SATOSHIS_PER_BCH;
              const usdVal = bchVal * bchPriceUsd;

              return (
                <div
                  key={tx.txid}
                  className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 transition text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-extrabold text-slate-100 font-mono text-sm">
                      {tx.amountSats ? `${formatBch(tx.amountSats)} BCH` : 'Tip Received'}
                      {tx.amountSats && (
                        <span className="text-[11px] text-slate-400 font-normal ml-1.5">
                          {bchPriceUsd > 0 ? `(≈ ${formatUsd(usdVal)})` : '(USD rate unavailable)'}
                        </span>
                      )}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                        isUnconfirmed
                          ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                          : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                      }`}
                    >
                      {isUnconfirmed ? '⚡ 0-Conf Mempool' : `✓ Block #${tx.height}`}
                    </span>
                  </div>

                  {tx.memo && (
                    <div className="mt-2 p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-200 font-serif italic flex items-start gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="break-words">"{tx.memo}"</span>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span className="truncate max-w-[200px]">{tx.txid}</span>
                    <a
                      href={getExplorerUrl(tx.txid, network)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline flex items-center gap-1 ml-2 shrink-0"
                    >
                      <span>Explorer</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {fulcrumError && hasReceivingAddress && (
        <p role="alert" className="px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
          Fulcrum is unavailable. Balance and supporter feed were cleared; reconnect to refresh live data.
        </p>
      )}

      {/* Network Telemetry Badge */}
      <div className="px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <Radio className={`w-3.5 h-3.5 ${fulcrumError ? 'text-amber-400' : 'text-emerald-400 animate-pulse'}`} />
          <span>
            Fulcrum Electrum:{' '}
            <strong className="text-slate-300">
              {fulcrumError ? 'Unavailable' : fulcrumStatus.connectedUrl ? fulcrumStatus.connectedUrl.replace('wss://', '').split(':')[0] : hasReceivingAddress ? 'Connecting...' : 'Address not configured'}
            </strong>
          </span>
        </div>
        {fulcrumStatus.latencyMs !== null && (
          <span className="text-emerald-400 font-semibold">{fulcrumStatus.latencyMs}ms</span>
        )}
      </div>
    </div>
  );
};
