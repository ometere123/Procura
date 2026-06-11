"use client";
import { CONTRACT_CONFIGURED, NOT_CONFIGURED_MESSAGE } from "@/lib/genlayer/config";

export function NotConfiguredBanner() {
  if (CONTRACT_CONFIGURED) return null;
  return (
    <div className="border-2 border-amber bg-rail/80 p-4 my-6">
      <div className="font-mono-data text-[11px] tracking-widest uppercase text-amber mb-1">
        Configuration Required
      </div>
      <pre className="font-body text-sm text-signalwhite whitespace-pre-wrap">{NOT_CONFIGURED_MESSAGE}</pre>
    </div>
  );
}
