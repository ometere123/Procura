/*
 * End-to-end test suite for the deployed Procura contract on GenLayer Studionet.
 *
 *  Environment variables required (script aborts if any are missing — no defaults
 *  for keys, no hardcoded keys anywhere in this file):
 *
 *    NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS    target Procura contract
 *    PROCURA_BUYER_PK                         buyer (RFP creator) private key
 *    PROCURA_VENDOR1_PK ... VENDOR4_PK        four vendor private keys
 *
 *  Usage:
 *    node scripts/test-all.mjs                 # run every suite
 *    node scripts/test-all.mjs happy-path      # filter to listed suites
 *    node scripts/test-all.mjs --bucket 2      # filter to one bucket
 *
 *  Run order: Step 0 sanity → bucket 1 happy paths → bucket 2 reverts → bucket 3 nondet.
 *  Stops on first failure. Exit code != 0 on failure.
 */

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "test", "write-worker.mjs");

// --------- env loading ---------
function loadEnv() {
  if (!existsSync(".env.local")) return;
  for (const raw of readFileSync(".env.local", "utf8").split("\n")) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

function requireEnv(name) {
  const v = (process.env[name] || "").trim();
  if (!v) {
    console.error(`\nMissing required env var: ${name}`);
    console.error("Set it in your shell or in .env.local. PKs are never hardcoded in this script.");
    process.exit(2);
  }
  return v;
}

const CONTRACT     = requireEnv("NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS");
const BUYER_PK     = requireEnv("PROCURA_BUYER_PK");
const VENDOR_PKS   = ["PROCURA_VENDOR1_PK","PROCURA_VENDOR2_PK","PROCURA_VENDOR3_PK","PROCURA_VENDOR4_PK"].map(requireEnv);

// --------- logging ---------
const ts   = () => new Date().toISOString().slice(11, 23);
const log  = (...a) => console.log(ts(), ...a);
const info = (m) => log("·", m);
const ok   = (m) => log("✓", m);
const bad  = (m) => log("✗", m);
const hr   = (c = "─") => log(c.repeat(72));

// --------- clients ---------
function mkClient(pk) {
  const account = createAccount(pk);
  const client = createClient({ chain: studionet, account });
  return { client, address: account.address };
}

const readClient = createClient({ chain: studionet });
const buyer      = mkClient(BUYER_PK);
const vendors    = VENDOR_PKS.map(mkClient);

// --------- helpers ---------
function shortHash(h) { return h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "(no hash)"; }
function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "(no addr)"; }
function shortArg(v)  {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.length > 24 ? v.slice(0, 12) + "…" + v.slice(-6) : v;
  if (typeof v === "bigint") return v.toString();
  return JSON.stringify(v).slice(0, 32);
}
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const newId  = (p) => `${p}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

// ---- Global RPC throttle: stay under Studionet's 30 req/min ceiling.
// Sliding 60s window, target 24 req/min to leave headroom for background polls
// and the occasional retry-on-rate-limit.
const RPC_WINDOW_MS = 60_000;
const RPC_MAX_PER_WINDOW = 24;
const rpcTimestamps = [];

async function rpcThrottleAcquire() {
  while (true) {
    const now = Date.now();
    while (rpcTimestamps.length && now - rpcTimestamps[0] > RPC_WINDOW_MS) rpcTimestamps.shift();
    if (rpcTimestamps.length < RPC_MAX_PER_WINDOW) { rpcTimestamps.push(now); return; }
    const wait = RPC_WINDOW_MS - (now - rpcTimestamps[0]) + 250;
    await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
  }
}

function isRateLimitErr(e) {
  const msg = (e?.message || e?.shortMessage || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many requests") || e?.code === 429;
}

async function withRateLimitRetry(fn, label, maxAttempts = 5) {
  let lastErr;
  for (let i = 1; i <= maxAttempts; i++) {
    await rpcThrottleAcquire();
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (!isRateLimitErr(e) || i === maxAttempts) throw e;
      const backoff = 5000 * i;
      log("⏳", `${label}: rate-limited, backing off ${backoff/1000}s (attempt ${i}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function callRead(method, args = []) {
  const r = await withRateLimitRetry(
    () => readClient.readContract({ address: CONTRACT, functionName: method, args }),
    `read ${method}`,
  );
  try { return typeof r === "string" ? (r === "" ? null : JSON.parse(r)) : r; }
  catch { return r; }
}

async function getBalance(addr) {
  return await withRateLimitRetry(() => readClient.getBalance({ address: addr }), "getBalance");
}

/**
 * Send a write, wait for receipt, then inspect the leader receipt's execution_result.
 * Anything other than SUCCESS counts as a failure even if writeContract resolved.
 * Returns { hash, ok, error, stderr, executionResult, statusName }.
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); },
                 (e) => { clearTimeout(t); reject(e); });
  });
}

async function withRpcRetry(fn, label, timeoutMs = 12 * 60 * 1000) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await withTimeout(fn(), timeoutMs, label); }
    catch (e) {
      lastErr = e;
      log("!", `${label} attempt ${attempt} failed: ${e?.shortMessage || e?.message || e}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr;
}

async function callWrite(actor, label, method, args = []) {
  const callerTag = actor === buyer ? "buyer" : `v${vendors.indexOf(actor) + 1}`;
  const argsSummary = args.map(shortArg).join(", ");
  log("→", callerTag, `${method}(${argsSummary})`);
  const t0 = Date.now();

  // STEP 1: submit. Only retry if we never got a hash back. Never re-submit a tx
  // that may already be on-chain.
  let hash;
  try {
    hash = await withRpcRetry(
      () => actor.client.writeContract({ address: CONTRACT, functionName: method, args, value: 0n }),
      `${method} submit`,
    );
  } catch (e) {
    return { ok: false, error: `submit failed after 3 attempts: ${e?.shortMessage || e?.message || e}`,
             ms: Date.now() - t0 };
  }

  // STEP 2: wait for receipt. Retry the wait itself on RPC blips — same hash.
  try {
    await withRpcRetry(
      () => readClient.waitForTransactionReceipt({
        hash, status: TransactionStatus.ACCEPTED, retries: 200, interval: 3000,
      }),
      `${method} waitReceipt`,
    );
  } catch (e) {
    return { hash, ok: false, error: `waitReceipt failed: ${e?.shortMessage || e?.message || e}`,
             ms: Date.now() - t0 };
  }

  // STEP 3: inspect leader receipt.
  let tx;
  try {
    tx = await withRpcRetry(() => readClient.getTransaction({ hash }), `${method} getTransaction`);
  } catch (e) {
    return { hash, ok: false, error: `getTransaction failed: ${e?.shortMessage || e?.message || e}`,
             ms: Date.now() - t0 };
  }

  const leader = tx?.consensus_data?.leader_receipt?.[0];
  const executionResult = leader?.execution_result || tx?.txExecutionResultName || "";
  const statusName = tx?.statusName || "";
  const stderrRaw = leader?.error || "";
  const okExec = ["SUCCESS", "ACCEPTED"].includes(executionResult.toUpperCase());
  if (!okExec) {
    let stderr = String(stderrRaw).split(/\r?\n/).filter(Boolean).slice(-2).join(" | ");
    if (!stderr && leader?.eq_outputs) stderr = JSON.stringify(leader.eq_outputs).slice(0, 200);
    if (!stderr && leader?.result) stderr = String(leader.result).slice(0, 200);
    return { hash, ok: false, error: `execution_result=${executionResult || "<unknown>"} status=${statusName}`,
             stderr, executionResult, statusName, ms: Date.now() - t0 };
  }
  log("✓", `${method} (${Date.now() - t0}ms) tx=${shortHash(hash)} status=${statusName}`);
  return { hash, ok: true, executionResult, statusName, ms: Date.now() - t0 };
}

/** assert; throws AssertionError-like if not equal */
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed: ${label}\n  expected: ${e}\n  actual:   ${a}`);
  info(`assert ${label} = ${e.length > 60 ? e.slice(0, 60) + "…" : e}`);
}
function assertTrue(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
  info(`assert ${label} = true`);
}
function assertIn(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`assertion failed: ${label}: ${value} not in ${JSON.stringify(allowed)}`);
  info(`assert ${label} ∈ allowed (${value})`);
}
function assertNum(value, low, high, label) {
  if (typeof value !== "number" || value < low || value > high)
    throw new Error(`assertion failed: ${label}: ${value} not in [${low}, ${high}]`);
  info(`assert ${label} ∈ [${low},${high}] (${value})`);
}
function assertArr(v, label) {
  if (!Array.isArray(v)) throw new Error(`assertion failed: ${label} not array`);
  info(`assert ${label} is array (len=${v.length})`);
}
function assertRevert(res, mustInclude, label) {
  if (res.ok) throw new Error(`expected on-chain revert but execution_result=${res.executionResult}: ${label}`);
  const raw = (res.stderr || "").trim();
  // Treat empty / "{}" / "null" / "[]" as no usable stderr.
  const hasMsg = raw && !["{}", "[]", "null", "undefined"].includes(raw);
  // SDK on Studionet does not always surface the Python VmUserError message in
  // leader_receipt[0].error; when it does we use it for a tighter assertion.
  // Otherwise we trust execution_result=ERROR + the per-suite state-unchanged read.
  if (mustInclude && hasMsg && !raw.toLowerCase().includes(mustInclude.toLowerCase()))
    throw new Error(`reverted but message did not include "${mustInclude}": ${label}\n  got: ${raw}`);
  const reason = hasMsg ? `stderr="${raw.slice(0, 80)}"` : `stderr=<empty> (SDK didn't surface VmUserError msg)`;
  info(`revert ${label} (${res.executionResult}) ${reason}`);
}

// --------- fixtures ---------
function makeRfp(overrides = {}) {
  return {
    title: "E2E RFP",
    buyer_org: "Test Buyer Org",
    category: "SOFTWARE",
    summary: "E2E test RFP.",
    full_text: "Mandatory: cert X, cert Y. Optional: Z.",
    mandatory_requirements: ["cert X", "cert Y"],
    optional_requirements: ["Z"],
    budget_min: 10000, budget_max: 100000, currency: "USD",
    submission_deadline: "2026-12-31", evaluation_deadline: "2027-01-31",
    required_documents: ["doc A"],
    compliance_requirements: "HIPAA",
    security_requirements: "SOC2",
    delivery_requirements: "12 months",
    pricing_model: "fixed",
    clarification_rules: "5 BD",
    appeal_rules: "10 BD",
    conflict_of_interest_rules: "disclose 36 months",
    ...overrides,
  };
}
const RUBRIC = {
  items: [
    { id: "MANDATORY_ELIGIBILITY", category: "MANDATORY_ELIGIBILITY", weight: 0,  mandatory: true,  description: "all mandatory certs present" },
    { id: "TECHNICAL_FIT",         category: "TECHNICAL_FIT",         weight: 30, mandatory: false, description: "fit to scope" },
    { id: "COMMERCIAL_VALUE",      category: "COMMERCIAL_VALUE",      weight: 25, mandatory: false, description: "price-value" },
    { id: "DELIVERY_FEASIBILITY",  category: "DELIVERY_FEASIBILITY",  weight: 15, mandatory: false, description: "timeline realism" },
    { id: "VENDOR_CAPABILITY",     category: "VENDOR_CAPABILITY",     weight: 10, mandatory: false, description: "references" },
    { id: "COMPLIANCE_SECURITY",   category: "COMPLIANCE_SECURITY",   weight: 10, mandatory: false, description: "encryption + audit" },
    { id: "QUALITATIVE_FIT",       category: "QUALITATIVE_FIT",       weight: 5,  mandatory: false, description: "buyer context" },
    { id: "RISK_AND_EXCEPTIONS",   category: "RISK_AND_EXCEPTIONS",   weight: 5,  mandatory: false, description: "contract exceptions" },
  ],
};
function makeBid(overrides = {}) {
  return {
    vendor_name: "Test Vendor",
    vendor_profile: "Vendor profile.",
    executive_summary: "We will deliver the scope on time and on budget.",
    technical_approach: "Standard cloud architecture, FHIR R4, HL7 v2.5, SSO via SAML, encryption at rest + in transit.",
    implementation_plan: "Pilot month 6, full rollout month 12.",
    timeline: "12 months",
    pricing_proposal: "$80,000 fixed-fee.",
    bid_amount: 80000, currency: "USD",
    compliance_responses: "HIPAA, SOC 2, encryption at rest AES-256, audit logging.",
    team_capability: "Implementation lead with 10 years experience.",
    case_studies: "5 deployments at similar scale.",
    references: "3 references available.",
    risk_disclosures: "Standard delivery risks.",
    assumptions: "Customer provides access to data sources.",
    exceptions: "None.",
    ...overrides,
  };
}

async function createRfpAndExpect(actor, rfpOverrides = {}, label = "create_rfp") {
  const rfpId = newId("rfp");
  const rfp = { rfp_id: rfpId, ...makeRfp(rfpOverrides) };
  const res = await callWrite(actor, label, "create_rfp",
    [rfpId, JSON.stringify(rfp), JSON.stringify(RUBRIC)]);
  if (!res.ok) throw new Error(`create_rfp setup failed: ${res.error} ${res.stderr || ""}`);
  return rfpId;
}

async function commitBidFor(vendor, rfpId, bidOverrides = {}) {
  const bidId = newId("bid");
  const bid = { bid_id: bidId, rfp_id: rfpId, ...makeBid(bidOverrides) };
  const bid_json = JSON.stringify(bid);
  const salt = randomBytes(32).toString("hex");
  const hash = sha256(bid_json + salt);
  const res = await callWrite(vendor, `commit ${bidId}`, "submit_bid_commitment",
    [bidId, rfpId, hash]);
  if (!res.ok) throw new Error(`commit setup failed: ${res.error} ${res.stderr || ""}`);
  return { bidId, bid_json, salt, hash };
}

async function revealBidFor(vendor, draft) {
  const res = await callWrite(vendor, `reveal ${draft.bidId}`, "reveal_bid",
    [draft.bidId, draft.bid_json, draft.salt]);
  if (!res.ok) throw new Error(`reveal setup failed: ${res.error} ${res.stderr || ""}`);
}

// --------- suite registry ---------
const SUITES = [];
function suite(name, bucket, fn) { SUITES.push({ name, bucket, fn }); }

// =======================================================================
// BUCKET 1 — DETERMINISTIC HAPPY PATH
// =======================================================================
suite("happy-path", 1, async () => {
  // 1. Buyer creates RFP
  const rfpId = await createRfpAndExpect(buyer, { title: "Happy-path EHR" });

  // verify state
  const rfp = await callRead("get_rfp", [rfpId]);
  assertEq(rfp.status, "OPEN", "rfp.status");
  assertEq(rfp.title, "Happy-path EHR", "rfp.title");
  assertTrue(typeof rfp.buyer === "string" && rfp.buyer.toLowerCase() === buyer.address.toLowerCase(), "rfp.buyer == buyer");
  const bidsBefore = await callRead("get_rfp_bids", [rfpId]);
  assertEq(bidsBefore, [], "rfp_bids initially empty");

  // 2. Each vendor commits a sealed bid
  const drafts = [];
  for (let i = 0; i < vendors.length; i++) {
    const draft = await commitBidFor(vendors[i], rfpId, { vendor_name: `Vendor ${i + 1}` });
    drafts.push(draft);
    const c = await callRead("get_bid_commitment", [draft.bidId]);
    assertEq(c.status, "COMMITTED", `commitment[${draft.bidId}].status`);
    assertEq(c.commitment_hash, draft.hash, `commitment[${draft.bidId}].hash matches`);
    assertTrue(c.vendor.toLowerCase() === vendors[i].address.toLowerCase(), "commitment.vendor");
  }
  const bidsAfter = await callRead("get_rfp_bids", [rfpId]);
  assertEq(bidsAfter.length, vendors.length, "rfp_bids count == vendors");

  // 3. Buyer closes
  const closeRes = await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  if (!closeRes.ok) throw new Error(`close failed: ${closeRes.error}`);
  const rfpClosed = await callRead("get_rfp", [rfpId]);
  assertEq(rfpClosed.status, "CLOSED", "rfp.status after close");

  // 4. Each vendor reveals
  for (let i = 0; i < vendors.length; i++) {
    await revealBidFor(vendors[i], drafts[i]);
    const bid = await callRead("get_bid", [drafts[i].bidId]);
    assertEq(bid.status, "REVEALED", `bid[${drafts[i].bidId}].status`);
    assertEq(bid.vendor_name, `Vendor ${i + 1}`, "bid.vendor_name persisted");
    assertTrue(bid.vendor.toLowerCase() === vendors[i].address.toLowerCase(), "bid.vendor address");
  }

  // 5. Protocol stats reflect activity
  const stats = await callRead("get_protocol_stats");
  assertTrue(stats.rfp_count >= 1, "stats.rfp_count >= 1");
  assertTrue(stats.bid_count >= vendors.length, "stats.bid_count >= 4");
});

// =======================================================================
// BUCKET 2 — DETERMINISTIC REVERT PATHS
// =======================================================================
suite("revert-empty-rfp-id", 2, async () => {
  const res = await callWrite(buyer, "create_rfp empty id", "create_rfp",
    ["", JSON.stringify(makeRfp()), JSON.stringify(RUBRIC)]);
  assertRevert(res, "rfp_id required", "empty rfp_id");
});

suite("revert-duplicate-rfp", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const res = await callWrite(buyer, "duplicate create_rfp", "create_rfp",
    [rfpId, JSON.stringify(makeRfp()), JSON.stringify(RUBRIC)]);
  assertRevert(res, "exists", "duplicate rfp_id rejected");
  const rfp = await callRead("get_rfp", [rfpId]);
  assertEq(rfp.status, "OPEN", "rfp state unchanged");
});

