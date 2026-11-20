# BlazeTip — Non-Custodial BCH Creator Checkout

**BCH BLAZE 2026 (DoraHacks) · v0.1.0**

BlazeTip is a **non-custodial** checkout, supporter wall and streamer alert
widget for Bitcoin Cash. Creators drop it on their site or OBS scene; supporters
pay **directly from their own wallet to the creator's address** — the platform
never holds keys or coins, and takes no cut.

## The problem

Creator tip pages can take large platform cuts, hold custody of funds, or lack
real-time feedback for live streams. Bitcoin Cash enables low-cost payments and
supports 0-conf acceptance where the recipient's risk policy allows it; what's
missing is a ready-made front-end: checkout, QR/BIP-21, live supporter wall,
and OBS alerts. BlazeTip is that front-end, with **zero custody by design** and
no platform fee (network fees still apply).

## 2-minute demo

For a demo without real funds, open `http://localhost:3000/?net=chipnet` and
configure a **Chipnet** receiving address under **Customize**. The starter
profile has no address, so checkout remains unavailable until one is set. To
show live payments, use a Chipnet wallet funded with test coins; do not approve
a Mainnet transaction for a demo.

1. Point out the live Fulcrum balance and on-chain feed on the supporter wall.
2. Select a tip amount and memo, then scan the **WizardConnect** pairing QR
   with a Chipnet wallet. Review the wallet prompt; BlazeTip assembles the
   transaction and asks Fulcrum to broadcast it. A receipt appears only after
   Fulcrum either returns a TXID or retrieves byte-for-byte identical
   transaction data under the locally derived TXID (for an already-broadcast
   transaction).
3. Show the detected payment and `BLAZE:` memo in the supporter wall.
4. Open `http://localhost:3000/?net=chipnet&overlay=1` in OBS as a Browser
   Source. A real detected payment triggers the alert and chime; **Test Alert**
   is clearly marked as a demo and does not represent a payment.
5. Mention the **QR/BIP-21** rail for wallets that do not use WizardConnect.

Without a funded Chipnet wallet, demonstrate the interface and use **Test
Alert** to show the overlay animation. Do not describe that test alert as an
on-chain event.

## Architecture

```
src/
├── App.tsx                    # Landing + OBS overlay route (?overlay=1)
├── components/
│   ├── TipCheckoutCard.tsx    # Dual rail: WizardConnect / BIP-21 QR
│   ├── SupporterWall.tsx      # Goal bar, on-chain feed, Fulcrum latency
│   ├── ReceiptModal.tsx       # TxID + explorer link, mempool (0-conf) status
│   ├── EditProfileModal.tsx   # Name/bio/address/goal + iframe embed code
│   └── HackathonBanner.tsx    # Header, network switcher (Mainnet/Chipnet)
├── hooks/useBchWallet.ts      # WizardConnect HD wallet: UTXO scan, tx assembly
├── services/fulcrum.ts        # Electrum RPC over WebSocket (balance, history,
│                              #  listunspent, subscribe, broadcast)
├── utils/tx.ts                # Pure coin-selection, fee & output assembly (tested)
└── utils/bch.ts               # BIP-21 build/parse, BCH/USD formatting, explorers
```

Key decisions:

- **Fulcrum (Electrum protocol) over WebSocket** — no API keys, no custodial
  middleman; subscribes to scripthash notifications for real-time 0-conf.
- **WizardConnect** for one-click pairing with BCH HD wallets; the wallet signs
  (`broadcast: true`) and BlazeTip attempts a Fulcrum broadcast. A receipt is
  shown only when Fulcrum accepts the broadcast or confirms the exact
  transaction bytes under its locally derived TXID; if verification fails,
  the app asks the user to check their wallet and explorer before trying again. The pairing
  dialog UI loads on demand. The wallet hook still imports
  WizardConnect at app startup, so the provider dependencies remain in the
  initial transfer: the latest measured build emitted a 90.37 kB app entry,
  495.05 kB libauth chunk, and 626.57 kB WizardConnect chunk (minified).
  Vite warns about chunks over 500 kB; reducing the startup transfer remains
  open work.
- **CashToken protection**: the UTXO scan skips outputs carrying `token_data`,
  so a tip can never burn a supporter's tokens.
- **Honest receipts**: the receipt states the payment is in the mempool
  awaiting confirmation — never claims "confirmed".

## Run it (Chipnet)

```sh
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:3000 — starts on Mainnet
```

For a **safe test without real money**:

1. Click **Chipnet (Test)** in the header or open `?net=chipnet`. In checkout,
   the **Switch to Chipnet · $0.05** preset changes the network and selects a
   $0.05 test tip. The receiving
   address is re-encoded as a valid `bchtest:` CashAddr (checksum recomputed —
   not a naive prefix swap) and Fulcrum endpoints switch to
   chipnet.imaginary.cash.
2. Fund a Chipnet wallet from the faucet: <https://chipnet.cash/>
3. Connect the wallet (Paytaca/Selene/Cashonize on Chipnet) and send a tip.

Quality gates:

```sh
pnpm build          # tsc (strict) + vite build — must be clean
pnpm test           # 122 cases across root + BCH_PACOTE snapshot (61 each):
  # USD-to-sats quote handling, sats/fee math, coin selection,
                    # BIP-21 build/parse, OP_RETURN build/parse, txid derivation
```

All transaction math lives in pure, unit-tested functions (`src/utils/tx.ts`,
`src/utils/bch.ts`, `src/services/fulcrum.ts`).

## What BlazeTip does NOT do

- No keys, seeds or custody — ever. No `.env` secrets.
- Payment alerts are triggered by Fulcrum events; the separate **Test Alert**
  control emits a clearly labeled demo animation and does not represent a
  payment.
- No backend; the whole app is client-side talking to Fulcrum + CoinGecko
  (USD price, refreshed every 60s). If no live price has been fetched yet, the
  interface marks USD values unavailable instead of showing a hardcoded quote.

## License

MIT.
