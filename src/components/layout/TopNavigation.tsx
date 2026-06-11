"use client";
import Link from "next/link";
import { ConnectWallet } from "./ConnectWallet";

export function TopNavigation() {
  return (
    <header className="border-b border-graphite bg-rail sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-3 h-8 bg-amber" />
          <div>
            <div className="font-head text-2xl text-signalwhite leading-none">PROCURA</div>
            <div className="font-mono-data text-[10px] tracking-widest text-track">BID SIGNAL YARD</div>
          </div>
        </Link>
        <nav className="flex items-center gap-5 font-mono-data text-xs tracking-widest uppercase">
          <Link href="/rfps" className="hover:text-amber">RFP Yard</Link>
          <Link href="/create-rfp" className="hover:text-amber">Create RFP</Link>
          <ConnectWallet />
        </nav>
      </div>
    </header>
  );
}