suite("revert-buyer-self-bid", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const dummy = sha256("dummy_bid_json" + "salt");
  const res = await callWrite(buyer, "buyer self-bid", "submit_bid_commitment",
    [newId("bid"), rfpId, dummy]);
  assertRevert(res, "buyer", "buyer cannot bid on own rfp");
  const bids = await callRead("get_rfp_bids", [rfpId]);
  assertEq(bids, [], "no bids created");
});

suite("revert-non-buyer-close", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const res = await callWrite(vendors[0], "non-buyer close_rfp", "close_rfp", [rfpId]);
  assertRevert(res, "buyer", "non-buyer cannot close");
  const rfp = await callRead("get_rfp", [rfpId]);
  assertEq(rfp.status, "OPEN", "rfp still OPEN");
});

suite("revert-commit-after-close", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  const bidsBefore = await callRead("get_rfp_bids", [rfpId]);
  const newBidId = newId("bid");
  const dummy = sha256("post-close" + "salt");
  const res = await callWrite(vendors[0], "commit after close", "submit_bid_commitment",
    [newBidId, rfpId, dummy]);
  assertRevert(res, "open", "no commits after close");
  const bidsAfter = await callRead("get_rfp_bids", [rfpId]);
  assertEq(bidsAfter, bidsBefore, "rfp_bids unchanged");
  const commitment = await callRead("get_bid_commitment", [newBidId]);
  assertEq(commitment, null, "no commitment stored");
});

