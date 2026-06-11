import { SignalBadge } from "@/components/ui/Primitives";
import type { SubScore } from "@/types/procura";

export function GatePanel({ title, sub, tone = "cyan" }: { title: string; sub?: SubScore; tone?: "cyan" | "lime" | "amber" | "cobalt" | "violet" | "vermilion" }) {
  const colour: Record<string, string> = {
    cyan: "var(--cyan)", lime: "var(--lime)", amber: "var(--amber)",
    cobalt: "var(--cobalt)", violet: "var(--violet)", vermilion: "var(--vermilion)",
  };
  return (
    <div className="gate-card" style={{ borderLeftColor: colour[tone] }}>
      <div className="flex items-center justify-between">
        <div className="font-head text-xl" style={{ color: colour[tone] }}>{title}</div>
        {sub ? <SignalBadge tone={tone}>SCORE {sub.score}</SignalBadge> : <SignalBadge tone="track">UNREVIEWED</SignalBadge>}
      </div>
      {sub?.reason && <p className="text-concrete text-sm mt-2">{sub.reason}</p>}
    </div>
  );
}
