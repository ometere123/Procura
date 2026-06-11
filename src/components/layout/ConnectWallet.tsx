"use client";
import { useEffect } from "react";
import { useWallet } from "@/lib/wallet";
import { GENLAYER_STUDIONET } from "@/lib/genlayer/config";
import { installConsoleFilter } from "@/lib/consoleFilter";

export function ConnectWallet() {
  const { address, chainId, connecting, error, connect, disconnect, ensureChain, hydrate } = useWallet();

  useEffect(() => { installConsoleFilter(); hydrate(); }, [hydrate]);

  if (!address) {
    return (
      <button onClick={connect} disabled={connecting} className="signal-lever">
        {connecting ? "Connecting…" : "▰ Connect Wallet"}
      </button>
    );
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const wrongChain = chainId !== GENLAYER_STUDIONET.chainId;

  return (
    <div className="flex items-center gap-2">
      {wrongChain && (
        <button onClick={ensureChain} className="signal-lever appeal" title={`Switch to ${GENLAYER_STUDIONET.name}`}>
          Switch to Studionet
        </button>
      )}
      <div className="font-mono-data text-[11px] tracking-widest border border-amber px-3 py-2 text-amber">
        {short}
      </div>
      <button onClick={disconnect} className="font-mono-data text-[10px] tracking-widest text-track hover:text-vermilion uppercase">
        Disconnect
      </button>
      {error && <div className="font-mono-data text-[10px] text-vermilion">{error}</div>}
    </div>
  );
}