suite("revert-duplicate-commitment", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const draft = await commitBidFor(vendors[0], rfpId);
  const bidsBefore = await callRead("get_rfp_bids", [rfpId]);
  const res = await callWrite(vendors[0], "duplicate commit", "submit_bid_commitment",
    [draft.bidId, rfpId, draft.hash]);
  assertRevert(res, "exists", "duplicate bid_id rejected");
  const bidsAfter = await callRead("get_rfp_bids", [rfpId]);
  assertEq(bidsAfter, bidsBefore, "rfp_bids unchanged (no double-add)");
});

suite("revert-bad-commitment-hash", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const newBidId = newId("bid");
  const res = await callWrite(vendors[0], "short hash", "submit_bid_commitment",
    [newBidId, rfpId, "deadbeef"]);
  assertRevert(res, "commitment_hash", "short hash rejected");
  const commitment = await callRead("get_bid_commitment", [newBidId]);
  assertEq(commitment, null, "no commitment stored");
  const bids = await callRead("get_rfp_bids", [rfpId]);
  assertEq(bids, [], "rfp_bids still empty");
});

suite("revert-rfp-not-found", 2, async () => {
  const dummy = sha256("x" + "y");
  const res = await callWrite(vendors[0], "commit to missing rfp", "submit_bid_commitment",
    [newId("bid"), "rfp_does_not_exist_zzz", dummy]);
  assertRevert(res, "rfp not found", "missing rfp rejected");
});

