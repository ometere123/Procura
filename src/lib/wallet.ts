"use client";
import { create } from "zustand";
import { GENLAYER_STUDIONET } from "./genlayer/config";

type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, h: (...args: unknown[]) => void) => void;
  removeListener?: (e: string, h: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window { ethereum?: Eth }
}

interface WalletState {
  address: `0x${string}` | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureChain: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const CHAIN_HEX = "0x" + GENLAYER_STUDIONET.chainId.toString(16);

export const useWallet = create<WalletState>((set, get) => ({
  address: null,
  chainId: null,
  connecting: false,
  error: null,

  hydrate: async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    try {
      const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
      const cid = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      if (accounts?.[0]) set({ address: accounts[0] as `0x${string}`, chainId: parseInt(cid, 16) });
      window.ethereum.on?.("accountsChanged", (...args: unknown[]) => {
        const accs = args[0] as string[];
        set({ address: (accs?.[0] as `0x${string}`) || null });
      });
      window.ethereum.on?.("chainChanged", (...args: unknown[]) => {
        set({ chainId: parseInt(args[0] as string, 16) });
      });
    } catch {}
  },

  connect: async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      set({ error: "No injected wallet detected. Install MetaMask or another injected wallet." });
      return;
    }
    set({ connecting: true, error: null });
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      set({ address: accounts[0] as `0x${string}` });
      await get().ensureChain();
      const cid = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      set({ chainId: parseInt(cid, 16) });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ connecting: false });
    }
  },

  ensureChain: async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_HEX }],
      });
    } catch (e) {
      const err = e as { code?: number };
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: CHAIN_HEX,
            chainName: GENLAYER_STUDIONET.name,
            rpcUrls: [GENLAYER_STUDIONET.rpcUrl],
            nativeCurrency: { name: GENLAYER_STUDIONET.currency, symbol: GENLAYER_STUDIONET.currency, decimals: 18 },
            blockExplorerUrls: [GENLAYER_STUDIONET.explorerUrl],
          }],
        });
      } else {
        throw e;
      }
    }
  },

  disconnect: () => set({ address: null, chainId: null }),
}));
