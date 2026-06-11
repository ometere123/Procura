"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SectionHeading, SignalBadge, GateStatusChip } from "@/components/ui/Primitives";
import { NotConfiguredBanner } from "@/components/layout/NotConfiguredBanner";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer/config";
import type { RFP } from "@/types/procura";

export default function RfpYardPage() {
  const [rfps, setRfps] = useState<RFP[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!CONTRACT_CONFIGURED) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch("/api/rfps", { cache: "no-store" });
        const json = (await res.json()) as { rfps: RFP[] };
        setRfps(json.rfps || []);
      } catch {
        setRfps([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <SectionHeading kicker="RFP Yard" title="Procurement Rail Yard" />
      <NotConfiguredBanner />

      {loading && CONTRACT_CONFIGURED && (
        <div className="font-mono-data text-track text-sm">LOADING RAIL YARD…</div>
      )}

      {!loading && (!rfps || rfps.length === 0) && (
        <div className="rail-panel mt-6">
          <div className="font-head text-2xl text-amber">No RFPs yet.</div>
          <p className="text-concrete mt-2">
            Create the first procurement round to open the bid yard.
          </p>
          <Link href="/create-rfp" className="signal-lever mt-6">▰ Create RFP</Link>
        </div>
      )}

      {rfps && rfps.length > 0 && (
        <div className="space-y-4 mt-6">
          {rfps.map((r, i) => (
            <div
              key={r.rfp_id}
              className="grid grid-cols-12 gap-3 border border-graphite bg-rail/60"
              style={{ marginLeft: `${(i % 3) * 24}px` }}
            >
              <div className="col-span-12 md:col-span-9 p-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono-data text-xs text-track">{r.rfp_id}</span>
                  <SignalBadge tone="cyan">{r.category}</SignalBadge>
                  <GateStatusChip status={r.status || "OPEN"} />
                </div>
                <div className="font-head text-3xl text-signalwhite mt-2">{r.title}</div>
                <div className="text-concrete text-sm mt-1">{r.buyer_org}</div>
                <div className="flex flex-wrap gap-6 mt-4 font-mono-data text-xs text-track">
                  <span>DEADLINE: {r.submission_deadline}</span>
                  <span>BIDS: {r.bid_count ?? 0}</span>
                  <span>BUDGET: {r.currency} {r.budget_min}–{r.budget_max}</span>
                </div>
              </div>
              <div className="col-span-12 md:col-span-3 flex items-center justify-end p-5 border-l border-graphite bg-graphite/60">
                <Link href={`/rfps/${r.rfp_id}`} className="signal-lever">Open Yard</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
