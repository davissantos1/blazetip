import React from 'react';
import { ExternalLink, FileText, Github, Flame } from 'lucide-react';
import { NetworkType } from '../types';

interface HackathonBannerProps {
  network: NetworkType;
  onNetworkChange: (net: NetworkType) => void;
  /** Rendered only when a real, reachable URL is provided. */
  githubRepoUrl?: string;
  /** Rendered only when a real, reachable URL is provided. */
  slidesUrl?: string;
  /**
   * CashTokens address able to receive EMBER2026 tokens (BLAZE Community
   * Choice voting). Rendered only when provided — set the creator's real
   * address in App.tsx before deploying; never a placeholder.
   */
  emberTokenAddress?: string;
}

export const HackathonBanner: React.FC<HackathonBannerProps> = ({
  network,
  onNetworkChange,
  githubRepoUrl,
  slidesUrl,
  emberTokenAddress,
}) => {
  return (
    <header className="w-full bg-slate-900/90 backdrop-blur-md border-b border-emerald-500/20 sticky top-0 z-50 text-xs">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand / Event Tag */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 rounded-full font-semibold text-emerald-400">
            <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>BCH BLAZE 2026</span>
          </div>
          <span className="hidden sm:inline text-slate-400">|</span>
          <span className="hidden sm:inline text-slate-300 font-medium">Widget Factory Entry</span>
        </div>

        {/* Submission Links — shown only when real URLs are configured */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {slidesUrl && (
            <a
              href={slidesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-slate-300 hover:text-emerald-400 transition-colors px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50"
              title="Presentation Slides"
            >
              <FileText className="w-3 h-3 text-emerald-400" />
              <span>Pitch Slides</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}

          {githubRepoUrl && (
            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-slate-300 hover:text-emerald-400 transition-colors px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50"
              title="Public Open-Source Repository"
            >
              <Github className="w-3 h-3 text-slate-200" />
              <span>Source Code</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}

          {emberTokenAddress && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(emberTokenAddress).catch(() => {});
              }}
              title={`EMBER2026 token address (Community Choice voting): ${emberTokenAddress} — click to copy`}
              className="flex items-center gap-1 text-slate-300 hover:text-amber-400 transition-colors px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 font-mono"
            >
              <Flame className="w-3 h-3 text-amber-400" />
              <span>Vote EMBER2026</span>
            </button>
          )}
        </div>

        {/* Network Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => onNetworkChange('mainnet')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all ${
              network === 'mainnet'
                ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ● Mainnet
          </button>
          <button
            onClick={() => onNetworkChange('chipnet')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all ${
              network === 'chipnet'
                ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Chipnet (Test)
          </button>
        </div>
      </div>
    </header>
  );
};
