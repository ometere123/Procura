"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRfp } from "@/lib/genlayer/write";
import { newId } from "@/lib/ids";
import { SectionHeading } from "@/components/ui/Primitives";
import { NotConfiguredBanner } from "@/components/layout/NotConfiguredBanner";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer/config";
import { useTx } from "@/lib/useTx";
import { TxStatusLine } from "@/components/ui/TxStatusLine";

const CATEGORIES = [
  "SOFTWARE","CLOUD_INFRASTRUCTURE","CYBERSECURITY","CONSULTING","CONSTRUCTION",
  "EQUIPMENT","LOGISTICS","HEALTHCARE_SUPPLY","EDUCATION_TECH",
  "PROFESSIONAL_SERVICES","RESEARCH_SERVICES","PUBLIC_SECTOR_SERVICES",
  "DAO_VENDOR_SELECTION","OTHER",
];

const STEPS = [
  "Buyer Organisation","Procurement Category","RFP Text","Requirements",
  "Rubric Switchboard","Budget & Pricing","Compliance & Security","Deadlines",
  "Clarification & Appeal Rules","Review & Create",
];

const DEFAULT_RUBRIC = [
  ["MANDATORY_ELIGIBILITY", 0, true],
  ["TECHNICAL_FIT", 25, false],
  ["COMMERCIAL_VALUE", 20, false],
  ["DELIVERY_FEASIBILITY", 15, false],
  ["VENDOR_CAPABILITY", 15, false],
  ["COMPLIANCE_SECURITY", 10, false],
  ["QUALITATIVE_FIT", 10, false],
  ["RISK_AND_EXCEPTIONS", 5, false],
] as const;

