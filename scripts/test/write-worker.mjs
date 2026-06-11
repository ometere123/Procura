// Isolated single-write worker. Spawned by test-all.mjs for nondet writes
// where the SDK's waitForTransactionReceipt can hang indefinitely. The
// worker ONLY submits and prints the hash, then exits. The parent owns
// receipt polling. If the worker hangs the parent SIGKILLs it.
//
// usage:
//   node scripts/test/write-worker.mjs <actorKey> <method> <argsJson>
// env required:
//   NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS
//   PROCURA_BUYER_PK or PROCURA_VENDOR{1..4}_PK matching <actorKey>
//
// stdout protocol: one JSON object per line:
//   {"type":"hash","hash":"0x..."}
//   {"type":"error","msg":"..."}

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const [, , actorKey, method, argsJson] = process.argv;
const CONTRACT = (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS || "").trim();

function emit(o) { process.stdout.write(JSON.stringify(o) + "\n"); }
function die(msg, code = 1) { emit({ type: "error", msg }); process.exit(code); }

if (!actorKey || !method || !argsJson) die("usage: <actorKey> <method> <argsJson>", 2);
if (!CONTRACT) die("missing NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS");

const pkEnvByActor = {
  buyer: "PROCURA_BUYER_PK",
  v1: "PROCURA_VENDOR1_PK",
  v2: "PROCURA_VENDOR2_PK",
  v3: "PROCURA_VENDOR3_PK",
  v4: "PROCURA_VENDOR4_PK",
};
const pkEnv = pkEnvByActor[actorKey];
if (!pkEnv) die(`unknown actor: ${actorKey}`, 2);
const pk = process.env[pkEnv];
if (!pk) die(`missing env ${pkEnv}`, 2);

let args;
try { args = JSON.parse(argsJson); }
catch (e) { die(`bad argsJson: ${e.message}`, 2); }

const account = createAccount(pk);
const client = createClient({ chain: studionet, account });

try {
  const hash = await client.writeContract({
    address: CONTRACT,
    functionName: method,
    args,
    value: 0n,
  });
  emit({ type: "hash", hash });
  process.exit(0);
} catch (e) {
  die(e?.shortMessage || e?.message || String(e));
}
