"use client";
import type { TxState } from "@/lib/useTx";
import { explorerTx } from "@/lib/genlayer/client";

const PHASES = ["SUBMITTING", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED"] as const;

export function TxStatusLine({ state, className = "" }: { state: TxState; className?: string }) {
  if (!state.busy && !state.phase && !state.error) return null;

  const currentIdx = state.phase ? PHASES.indexOf(state.phase as (typeof PHASES)[number]) : -1;
  const isFailed = state.phase === "FAILED" || !!state.error;
  const isDone = state.phase === "ACCEPTED" || state.phase === "FINALIZED";

  return (
    <div className={`mt-3 border-2 border-amber bg-rail p-3 ${className}`} style={{ background: "#090B0A" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono-data text-[11px] tracking-widest uppercase text-amber">
          {state.label || "Transaction"}
        </div>
        {state.hash && (
          <a href={explorerTx(state.hash)} target="_blank" rel="noreferrer"
            className="font-mono-data text-[10px] tracking-widest text-cyan hover:text-amber underline">
            {state.hash.slice(0, 10)}…
          </a>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PHASES.map((p, i) => {
          const active = i === currentIdx;
          const past = i < currentIdx || isDone;
          let cls = "border-track text-concrete bg-graphite";
          if (isFailed) cls = "border-vermilion text-vermilion bg-vermilion/10";
          else if (active) cls = "border-amber text-rail bg-amber animate-pulse font-bold";
          else if (past) cls = "border-lime text-lime bg-lime/10";
          return (
            <span key={p} className={`font-mono-data text-[10px] tracking-widest px-2 py-1 border ${cls}`}>
              {p}
            </span>
          );
        })}
        {isFailed && (
          <span className="font-mono-data text-[10px] tracking-widest px-2 py-1 border border-vermilion text-vermilion bg-vermilion/10">
            FAILED
          </span>
        )}
      </div>
      {state.error && (
        <div className="font-body text-xs text-vermilion mt-2 break-words">{state.error}</div>
      )}
    </div>
  );
}
