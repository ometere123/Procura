# PROCURA

> Procurement decisions judged by proposals, rubrics, and consensus.

PROCURA is a GenLayer-native **procurement bid evaluator and vendor selection consensus
layer**. Buyers create RFPs and rubrics. Vendors submit **sealed bids** with a commit-reveal
flow. After the RFP closes and vendors reveal their proposals, GenLayer validators
read the RFP, the rubric, the vendor's proposal and supporting evidence, then reach
consensus on a structured bid review — eligibility, scores per gate, red flags,
clarification requests, and a final ranking with award recommendation.

The contract is the source of truth. Every review, ranking, clarification decision
and appeal decision is non-deterministic LLM output that has been agreed on by
GenLayer validators and persisted on-chain.

---

## Stack

- **Contract** — `contracts/Procura.py` (py-genlayer)
- **Frontend** — Next.js 15 (App Router) · TypeScript strict · Tailwind CSS
- **Chain** — GenLayer Studionet (chainId `61999`)
- **Wallet** — injected EIP-1193 (MetaMask)
- **SDK** — `genlayer-js@1.1.7`

UI direction: **Bid Signal Yard** — industrial procurement signal yard with rail
panels, signal-lever buttons, tender-paper forms, and Award Signal panels per
bid.

---

## Routes

| Route | What it does |
|---|---|
| `/` | Landing — Signal Yard Hero, Signal Gates, Why-GenLayer |
| `/rfps` | RFP rail yard with sealed/revealed counts per round |
| `/create-rfp` | 10-step RFP foundry wizard incl. Rubric Switchboard |
| `/rfps/[id]` | RFP detail — text, rubric, bid yard, Consensus Ranking, Award Signal |
| `/rfps/[id]/submit-bid` | Sealed bid packet wizard (commit-only) |
| `/rfps/[id]/bids/[bidId]` | Bid detail — Proposal Packet, Signal Gate Matrix, Award Signal Panel |
| `/rfps/[id]/bids/[bidId]/evidence` | Evidence locker |
| `/rfps/[id]/bids/[bidId]/clarification` | Clarification loop |
| `/rfps/[id]/bids/[bidId]/appeal` | Appeal chamber |
| `/api/rfps` | Server-side fan-out for the RFP list (rate-limit safe) |

---

## Setup

```bash
npm install
cp .env.example .env.local
```

Deploy `contracts/Procura.py` to GenLayer Studionet via the GenLayer Studio,
copy the resulting contract address into `.env.local`:

```env
NEXT_PUBLIC_GENLAYER_NETWORK_NAME=GenLayer Studionet
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_EXPLORER_URL=https://explorer-studio.genlayer.com
NEXT_PUBLIC_GENLAYER_CURRENCY=GEN
NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS=0x...
```

Then:

```bash
npm run dev
```

The UI surfaces a *"GenLayer contract is not configured yet"* banner until the
address is set.

---

## Wallet flow

Click **▰ Connect Wallet**. The app uses your injected provider (`window.ethereum`)
and switches the wallet to Studionet (chainId `61999`); if Studionet isn't in
your wallet yet, it offers an `wallet_addEthereumChain`.

