"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { openAppeal, reviewAppeal } from "@/lib/genlayer/write";
import { newId } from "@/lib/ids";
import { SectionHeading } from "@/components/ui/Primitives";
import { NotConfiguredBanner } from "@/components/layout/NotConfiguredBanner";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer/config";
import { useTx } from "@/lib/useTx";
import { TxStatusLine } from "@/components/ui/TxStatusLine";

const REASONS = [
  "REQUIREMENT_MISINTERPRETED","EVIDENCE_NOT_CONSIDERED","SCORING_ERROR",
  "RANKING_ERROR","CLARIFICATION_IGNORED","COMPLIANCE_MISREAD",
  "PRICE_VALUE_MISJUDGED","CONFLICT_OF_INTEREST","OTHER",
];

export default function AppealPage({ params }: { params: Promise<{ rfpId: string; bidId: string }> }) {
  const { rfpId, bidId } = use(params);
  const router = useRouter();
  const tx = useTx();
  const busy = tx.busy ? tx.label : null;
  const [aid, setAid] = useState<string | null>(null);
  const [reason, setReason] = useState("REQUIREMENT_MISINTERPRETED");
  const [argument, setArg] = useState("");
  const [newEv, setNewEv] = useState("");

  async function open() {
    const id = newId("apl");
    const r = await tx.run("Open Appeal", (cb) => openAppeal(id, bidId, { reason, argument, new_evidence: newEv }, cb));
    if (r !== undefined) setAid(id);
  }
  async function rev() {
    if (!aid) return;
    const r = await tx.run("Review Appeal", (cb) => reviewAppeal(aid, cb));
    if (r !== undefined) router.push(`/rfps/${rfpId}/bids/${bidId}`);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <SectionHeading kicker="Appeal Chamber" title="Challenge an outcome" />
      <NotConfiguredBanner />

      <div className="tender-paper space-y-4">
        <div><label>Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div><label>Argument</label><textarea rows={5} value={argument} onChange={(e) => setArg(e.target.value)} /></div>
        <div><label>New Evidence (notes / link)</label><textarea rows={3} value={newEv} onChange={(e) => setNewEv(e.target.value)} /></div>
        <button onClick={open} disabled={!!busy || !!aid || !CONTRACT_CONFIGURED} className="signal-lever appeal">
          {busy === "Open Appeal" ? "Submitting…" : "▰ Open Appeal"}
        </button>
        {aid && <div className="font-mono-data text-xs text-vermilion">ID: {aid}</div>}
        <TxStatusLine state={tx} />
      </div>

      {aid && (
        <div className="tender-paper mt-6">
          <div className="font-head text-2xl">GenLayer reviews appeal</div>
          <button onClick={rev} disabled={!!busy} className="signal-lever review mt-3">
            {busy === "Review Appeal" ? "Reviewing…" : "▰ Run Appeal Review"}
          </button>
        </div>
      )}
    </div>
  );
}