suite("revert-reveal-before-close", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const draft = await commitBidFor(vendors[0], rfpId);
  const res = await callWrite(vendors[0], "reveal before close", "reveal_bid",
    [draft.bidId, draft.bid_json, draft.salt]);
  assertRevert(res, "closed", "reveal blocked while OPEN");
  const bid = await callRead("get_bid", [draft.bidId]);
  assertEq(bid, null, "bid not stored");
});

suite("revert-wrong-vendor-reveal", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const draft = await commitBidFor(vendors[0], rfpId);
  await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  const res = await callWrite(vendors[1], "wrong-vendor reveal", "reveal_bid",
    [draft.bidId, draft.bid_json, draft.salt]);
  assertRevert(res, "vendor", "only committing vendor can reveal");
  const bid = await callRead("get_bid", [draft.bidId]);
  assertEq(bid, null, "bid not stored");
});

suite("revert-reveal-hash-mismatch", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const draft = await commitBidFor(vendors[0], rfpId);
  await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  const tamperedJson = draft.bid_json.replace("Test Vendor", "Tampered Vendor");
  const res = await callWrite(vendors[0], "tampered reveal", "reveal_bid",
    [draft.bidId, tamperedJson, draft.salt]);
  assertRevert(res, "match", "tampered bid rejected");
  const bid = await callRead("get_bid", [draft.bidId]);
  assertEq(bid, null, "no bid stored after tampered reveal");
  const c = await callRead("get_bid_commitment", [draft.bidId]);
  assertEq(c.status, "COMMITTED", "commitment still COMMITTED, not REVEALED");
});

suite("revert-non-buyer-review", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const draft = await commitBidFor(vendors[0], rfpId);
  await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  await revealBidFor(vendors[0], draft);
  const res = await callWrite(vendors[0], "non-buyer review_bid", "review_bid", [draft.bidId]);
  assertRevert(res, "buyer", "only buyer can review");
  const review = await callRead("get_bid_review", [draft.bidId]);
  assertEq(review, null, "no review stored");
});