Writes go through `genlayer-js`'s `createClient({ chain: studionet, account,
provider: window.ethereum })` directly — no MetaMask Snap (no
`wallet_getSnaps` / `wallet_requestSnaps`), no stock `eth_sendTransaction`
fallback.

---

## Commit-reveal sealed bidding

1. Buyer creates the RFP.
2. Vendors call `submit_bid_commitment(bid_id, rfp_id, commitment_hash)` while
   the RFP is `OPEN`. Only the SHA-256 hash hits chain. The bid JSON + a 32-byte
   random salt are saved to the vendor's browser (localStorage).
3. Buyer closes the RFP. New commitments are rejected.
4. Vendors call `reveal_bid(bid_id, bid_json, salt)`. The contract recomputes
   `sha256(bid_json + salt)` and rejects on mismatch. Wrong-vendor reveals are
   also rejected.
5. After reveal, GenLayer reviews the bid (`review_bid`) and the RFP-wide ranker
   (`rank_rfp_bids`) produces an award recommendation.

The buyer is blocked at the contract level from submitting a bid on their own
RFP. `close_rfp`, `finalize_rfp`, `review_bid`, `review_clarification`,
`review_appeal`, and `rank_rfp_bids` are all gated to the RFP buyer.

---

## Non-deterministic functions

All AI calls use `gl.eq_principle.prompt_non_comparative(callable, task=..., criteria=...)`:

- `review_bid(bid_id)`
- `rank_rfp_bids(rfp_id)`
- `detect_bid_similarity(bid_a, bid_b)`
- `review_clarification(clarification_id)`
- `review_appeal(appeal_id)`
- `interpret_requirement(bid_id, requirement_id)`
- `assess_commercial_value(bid_id)`
- `assess_delivery_feasibility(bid_id)`

The inner `run()` callable validates the leader's output against strict schema
constraints (allowed enums, score ranges, required fields). If the LLM returns
something invalid, `_require` raises and the validators don't accept it.

---

## Tests

`scripts/test-all.mjs` runs an on-chain end-to-end suite in three buckets:

```bash
# Required env vars — fill into .env.local (never commit)
NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS=0x...
PROCURA_BUYER_PK=0x...
PROCURA_VENDOR1_PK=0x...
PROCURA_VENDOR2_PK=0x...
PROCURA_VENDOR3_PK=0x...
PROCURA_VENDOR4_PK=0x...

# Full sweep
node scripts/test-all.mjs

# Single bucket
node scripts/test-all.mjs --bucket 2

# Specific suites
node scripts/test-all.mjs nondet-rank-rfp nondet-review-bid

# Continue past failures (useful for nondet suites on Studionet)
node scripts/test-all.mjs --bucket 3 --continue
```

| Bucket | Coverage |
|---|---|
| 1 — happy path | `create_rfp` → 4× sealed commit → close → 4× reveal, with state-read assertions after every write |
| 2 — reverts | 14 deterministic guards: empty/duplicate RFP, buyer-self-bid, non-buyer close/review/rank/finalize, commit-after-close, duplicate commitment, bad hash, RFP-not-found, reveal-before-close, wrong-vendor reveal, reveal-hash-mismatch |
| 3 — nondet | review_bid + rank_rfp_bids + review_clarification + review_appeal — full schema validation on the stored leader output |

Each nondet write runs in a child process (`scripts/test/write-worker.mjs`) so
SDK polling hangs can't stall the suite. The parent polls receipts on its own
`getTransaction` loop with a heartbeat every 60 s and retries on `UNDETERMINED`.

Debug helpers:

```bash
node scripts/get-one-rfp.mjs                    # last RFP id from the chain
node scripts/inspect-tx.mjs 0x<hash>            # decode leader_receipt + genvm_result
node scripts/read-review.mjs <bid_id>           # read get_bid_review for a bid
powershell -File scripts/smoke-routes.ps1       # HTTP smoke against localhost:3100
```

---

## Honest limitations

- **Studionet validator divergence.** `prompt_non_comparative` on long LLM
  outputs occasionally finalizes as `UNDETERMINED` after leader rotation. The
  test runner detects this, cools down 90 s and retries. The UI surfaces the
  same status via the tx status strip.
- **SDK return short-circuit.** `prompt_non_comparative` can occasionally
  return `{"accept":true}` instead of the leader's `run()` output, which then
  lands in storage. The test runner detects this via a content sanity check
  and retries the call.
- **30 req/min on Studionet RPC.** `/rfps` does N+1 reads on cold load; the
  `/api/rfps` route sequentially fetches with a 2.5 s spacing so all RFPs land
  reliably. In `npm run dev` this is ~90 s on the first hit; production
  (`npm run build && npm start`) uses ISR.
- **Per-vendor draft storage is localStorage.** A vendor must reveal from the
  same browser profile that committed. There is no off-chain backup. Switching
  browsers between commit and reveal loses the salt and the bid cannot be
  revealed.

---

## License

MIT.
