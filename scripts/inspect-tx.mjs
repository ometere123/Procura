// node scripts/inspect-tx.mjs <hash>
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split("\n")) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const hash = process.argv[2];
if (!hash) { console.error("usage: node scripts/inspect-tx.mjs <hash>"); process.exit(1); }

const client = createClient({ chain: studionet });
const tx = await client.getTransaction({ hash });

console.log("statusName:", tx.statusName);
console.log("txExecutionResultName:", tx.txExecutionResultName);
console.log("consensus_data.final:", tx?.consensus_data?.final);
console.log("\n--- leader_receipt[0] ---");
const lr = tx?.consensus_data?.leader_receipt?.[0];
if (!lr) {
  console.log("(no leader receipt)");
} else {
  console.log("execution_result:", lr.execution_result);
  console.log("error:", JSON.stringify(lr.error));
  console.log("vote:", lr.vote);
  console.log("mode:", lr.mode);
  console.log("gas_used:", lr.gas_used);
  console.log("class_name:", lr.class_name);
  console.log("eq_outputs:", JSON.stringify(lr.eq_outputs).slice(0, 400));
  console.log("result:", JSON.stringify(lr.result).slice(0, 400));
  console.log("\nfull leader_receipt keys:", Object.keys(lr));
  console.log("\ngenvm_result:", JSON.stringify(lr.genvm_result).slice(0, 2000));
  console.log("\nexecution_stats:", JSON.stringify(lr.execution_stats).slice(0, 1000));
  console.log("\nnondet_disagree:", JSON.stringify(lr.nondet_disagree));
  if (lr.result?.raw) {
    try {
      const decoded = Buffer.from(lr.result.raw, "base64").toString("utf8");
      console.log("\ndecoded result.raw:");
      console.log(decoded);
    } catch (e) { console.log("decode err:", e.message); }
  }
  if (lr.result?.stdout) console.log("\nstdout:", lr.result.stdout);
  if (lr.result?.stderr) console.log("\nstderr:", lr.result.stderr);
}
console.log("\n--- consensus_data.validators (count) ---");
console.log(tx?.consensus_data?.validators?.length || 0);
if (tx?.consensus_data?.validators?.[0]) {
  console.log("validator[0]:", JSON.stringify(tx.consensus_data.validators[0]).slice(0, 400));
}
console.log("\n--- consensus_data.votes ---");
console.log(JSON.stringify(tx?.consensus_data?.votes || {}).slice(0, 400));