suite("revert-non-buyer-rank", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const draft = await commitBidFor(vendors[0], rfpId);
  await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  await revealBidFor(vendors[0], draft);
  const res = await callWrite(vendors[0], "non-buyer rank", "rank_rfp_bids", [rfpId]);
  assertRevert(res, "buyer", "only buyer can rank");
  const ranking = await callRead("get_rfp_ranking", [rfpId]);
  assertEq(ranking, null, "no ranking stored");
});

suite("revert-non-buyer-finalize", 2, async () => {
  const rfpId = await createRfpAndExpect(buyer);
  const res = await callWrite(vendors[0], "non-buyer finalize", "finalize_rfp", [rfpId]);
  assertRevert(res, "buyer", "only buyer can finalize");
  const rfp = await callRead("get_rfp", [rfpId]);
  assertEq(rfp.status, "OPEN", "rfp.status still OPEN");
});

// =======================================================================
// BUCKET 3 — NONDETERMINISTIC FUNCTIONS
// =======================================================================
function validateReview(d) {
  assertIn(d.verdict,
    ["ELIGIBLE","INELIGIBLE","SHORTLISTED","RANKED","RECOMMENDED","NOT_RECOMMENDED","NEEDS_CLARIFICATION","ESCALATE"],
    "review.verdict");
  assertIn(d.eligibility, ["ELIGIBLE","INELIGIBLE","CONDITIONALLY_ELIGIBLE","UNCLEAR"], "review.eligibility");
  assertIn(d.risk_level, ["LOW","MEDIUM","HIGH","CRITICAL"], "review.risk_level");
  assertNum(d.procurement_score, 0, 100, "review.procurement_score");
  assertNum(d.confidence, 0, 100, "review.confidence");
  assertTrue(typeof d.reasoning_summary === "string" && d.reasoning_summary.trim().length > 0, "reasoning_summary non-empty");
  for (const sub of ["technical_fit","commercial_value","delivery_feasibility","vendor_capability","compliance_security","qualitative_fit","risk_and_exceptions"]) {
    assertTrue(d[sub] && typeof d[sub].score === "number", `review.${sub} present`);
    assertNum(d[sub].score, 0, 100, `review.${sub}.score`);
  }
  for (const arr of ["mandatory_failures","clarification_requests","positive_signals","red_flags","missing_information"]) {
    assertArr(d[arr], `review.${arr}`);
  }
}

// ---------- Isolated child-process write (for nondet) ----------
//
// Worker process submits the tx and exits. If it hangs we SIGKILL it.
// Parent owns receipt polling — never touches genlayer-js waitForTransactionReceipt.

const ACTOR_KEY = (actor) => actor === buyer ? "buyer" : `v${vendors.indexOf(actor) + 1}`;

function spawnWriteWorker(actorKey, method, args, submitTimeoutMs) {
  return new Promise((resolve) => {
    const argsJson = JSON.stringify(args);
    const child = spawn(process.execPath, [WORKER_PATH, actorKey, method, argsJson], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let hash = null;
    let errMsg = null;
    let stdoutBuf = "";
    let stderrBuf = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try { child.kill("SIGKILL"); } catch {}
    }, submitTimeoutMs);

    child.stdout.on("data", (d) => {
      stdoutBuf += d.toString();
      let i;
      while ((i = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, i).trim();
        stdoutBuf = stdoutBuf.slice(i + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "hash") hash = msg.hash;
          if (msg.type === "error") errMsg = msg.msg;
        } catch {}
      }
    });
    child.stderr.on("data", (d) => { stderrBuf += d.toString(); });

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({
        hash, killed, exitCode: code, signal,
        error: errMsg || (killed ? `submit timeout ${submitTimeoutMs}ms (SIGKILLed)` : null),
        stderr: stderrBuf.slice(-500),
      });
    });
  });
}

// Wait for the chain to definitively finalize each tx. Submitting a fresh
// write while the prior one is still PROPOSING/COMMITTING just stacks new
// txs behind a held validator slot, so we no longer bail on rotation — we
// trust the chain to resolve to ACCEPTED, FINALIZED, or UNDETERMINED and
// only retry on the latter.
const POLL_TOTAL_BUDGET_MS = 30 * 60 * 1000; // 30 min absolute ceiling per write

async function pollReceiptIndependent(hash, totalTimeoutMs = POLL_TOTAL_BUDGET_MS, perCallTimeoutMs = 30000) {
  const start = Date.now();
  let lastErr = null;
  let lastStatus = null;
  let lastHeartbeat = start;
  const HEARTBEAT_MS = 60_000;
  let iter = 0;
  while (Date.now() - start < totalTimeoutMs) {
    iter++;
    try {
      await rpcThrottleAcquire();
      const tx = await Promise.race([
        readClient.getTransaction({ hash }),
        new Promise((_, rj) => setTimeout(() => rj(new Error(`getTransaction timeout ${perCallTimeoutMs}ms`)), perCallTimeoutMs)),
      ]);
      const statusName = (tx?.statusName || "").toUpperCase();
      const lr = tx?.consensus_data?.leader_receipt?.[0];
      const er = (lr?.execution_result || "").toUpperCase();
      if (statusName && statusName !== lastStatus) {
        lastStatus = statusName;
        log("…", `tx=${shortHash(hash)} status=${statusName} (waited ${Math.round((Date.now()-start)/1000)}s)`);
      } else if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
        lastHeartbeat = Date.now();
        log("♥", `tx=${shortHash(hash)} status=${lastStatus || "PENDING"} elapsed=${Math.round((Date.now()-start)/1000)}s iter=${iter}`);
      }

      if (statusName === "ACCEPTED" || statusName === "FINALIZED") {
        if (er === "SUCCESS" || er === "ACCEPTED") {
          return { ok: true, executionResult: er, statusName };
        }
        let stderrMsg = "";
        const gv = lr?.genvm_result;
        if (gv?.stderr) stderrMsg = String(gv.stderr).split(/\r?\n/).filter(Boolean).slice(-2).join(" | ");
        return { ok: false, error: `execution_result=${er} status=${statusName}`, stderr: stderrMsg, executionResult: er, statusName };
      }

      if (statusName === "UNDETERMINED") {
        return {
          ok: false,
          retryable: true,
          executionResult: "UNDETERMINED",
          statusName,
          error: `tx UNDETERMINED — validators did not converge after leader rotation`,
        };
      }

      // No early bail on PROPOSING/COMMITTING. Submitting a fresh write while
      // the prior one is still in rotation stacks PENDINGs behind a held
      // validator slot. We wait the full budget for ACCEPTED/UNDETERMINED.
    } catch (e) {
      lastErr = e;
      if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
        lastHeartbeat = Date.now();
        log("♥", `tx=${shortHash(hash)} poll err=${e?.message?.slice(0, 60) || "?"} elapsed=${Math.round((Date.now()-start)/1000)}s iter=${iter}`);
      }
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
  return { ok: false, retryable: true, error: `independent receipt poll timeout ${totalTimeoutMs}ms; lastErr=${lastErr?.message || "<none>"}` };
}

