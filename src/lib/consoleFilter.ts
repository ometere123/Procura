"use client";

// Silence the genlayer-js internal log for transient retry-on-busy responses.
// We catch and retry these in withBusyRetry; the SDK's own console.error pops the
// Next.js dev overlay even though nothing has failed. Real RPC errors still log.

let installed = false;

export function installConsoleFilter() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const s = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (/Server busy|execution slots occupied|retry later|gen_call.*busy/i.test(s)) {
      // demote to debug so it stops triggering the dev overlay
      console.debug("[busy-retry]", ...args);
      return;
    }
    origError(...args);
  };
}
