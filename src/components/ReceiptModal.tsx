import React from 'react';
import { CheckCircle2, ExternalLink, Download, X, Copy, Check, ShieldCheck } from 'lucide-react';
import { PaymentState, NetworkType } from '../types';
import { formatBch, formatUsd, getExplorerUrl } from '../utils/bch';

interface ReceiptModalProps {
  payment: PaymentState;
  network: NetworkType;
  creatorName: string;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  payment,
  network,
  creatorName,
  onClose,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!payment.txid) return null;

  const explorerUrl = payment.explorerUrl || getExplorerUrl(payment.txid, network);

  const handleCopyTxid = () => {
    navigator.clipboard.writeText(payment.txid || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-3 shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h3 className="text-2xl font-bold tracking-tight text-white font-display">Payment Broadcast</h3>
          <p className="text-sm text-slate-400 mt-1">
            Sent to <span className="text-emerald-400 font-semibold">{creatorName}</span> on Bitcoin Cash {network === 'mainnet' ? 'Mainnet' : 'Chipnet'}.
          </p>
        </div>

        {/* Real Mainnet Badge */}
        {payment.isRealMainnetTx && (
          <div className="mb-5 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Real Mainnet Transaction Broadcast to BCH Network</span>
          </div>
        )}

        {/* Amount Box */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 text-center mb-6">
          <div className="text-3xl font-extrabold text-white tracking-tight font-mono">
            {formatBch(payment.satsAmount)} <span className="text-emerald-400 text-xl font-bold">BCH</span>
          </div>
          <div className="text-sm text-slate-400 mt-0.5">
            ≈ {formatUsd(payment.usdAmount)} USD ({payment.satsAmount.toLocaleString()} satoshis)
          </div>
        </div>

        {/* Transaction Details */}
        <div className="space-y-3 text-xs mb-6">
          {payment.senderNote && (
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400 block mb-0.5 font-medium">On-Chain Memo (OP_RETURN):</span>
              <p className="text-slate-200 italic font-serif">"{payment.senderNote}"</p>
            </div>
          )}

          <div className="flex justify-between items-center py-1.5 border-b border-slate-800/60">
            <span className="text-slate-400">Network Status</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium font-mono text-[11px]">
              ● In mempool · awaiting confirmation
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-slate-800/60">
            <span className="text-slate-400">Timestamp</span>
            <span className="text-slate-200 font-mono">
              {new Date(payment.timestamp || Date.now()).toLocaleString()}
            </span>
          </div>

          <div className="py-1.5">
            <span className="text-slate-400 block mb-1">Transaction Hash (TXID)</span>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800">
              <span className="truncate text-slate-300 font-mono text-[11px] select-all">
                {payment.txid}
              </span>
              <button
                onClick={handleCopyTxid}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition shrink-0"
                title="Copy TXID"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
          >
            <span>View on {network === 'chipnet' ? 'chipnet.imaginary.cash' : 'Blockchair'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={handlePrint}
            className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Print Receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
};