async function callWriteIsolated(actor, method, args, opts = {}) {
  const { submitTimeoutMs = 45_000, receiptTimeoutMs = 20 * 60 * 1000 } = opts;
  const actorKey = ACTOR_KEY(actor);
  log("→", actorKey, `${method}(${args.map(shortArg).join(", ")})  [isolated]`);
  const t0 = Date.now();

  const worker = await spawnWriteWorker(actorKey, method, args, submitTimeoutMs);
  if (!worker.hash) {
    return {
      ok: false,
      error: `submit failed: ${worker.error || "no hash"}${worker.stderr ? " | stderr=" + worker.stderr : ""}`,
      ms: Date.now() - t0,
    };
  }

  log("⋯", `submitted tx=${shortHash(worker.hash)} (worker exit ${worker.exitCode}); polling receipt independently…`);

  const final = await pollReceiptIndependent(worker.hash, receiptTimeoutMs);
  const ms = Date.now() - t0;
  if (final.ok) log("✓", `${method} (${ms}ms) tx=${shortHash(worker.hash)} status=${final.statusName} [isolated]`);
  return { ...final, hash: worker.hash, ms };
}

// Detect the SDK's short-circuit envelope. When prompt_non_comparative bypasses
// the LLM (cache/early-validate path) it returns `{"accept":true}` instead of
// the leader's actual run() output, so the contract stores the envelope rather
// than the real bid-review/ranking JSON. We treat that as an SDK flake and
// retry the whole call.
function isShortCircuitEnvelope(stored) {
  if (!stored || typeof stored !== "object") return false;
  const keys = Object.keys(stored);
  if (keys.length <= 2 && keys.every((k) => k === "accept" || k === "reason")) return true;
  return false;
}

async function callNondetWrite(actor, label, method, args, opts = {}) {
  const {
    maxAttempts = 4,
    // optional content validator: { readFn, isValid(parsed): bool, readArgs }
    contentCheck = null,
  } = opts;

  for (let i = 1; i <= maxAttempts; i++) {
    const res = await callWriteIsolated(actor, method, args);
    if (!res.ok) {
      // UNDETERMINED (validator divergence) is retryable. Wait longer between
      // retries to give the prior tx and any queued PENDINGs time to clear
      // through the validator network.
      if (res.retryable) {
        const cooldownMs = 90_000;
        log("!", `${method} attempt ${i}: ${res.error} (retryable); ${i < maxAttempts ? `cooldown ${cooldownMs/1000}s before retry` : "giving up"}`);
        if (i < maxAttempts) { await new Promise((r) => setTimeout(r, cooldownMs)); continue; }
        throw new Error(`${method} retryable failure after ${maxAttempts} attempts: ${res.error} tx=${res.hash}`);
      }
      log("!", `${method} attempt ${i}: ${res.error}; ${i < maxAttempts ? "retrying in 20s…" : "giving up"}`);
      if (i < maxAttempts) { await new Promise((r) => setTimeout(r, 20000)); continue; }
      throw new Error(`${method} failed: ${res.error} stderr=${res.stderr || "<empty>"} tx=${res.hash}`);
    }

    // tx accepted. Now verify stored content shape if a check is provided.
    if (contentCheck) {
      const stored = await contentCheck.readFn(...(contentCheck.readArgs || []));
      if (isShortCircuitEnvelope(stored)) {
        log("!", `${method} stored short-circuit envelope ${JSON.stringify(stored)} tx=${res.hash}; SDK flake, retrying (${i}/${maxAttempts})`);
        if (i < maxAttempts) { await new Promise((r) => setTimeout(r, 15000)); continue; }
        throw new Error(`${method} returned short-circuit envelope after ${maxAttempts} attempts: ${JSON.stringify(stored)}`);
      }
      if (!contentCheck.isValid(stored)) {
        log("!", `${method} stored content failed validator tx=${res.hash}; retrying (${i}/${maxAttempts})`);
        if (i < maxAttempts) { await new Promise((r) => setTimeout(r, 15000)); continue; }
        throw new Error(`${method} stored content invalid after ${maxAttempts} attempts: ${JSON.stringify(stored).slice(0, 200)}`);
      }
    }
    return res;
  }
}

suite("nondet-review-bid", 3, async () => {
  const rfpId = await createRfpAndExpect(buyer, { title: "Nondet review_bid RFP" });
  const draft = await commitBidFor(vendors[0], rfpId, { vendor_name: "Atlas Strong" });
  await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  await revealBidFor(vendors[0], draft);

  await callNondetWrite(buyer, "review_bid", "review_bid", [draft.bidId], {
    contentCheck: {
      readFn: callRead,
      readArgs: ["get_bid_review", [draft.bidId]],
      isValid: (r) => r && typeof r === "object" && typeof r.verdict === "string",
    },
  });

  // confirm persistence + schema
  const stored = await callRead("get_bid_review", [draft.bidId]);
  assertTrue(stored && typeof stored === "object", "review persisted as object");
  validateReview(stored);
});

