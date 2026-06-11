import Link from "next/link";
import { SectionHeading, SignalBadge } from "@/components/ui/Primitives";
import { NotConfiguredBanner } from "@/components/layout/NotConfiguredBanner";

export default function HomePage() {
  return (
    <div>
      {/* Signal Yard Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-12 gap-6">
          {/* Left vertical track */}
          <div className="col-span-12 md:col-span-3 flex md:flex-col items-start gap-4 border-l-4 border-amber pl-5">
            <div>
              <div className="font-head text-6xl text-signalwhite leading-none">PROCURA</div>
              <p className="text-concrete mt-3 max-w-xs">
                Bid evaluation by rubric, evidence, and consensus.
              </p>
            </div>
            <div className="mt-auto pt-10">
              <Link href="/create-rfp" className="signal-lever">▰ Create RFP</Link>
            </div>
          </div>

          {/* Centre routing board */}
          <div className="col-span-12 md:col-span-6">
            <div className="rail-panel" style={{ borderLeftColor: "var(--cyan)" }}>
              <div className="font-mono-data text-[11px] tracking-widest uppercase text-cyan mb-3">
                Procurement Journey
              </div>
              <div className="space-y-3">
                {[
                  ["RFP", "amber"],
                  ["Vendor Bids", "cyan"],
                  ["Eligibility", "lime"],
                  ["Rubric Signals", "cobalt"],
                  ["Consensus Rank", "violet"],
                ].map(([label, tone], i) => (
                  <div
                    key={label}
                    className="flex items-center gap-4 font-head text-2xl"
                    style={{ paddingLeft: `${i * 36}px`, color: `var(--${tone})` }}
                  >
                    <span>↘</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 inline-block tender-paper text-xs px-3 py-1">
                Consensus support for procurement review. Final governance remains with the buyer.
              </div>
            </div>
            <h1 className="sr-only">
              Procurement decisions are rarely just price. PROCURA turns RFPs, vendor proposals,
              and qualitative fit into consensus-backed bid rankings.
            </h1>
            <p className="font-body text-concrete mt-6 max-w-2xl">
              Procurement decisions are rarely just price. PROCURA turns RFPs, vendor proposals,
              and qualitative fit into consensus-backed bid rankings.
            </p>
            <p className="font-body text-track mt-2 text-sm max-w-2xl">
              Create RFPs, collect vendor bids, score proposals against rubrics, request
              clarifications, and rank eligible vendors through GenLayer consensus.
            </p>
          </div>

          {/* Award signal tower */}
          <div className="col-span-12 md:col-span-3">
            <div className="rail-panel h-full flex flex-col" style={{ borderLeftColor: "var(--violet)" }}>
              <div className="font-mono-data text-[11px] tracking-widest uppercase text-violet">
                Award Signal Tower
              </div>
              <ul className="mt-4 space-y-2 font-mono-data text-xs">
                {["ELIGIBILITY", "TECHNICAL FIT", "PRICE VALUE", "DELIVERY RISK", "FINAL RANK"].map((s) => (
                  <li key={s} className="flex items-center justify-between border-b border-graphite py-2">
                    <span className="tracking-widest text-concrete">{s}</span>
                    <SignalBadge tone="track">▢ EMPTY</SignalBadge>
                  </li>
                ))}
              </ul>
              <Link href="/rfps" className="signal-lever secondary mt-6 self-start">Open Bid Yard</Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6">
          <NotConfiguredBanner />
        </div>
      </section>

      {/* Signal Gates */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <SectionHeading kicker="Signal Gates" title="Eight judgement gates per bid" tone="cyan" />
        <div className="grid md:grid-cols-5 gap-4">
          {[
            ["Eligibility Gate", "Mandatory documents, certifications, disqualifying exceptions."],
            ["Technical Gate", "Architecture fit, scope coverage, integration feasibility."],
            ["Commercial Gate", "Price-value balance, hidden costs, scope completeness."],
            ["Risk Gate", "Contract exceptions, delivery risk, compliance gaps."],
            ["Consensus Gate", "GenLayer validators interpret and rank."],
          ].map(([title, body]) => (
            <div key={title} className="gate-card">
              <div className="font-head text-xl text-cyan">{title}</div>
              <div className="font-body text-sm text-concrete mt-2">{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Why procurement bid review is hard */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <SectionHeading kicker="Why this is hard" title="Procurement is not a checklist" />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="tender-paper">
            <div className="font-head text-2xl">A deterministic contract can…</div>
            <ul className="font-body mt-3 space-y-1 text-sm">
              <li>• Store RFP metadata and bids</li>
              <li>• Enforce a deadline</li>
              <li>• Hash uploaded documents</li>
              <li>• Count votes</li>
            </ul>
          </div>
          <div className="rail-panel" style={{ borderLeftColor: "var(--vermilion)" }}>
            <div className="font-head text-2xl text-vermilion">…but cannot judge</div>
            <ul className="font-body mt-3 space-y-1 text-sm text-concrete">
              <li>• Whether the proposal truly answers the RFP</li>
              <li>• Whether pricing is fair for the scope</li>
              <li>• Whether delivery timelines are credible</li>
              <li>• Whether two bids should rank differently despite similar prices</li>
              <li>• Whether a clarification resolves concerns</li>
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <SectionHeading kicker="How PROCURA works" title="From RFP to award signal" tone="lime" />
        <div className="grid md:grid-cols-4 gap-4 font-mono-data text-xs uppercase tracking-widest">
          {[
            ["01", "Create RFP & rubric"],
            ["02", "Receive vendor bids + evidence"],
            ["03", "GenLayer review per bid"],
            ["04", "Consensus rank & award signal"],
          ].map(([n, t]) => (
            <div key={n} className="gate-card" style={{ borderLeftColor: "var(--lime)" }}>
              <div className="font-head text-4xl text-lime">{n}</div>
              <div className="text-concrete mt-2">{t}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Why this needed GenLayer */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="rail-panel" style={{ borderLeftColor: "var(--violet)" }}>
          <div className="font-mono-data text-[11px] tracking-widest uppercase text-violet">
            Why this needed GenLayer
          </div>
          <p className="font-body text-concrete mt-3 max-w-4xl">
            PROCURA needs GenLayer because procurement bid evaluation requires interpretation of
            RFP text, vendor proposals, qualitative fit, technical credibility, commercial value,
            and comparative ranking. Validators reach consensus on bid eligibility, score, and
            ranking — turning subjective procurement judgement into a structured, auditable
            on-chain decision.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-12 flex flex-wrap gap-4">
        <Link href="/create-rfp" className="signal-lever">▰ Create RFP</Link>
        <Link href="/rfps" className="signal-lever secondary">Open Bid Yard</Link>
      </section>
    </div>
  );
}
