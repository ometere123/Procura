export function ProcuraFooter() {
  return (
    <footer className="border-t border-graphite mt-16 bg-rail">
      <div className="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-3 gap-6 text-sm">
        <div>
          <div className="font-head text-2xl text-amber">PROCURA</div>
          <p className="text-track mt-2 max-w-sm">
            Procurement decisions judged by proposals, rubrics, and consensus.
          </p>
        </div>
        <div className="font-mono-data text-[11px] tracking-widest uppercase text-concrete">
          <div>Network: GenLayer Studionet</div>
          <div>Chain ID: 61999</div>
          <div>Currency: GEN</div>
        </div>
        <div className="text-track text-xs leading-relaxed">
          PROCURA provides decentralised bid evaluation and procurement decision support.
          It is not legal advice and does not replace the buyer&apos;s procurement governance,
          legal review, or final award authority.
        </div>
      </div>
    </footer>
  );
}