const REVIEW_CONTENT_CHECK = (bidId) => ({
  readFn: callRead,
  readArgs: ["get_bid_review", [bidId]],
  isValid: (r) => r && typeof r === "object" && typeof r.verdict === "string",
});

suite("nondet-rank-rfp", 3, async () => {
  const rfpId = await createRfpAndExpect(buyer, { title: "Nondet rank_rfp RFP" });
  const draftA = await commitBidFor(vendors[0], rfpId, { vendor_name: "Atlas Strong", bid_amount: 90000 });
  const draftB = await commitBidFor(vendors[1], rfpId, { vendor_name: "Cheap Cuts", bid_amount: 20000,
    exceptions: "Liability cap 1x annual fees, no SLA credits, no 24x7 support.",
    risk_disclosures: "No HITRUST yet, no SOC 2.", compliance_responses: "Not certified yet." });
  await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  await revealBidFor(vendors[0], draftA);
  await revealBidFor(vendors[1], draftB);

  // pre-review each bid so ranker has reviews to reason about
  await callNondetWrite(buyer, "review_bid A", "review_bid", [draftA.bidId],
    { contentCheck: REVIEW_CONTENT_CHECK(draftA.bidId) });
  await callNondetWrite(buyer, "review_bid B", "review_bid", [draftB.bidId],
    { contentCheck: REVIEW_CONTENT_CHECK(draftB.bidId) });

  await callNondetWrite(buyer, "rank_rfp_bids", "rank_rfp_bids", [rfpId], {
    contentCheck: {
      readFn: callRead,
      readArgs: ["get_rfp_ranking", [rfpId]],
      isValid: (r) => r && typeof r === "object" && typeof r.ranking_status === "string" && Array.isArray(r.ranked_bids),
    },
  });

  const ranking = await callRead("get_rfp_ranking", [rfpId]);
  assertTrue(ranking && typeof ranking === "object", "ranking persisted");
  assertIn(ranking.ranking_status, ["RANKED","PARTIALLY_RANKED","NEEDS_MORE_INFORMATION","ESCALATE"], "ranking.ranking_status");
  assertArr(ranking.ranked_bids, "ranking.ranked_bids");
  const seenRanks = new Set();
  for (const rb of ranking.ranked_bids) {
    assertNum(rb.procurement_score, 0, 100, "ranked_bid.procurement_score");
    assertIn(rb.award_recommendation,
      ["PRIMARY_AWARD","BACKUP_VENDOR","SHORTLIST_ONLY","DO_NOT_AWARD","NEEDS_CLARIFICATION"],
      "ranked_bid.award_recommendation");
    assertTrue(!seenRanks.has(rb.rank), `unique rank ${rb.rank}`);
    seenRanks.add(rb.rank);
  }
  assertTrue(typeof ranking.reasoning_summary === "string" && ranking.reasoning_summary.length > 0, "ranking.reasoning_summary");
});

suite("nondet-clarification-review", 3, async () => {
  const rfpId = await createRfpAndExpect(buyer, { title: "Nondet clarification RFP" });
  const draft = await commitBidFor(vendors[0], rfpId, { vendor_name: "ClariCorp", risk_disclosures: "Some details TBD.", compliance_responses: "We will provide cert later." });
  await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  await revealBidFor(vendors[0], draft);
  await callNondetWrite(buyer, "review_bid", "review_bid", [draft.bidId],
    { contentCheck: REVIEW_CONTENT_CHECK(draft.bidId) });

  const cid = newId("clr");
  const reqRes = await callWrite(buyer, "request_clarification", "request_clarification",
    [cid, draft.bidId, JSON.stringify({ reason: "COMPLIANCE_GAP", question: "Provide HITRUST cert details." })]);
  if (!reqRes.ok) throw new Error(`request_clarification failed: ${reqRes.error} ${reqRes.stderr || ""}`);

  const respRes = await callWrite(vendors[0], "submit_clarification_response", "submit_clarification_response",
    [cid, JSON.stringify({ answer: "Our HITRUST CSF r2 certificate is dated 2025-01-01.", evidence: "Cert id 12345" })]);
  if (!respRes.ok) throw new Error(`submit_clarification_response failed: ${respRes.error} ${respRes.stderr || ""}`);

  await callNondetWrite(buyer, "review_clarification", "review_clarification", [cid], {
    contentCheck: {
      readFn: callRead,
      readArgs: ["get_clarification_review", [cid]],
      isValid: (r) => r && typeof r === "object" && typeof r.clarification_decision === "string",
    },
  });

  const stored = await callRead("get_clarification_review", [cid]);
  assertTrue(stored && typeof stored === "object", "clarification review persisted");
  assertIn(stored.clarification_decision,
    ["CONCERNS_RESOLVED","CONCERNS_PARTIALLY_RESOLVED","CONCERNS_NOT_RESOLVED","NEW_RISK_IDENTIFIED","ESCALATE"],
    "clarification_decision");
  assertNum(stored.confidence, 0, 100, "clarification.confidence");
  assertArr(stored.resolved_items, "clarification.resolved_items");
  assertArr(stored.unresolved_items, "clarification.unresolved_items");
});

