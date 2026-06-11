"use client";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { PROCURA_CONTRACT_ADDRESS } from "./config";
import { useWallet } from "../wallet";

export function getReadClient() {
  return createClient({ chain: studionet });
}

export async function getWriteClient() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask or compatible injected wallet required");
  }
  const { address, ensureChain } = useWallet.getState();
  if (!address) throw new Error("Connect your wallet first.");

  // Make sure the wallet is on Studionet (chain 61999) before signing.
  // We deliberately do NOT call client.connect("studionet") — that path is the
  // GenLayer MetaMask Snap installer (wallet_getSnaps / wallet_requestSnaps).
  // For normal browser-wallet writes the EIP-1193 provider is enough; genlayer-js
  // will call eth_sendTransaction against the consensus main contract directly.
  await ensureChain();

  return createClient({
    chain: studionet,
    account: address as `0x${string}`,
    provider: window.ethereum as unknown as never,
  });
}

export function getContractAddress(): `0x${string}` {
  if (!PROCURA_CONTRACT_ADDRESS) throw new Error("Procura contract address not configured");
  return PROCURA_CONTRACT_ADDRESS as `0x${string}`;
}

export function explorerTx(hash: string) {
  return `${process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL || "https://explorer-studio.genlayer.com"}/tx/${hash}`;
}
