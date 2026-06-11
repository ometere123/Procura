"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { requestClarification, submitClarificationResponse, reviewClarification } from "@/lib/genlayer/write";
import { newId } from "@/lib/ids";
import { SectionHeading } from "@/components/ui/Primitives";
import { NotConfiguredBanner } from "@/components/layout/NotConfiguredBanner";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer/config";
import { useTx } from "@/lib/useTx";
import { TxStatusLine } from "@/components/ui/TxStatusLine";

const REASONS = [
  "MISSING_DOCUMENT","UNCLEAR_TECHNICAL_RESPONSE","UNCLEAR_PRICING",
  "TIMELINE_AMBIGUITY","COMPLIANCE_GAP","SECURITY_GAP","REFERENCE_GAP",
  "SCOPE_EXCEPTION","OTHER",
];

export default function ClarificationPage({ params }: { params: Promise<{ rfpId: string; bidId: string }> }) {
  const { rfpId, bidId } = use(params);
  const router = useRouter();
  const tx = useTx();
  const busy = tx.busy ? tx.label : null;
  const [cid, setCid] = useState<string | null>(null);
  const [reason, setReason] = useState("MISSING_DOCUMENT");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [evidence, setEvidence] = useState("");

  async function req() {
    const id = newId("clr");
    const r = await tx.run("Request Clarification", (cb) => requestClarification(id, bidId, { reason, question }, cb));
    if (r !== undefined) setCid(id);
  }
  async function resp() {
    if (!cid) return;
    await tx.run("Submit Response", (cb) => submitClarificationResponse(cid, { answer, evidence }, cb));
  }
  async function rev() {
    if (!cid) return;
    const r = await tx.run("Review Clarification", (cb) => reviewClarification(cid, cb));
    if (r !== undefined) router.push(`/rfps/${rfpId}/bids/${bidId}`);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <SectionHeading kicker="Clarification Loop" title="Resolve open concerns" tone="cyan" />
      <NotConfiguredBanner />

      <div className="tender-paper space-y-4">
        <div className="font-head text-2xl">1 · Buyer requests clarification</div>
        <div><label>Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div><label>Question</label><textarea rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} /></div>
        <button onClick={req} disabled={!!busy || !!cid || !CONTRACT_CONFIGURED} className="signal-lever clarify">
          {busy === "Request Clarification" ? "Submitting…" : "▰ Request Clarification"}
        </button>
        {cid && <div className="font-mono-data text-xs text-cobalt">ID: {cid}</div>}
        <TxStatusLine state={tx} />
      </div>

      {cid && (
        <div className="tender-paper space-y-4 mt-6">
          <div className="font-head text-2xl">2 · Vendor responds</div>
          <div><label>Answer</label><textarea rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} /></div>
          <div><label>Supporting Evidence (notes / link)</label><textarea rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} /></div>
          <button onClick={resp} disabled={!!busy} className="signal-lever">
            {busy === "Submit Response" ? "Submitting…" : "▰ Submit Response"}
          </button>
        </div>
      )}

      {cid && (
        <div className="tender-paper mt-6">
          <div className="font-head text-2xl">3 · GenLayer reviews clarification</div>
          <button onClick={rev} disabled={!!busy} className="signal-lever review mt-3">
            {busy === "Review Clarification" ? "Reviewing…" : "▰ Run Clarification Review"}
          </button>
        </div>
      )}
    </div>
  );
}
