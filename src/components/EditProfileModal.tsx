import React, { useEffect, useState } from 'react';
import { X, Save, Check, Settings, Code, Copy, AlertTriangle } from 'lucide-react';
import { CreatorProfile, NetworkType } from '../types';
import { validateBchAddressForNetwork } from '../utils/bch';

interface EditProfileModalProps {
  isOpen: boolean;
  profile: CreatorProfile;
  onSave: (updated: CreatorProfile) => void;
  onClose: () => void;
}

/** Returns null when the address is a valid BCH CashAddr for the network, otherwise an error message. */
function validateBchAddress(raw: string, network: NetworkType): string | null {
  const addr = raw.trim();
  if (!addr) return 'Receiving address is required.';
  try {
    return validateBchAddressForNetwork(addr, network);
  } catch {
    return 'Invalid BCH CashAddr format. Use an address like bitcoincash:qr...';
  }
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  profile,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [bchAddress, setBchAddress] = useState(profile.bchAddress);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [goalUsd, setGoalUsd] = useState<number>(profile.goalUsd ?? 0);
  const [amountsStr, setAmountsStr] = useState(profile.suggestedAmountsUsd.join(', '));
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const network: NetworkType = profile.network;

  useEffect(() => {
    if (!isOpen) return;
    setName(profile.name);
    setHandle(profile.handle);
    setBio(profile.bio);
    setBchAddress(profile.bchAddress);
    setAvatarUrl(profile.avatarUrl);
    setGoalUsd(profile.goalUsd ?? 0);
    setAmountsStr(profile.suggestedAmountsUsd.join(', '));
    setAddressError(null);
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateBchAddress(bchAddress, network);
    if (error) {
      setAddressError(error);
      return;
    }
    const amounts = amountsStr
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    onSave({
      ...profile,
      name,
      handle,
      bio,
      bchAddress: bchAddress.trim(),
      avatarUrl: avatarUrl.trim() || profile.avatarUrl,
      goalUsd: Number(goalUsd) > 0 ? Number(goalUsd) : undefined,
      suggestedAmountsUsd: amounts.length > 0 ? amounts : [1, 5, 10, 20],
    });
    onClose();
  };

  const embedUrl = new URL(window.location.pathname, window.location.origin);
  embedUrl.search = new URLSearchParams({
    net: profile.network,
    to: profile.bchAddress,
    name: profile.name,
    handle: profile.handle,
    bio: profile.bio,
    goal: profile.goalUsd?.toString() ?? '',
  }).toString();
  const embedSnippet = `<iframe src="${embedUrl.toString().replace(/&/g, '&amp;')}" width="420" height="580" style="border:none;border-radius:24px;overflow:hidden;" title="BlazeTip BCH Widget"></iframe>`;

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative text-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Customize Your Tipping Page</h3>
            <p className="text-xs text-slate-400">Set your receiving BCH address and personal profile.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Creator Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Handle / Social Tag</label>
            <input
              type="text"
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Your Receiving BCH Address</label>
            <input
              type="text"
              required
              placeholder="bitcoincash:qp..."
              value={bchAddress}
              onChange={(e) => {
                setBchAddress(e.target.value);
                if (addressError) setAddressError(null);
              }}
              onBlur={() => setAddressError(validateBchAddress(bchAddress, network))}
              className={`w-full px-3.5 py-2.5 bg-slate-950 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${addressError ? 'border border-red-500/60' : 'border border-slate-800'}`}
            />
            {addressError && (
              <p className="mt-1.5 flex items-center gap-1.5 text-red-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{addressError}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Short Bio</label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Avatar Image URL</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Crowdfunding Goal (USD, optional; 0 disables)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={goalUsd}
              onChange={(e) => setGoalUsd(parseFloat(e.target.value) || 0)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Preset Tip Amounts (USD, comma-separated)</label>
            <input
              type="text"
              value={amountsStr}
              onChange={(e) => setAmountsStr(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div className="pt-3 border-t border-slate-800">
            <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5 text-emerald-400" />
              <span>Embed Widget Snippet (Iframe)</span>
            </label>
            <div className="flex items-center gap-2 p-2 bg-slate-950 border border-slate-800 rounded-xl">
              <input
                type="text"
                readOnly
                value={embedSnippet}
                className="w-full bg-transparent font-mono text-[10px] text-slate-400 outline-none select-all"
              />
              <button
                type="button"
                onClick={handleCopyEmbed}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition shrink-0 flex items-center gap-1 text-[11px]"
              >
                {copiedEmbed ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedEmbed ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20"
            >
              <Save className="w-4 h-4" />
              <span>Save Profile</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