export default function CreateRfpPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const tx = useTx();
  const submitting = tx.busy;

  const [form, setForm] = useState({
    title: "", buyer_org: "", category: "SOFTWARE",
    summary: "", full_text: "",
    mandatory_requirements: "", optional_requirements: "",
    budget_min: 0, budget_max: 0, currency: "USD", pricing_model: "FIXED",
    compliance_requirements: "", security_requirements: "", delivery_requirements: "",
    submission_deadline: "", evaluation_deadline: "",
    required_documents: "",
    clarification_rules: "", appeal_rules: "", conflict_of_interest_rules: "",
  });

  const [rubric, setRubric] = useState(
    DEFAULT_RUBRIC.map(([cat, w, m]) => ({
      id: cat as string, category: cat as string, weight: w as number, mandatory: m as boolean,
      description: "", excellent: "", weak: "", red_flags: "", required_evidence: "", minimum_standard: "",
    })),
  );

  const update = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setErr(null);
    if (!CONTRACT_CONFIGURED) { setErr("Contract not configured"); return; }
    if (!form.title.trim() || !form.full_text.trim()) {
      setErr("RFP title and full text are required"); return;
    }
    const id = newId("rfp");
    const payload = {
      rfp_id: id,
      ...form,
      mandatory_requirements: form.mandatory_requirements.split("\n").map((s) => s.trim()).filter(Boolean),
      optional_requirements: form.optional_requirements.split("\n").map((s) => s.trim()).filter(Boolean),
      required_documents: form.required_documents.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    const r = await tx.run("Create RFP", (cb) => createRfp(id, payload, { items: rubric }, cb));
    if (r !== undefined) router.push(`/rfps/${id}`);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <SectionHeading kicker="RFP Foundry" title="Forge a procurement round" />
      <NotConfiguredBanner />

      <div className="flex flex-wrap gap-2 mb-6 font-mono-data text-[10px] tracking-widest">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`px-2 py-1 border ${i === step ? "border-amber text-amber" : "border-graphite text-track"}`}
          >
            {String(i + 1).padStart(2, "0")} · {s}
          </button>
        ))}
      </div>

      <div className="tender-paper">
        {step === 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            <div><label>Buyer Organisation</label><input value={form.buyer_org} onChange={(e) => update("buyer_org", e.target.value)} /></div>
            <div><label>RFP Title</label><input value={form.title} onChange={(e) => update("title", e.target.value)} /></div>
          </div>
        )}
        {step === 1 && (
          <div>
            <label>Procurement Category</label>
            <select value={form.category} onChange={(e) => update("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div><label>Summary</label><textarea rows={3} value={form.summary} onChange={(e) => update("summary", e.target.value)} /></div>
            <div><label>Full RFP Text</label><textarea rows={10} value={form.full_text} onChange={(e) => update("full_text", e.target.value)} /></div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div><label>Mandatory Requirements (one per line)</label><textarea rows={6} value={form.mandatory_requirements} onChange={(e) => update("mandatory_requirements", e.target.value)} /></div>
            <div><label>Optional Requirements (one per line)</label><textarea rows={4} value={form.optional_requirements} onChange={(e) => update("optional_requirements", e.target.value)} /></div>
            <div><label>Required Documents (one per line)</label><textarea rows={4} value={form.required_documents} onChange={(e) => update("required_documents", e.target.value)} /></div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3">
            <div className="font-mono-data text-[11px] tracking-widest uppercase">Rubric Switchboard</div>
            {rubric.map((r, i) => (
              <div key={r.id} className="border border-graphite/40 p-3 bg-paper/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-head text-xl">{r.category}</div>
                  <div className="flex items-center gap-2">
                    <label className="mb-0">Weight</label>
                    <input type="number" className="w-20" value={r.weight}
                      onChange={(e) => setRubric((rs) => rs.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
                    <label className="mb-0 flex items-center gap-1">
                      <input type="checkbox" className="w-auto" checked={r.mandatory}
                        onChange={(e) => setRubric((rs) => rs.map((x, j) => j === i ? { ...x, mandatory: e.target.checked } : x))} />
                      Mandatory
                    </label>
                  </div>
                </div>
                <textarea rows={2} placeholder="Description"
                  value={r.description}
                  onChange={(e) => setRubric((rs) => rs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              </div>
            ))}
          </div>
        )}
        {step === 5 && (
          <div className="grid md:grid-cols-3 gap-4">
            <div><label>Budget Min</label><input type="number" value={form.budget_min} onChange={(e) => update("budget_min", Number(e.target.value))} /></div>
            <div><label>Budget Max</label><input type="number" value={form.budget_max} onChange={(e) => update("budget_max", Number(e.target.value))} /></div>
            <div><label>Currency</label><input value={form.currency} onChange={(e) => update("currency", e.target.value)} /></div>
            <div className="md:col-span-3"><label>Pricing Model</label><input value={form.pricing_model} onChange={(e) => update("pricing_model", e.target.value)} /></div>
          </div>
        )}
        {step === 6 && (
          <div className="space-y-4">
            <div><label>Compliance Requirements</label><textarea rows={3} value={form.compliance_requirements} onChange={(e) => update("compliance_requirements", e.target.value)} /></div>
            <div><label>Security / Privacy Requirements</label><textarea rows={3} value={form.security_requirements} onChange={(e) => update("security_requirements", e.target.value)} /></div>
            <div><label>Delivery Requirements</label><textarea rows={3} value={form.delivery_requirements} onChange={(e) => update("delivery_requirements", e.target.value)} /></div>
          </div>
        )}
        {step === 7 && (
          <div className="grid md:grid-cols-2 gap-4">
            <div><label>Submission Deadline</label><input type="date" value={form.submission_deadline} onChange={(e) => update("submission_deadline", e.target.value)} /></div>
            <div><label>Evaluation Deadline</label><input type="date" value={form.evaluation_deadline} onChange={(e) => update("evaluation_deadline", e.target.value)} /></div>
          </div>
        )}
        {step === 8 && (
          <div className="space-y-4">
            <div><label>Clarification Rules</label><textarea rows={3} value={form.clarification_rules} onChange={(e) => update("clarification_rules", e.target.value)} /></div>
            <div><label>Appeal Rules</label><textarea rows={3} value={form.appeal_rules} onChange={(e) => update("appeal_rules", e.target.value)} /></div>
            <div><label>Conflict of Interest Rules</label><textarea rows={3} value={form.conflict_of_interest_rules} onChange={(e) => update("conflict_of_interest_rules", e.target.value)} /></div>
          </div>
        )}
        {step === 9 && (
          <div className="space-y-3 font-body text-sm">
            <div className="font-head text-2xl">Review and create</div>
            <pre className="font-mono-data text-xs whitespace-pre-wrap">{JSON.stringify({ ...form, rubric }, null, 2)}</pre>
            {err && <div className="text-vermilion">{err}</div>}
            <button onClick={submit} disabled={submitting} className="signal-lever">
              {submitting ? "Submitting…" : "▰ Create RFP On-Chain"}
            </button>
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
