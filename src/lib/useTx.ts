"use client";
import { useCallback, useState } from "react";
import type { TxPhase } from "./genlayer/contracts";

export interface TxState {
  busy: boolean;
  label: string | null;
  phase: TxPhase | null;
  hash: `0x${string}` | null;
  error: string | null;
}

export function useTx() {
  const [state, setState] = useState<TxState>({
    busy: false, label: null, phase: null, hash: null, error: null,
  });

  const run = useCallback(
    async <T,>(label: string, fn: (cb: (p: TxPhase, hash?: `0x${string}`) => void) => Promise<T>): Promise<T | undefined> => {
      setState({ busy: true, label, phase: null, hash: null, error: null });
      try {
        const result = await fn((phase, hash) =>
          setState((s) => ({ ...s, phase, hash: hash || s.hash })),
        );
        setState((s) => ({ ...s, busy: false }));
        return result;
      } catch (e) {
        const msg = (e as Error).message || String(e);
        setState((s) => ({ ...s, busy: false, error: msg, phase: "FAILED" }));
        return undefined;
      }
    },
    [],
  );

  const reset = () => setState({ busy: false, label: null, phase: null, hash: null, error: null });

  return { ...state, run, reset };
}
