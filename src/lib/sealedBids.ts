"use client";

const KEY = "procura_sealed_drafts_v1";

export interface SealedDraft {
  bid_id: string;
  rfp_id: string;
  vendor: string;
  bid_json: string;
  salt: string;
  commitment_hash: string;
  created_at: number;
  revealed: boolean;
}

function randomHex(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeCommitment(bidJson: string) {
  const salt = randomHex(32);
  const commitment_hash = await sha256Hex(bidJson + salt);
  return { salt, commitment_hash };
}

export function loadDrafts(): SealedDraft[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function saveDraft(d: SealedDraft) {
  const all = loadDrafts().filter((x) => x.bid_id !== d.bid_id);
  all.push(d);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getDraft(bidId: string) {
  return loadDrafts().find((x) => x.bid_id === bidId) || null;
}

export function markRevealed(bidId: string) {
  const all = loadDrafts().map((x) => x.bid_id === bidId ? { ...x, revealed: true } : x);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function draftsForWallet(addr: string) {
  return loadDrafts().filter((x) => x.vendor.toLowerCase() === addr.toLowerCase());
}
