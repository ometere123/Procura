"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getRfp, getRubric, getRfpBids, getBid, getBidCommitment, getRfpRanking } from "@/lib/genlayer/read";
import { closeRfp, rankRfpBids, finalizeRfp } from "@/lib/genlayer/write";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer/config";
import { NotConfiguredBanner } from "@/components/layout/NotConfiguredBanner";
import { SectionHeading, SignalBadge, GateStatusChip, MonoSignalNumber } from "@/components/ui/Primitives";
import { useWallet } from "@/lib/wallet";
import { useTx } from "@/lib/useTx";
import { TxStatusLine } from "@/components/ui/TxStatusLine";
import type { RFP, Bid, RfpRanking } from "@/types/procura";
import type { TxPhase } from "@/lib/genlayer/contracts";

function formatCompact(n: number | string | undefined) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? "—");
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(num);
}

type Slot =
  | { bid_id: string; revealed: true; bid: Bid }
  | { bid_id: string; revealed: false; vendor: string; commitment_hash: string };

export default function RfpDetailPage({ params }: { params: Promise<{ rfpId: string }> }) {
  const { rfpId } = use(params);
  const { address } = useWallet();
  const [rfp, setRfp] = useState<RFP | null>(null);
  const [rubric, setRubric] = useState<{ items?: unknown[] } | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [ranking, setRanking] = useState<RfpRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const tx = useTx();
  type TxCallback = (phase: TxPhase, hash?: `0x${string}`) => void;

  async function load() {
    if (!CONTRACT_CONFIGURED) { setLoading(false); return; }
    const [r, rb, bidIds, rk] = await Promise.all([
      getRfp(rfpId), getRubric(rfpId), getRfpBids(rfpId), getRfpRanking(rfpId),
    ]);
    setRfp(r); setRubric(rb); setRanking(rk);
    const built: Slot[] = [];
    for (const id of bidIds || []) {
      const bid = await getBid(id);
      if (bid && bid.vendor_name) {
        built.push({ bid_id: id, revealed: true, bid });
      } else {
        const c = await getBidCommitment(id);
        built.push({
          bid_id: id, revealed: false,
          vendor: c?.vendor || "—",
          commitment_hash: c?.commitment_hash || "",
        });
      }
    }
    setSlots(built);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [rfpId]);

  const busy = tx.busy ? tx.label : null;
  async function run<T>(label: string, fn: (cb: TxCallback) => Promise<T>) {
    const r = await tx.run(label, fn);
    if (r !== undefined) await load();
  }

  if (!CONTRACT_CONFIGURED) {
    return <div className="max-w-5xl mx-auto px-6 py-12"><NotConfiguredBanner /></div>;
  }
  if (loading) return <div className="max-w-5xl mx-auto px-6 py-12 font-mono-data text-track">LOADING…</div>;
  if (!rfp) return <div className="max-w-5xl mx-auto px-6 py-12">RFP not found.</div>;

  const sealedCount = slots.filter((s) => !s.revealed).length;
  const revealedCount = slots.filter((s) => s.revealed).length;
  const rfpStatus = rfp.status || "OPEN";
  const canRank = revealedCount > 0 && rfpStatus !== "OPEN";
  const isBuyer = !!address && !!rfp.buyer && address.toLowerCase() === rfp.buyer.toLowerCase();

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">
      <div className="rail-panel">
        <div className="flex flex-wrap gap-3 items-center">
          <span className="font-mono-data text-xs text-track">{rfp.rfp_id}</span>
          <SignalBadge tone="cyan">{rfp.category}</SignalBadge>
          <GateStatusChip status={rfpStatus} />
        </div>
        <div className="font-head text-3xl md:text-4xl text-signalwhite mt-2 leading-tight">{rfp.title}</div>
        <div className="text-concrete text-sm mt-1">{rfp.buyer_org}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <div>
            <div className="font-mono-data text-2xl text-amber">{sealedCount} / {revealedCount}</div>
            <div className="font-mono-data text-[10px] tracking-widest uppercase text-track">Sealed / Revealed</div>
          </div>
          <div>
            <div className="font-mono-data text-2xl text-cyan">{rfp.submission_deadline || "—"}</div>
            <div className="font-mono-data text-[10px] tracking-widest uppercase text-track">Deadline</div>
          </div>
          <div>
            <div className="font-mono-data text-2xl text-lime">{rfp.currency} {formatCompact(rfp.budget_max)}</div>
            <div className="font-mono-data text-[10px] tracking-widest uppercase text-track">Budget Max</div>
          </div>
          <div>
            <div className="font-mono-data text-2xl text-amber truncate">{ranking ? ranking.ranking_status : "—"}</div>
            <div className="font-mono-data text-[10px] tracking-widest uppercase text-track">Ranking Status</div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 items-center">
          {isBuyer ? (
            <div className="signal-stamp text-amber border-amber px-3 py-2">
              ✕ AS THE RFP BUYER YOU CANNOT BID ON THIS RFP
            </div>
          ) : (
            <Link href={`/rfps/${rfpId}/submit-bid`} className="signal-lever">▰ Commit Sealed Bid</Link>
          )}
          {isBuyer && (
            <>
              <button onClick={() => run("Close RFP", (cb) => closeRfp(rfpId, cb))} disabled={!!busy || rfpStatus !== "OPEN"} className="signal-lever secondary">
                {busy === "Close RFP" ? "Closing…" : "Close RFP (Open Reveal Window)"}
              </button>
              <button onClick={() => run("Run Consensus Ranking", (cb) => rankRfpBids(rfpId, cb))} disabled={!!busy || !canRank} className="signal-lever review">
                {busy === "Run Consensus Ranking" ? "Ranking…" : "▰ Run Consensus Ranking"}
              </button>
              <button onClick={() => run("Finalize RFP", (cb) => finalizeRfp(rfpId, cb))} disabled={!!busy} className="signal-lever secondary">
                Finalize
              </button>
            </>
          )}
          {!isBuyer && (
            <div className="font-mono-data text-[10px] tracking-widest uppercase text-track px-2 py-1">
              Buyer-only actions (close · rank · finalize) hidden
            </div>
          )}
        </div>
        <TxStatusLine state={tx} />
      </div>

      <section>
        <SectionHeading kicker="RFP Text" title="Requirements Packet" />
        <div className="tender-paper whitespace-pre-wrap">{rfp.full_text}</div>
      </section>

      <section>
        <SectionHeading kicker="Rubric Switchboard" title="Scoring criteria" tone="cyan" />
        <div className="grid md:grid-cols-2 gap-3">
          {(rubric?.items || []).map((it, i) => {
            const r = it as { category: string; weight: number; mandatory: boolean; description: string };
            return (
              <div key={i} className="gate-card">
                <div className="flex justify-between">
                  <div className="font-head text-xl text-cyan">{r.category}</div>
                  <SignalBadge tone={r.mandatory ? "vermilion" : "track"}>
                    {r.mandatory ? "MANDATORY" : `WEIGHT ${r.weight}`}
                  </SignalBadge>
                </div>
                {r.description && <div className="text-concrete text-sm mt-2">{r.description}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHeading kicker="Bid Yard" title="Sealed bids & revealed packets" />
        <div className="rail-panel mb-4" style={{ borderLeftColor: "var(--violet)" }}>
          <div className="text-concrete text-sm">
            <span className="font-mono-data uppercase text-violet text-[11px] tracking-widest">Sealed bidding before reveal</span>
            <p className="mt-1">
              While the RFP is <span className="text-amber">OPEN</span>, only commitment hashes are
              visible — no vendor can see another vendor&apos;s proposal. After the buyer closes the RFP,
              vendors reveal their bids and GenLayer validators review the revealed proposals.
            </p>
          </div>
        </div>

        {slots.length === 0 ? (
          <div className="rail-panel">
            <div className="font-head text-xl text-amber">No bids submitted yet.</div>
            <p className="text-concrete mt-1">Share this RFP or commit the first sealed bid.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {slots.map((s) => {
              if (s.revealed) {
                const b = s.bid;
                return (
                  <Link key={s.bid_id} href={`/rfps/${rfpId}/bids/${s.bid_id}`}
                    className="block rail-panel hover:border-amber transition-colors">
                    <div className="flex flex-wrap items-center gap-3 justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-data text-xs text-track">{s.bid_id}</span>
                          <SignalBadge tone="lime">REVEALED</SignalBadge>
                          <GateStatusChip status={String(b.status || "REVEALED")} />
                          {b.rank && <SignalBadge tone="amber">RANK #{b.rank}</SignalBadge>}
                        </div>
                        <div className="font-head text-2xl text-signalwhite mt-1">{b.vendor_name}</div>
                      </div>
                      <div className="text-right">
                        {b.procurement_score != null && (
                          <div className="mono-num text-amber">{b.procurement_score}</div>
                        )}
                        <div className="font-mono-data text-[10px] text-track tracking-widest">
                          {b.currency} {b.bid_amount}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              }
              const isMine = address?.toLowerCase() === s.vendor.toLowerCase();
              return (
                <Link key={s.bid_id} href={`/rfps/${rfpId}/bids/${s.bid_id}`}
                  className="block rail-panel hover:border-violet transition-colors"
                  style={{ borderLeftColor: "var(--violet)" }}>
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-data text-xs text-track">{s.bid_id}</span>
                        <SignalBadge tone="violet">SEALED</SignalBadge>
                        {isMine && <SignalBadge tone="amber">YOURS</SignalBadge>}
                      </div>
                      <div className="font-head text-2xl text-track mt-1">▢ Hidden until reveal</div>
                      <div className="font-mono-data text-[10px] text-track mt-1 break-all">
                        HASH {s.commitment_hash.slice(0, 24)}…
                      </div>
                    </div>
                    <div className="font-mono-data text-[10px] text-track tracking-widest text-right">
                      VENDOR<br />{s.vendor.slice(0, 6)}…{s.vendor.slice(-4)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHeading kicker="Consensus Ranking" title="Award signal" tone="lime" />
        {!ranking ? (
          <div className="rail-panel">
            <div className="font-head text-xl text-track">Awaiting consensus ranking.</div>
            <p className="text-concrete text-sm mt-1">
              Run Consensus Ranking after the RFP is closed and at least one bid has been revealed and reviewed.
            </p>
          </div>
        ) : (
          <div className="rail-panel" style={{ borderLeftColor: "var(--lime)" }}>
            <div className="flex flex-wrap gap-4 items-center">
              <GateStatusChip status={ranking.ranking_status} />
              <SignalBadge tone="cyan">CONFIDENCE {ranking.ranking_confidence}</SignalBadge>
              <SignalBadge tone="amber">{ranking.total_bids_reviewed} BIDS</SignalBadge>
            </div>
            <div className="mt-6 space-y-2">
              {ranking.ranked_bids.map((rb) => (
                <div key={rb.bid_id} className="border border-graphite p-3 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <div className="font-head text-2xl text-amber">#{rb.rank} · {rb.bid_id}</div>
                    <div className="text-concrete text-sm">{rb.reason}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MonoSignalNumber value={rb.procurement_score} label="Score" />
                    <GateStatusChip status={rb.award_recommendation} />
                  </div>
                </div>
              ))}
            </div>
            {ranking.award_summary?.recommended_bid_id && (
              <div className="tender-paper mt-6">
                <div className="font-head text-2xl">Award Recommendation</div>
                <div className="font-mono-data text-sm mt-2">
                  PRIMARY → {ranking.award_summary.recommended_bid_id} ·
                  {ranking.award_summary.currency} {ranking.award_summary.recommended_contract_value}
                </div>
                {ranking.award_summary.backup_bid_id && (
                  <div className="font-mono-data text-sm">BACKUP → {ranking.award_summary.backup_bid_id}</div>
                )}
              </div>
            )}
            {ranking.tie_breaks?.length > 0 && (
              <div className="mt-4">
                <div className="font-mono-data text-[11px] tracking-widest uppercase text-cyan">Tie-breaks</div>
                <ul className="text-concrete text-sm list-disc pl-5">{ranking.tie_breaks.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )}
            {ranking.red_flags?.length > 0 && (
              <div className="mt-4">
                <div className="font-mono-data text-[11px] tracking-widest uppercase text-vermilion">Red Flags</div>
                <ul className="text-concrete text-sm list-disc pl-5">{ranking.red_flags.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )}
            <div className="text-concrete text-sm mt-4">{ranking.reasoning_summary}</div>
          </div>
        )}
      </section>

      <section className="rail-panel" style={{ borderLeftColor: "var(--violet)" }}>
        <div className="font-mono-data text-[11px] tracking-widest uppercase text-violet">
          Why this needed GenLayer
        </div>
        <p className="text-concrete mt-2 max-w-3xl">
          Commit-reveal stops bid-peeking during the active round, but the procurement *decision*
          still requires interpretation — proposal quality, qualitative fit, delivery feasibility,
          and price-value tradeoffs against an open-ended rubric. GenLayer validators reach
          consensus on the ranking after reveal instead of relying on deterministic scoring.
        </p>
      </section>
    </div>
  );
}