suite("nondet-appeal-review", 3, async () => {
  const rfpId = await createRfpAndExpect(buyer, { title: "Nondet appeal RFP" });
  const draft = await commitBidFor(vendors[0], rfpId, { vendor_name: "Appellant Co" });
  await callWrite(buyer, "close_rfp", "close_rfp", [rfpId]);
  await revealBidFor(vendors[0], draft);
  await callNondetWrite(buyer, "review_bid", "review_bid", [draft.bidId],
    { contentCheck: REVIEW_CONTENT_CHECK(draft.bidId) });

  const aid = newId("apl");
  const openRes = await callWrite(vendors[0], "open_appeal", "open_appeal",
    [aid, draft.bidId, JSON.stringify({ reason: "SCORING_ERROR",
      argument: "Our compliance score did not account for the attached HITRUST certificate.",
      new_evidence: "Cert id 12345" })]);
  if (!openRes.ok) throw new Error(`open_appeal failed: ${openRes.error} ${openRes.stderr || ""}`);

  await callNondetWrite(buyer, "review_appeal", "review_appeal", [aid], {
    contentCheck: {
      readFn: callRead,
      readArgs: ["get_appeal_review", [aid]],
      isValid: (r) => r && typeof r === "object" && typeof r.appeal_decision === "string",
    },
  });

  const stored = await callRead("get_appeal_review", [aid]);
  assertTrue(stored && typeof stored === "object", "appeal review persisted");
  assertIn(stored.appeal_decision,
    ["ORIGINAL_DECISION_UPHELD","ORIGINAL_DECISION_ADJUSTED","MORE_INFORMATION_REQUIRED","ESCALATE_TO_HUMAN_PANEL","APPEAL_REJECTED"],
    "appeal_decision");
  assertNum(stored.confidence, 0, 100, "appeal.confidence");
  assertArr(stored.accepted_arguments, "appeal.accepted_arguments");
  assertArr(stored.rejected_arguments, "appeal.rejected_arguments");
});

// =======================================================================
// Step 0 — sanity
// =======================================================================
async function sanity() {
  hr("═");
  log("STEP 0 — sanity");
  log("contract", CONTRACT);
  log("network ", "studionet (chainId 61999)");
  log("buyer  ", shortAddr(buyer.address));
  vendors.forEach((v, i) => log(`vendor${i + 1}`, shortAddr(v.address)));

  for (const w of [{ tag: "buyer", a: buyer.address }, ...vendors.map((v, i) => ({ tag: `vendor${i + 1}`, a: v.address }))]) {
    const bal = await getBalance(w.a);
    log("balance", w.tag, bal.toString());
    if (bal === 0n) throw new Error(`${w.tag} ${w.a} has zero balance; fund the wallet on Studionet`);
  }
  const stats = await callRead("get_protocol_stats");
  if (!stats || typeof stats !== "object") throw new Error("RPC unreachable or contract not deployed at address");
  log("protocol_stats", JSON.stringify(stats));
  ok("sanity passed");
}

// =======================================================================
// runner
// =======================================================================
function parseCli() {
  const args = process.argv.slice(2);
  const filter = [];
  let bucket = null;
  let cont = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--bucket") { bucket = Number(args[++i]); continue; }
    if (args[i] === "--continue") { cont = true; continue; }
    filter.push(args[i]);
  }
  return { filter, bucket, cont };
}

async function main() {
  await sanity();

  const { filter, bucket, cont } = parseCli();
  let suites = SUITES;
  if (filter.length) suites = suites.filter((s) => filter.includes(s.name));
  if (bucket != null) suites = suites.filter((s) => s.bucket === bucket);
  suites.sort((a, b) => a.bucket - b.bucket);

  if (cont) log("◇ --continue mode: will run every suite and report at end, not stop on first failure.");

  const results = [];
  const t0 = Date.now();
  for (const s of suites) {
    hr("═");
    log(`SUITE bucket-${s.bucket}: ${s.name}`);
    const sT0 = Date.now();
    try {
      await s.fn();
      const ms = Date.now() - sT0;
      ok(`${s.name} (${ms}ms)`);
      results.push({ name: s.name, bucket: s.bucket, status: "PASS", ms });
    } catch (e) {
      const ms = Date.now() - sT0;
      bad(`${s.name} (${ms}ms): ${e.message}`);
      results.push({ name: s.name, bucket: s.bucket, status: "FAIL", ms, error: e.message });
      if (!cont) {
        hr("═");
        log("STOPPED on first failure.");
        printSummary(results, Date.now() - t0);
        process.exit(1);
      }
      log("◇ continuing to next suite (--continue mode).");
    }
  }
  printSummary(results, Date.now() - t0);
  const failed = results.filter((r) => r.status === "FAIL").length;
  if (failed > 0) process.exit(1);
}

function printSummary(results, totalMs) {
  hr("═");
  log("SUMMARY");
  log(`contract  ${CONTRACT}`);
  log(`network   GenLayer Studionet (chainId 61999)`);
  for (const r of results) {
    const tag = r.status === "PASS" ? "✓" : "✗";
    log(`${tag} bucket-${r.bucket} ${r.name.padEnd(28)} ${r.status}  ${r.ms}ms${r.error ? "  " + r.error : ""}`);
  }
  log(`total wall-clock: ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s)`);
  const passed = results.filter((r) => r.status === "PASS").length;
  log(`${passed}/${results.length} suites passed`);
}

// Process-level keepalive guards — never let the runner die silently.
process.on("unhandledRejection", (reason) => {
  hr("═");
  log("‼ unhandledRejection:", reason?.shortMessage || reason?.message || String(reason));
  process.exit(2);
});
process.on("uncaughtException", (err) => {
  hr("═");
  log("‼ uncaughtException:", err?.shortMessage || err?.message || String(err));
  process.exit(3);
});
process.on("beforeExit", (code) => {
  log("◇ beforeExit code=" + code);
});
process.on("exit", (code) => {
  log("◇ exit code=" + code);
});

main().catch((e) => {
  hr("═");
  bad("ABORTED: " + (e?.shortMessage || e?.message || e));
  process.exit(1);
});
