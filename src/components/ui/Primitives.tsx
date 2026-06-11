import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export function SignalBadge({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "lime" | "vermilion" | "cyan" | "cobalt" | "violet" | "track" }) {
  const map: Record<string, string> = {
    amber: "text-amber",
    lime: "text-lime",
    vermilion: "text-vermilion",
    cyan: "text-cyan",
    cobalt: "text-cobalt",
    violet: "text-violet",
    track: "text-track",
  };
  return <span className={clsx("signal-stamp", map[tone])}>{children}</span>;
}

export function MonoSignalNumber({ value, label, tone = "amber" }: { value: ReactNode; label: string; tone?: "amber" | "lime" | "vermilion" | "cyan" }) {
  const map: Record<string, string> = {
    amber: "text-amber", lime: "text-lime", vermilion: "text-vermilion", cyan: "text-cyan",
  };
  return (
    <div>
      <div className={clsx("mono-num", map[tone])}>{value}</div>
      <div className="font-mono-data text-[10px] tracking-widest uppercase text-track">{label}</div>
    </div>
  );
}

export function RailPanel({ children, className, accent }: { children: ReactNode; className?: string; accent?: string }) {
  return (
    <div
      className={clsx("rail-panel", className)}
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      {children}
    </div>
  );
}

export function TenderPaperPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("tender-paper", className)}>{children}</div>;
}

export function SectionHeading({ kicker, title, tone = "amber" }: { kicker?: string; title: string; tone?: "amber" | "lime" | "cyan" }) {
  const map: Record<string, string> = { amber: "text-amber", lime: "text-lime", cyan: "text-cyan" };
  return (
    <div className="mb-4">
      {kicker && <div className={clsx("font-mono-data text-[11px] tracking-widest uppercase", map[tone])}>{kicker}</div>}
      <h2 className="font-head text-3xl text-signalwhite mt-1">{title}</h2>
      <div className="track-line mt-2" />
    </div>
  );
}

export function LeverLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "review" | "clarify" | "appeal" }) {
  return <Link href={href} className={clsx("signal-lever", variant !== "primary" && variant)}>{children}</Link>;
}

export function GateStatusChip({ status }: { status: string }) {
  const tone =
    /INELIGIBLE|NOT_RECOMMENDED|HIGH|CRITICAL|ESCALATE/.test(status) ? "text-vermilion" :
    /RECOMMENDED|ELIGIBLE|PRIMARY|RESOLVED|LOW/.test(status) ? "text-lime" :
    /SHORTLISTED|RANKED|MEDIUM|PARTIAL/.test(status) ? "text-amber" :
    "text-cyan";
  return <span className={clsx("signal-stamp", tone)}>{status}</span>;
}
