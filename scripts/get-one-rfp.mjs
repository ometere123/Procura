import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { readFileSync, existsSync } from "node:fs";
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local","utf8").split("\n")) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
const c = createClient({ chain: studionet });
const r = await c.readContract({ address: process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS, functionName: "list_rfps", args: [] });
const ids = JSON.parse(r);
console.log(ids[ids.length - 1] || "");
