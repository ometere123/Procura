// node scripts/read-review.mjs <bid_id>
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split("\n")) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const bidId = process.argv[2];
if (!bidId) { console.error("usage: node scripts/read-review.mjs <bid_id>"); process.exit(1); }
const CONTRACT = process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS;
const client = createClient({ chain: studionet });

const raw = await client.readContract({ address: CONTRACT, functionName: "get_bid_review", args: [bidId] });
console.log("typeof raw:", typeof raw);
console.log("raw length:", typeof raw === "string" ? raw.length : "n/a");
console.log("\nraw value:");
console.log(raw);
console.log("\n--- parsed ---");
try {
  let parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof parsed === "string") {
    console.log("(double-encoded! parsing again)");
    parsed = JSON.parse(parsed);
  }
  console.log(JSON.stringify(parsed, null, 2).slice(0, 3000));
} catch (e) {
  console.log("parse error:", e.message);
}
