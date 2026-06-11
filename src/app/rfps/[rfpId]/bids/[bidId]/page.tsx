"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getBid, getBidCommitment, getBidEvidence, getBidReview, getRfpRanking, getRfp } from "@/lib/genlayer/read";
import { reviewBid, revealBid, assessCommercialValue, assessDeliveryFeasibility } from "@/lib/genlayer/write";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer/config";
import { NotConfiguredBanner } from "@/components/layout/NotConfiguredBanner";
import { SectionHeading, SignalBadge, GateStatusChip, MonoSignalNumber } from "@/components/ui/Primitives";
import { GatePanel } from "@/components/signal-gates/GatePanel";
import { getDraft, markRevealed } from "@/lib/sealedBids";
import { useWallet } from "@/lib/wallet";
import { useTx } from "@/lib/useTx";
import { TxStatusLine } from "@/components/ui/TxStatusLine";
import type { TxPhase } from "@/lib/genlayer/contracts";
import type { Bid, Evidence, BidReview, RfpRanking, RFP } from "@/types/procura";

export default function BidDetailPage({ params }: { params: Promise<{ rfpId: string; bidId: string }> }) {
  const { rfpId, bidId } = use(params);
  const { address } = useWallet();
  const [rfp, setRfp] = useState<RFP | null>(null);
  const [bid, setBid] = useState<Bid | null>(null);
  const [commitment, setCommitment] = useState<{ vendor: string; status: string; commitment_hash: string } | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [review, setReview] = useState<BidReview | null>(null);
  const [ranking, setRanking] = useState<RfpRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const tx = useTx();
  type TxCallback = (phase: TxPhase, hash?: `0x${string}`) => void;
  const draft = typeof window !== "undefined" ? getDraft(bidId) : null;

  async function load() {
    if (!CONTRACT_CONFIGURED) { setLoading(false); return; }
    const [r, c, b, ev, rv, rk] = await Promise.all([
      getRfp(rfpId), getBidCommitment(bidId), getBid(bidId),
      getBidEvidence(bidId), getBidReview(bidId), getRfpRanking(rfpId),
    ]);
    setRfp(r);
    setCommitment(c as never);
    setBid(b);
    setEvidence(ev || []);
    setReview(rv);
    setRanking(rk);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [bidId]);

  const busy = tx.busy ? tx.label : null;
  async function run<T>(label: string, fn: (cb: TxCallback) => Promise<T>, after?: () => void) {
    const r = await tx.run(label, fn);
    if (r !== undefined) { after?.(); await load(); }
  }

  if (!CONTRACT_CONFIGURED) {
    return <div className="max-w-5xl mx-auto px-6 py-12"><NotConfiguredBanner /></div>;
  }
  if (loading) return <div className="max-w-5xl mx-auto px-6 py-12 font-mono-data text-track">LOADING…</div>;

  // ---- Sealed (committed but not revealed) state ----
  const isSealed = !bid && commitment;
  const rfpStatus = rfp?.status || "OPEN";
  const canReveal = isSealed && (rfpStatus === "CLOSED" || rfpStatus === "REVEALING") &&
                    !!draft && address?.toLowerCase() === commitment?.vendor.toLowerCase();
  const isOwner = address && commitment && address.toLowerCase() === commitment.vendor.toLowerCase();

  if (isSealed) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-6">
        <div className="rail-panel" style={{ borderLeftColor: "var(--violet)" }}>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="font-mono-data text-xs text-track">{bidId}</span>
            <SignalBadge tone="violet">SEALED</SignalBadge>
            <GateStatusChip status="COMMITTED" />
          </div>
          <div className="font-head text-4xl text-signalwhite mt-2">Sealed bid commitment</div>
          <p className="text-concrete mt-2 max-w-3xl">
            This bid is hidden until the buyer closes the RFP. The on-chain record shows only a
            SHA-256 commitment hash. Bid content stays off-chain (in the vendor&apos;s browser) until
            reveal.
          </p>
          <div className="mt-4 font-mono-data text-xs text-track break-all">
            HASH: {commitment?.commitment_hash}
          </div>
          <div className="mt-1 font-mono-data text-xs text-track">VENDOR: {commitment?.vendor}</div>
          <div className="mt-1 font-mono-data text-xs text-track">RFP STATUS: {rfpStatus}</div>
        </div>

        {!isOwner && (
          <div className="rail-panel">
            <div className="font-head text-xl text-amber">Bid content is sealed.</div>
            <p className="text-concrete text-sm mt-1">
              Other participants cannot view this bid until the RFP is closed and the vendor reveals.
            </p>
          </div>
        )}

        {isOwner && (
          <div className="rail-panel" style={{ borderLeftColor: "var(--lime)" }}>
            <div className="font-head text-2xl text-lime">You own this sealed bid</div>
            {rfpStatus === "OPEN" && (
              <p className="text-concrete text-sm mt-2">
                Waiting for the buyer to close the RFP. After close you can reveal your bid here.
                Keep this browser profile — your salt is stored locally and is required to reveal.
              </p>
            )}
            {rfpStatus === "CLOSED" || rfpStatus === "REVEALING" ? (
              draft ? (
                <div className="mt-4">
                  <p className="text-concrete text-sm">RFP is closed. Reveal your bid to make it visible to GenLayer validators.</p>
                  <button
                    onClick={() => run("Reveal Bid", (cb) => revealBid(bidId, draft.bid_json, draft.salt, cb), () => markRevealed(bidId))}
                    disabled={!!busy || !canReveal}
                    className="signal-lever review mt-3">
                    {busy === "Reveal Bid" ? "Revealing…" : "▰ Reveal Bid On-Chain"}
                  </button>
                  <TxStatusLine state={tx} />
                </div>
              ) : (
                <div className="text-vermilion text-sm mt-3">
                  No local draft found for this bid in this browser. Reveal requires the original
                  bid JSON + salt that were stored on the device used at commit time.
                </div>
              )
            ) : null}
          </div>
        )}
      </div>
    );
  }

  if (!bid) return <div className="max-w-5xl mx-auto px-6 py-12">Bid not found.</div>;

  const rankingPosition = ranking?.ranked_bids.find((r) => r.bid_id === bidId);
  const isBuyer = !!address && !!rfp?.buyer && address.toLowerCase() === rfp.buyer.toLowerCase();

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
      <div className="rail-panel">
        <div className="flex flex-wrap gap-3 items-center">
          <span className="font-mono-data text-xs text-track">{bid.bid_id}</span>
          <SignalBadge tone="cyan">RFP {rfpId}</SignalBadge>
          <GateStatusChip status={String(bid.status || "REVEALED")} />
          {bid.rank && <SignalBadge tone="amber">RANK #{bid.rank}</SignalBadge>}
        </div>
        <div className="font-head text-5xl text-signalwhite mt-2">{bid.vendor_name}</div>
        <div className="text-track text-xs font-mono-data mt-1">{bid.vendor}</div>
        <div className="grid md:grid-cols-4 gap-6 mt-6">
          <MonoSignalNumber value={`${bid.currency} ${bid.bid_amount}`} label="Bid Amount" tone="cyan" />
          <MonoSignalNumber value={review ? review.procurement_score : "—"} label="Procurement Score" />
          <MonoSignalNumber value={review ? review.confidence : "—"} label="Confidence" tone="lime" />
          <MonoSignalNumber value={review ? review.risk_level : "—"} label="Risk Level" tone="vermilion" />
        </div>
      </div>

      <section>
        <SectionHeading kicker="Proposal Packet" title="Revealed proposal" />
        <div className="grid md:grid-cols-2 gap-4">
          {[
            ["Executive Summary", bid.executive_summary],
            ["Technical Approach", bid.technical_approach],
            ["Implementation Plan", bid.implementation_plan],
            ["Timeline", bid.timeline],
            ["Pricing", bid.pricing_proposal],
            ["Compliance Responses", bid.compliance_responses],
            ["Team Capability", bid.team_capability],
            ["References / Case Studies", `${bid.case_studies}\n\n${bid.references}`],
            ["Risk Disclosures", bid.risk_disclosures],
            ["Assumptions & Exceptions", `${bid.assumptions}\n\n${bid.exceptions}`],
          ].map(([title, body]) => (
            <div key={title} className="tender-paper">
              <div className="font-mono-data text-[11px] tracking-widest uppercase">{title}</div>
              <div className="whitespace-pre-wrap mt-2 text-sm">{body || "—"}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading kicker="Evidence Locker" title="Supporting documents" tone="cyan" />
        {evidence.length === 0 ? (
          <div className="rail-panel">
            <div className="font-head text-xl text-track">No evidence attached yet.</div>
            <Link href={`/rfps/${rfpId}/bids/${bidId}/evidence`} className="signal-lever mt-4">▰ Attach Evidence</Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {evidence.map((e) => (
              <div key={e.evidence_id} className="gate-card">
                <div className="flex justify-between"><SignalBadge tone="cyan">{e.type}</SignalBadge><SignalBadge tone="track">{e.privacy}</SignalBadge></div>
                <div className="font-head text-lg mt-2 text-signalwhite">{e.title}</div>
                <div className="text-concrete text-xs mt-1">{e.description}</div>
              </div>
            ))}
            <Link href={`/rfps/${rfpId}/bids/${bidId}/evidence`} className="gate-card flex items-center justify-center border-dashed">
              <span className="font-mono-data text-amber tracking-widest text-xs">+ ADD EVIDENCE</span>
            </Link>
          </div>
        )}
      </section>

      <section>
        <SectionHeading kicker="Consensus Review" title="GenLayer bid evaluation" tone="lime" />
        <div className="flex flex-wrap gap-3 mb-4">
          {isBuyer && (
            <>
              <button onClick={() => run("Run Consensus Evaluation", (cb) => reviewBid(bidId, cb))} disabled={!!busy} className="signal-lever review">
                {busy === "Run Consensus Evaluation" ? "Reviewing…" : "▰ Run Consensus Evaluation"}
              </button>
              <button onClick={() => run("Assess Commercial Value", (cb) => assessCommercialValue(bidId, cb))} disabled={!!busy} className="signal-lever secondary">
                Assess Commercial Value
              </button>
              <button onClick={() => run("Assess Delivery Feasibility", (cb) => assessDeliveryFeasibility(bidId, cb))} disabled={!!busy} className="signal-lever secondary">
                Assess Delivery Feasibility
              </button>
              <Link href={`/rfps/${rfpId}/bids/${bidId}/clarification`} className="signal-lever clarify">Request Clarification</Link>
            </>
          )}
          <Link href={`/rfps/${rfpId}/bids/${bidId}/appeal`} className="signal-lever appeal">Open Appeal</Link>
          {!isBuyer && (
            <div className="font-mono-data text-[10px] tracking-widest uppercase text-track px-2 py-1">
              Review / clarification actions are buyer-only
            </div>
          )}
        </div>
        <TxStatusLine state={tx} className="mb-4" />

        {!review ? (
          <div className="rail-panel">
            <div className="font-head text-xl text-amber">AWAITING CONSENSUS EVALUATION</div>
            <p className="text-concrete text-sm mt-1">This bid has been revealed but not yet evaluated by GenLayer consensus.</p>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-3">
              <GatePanel title="Mandatory Eligibility" tone="vermilion"
                sub={{ score: review.eligibility === "ELIGIBLE" ? 100 : review.eligibility === "CONDITIONALLY_ELIGIBLE" ? 60 : 0,
                       reason: `Eligibility: ${review.eligibility}` }} />
              <GatePanel title="Technical Fit" tone="cobalt" sub={review.technical_fit} />
              <GatePanel title="Commercial Value" tone="lime" sub={review.commercial_value} />
              <GatePanel title="Delivery Feasibility" tone="amber" sub={review.delivery_feasibility} />
              <GatePanel title="Vendor Capability" tone="cyan" sub={review.vendor_capability} />
              <GatePanel title="Compliance / Security" tone="violet" sub={review.compliance_security} />
              <GatePanel title="Qualitative Fit" tone="cyan" sub={review.qualitative_fit} />
              <GatePanel title="Risk & Exceptions" tone="vermilion" sub={review.risk_and_exceptions} />
            </div>

            <div className="grid md:grid-cols-2 gap-4 mt-6">
              {[
                ["Positive Signals", review.positive_signals, "lime"],
                ["Red Flags", review.red_flags, "vermilion"],
                ["Mandatory Failures", review.mandatory_failures, "vermilion"],
                ["Clarification Requests", review.clarification_requests, "cobalt"],
                ["Missing Information", review.missing_information, "amber"],
              ].map(([title, items, tone]) => {
                const arr = items as string[];
                return (
                  <div key={title as string} className="gate-card" style={{ borderLeftColor: `var(--${tone})` }}>
                    <div className="font-mono-data text-[11px] tracking-widest uppercase" style={{ color: `var(--${tone})` }}>{title as string}</div>
                    {arr?.length ? (
                      <ul className="text-concrete text-sm mt-2 list-disc pl-5 space-y-1">{arr.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    ) : <div className="text-track text-sm mt-2">None.</div>}
                  </div>
                );
              })}
            </div>

            <div className="tender-paper mt-6">
              <div className="font-mono-data text-[11px] tracking-widest uppercase">Reasoning Summary</div>
              <p className="mt-2">{review.reasoning_summary}</p>
              <div className="font-mono-data text-[11px] tracking-widest uppercase mt-4">Recommended Action</div>
              <p className="mt-2">{review.recommended_action}</p>
            </div>

            <div className="rail-panel mt-6" style={{ borderLeftColor: "var(--amber)" }}>
              <div className="font-mono-data text-[11px] tracking-widest uppercase text-amber">Award Signal Panel</div>
              <div className="font-head text-4xl mt-2 text-signalwhite">AWARD SIGNAL: {review.verdict}</div>
              <div className="grid md:grid-cols-4 gap-6 mt-4">
                <MonoSignalNumber value={review.procurement_score} label="Procurement Score" />
                <MonoSignalNumber value={rankingPosition ? `${rankingPosition.rank}` : "—"} label="Rank" tone="cyan" />
                <MonoSignalNumber value={review.eligibility} label="Eligibility" tone="lime" />
                <MonoSignalNumber value={review.confidence} label="Confidence" tone="amber" />
              </div>
            </div>
          </>
        )}
      </section>

      {ranking && (
        <section>
          <SectionHeading kicker="Vendor Comparison Rail" title="Position in this RFP" />
          <div className="space-y-2">
            {ranking.ranked_bids.map((rb) => (
              <div key={rb.bid_id}
                className={`border p-3 flex justify-between items-center ${rb.bid_id === bidId ? "border-amber bg-graphite" : "border-graphite"}`}>
                <div>
                  <div className="font-head text-xl">#{rb.rank} · {rb.bid_id}</div>
                  <div className="text-concrete text-sm">{rb.reason}</div>
                </div>
                <GateStatusChip status={rb.award_recommendation} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rail-panel" style={{ borderLeftColor: "var(--violet)" }}>
        <div className="font-mono-data text-[11px] tracking-widest uppercase text-violet">
          Why this needed GenLayer
        </div>
        <p className="text-concrete mt-2 max-w-3xl">
          After the sealed-bidding window closes and vendors reveal, GenLayer validators interpret
          each proposal against the RFP rubric — judging qualitative fit, technical credibility,
          delivery feasibility and price-value balance. No deterministic contract can produce
          that judgement.
        </p>
      </section>
    </div>
  );
}
