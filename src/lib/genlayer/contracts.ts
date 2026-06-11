"use client";
import { TransactionStatus } from "genlayer-js/types";
import { getReadClient, getWriteClient, getContractAddress } from "./client";

function safeParse<T>(s: string): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

function isBusy(e: unknown): boolean {
  const msg = (e as Error)?.message || "";
  return /Server busy|execution slots occupied|retry later|JsonRpcVersionUnsupportedError/i.test(msg);
}

async function withBusyRetry<T>(fn: () => Promise<T>, label: string, max = 6): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < max; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (!isBusy(e)) throw e;
      const delay = Math.min(8000, 800 * 2 ** i + Math.random() * 400);
      console.warn(`[busy] ${label} retry ${i + 1}/${max} in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function readMethod<T = unknown>(method: string, args: unknown[] = []): Promise<T | null> {
  const client = getReadClient();
  try {
    const result = await withBusyRetry(
      () => client.readContract({
        address: getContractAddress(),
        functionName: method,
        args,
      } as never),
      `read ${method}`,
    );
    if (typeof result === "string") return safeParse<T>(result) ?? (result as unknown as T);
    return result as T;
  } catch (e) {
    console.error("readMethod failed", method, e);
    return null;
  }
}

export type TxPhase =
  | "SUBMITTING" | "PENDING" | "PROPOSING" | "COMMITTING"
  | "REVEALING" | "ACCEPTED" | "FINALIZED" | "UNDETERMINED" | "FAILED";

export async function writeMethod(
  method: string,
  args: unknown[] = [],
  onStatus?: (phase: TxPhase, hash?: `0x${string}`) => void,
): Promise<string> {
  onStatus?.("SUBMITTING");
  const writeClient = await getWriteClient();
  const readClient = getReadClient();

  const hash = (await withBusyRetry(
    () => writeClient.writeContract({
      address: getContractAddress(),
      functionName: method,
      args,
      value: BigInt(0),
    } as never),
    `write ${method}`,
  )) as `0x${string}`;

  onStatus?.("PENDING", hash);

  let stop = false;
  const poller = (async () => {
    while (!stop) {
      try {
        // @ts-expect-error genlayer-js getTransaction returns { status, ... }
        const tx = await readClient.getTransaction({ hash });
        const s = (tx?.status || tx?.statusName || "").toString().toUpperCase() as TxPhase;
        if (s) onStatus?.(s, hash);
      } catch {}
      await new Promise((r) => setTimeout(r, 2500));
    }
  })();

  try {
    await withBusyRetry(
      () => readClient.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
        retries: 120,
        interval: 3000,
      } as never),
      `waitForReceipt ${method}`,
    );
    onStatus?.("ACCEPTED", hash);
  } catch (e) {
    onStatus?.("FAILED", hash);
    throw e;
  } finally {
    stop = true;
    await poller.catch(() => {});
  }
  return hash;
}
