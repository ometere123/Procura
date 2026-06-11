"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addEvidence } from "@/lib/genlayer/write";
import { getBidEvidence } from "@/lib/genlayer/read";
import { newId } from "@/lib/ids";
import { SectionHeading, SignalBadge } from "@/components/ui/Primitives";
import { NotConfiguredBanner } from "@/components/layout/NotConfiguredBanner";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer/config";
import { useTx } from "@/lib/useTx";
import { TxStatusLine } from "@/components/ui/TxStatusLine";
import type { Evidence } from "@/types/procura";

const TYPES = [
  "RFP_DOCUMENT","TECHNICAL_PROPOSAL","COMMERCIAL_PROPOSAL","PRICING_SHEET",
  "COMPLIANCE_CERTIFICATE","SECURITY_DOCUMENT","CASE_STUDY","REFERENCE_LETTER",
  "IMPLEMENTATION_PLAN","PROJECT_TIMELINE","INSURANCE_DOCUMENT","LEGAL_DOCUMENT",
  "FINANCIAL_STATEMENT","TEAM_PROFILE","PRODUCT_DEMO","ARCHITECTURE_DIAGRAM",
  "SERVICE_LEVEL_AGREEMENT","OTHER",
];
const PRIVACY = ["PUBLIC", "REDACTED", "PRIVATE_HASH_ONLY"];

export default function EvidencePage({ params }: { params: Promise<{ rfpId: string; bidId: string }> }) {
  const { rfpId, bidId } = use(params);
  const router = useRouter();
  const [items, setItems] = useState<Evidence[]>([]);
  const tx = useTx();
  const busy = tx.busy;
  const [form, setForm] = useState({
    type: "TECHNICAL_PROPOSAL", title: "", description: "", uri: "", hash: "",
    source: "", date: "", relevance_note: "", privacy: "PUBLIC",
  });
  const update = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!CONTRACT_CONFIGURED) return;
    getBidEvidence(bidId).then((d) => setItems(d || []));
  }, [bidId]);

  async function go() {
    if (!form.title.trim()) return;
    const id = newId("ev");
    const r = await tx.run("Attach Evidence", (cb) => addEvidence(id, bidId, { ...form, rfp_id: rfpId, bid_id: bidId }, cb));
    if (r !== undefined) {
      const d = await getBidEvidence(bidId);
      setItems(d || []);
      setForm({ ...form, title: "", description: "", uri: "", hash: "", relevance_note: "" });
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <SectionHeading kicker="Evidence Locker" title="Attach supporting documents" tone="cyan" />
      <NotConfiguredBanner />

      <div className="tender-paper space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div><label>Type</label>
            <select value={form.type} onChange={(e) => update("type", e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label>Privacy</label>
            <select value={form.privacy} onChange={(e) => update("privacy", e.target.value)}>
              {PRIVACY.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label>Title</label><input value={form.title} onChange={(e) => update("title", e.target.value)} /></div>
          <div><label>Source</label><input value={form.source} onChange={(e) => update("source", e.target.value)} /></div>
          <div><label>URI / IPFS CID</label><input value={form.uri} onChange={(e) => update("uri", e.target.value)} /></div>
          <div><label>Hash</label><input value={form.hash} onChange={(e) => update("hash", e.target.value)} /></div>
          <div><label>Date</label><input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} /></div>
          <div className="md:col-span-2"><label>Description</label><textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} /></div>
          <div className="md:col-span-2"><label>Relevance Note</label><textarea rows={2} value={form.relevance_note} onChange={(e) => update("relevance_note", e.target.value)} /></div>
        </div>
        <button onClick={go} disabled={busy || !CONTRACT_CONFIGURED} className="signal-lever">
          {busy ? "Submitting…" : "▰ Attach Evidence"}
        </button>
        <TxStatusLine state={tx} />
      </div>

      <div className="mt-8 space-y-3">
        {items.length === 0 && <div className="text-track font-mono-data text-sm">NO EVIDENCE YET.</div>}
        {items.map((e) => (
          <div key={e.evidence_id} className="gate-card">
            <div className="flex justify-between"><SignalBadge tone="cyan">{e.type}</SignalBadge><SignalBadge tone="track">{e.privacy}</SignalBadge></div>
            <div className="font-head text-xl mt-2">{e.title}</div>
            <div className="text-concrete text-sm">{e.description}</div>
            {e.uri && <div className="font-mono-data text-xs text-track mt-1">{e.uri}</div>}
          </div>
        ))}
      </div>

      <button onClick={() => router.push(`/rfps/${rfpId}/bids/${bidId}`)} className="signal-lever secondary mt-8">
        Back to Bid
      </button>
    </div>
  );
}
