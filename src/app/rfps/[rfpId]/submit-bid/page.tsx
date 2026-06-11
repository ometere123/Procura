"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitBidCommitment } from "@/lib/genlayer/write";
import { getRfp } from "@/lib/genlayer/read";
import { newId } from "@/lib/ids";
import { makeCommitment, saveDraft } from "@/lib/sealedBids";
import { useWallet } from "@/lib/wallet";
import { useTx } from "@/lib/useTx";
import { TxStatusLine } from "@/components/ui/TxStatusLine";
import { SectionHeading } from "@/components/ui/Primitives";
import { NotConfiguredBanner } from "@/components/layout/NotConfiguredBanner";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer/config";

const STEPS = [
  "Vendor Profile","Executive Summary","Technical Proposal","Commercial Proposal",
  "Implementation Plan","Compliance Responses","Evidence","Exceptions & Risks","Seal & Commit",
];

export default function SubmitBidPage({ params }: { params: Promise<{ rfpId: string }> }) {
  const { rfpId } = use(params);
  const router = useRouter();
  const { address } = useWallet();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [isBuyer, setIsBuyer] = useState(false);
  const tx = useTx();
  const busy = tx.busy;

  useEffect(() => {
    if (!address) return;
    getRfp(rfpId).then((r) => {
      if (r?.buyer && r.buyer.toLowerCase() === address.toLowerCase()) setIsBuyer(true);
    });
  }, [rfpId, address]);

  const [form, setForm] = useState({
    vendor_name: "", vendor_profile: "",
    executive_summary: "", technical_approach: "",
    implementation_plan: "", timeline: "",
    pricing_proposal: "", bid_amount: 0, currency: "USD",
    compliance_responses: "", team_capability: "",
    case_studies: "", references: "",
    risk_disclosures: "", assumptions: "", exceptions: "",
  });
  const update = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function go() {
    setErr(null);
    if (!address) { setErr("Connect your wallet first."); return; }
    if (isBuyer) { setErr("As the RFP buyer you cannot submit a bid on this RFP."); return; }
    if (!form.vendor_name.trim() || !form.executive_summary.trim() || !form.technical_approach.trim()) {
      setErr("Vendor name, executive summary and technical approach are required");
      return;
    }
    const id = newId("bid");
    const bid = { bid_id: id, rfp_id: rfpId, ...form };
    const bid_json = JSON.stringify(bid);
    const { salt, commitment_hash } = await makeCommitment(bid_json);

    // store locally BEFORE writing on-chain, so we never lose the salt
    saveDraft({
      bid_id: id, rfp_id: rfpId, vendor: address,
      bid_json, salt, commitment_hash,
      created_at: Date.now(), revealed: false,
    });

    const r = await tx.run("Commit Sealed Bid", (cb) => submitBidCommitment(id, rfpId, commitment_hash, cb));
    if (r !== undefined) router.push(`/rfps/${rfpId}/bids/${id}`);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <SectionHeading kicker="Sealed Bid Packet Wizard" title="Commit a sealed bid" />
      <NotConfiguredBanner />

      {isBuyer && (
        <div className="rail-panel mb-6" style={{ borderLeftColor: "var(--vermilion)" }}>
          <div className="font-mono-data text-[11px] tracking-widest uppercase text-vermilion">Conflict of Interest</div>
          <div className="font-head text-2xl mt-1 text-signalwhite">You created this RFP.</div>
          <p className="text-concrete text-sm mt-1">
            The RFP buyer cannot submit a bid on their own RFP. Switch to a vendor wallet to commit a sealed bid.
          </p>
        </div>
      )}

      <div className="rail-panel mb-6" style={{ borderLeftColor: "var(--violet)" }}>
        <div className="font-mono-data text-[11px] tracking-widest uppercase text-violet">Sealed Bidding</div>
        <p className="text-concrete text-sm mt-2 max-w-3xl">
          Your bid stays sealed until the buyer closes the RFP. Only the SHA-256 commitment hash
          is written on-chain now; the full proposal and a random salt are kept in your browser
          and revealed by you after close. GenLayer validators only review bids after reveal.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 font-mono-data text-[10px] tracking-widest">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)}
            className={`px-2 py-1 border ${i === step ? "border-amber text-amber" : "border-graphite text-track"}`}>
            {String(i + 1).padStart(2, "0")} · {s}
          </button>
        ))}
      </div>

      <div className="tender-paper space-y-4">
        {step === 0 && (<>
          <div><label>Vendor Name</label><input value={form.vendor_name} onChange={(e) => update("vendor_name", e.target.value)} /></div>
          <div><label>Vendor Profile</label><textarea rows={4} value={form.vendor_profile} onChange={(e) => update("vendor_profile", e.target.value)} /></div>
        </>)}
        {step === 1 && <div><label>Executive Summary</label><textarea rows={6} value={form.executive_summary} onChange={(e) => update("executive_summary", e.target.value)} /></div>}
        {step === 2 && <div><label>Technical Approach</label><textarea rows={10} value={form.technical_approach} onChange={(e) => update("technical_approach", e.target.value)} /></div>}
        {step === 3 && (<>
          <div><label>Pricing Proposal</label><textarea rows={6} value={form.pricing_proposal} onChange={(e) => update("pricing_proposal", e.target.value)} /></div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><label>Bid Amount</label><input type="number" value={form.bid_amount} onChange={(e) => update("bid_amount", Number(e.target.value))} /></div>
            <div><label>Currency</label><input value={form.currency} onChange={(e) => update("currency", e.target.value)} /></div>
          </div>
        </>)}
        {step === 4 && (<>
          <div><label>Implementation Plan</label><textarea rows={6} value={form.implementation_plan} onChange={(e) => update("implementation_plan", e.target.value)} /></div>
          <div><label>Timeline</label><textarea rows={4} value={form.timeline} onChange={(e) => update("timeline", e.target.value)} /></div>
        </>)}
        {step === 5 && (<>
          <div><label>Compliance Responses</label><textarea rows={5} value={form.compliance_responses} onChange={(e) => update("compliance_responses", e.target.value)} /></div>
          <div><label>Team Capability</label><textarea rows={4} value={form.team_capability} onChange={(e) => update("team_capability", e.target.value)} /></div>
        </>)}
        {step === 6 && (<>
          <div><label>Case Studies</label><textarea rows={4} value={form.case_studies} onChange={(e) => update("case_studies", e.target.value)} /></div>
          <div><label>References</label><textarea rows={4} value={form.references} onChange={(e) => update("references", e.target.value)} /></div>
          <div className="text-xs text-track">Evidence can be attached after reveal from the bid detail page.</div>
        </>)}
        {step === 7 && (<>
          <div><label>Risk Disclosures</label><textarea rows={3} value={form.risk_disclosures} onChange={(e) => update("risk_disclosures", e.target.value)} /></div>
          <div><label>Assumptions</label><textarea rows={3} value={form.assumptions} onChange={(e) => update("assumptions", e.target.value)} /></div>
          <div><label>Exceptions to RFP terms</label><textarea rows={3} value={form.exceptions} onChange={(e) => update("exceptions", e.target.value)} /></div>
        </>)}
        {step === 8 && (
          <div>
            <div className="font-head text-2xl">Seal & Commit</div>
            <p className="text-sm mt-2">
              On submit we compute <span className="font-mono-data">sha256(bid_json + salt)</span>,
              save the bid and salt to your browser, and write only the commitment hash on-chain.
              Reveal later from the bid page.
            </p>
            {err && <div className="text-vermilion mt-2">{err}</div>}
            <button onClick={go} disabled={busy || !CONTRACT_CONFIGURED || !address} className="signal-lever mt-4">
              {busy ? "Sealing…" : "▰ Commit Sealed Bid"}
            </button>
            {!address && <div className="text-vermilion text-sm mt-2">Connect your wallet first.</div>}
            <TxStatusLine state={tx} />
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} className="signal-lever secondary">Back</button>
        <button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} className="signal-lever">Next</button>
      </div>
    </div>
  );
}
