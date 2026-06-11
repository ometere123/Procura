# v0.2.17
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import hashlib
from genlayer import *

VmUserError = gl.vm.UserError


ALLOWED_VERDICTS = {
    "ELIGIBLE", "INELIGIBLE", "SHORTLISTED", "RANKED",
    "RECOMMENDED", "NOT_RECOMMENDED", "NEEDS_CLARIFICATION", "ESCALATE",
}

ALLOWED_ELIGIBILITY = {"ELIGIBLE", "INELIGIBLE", "CONDITIONALLY_ELIGIBLE", "UNCLEAR"}
ALLOWED_RISK = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
ALLOWED_RANKING_STATUS = {"RANKED", "PARTIALLY_RANKED", "NEEDS_MORE_INFORMATION", "ESCALATE"}
ALLOWED_AWARD = {"PRIMARY_AWARD", "BACKUP_VENDOR", "SHORTLIST_ONLY", "DO_NOT_AWARD", "NEEDS_CLARIFICATION"}
ALLOWED_SIMILARITY = {
    "NO_SIGNIFICANT_SIMILARITY", "NORMAL_RFP_TEMPLATE_SIMILARITY",
    "POSSIBLE_TEMPLATE_REUSE", "POSSIBLE_COLLUSION_RISK", "NEEDS_MANUAL_REVIEW",
}
ALLOWED_CLARIFICATION = {
    "CONCERNS_RESOLVED", "CONCERNS_PARTIALLY_RESOLVED",
    "CONCERNS_NOT_RESOLVED", "NEW_RISK_IDENTIFIED", "ESCALATE",
}
ALLOWED_APPEAL = {
    "ORIGINAL_DECISION_UPHELD", "ORIGINAL_DECISION_ADJUSTED",
    "MORE_INFORMATION_REQUIRED", "ESCALATE_TO_HUMAN_PANEL", "APPEAL_REJECTED",
}


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise VmUserError(msg)


def _score(v) -> bool:
    return isinstance(v, (int, float)) and 0 <= v <= 100


def _arr(v) -> bool:
    return isinstance(v, list)


def _validate_review(d: dict) -> None:
    for k in ("verdict", "eligibility", "procurement_score", "confidence",
              "risk_level", "recommended_action", "reasoning_summary"):
        _require(k in d, f"review missing field: {k}")
    _require(d["verdict"] in ALLOWED_VERDICTS, "invalid verdict")
    _require(d["eligibility"] in ALLOWED_ELIGIBILITY, "invalid eligibility")
    _require(d["risk_level"] in ALLOWED_RISK, "invalid risk_level")
    _require(_score(d["procurement_score"]), "procurement_score out of range")
    _require(_score(d["confidence"]), "confidence out of range")
    _require(isinstance(d["reasoning_summary"], str) and d["reasoning_summary"].strip(),
             "reasoning_summary empty")
    for sub in ("technical_fit", "commercial_value", "delivery_feasibility",
                "vendor_capability", "compliance_security", "qualitative_fit",
                "risk_and_exceptions"):
        _require(sub in d and isinstance(d[sub], dict), f"missing subscore {sub}")
        _require(_score(d[sub].get("score", -1)), f"{sub}.score out of range")
    for arr_k in ("mandatory_failures", "clarification_requests",
                  "positive_signals", "red_flags", "missing_information"):
        _require(_arr(d.get(arr_k, [])), f"{arr_k} must be array")


def _validate_ranking(d: dict) -> None:
    for k in ("rfp_id", "ranking_status", "ranked_bids", "reasoning_summary"):
        _require(k in d, f"ranking missing field: {k}")
    _require(d["ranking_status"] in ALLOWED_RANKING_STATUS, "invalid ranking_status")
    _require(_arr(d["ranked_bids"]), "ranked_bids must be array")
    seen_ranks = set()
    for rb in d["ranked_bids"]:
        _require(isinstance(rb, dict), "ranked_bid not object")
        for k in ("bid_id", "rank", "procurement_score", "decision", "award_recommendation"):
            _require(k in rb, f"ranked_bid missing {k}")
        _require(rb["rank"] not in seen_ranks, "duplicate rank")
        seen_ranks.add(rb["rank"])
        _require(rb["award_recommendation"] in ALLOWED_AWARD, "invalid award_recommendation")
        _require(_score(rb["procurement_score"]), "ranked_bid score out of range")
        if rb["decision"] == "INELIGIBLE":
            _require(rb["award_recommendation"] in {"DO_NOT_AWARD", "SHORTLIST_ONLY", "NEEDS_CLARIFICATION"},
                     "ineligible bid cannot be recommended for award")


def _parse(s: str) -> dict:
    try:
        return json.loads(s)
    except Exception:
        raise VmUserError("invalid JSON input")


def _require_buyer(rfp: dict, sender: str) -> None:
    buyer = rfp.get("buyer", "")
    _require(buyer != "" and sender.lower() == buyer.lower(),
             "only the rfp buyer can perform this action")


def _extract_json(s: str) -> str:
    """Best-effort: strip markdown fences and isolate the first balanced JSON
    object/array. Returns the cleaned string; never raises."""
    if not isinstance(s, str):
        return s
    text = s.strip()
    if text.startswith("```"):
        nl = text.find("\n")
        if nl > 0:
            text = text[nl + 1:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    # Isolate first { ... } or [ ... ] block.
    obj_start = text.find("{")
    arr_start = text.find("[")
    if obj_start == -1 and arr_start == -1:
        return text
    if obj_start == -1:
        start, opener, closer = arr_start, "[", "]"
    elif arr_start == -1:
        start, opener, closer = obj_start, "{", "}"
    else:
        if obj_start < arr_start:
            start, opener, closer = obj_start, "{", "}"
        else:
            start, opener, closer = arr_start, "[", "]"
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return text[start:]


def _safe_loads(s: str):
    """json.loads with markdown-fence stripping and graceful failure."""
    cleaned = _extract_json(s)
    return json.loads(cleaned)


# ----------------- contract ------------------

class Procura(gl.Contract):
    owner: Address
    rfp_count: u256
    bid_count: u256
    evidence_count: u256
    review_count: u256
    ranking_count: u256
    clarification_count: u256
    appeal_count: u256

    rfps: TreeMap[str, str]
    bids: TreeMap[str, str]
    bid_commitments: TreeMap[str, str]
    bid_evidence: TreeMap[str, str]
    rfp_rubrics: TreeMap[str, str]
    bid_reviews: TreeMap[str, str]
    rfp_rankings: TreeMap[str, str]
    award_recommendations: TreeMap[str, str]
    clarifications: TreeMap[str, str]
    clarification_reviews: TreeMap[str, str]
    appeals: TreeMap[str, str]
    appeal_reviews: TreeMap[str, str]
    user_bids: TreeMap[str, str]
    user_rfps: TreeMap[str, str]
    rfp_bids: TreeMap[str, str]
    protocol_stats: TreeMap[str, str]

    def __init__(self) -> None:
        self.owner = gl.message.sender_address
        self.rfp_count = u256(0)
        self.bid_count = u256(0)
        self.evidence_count = u256(0)
        self.review_count = u256(0)
        self.ranking_count = u256(0)
        self.clarification_count = u256(0)
        self.appeal_count = u256(0)

    # ---------- deterministic writes ----------

    @gl.public.write
    def create_rfp(self, rfp_id: str, rfp_json: str, rubric_json: str) -> None:
        _require(rfp_id != "", "rfp_id required")
        _require(rfp_id not in self.rfps, "rfp already exists")
        rfp = _parse(rfp_json)
        _parse(rubric_json)
        rfp["status"] = "OPEN"
        rfp["bid_count"] = 0
        sender = str(gl.message.sender_address)
        rfp["buyer"] = sender
        self.rfps[rfp_id] = json.dumps(rfp)
        self.rfp_rubrics[rfp_id] = rubric_json
        existing = json.loads(self.user_rfps[sender]) if sender in self.user_rfps else []
        existing.append(rfp_id)
        self.user_rfps[sender] = json.dumps(existing)
        self.rfp_bids[rfp_id] = json.dumps([])
        self.rfp_count = u256(int(self.rfp_count) + 1)

    @gl.public.write
    def update_rfp(self, rfp_id: str, rfp_json: str, rubric_json: str) -> None:
        _require(rfp_id in self.rfps, "rfp not found")
        rfp = _parse(rfp_json)
        _parse(rubric_json)
        self.rfps[rfp_id] = json.dumps(rfp)
        self.rfp_rubrics[rfp_id] = rubric_json

    # ---- commit-reveal sealed bidding ----

    @gl.public.write
    def submit_bid_commitment(self, bid_id: str, rfp_id: str, commitment_hash: str) -> None:
        _require(rfp_id in self.rfps, "rfp not found")
        rfp = json.loads(self.rfps[rfp_id])
        _require(rfp.get("status") == "OPEN", "rfp not open for commitments")
        _require(bid_id not in self.bid_commitments, "commitment already exists")
        _require(bid_id not in self.bids, "bid already revealed")
        _require(isinstance(commitment_hash, str) and len(commitment_hash) >= 32,
                 "invalid commitment_hash")
        sender = str(gl.message.sender_address)
        buyer = rfp.get("buyer", "")
        _require(sender.lower() != buyer.lower(),
                 "rfp buyer cannot submit a bid on their own rfp")
        record = {
            "bid_id": bid_id,
            "rfp_id": rfp_id,
            "vendor": sender,
            "commitment_hash": commitment_hash.lower(),
            "status": "COMMITTED",
        }
        self.bid_commitments[bid_id] = json.dumps(record)
        rfp_bids = json.loads(self.rfp_bids[rfp_id]) if rfp_id in self.rfp_bids else []
        rfp_bids.append(bid_id)
        self.rfp_bids[rfp_id] = json.dumps(rfp_bids)
        ub = json.loads(self.user_bids[sender]) if sender in self.user_bids else []
        ub.append(bid_id)
        self.user_bids[sender] = json.dumps(ub)
        self.bid_count = u256(int(self.bid_count) + 1)

    @gl.public.write
    def reveal_bid(self, bid_id: str, bid_json: str, salt: str) -> None:
        _require(bid_id in self.bid_commitments, "commitment not found")
        _require(bid_id not in self.bids, "bid already revealed")
        commitment = json.loads(self.bid_commitments[bid_id])
        rfp_id = commitment["rfp_id"]
        rfp = json.loads(self.rfps[rfp_id])
        _require(rfp.get("status") in ("CLOSED", "REVEALING"),
                 "rfp must be closed before reveal")
        sender = str(gl.message.sender_address)
        _require(sender == commitment["vendor"], "only the committing vendor can reveal")

        recomputed = hashlib.sha256((bid_json + salt).encode("utf-8")).hexdigest()
        _require(recomputed == commitment["commitment_hash"],
                 "reveal does not match commitment")

        bid = _parse(bid_json)
        bid["bid_id"] = bid_id
        bid["rfp_id"] = rfp_id
        bid["vendor"] = sender
        bid["status"] = "REVEALED"
        self.bids[bid_id] = json.dumps(bid)
        commitment["status"] = "REVEALED"
        self.bid_commitments[bid_id] = json.dumps(commitment)

    @gl.public.write
    def add_evidence(self, evidence_id: str, bid_id: str, evidence_json: str) -> None:
        _require(bid_id in self.bids, "bid not found")
        _parse(evidence_json)
        items = json.loads(self.bid_evidence[bid_id]) if bid_id in self.bid_evidence else []
        ev = _parse(evidence_json)
        ev["evidence_id"] = evidence_id
        items.append(ev)
        self.bid_evidence[bid_id] = json.dumps(items)
        self.evidence_count = u256(int(self.evidence_count) + 1)

    @gl.public.write
    def close_rfp(self, rfp_id: str) -> None:
        _require(rfp_id in self.rfps, "rfp not found")
        rfp = json.loads(self.rfps[rfp_id])
        _require_buyer(rfp, str(gl.message.sender_address))
        rfp["status"] = "CLOSED"
        self.rfps[rfp_id] = json.dumps(rfp)

    @gl.public.write
    def request_clarification(self, clarification_id: str, bid_id: str, clarification_json: str) -> None:
        _require(bid_id in self.bids, "bid not found")
        c = _parse(clarification_json)
        c["clarification_id"] = clarification_id
        c["bid_id"] = bid_id
        c["status"] = "REQUESTED"
        self.clarifications[clarification_id] = json.dumps(c)
        self.clarification_count = u256(int(self.clarification_count) + 1)

    @gl.public.write
    def submit_clarification_response(self, clarification_id: str, response_json: str) -> None:
        _require(clarification_id in self.clarifications, "clarification not found")
        c = json.loads(self.clarifications[clarification_id])
        c["response"] = _parse(response_json)
        c["status"] = "RESPONDED"
        self.clarifications[clarification_id] = json.dumps(c)

    @gl.public.write
    def open_appeal(self, appeal_id: str, bid_id: str, appeal_json: str) -> None:
        _require(bid_id in self.bids, "bid not found")
        a = _parse(appeal_json)
        a["appeal_id"] = appeal_id
        a["bid_id"] = bid_id
        a["status"] = "OPEN"
        self.appeals[appeal_id] = json.dumps(a)
        self.appeal_count = u256(int(self.appeal_count) + 1)

    @gl.public.write
    def finalize_rfp(self, rfp_id: str) -> None:
        _require(rfp_id in self.rfps, "rfp not found")
        rfp = json.loads(self.rfps[rfp_id])
        _require_buyer(rfp, str(gl.message.sender_address))
        rfp["status"] = "FINALIZED"
        self.rfps[rfp_id] = json.dumps(rfp)

    # ---------- non-deterministic (GenLayer consensus) ----------

    @gl.public.write
    def review_bid(self, bid_id: str) -> None:
        _require(bid_id in self.bids, "bid not found")
        bid = json.loads(self.bids[bid_id])
        rfp_id = bid["rfp_id"]
        rfp = json.loads(self.rfps[rfp_id])
        _require_buyer(rfp, str(gl.message.sender_address))
        rubric = self.rfp_rubrics[rfp_id] if rfp_id in self.rfp_rubrics else "{}"
        evidence = self.bid_evidence[bid_id] if bid_id in self.bid_evidence else "[]"

        prompt = f"""You are evaluating a vendor bid against an RFP and procurement rubric.

Do not simply summarise the bid.
Do not rely only on vendor self-claims.
Judge whether the submitted evidence supports the vendor's claims.
Assess mandatory eligibility, technical fit, commercial value, delivery feasibility,
vendor capability, compliance/security, qualitative fit, and risk/exceptions.

Do not invent missing facts.
If information is missing, mark it as missing.
Distinguish between incomplete evidence and disqualifying failure.
Do not make a legal award decision. Produce procurement decision support.

RFP:
{json.dumps(rfp)}

RUBRIC:
{rubric}

VENDOR BID:
{json.dumps(bid)}

EVIDENCE:
{evidence}

Return STRICT JSON ONLY with keys: verdict, eligibility, procurement_score,
confidence, risk_level, recommended_action, technical_fit{{score,reason}},
commercial_value{{score,reason}}, delivery_feasibility{{score,reason}},
vendor_capability{{score,reason}}, compliance_security{{score,reason}},
qualitative_fit{{score,reason}}, risk_and_exceptions{{score,reason}},
mandatory_failures[], clarification_requests[], positive_signals[],
red_flags[], missing_information[], reasoning_summary.

Allowed verdict: ELIGIBLE, INELIGIBLE, SHORTLISTED, RANKED, RECOMMENDED,
NOT_RECOMMENDED, NEEDS_CLARIFICATION, ESCALATE.
Allowed eligibility: ELIGIBLE, INELIGIBLE, CONDITIONALLY_ELIGIBLE, UNCLEAR.
Allowed risk_level: LOW, MEDIUM, HIGH, CRITICAL.
All scores 0-100."""

        def run() -> str:
            res = gl.nondet.exec_prompt(prompt)
            parsed = _safe_loads(res)
            _validate_review(parsed)
            return json.dumps(parsed)

        result = gl.eq_principle.prompt_non_comparative(
            run,
            task="Evaluate a vendor procurement bid against an RFP and rubric and return strict JSON.",
            criteria="""
Accept the leader output only if it is valid strict JSON and a reasonable procurement bid review supported by the RFP, rubric, bid, and evidence.

Validation criteria:
- verdict must be one of the allowed verdict enums.
- eligibility must be one of the allowed eligibility enums.
- procurement_score and confidence must be numbers from 0 to 100.
- risk_level must be LOW, MEDIUM, HIGH, or CRITICAL.
- all required subscore objects must be present and each subscore must be 0 to 100.
- arrays such as mandatory_failures, clarification_requests, positive_signals, red_flags, and missing_information must be arrays.
- reasoning_summary must be non-empty and consistent with the scores, eligibility, risks, and evidence.
- reject malformed JSON, invented enum values, contradictory reviews, unsupported recommendations, or reviews that ignore important evidence.
- do not reject only because another valid review could use slightly different wording, reason text, or close-but-reasonable scores.
""",
        )
        self.bid_reviews[bid_id] = result
        try:
            parsed = _safe_loads(result)
            bid["status"] = parsed.get("verdict", "REVIEWED")
            bid["procurement_score"] = parsed.get("procurement_score", 0)
        except Exception:
            # raw consensus result is stored; downstream UI can surface it.
            bid["status"] = "REVIEW_PARSE_FAILED"
        self.bids[bid_id] = json.dumps(bid)
        self.review_count = u256(int(self.review_count) + 1)

    @gl.public.write
    def rank_rfp_bids(self, rfp_id: str) -> None:
        _require(rfp_id in self.rfps, "rfp not found")
        rfp = json.loads(self.rfps[rfp_id])
        _require_buyer(rfp, str(gl.message.sender_address))
        bid_ids = json.loads(self.rfp_bids[rfp_id]) if rfp_id in self.rfp_bids else []
        _require(len(bid_ids) > 0, "no bids to rank")
        rubric = self.rfp_rubrics[rfp_id] if rfp_id in self.rfp_rubrics else "{}"

        bids_payload = []
        for bid_id in bid_ids:
            bid_obj = json.loads(self.bids[bid_id]) if bid_id in self.bids else {}
            review = None
            if bid_id in self.bid_reviews:
                try: review = _safe_loads(self.bid_reviews[bid_id])
                except Exception: review = None
            bids_payload.append({"bid_id": bid_id, "bid": bid_obj, "review": review})

        prompt = f"""You are ranking vendor bids in a procurement RFP.

Rank bids by evidence-supported procurement fit against the RFP rubric.
Use the rubric as guidance, but do not blindly average scores.
Consider eligibility, technical fit, commercial value, delivery feasibility,
vendor capability, compliance/security, qualitative fit, risk, and price-value balance.
Use tie-break reasoning where bids are close.
Recommend primary award, backup vendor, shortlist only, do not award, or request clarification.

RFP:
{json.dumps(rfp)}

RUBRIC:
{rubric}

BIDS WITH REVIEWS:
{json.dumps(bids_payload)}

Return STRICT JSON ONLY with: rfp_id, ranking_status, total_bids_reviewed,
ranking_confidence, ranked_bids[{{bid_id,rank,procurement_score,decision,
award_recommendation,reason}}], award_summary{{recommended_bid_id,backup_bid_id,
recommended_contract_value,currency}}, rfp_findings[], tie_breaks[], red_flags[],
reasoning_summary.

Allowed ranking_status: RANKED, PARTIALLY_RANKED, NEEDS_MORE_INFORMATION, ESCALATE.
Allowed award_recommendation: PRIMARY_AWARD, BACKUP_VENDOR, SHORTLIST_ONLY,
DO_NOT_AWARD, NEEDS_CLARIFICATION."""

        def run() -> str:
            res = gl.nondet.exec_prompt(prompt)
            parsed = _safe_loads(res)
            parsed["rfp_id"] = rfp_id
            _validate_ranking(parsed)
            return json.dumps(parsed)

        result = gl.eq_principle.prompt_non_comparative(
            run,
            task="Rank vendor procurement bids against an RFP rubric and produce an award recommendation in strict JSON.",
            criteria="""
Accept the leader output only if it is valid strict JSON and a reasonable procurement ranking supported by the RFP, rubric, bid reviews, eligibility, scores, risks, and award rules.

Validation criteria:
- rfp_id must match the requested RFP.
- ranking_status must be one of the allowed ranking status enums.
- ranked_bids must be an array with real bid IDs from the RFP.
- ranks must be unique.
- procurement_score values must be 0 to 100.
- award_recommendation must be one of the allowed award enums.
- ineligible bids must not be recommended as primary award or backup vendor.
- ranking should be broadly consistent with accepted bid reviews, evidence, risk, eligibility, and price-value logic.
- reject malformed JSON, invented enum values, duplicate ranks, missing ranked bids, unsupported winner selection, or budget/award contradictions.
- do not reject only because another valid ranking could swap very close bids or phrase reasons differently.
""",
        )
        self.rfp_rankings[rfp_id] = result
        rfp["status"] = "RANKED"
        try:
            parsed = _safe_loads(result)
            rfp["ranking_status"] = parsed.get("ranking_status", "RANKED")
            self.rfps[rfp_id] = json.dumps(rfp)
            if isinstance(parsed.get("award_summary"), dict) and parsed["award_summary"].get("recommended_bid_id"):
                self.award_recommendations[rfp_id] = json.dumps(parsed["award_summary"])
            for rb in parsed.get("ranked_bids", []):
                bid_id = rb.get("bid_id", "")
                if bid_id and bid_id in self.bids:
                    b = json.loads(self.bids[bid_id])
                    b["rank"] = rb.get("rank")
                    b["decision"] = rb.get("decision")
                    b["award_recommendation"] = rb.get("award_recommendation")
                    self.bids[bid_id] = json.dumps(b)
        except Exception:
            rfp["ranking_status"] = "PARSE_FAILED"
            self.rfps[rfp_id] = json.dumps(rfp)
        self.ranking_count = u256(int(self.ranking_count) + 1)

    @gl.public.write
    def detect_bid_similarity(self, bid_id: str, comparison_bid_id: str) -> None:
        _require(bid_id in self.bids and comparison_bid_id in self.bids, "bids not found")
        a = self.bids[bid_id]
        b = self.bids[comparison_bid_id]
        prompt = f"""Compare two vendor bids for template reuse or possible collusion.

BID A: {a}
BID B: {b}

Return STRICT JSON: similarity_verdict, similarity_score (0-100), risk_level,
matched_elements[], explanation.
Allowed similarity_verdict: NO_SIGNIFICANT_SIMILARITY, NORMAL_RFP_TEMPLATE_SIMILARITY,
POSSIBLE_TEMPLATE_REUSE, POSSIBLE_COLLUSION_RISK, NEEDS_MANUAL_REVIEW."""

        def run() -> str:
            res = gl.nondet.exec_prompt(prompt)
            parsed = _safe_loads(res)
            _require(parsed["similarity_verdict"] in ALLOWED_SIMILARITY, "invalid similarity_verdict")
            _require(_score(parsed["similarity_score"]), "similarity_score out of range")
            return json.dumps(parsed)

        key = f"{bid_id}::{comparison_bid_id}"
        self.bid_reviews[f"similarity::{key}"] = gl.eq_principle.prompt_non_comparative(
            run,
            task="Compare two vendor bids for template reuse or possible collusion and return strict JSON.",
            criteria="""
Accept the leader output only if it is valid strict JSON and a reasonable bid similarity/collusion-risk assessment.

Validation criteria:
- similarity_verdict must be one of the allowed similarity verdict enums.
- similarity_score must be a number from 0 to 100.
- risk_level, if present, must be a reasonable bounded risk label.
- matched_elements must be an array if present.
- explanation must be consistent with the compared bids.
- reject malformed JSON, invented enum values, unsupported collusion claims, or scores that contradict the evidence.
- do not reject only because another valid assessment would use slightly different wording or a nearby score.
""",
        )

    @gl.public.write
    def review_clarification(self, clarification_id: str) -> None:
        _require(clarification_id in self.clarifications, "clarification not found")
        c = json.loads(self.clarifications[clarification_id])
        bid_id = c["bid_id"]
        bid = self.bids[bid_id]
        bid_obj = json.loads(bid)
        rfp = json.loads(self.rfps[bid_obj["rfp_id"]])
        _require_buyer(rfp, str(gl.message.sender_address))
        prior_review = self.bid_reviews[bid_id] if bid_id in self.bid_reviews else "null"
        prompt = f"""Review a vendor clarification response.

BID: {bid}
PRIOR_REVIEW: {prior_review}
CLARIFICATION: {json.dumps(c)}

Return STRICT JSON: clarification_decision, updated_bid_status, confidence (0-100),
resolved_items[], unresolved_items[], score_delta, reasoning_summary, recommended_action.
Allowed clarification_decision: CONCERNS_RESOLVED, CONCERNS_PARTIALLY_RESOLVED,
CONCERNS_NOT_RESOLVED, NEW_RISK_IDENTIFIED, ESCALATE."""

        def run() -> str:
            res = gl.nondet.exec_prompt(prompt)
            parsed = _safe_loads(res)
            _require(parsed["clarification_decision"] in ALLOWED_CLARIFICATION,
                     "invalid clarification_decision")
            return json.dumps(parsed)

        self.clarification_reviews[clarification_id] = gl.eq_principle.prompt_non_comparative(
            run,
            task="Review a vendor clarification response against the prior bid review and return strict JSON.",
            criteria="""
Accept the leader output only if it is valid strict JSON and a reasonable clarification review supported by the bid, prior review, and vendor response.

Validation criteria:
- clarification_decision must be one of the allowed clarification decision enums.
- confidence, if present, must be 0 to 100.
- resolved_items and unresolved_items must be arrays if present.
- updated_bid_status and recommended_action must be consistent with the response and prior concerns.
- reject malformed JSON, invented enum values, unsupported resolution, or contradictory status changes.
- do not reject only because another valid review would phrase reasoning differently.
""",
        )

    @gl.public.write
    def review_appeal(self, appeal_id: str) -> None:
        _require(appeal_id in self.appeals, "appeal not found")
        a = json.loads(self.appeals[appeal_id])
        bid_obj = json.loads(self.bids[a["bid_id"]])
        rfp = json.loads(self.rfps[bid_obj["rfp_id"]])
        _require_buyer(rfp, str(gl.message.sender_address))
        bid_id = a["bid_id"]
        bid = self.bids[bid_id]
        prior_review = self.bid_reviews[bid_id] if bid_id in self.bid_reviews else "null"
        prompt = f"""Review a vendor appeal.

BID: {bid}
PRIOR_REVIEW: {prior_review}
APPEAL: {json.dumps(a)}

Return STRICT JSON: appeal_decision, new_bid_decision, new_procurement_score,
confidence, accepted_arguments[], rejected_arguments[], reasoning_summary,
final_recommendation.
Allowed appeal_decision: ORIGINAL_DECISION_UPHELD, ORIGINAL_DECISION_ADJUSTED,
MORE_INFORMATION_REQUIRED, ESCALATE_TO_HUMAN_PANEL, APPEAL_REJECTED."""

        def run() -> str:
            res = gl.nondet.exec_prompt(prompt)
            parsed = _safe_loads(res)
            _require(parsed["appeal_decision"] in ALLOWED_APPEAL, "invalid appeal_decision")
            return json.dumps(parsed)

        self.appeal_reviews[appeal_id] = gl.eq_principle.prompt_non_comparative(
            run,
            task="Review a vendor procurement appeal against the prior bid review and return strict JSON.",
            criteria="""
Accept the leader output only if it is valid strict JSON and a reasonable procurement appeal review supported by the bid, prior review, and appeal arguments.

Validation criteria:
- appeal_decision must be one of the allowed appeal decision enums.
- new_procurement_score and confidence, if present, must be 0 to 100.
- accepted_arguments and rejected_arguments must be arrays if present.
- new_bid_decision and final_recommendation must be consistent with the accepted/rejected arguments and prior review.
- reject malformed JSON, invented enum values, unsupported score changes, or contradictory appeal outcomes.
- do not reject only because another valid appeal review would phrase reasoning differently.
""",
        )

    @gl.public.write
    def interpret_requirement(self, bid_id: str, requirement_id: str) -> None:
        _require(bid_id in self.bids, "bid not found")
        bid = self.bids[bid_id]
        prompt = f"""Interpret whether the bid satisfies requirement {requirement_id}.
BID: {bid}
Return STRICT JSON: requirement_id, status (SATISFIED|PARTIAL|MISSING|UNCLEAR),
evidence_summary, reasoning."""

        def run() -> str:
            res = gl.nondet.exec_prompt(prompt)
            return json.dumps(_safe_loads(res))

        self.bid_reviews[f"req::{bid_id}::{requirement_id}"] = gl.eq_principle.prompt_non_comparative(
            run,
            task="Interpret whether a vendor bid satisfies a specific RFP requirement and return strict JSON.",
            criteria="""
Accept the leader output only if it is valid strict JSON and a reasonable requirement interpretation for the requested requirement.

Validation criteria:
- requirement_id must match the requested requirement.
- status must be SATISFIED, PARTIAL, MISSING, or UNCLEAR.
- evidence_summary and reasoning should be consistent with the bid.
- reject malformed JSON, wrong requirement IDs, invented status values, or unsupported requirement findings.
- do not reject only because another valid interpretation would phrase reasoning differently.
""",
        )

    @gl.public.write
    def assess_commercial_value(self, bid_id: str) -> None:
        _require(bid_id in self.bids, "bid not found")
        bid = self.bids[bid_id]
        rfp_id = json.loads(bid)["rfp_id"]
        rfp = self.rfps[rfp_id]
        prompt = f"""Assess commercial value of this bid against the RFP.
RFP: {rfp}
BID: {bid}
Return STRICT JSON: score (0-100), price_value_balance, hidden_cost_risk,
total_cost_of_ownership_note, reasoning."""

        def run() -> str:
            res = gl.nondet.exec_prompt(prompt)
            parsed = _safe_loads(res)
            _require(_score(parsed["score"]), "score out of range")
            return json.dumps(parsed)

        self.bid_reviews[f"commercial::{bid_id}"] = gl.eq_principle.prompt_non_comparative(
            run,
            task="Assess commercial value of a vendor bid against the RFP and return strict JSON.",
            criteria="""
Accept the leader output only if it is valid strict JSON and a reasonable commercial value assessment.

Validation criteria:
- score must be a number from 0 to 100.
- price_value_balance, hidden_cost_risk, total_cost_of_ownership_note, and reasoning should be consistent with the RFP and bid.
- reject malformed JSON, unsupported commercial conclusions, invented facts, or scores that contradict the bid/RFP.
- do not reject only because another valid assessment would use nearby scores or different wording.
""",
        )

    @gl.public.write
    def assess_delivery_feasibility(self, bid_id: str) -> None:
        _require(bid_id in self.bids, "bid not found")
        bid = self.bids[bid_id]
        prompt = f"""Assess delivery feasibility of this bid.
BID: {bid}
Return STRICT JSON: score (0-100), timeline_realism, staffing_clarity,
dependency_risk, reasoning."""

        def run() -> str:
            res = gl.nondet.exec_prompt(prompt)
            parsed = _safe_loads(res)
            _require(_score(parsed["score"]), "score out of range")
            return json.dumps(parsed)

        self.bid_reviews[f"delivery::{bid_id}"] = gl.eq_principle.prompt_non_comparative(
            run,
            task="Assess delivery feasibility of a vendor bid and return strict JSON.",
            criteria="""
Accept the leader output only if it is valid strict JSON and a reasonable delivery feasibility assessment.

Validation criteria:
- score must be a number from 0 to 100.
- timeline_realism, staffing_clarity, dependency_risk, and reasoning should be consistent with the bid.
- reject malformed JSON, invented facts, unsupported delivery conclusions, or scores that contradict the evidence.
- do not reject only because another valid assessment would use nearby scores or different wording.
""",
        )

    # ---------- view ----------

    @gl.public.view
    def get_rfp(self, rfp_id: str) -> str:
        return self.rfps[rfp_id] if rfp_id in self.rfps else ""

    @gl.public.view
    def get_rubric(self, rfp_id: str) -> str:
        return self.rfp_rubrics[rfp_id] if rfp_id in self.rfp_rubrics else ""

    @gl.public.view
    def get_bid(self, bid_id: str) -> str:
        return self.bids[bid_id] if bid_id in self.bids else ""

    @gl.public.view
    def get_bid_evidence(self, bid_id: str) -> str:
        return self.bid_evidence[bid_id] if bid_id in self.bid_evidence else "[]"

    @gl.public.view
    def get_bid_review(self, bid_id: str) -> str:
        return self.bid_reviews[bid_id] if bid_id in self.bid_reviews else ""

    @gl.public.view
    def get_rfp_ranking(self, rfp_id: str) -> str:
        return self.rfp_rankings[rfp_id] if rfp_id in self.rfp_rankings else ""

    @gl.public.view
    def get_award_recommendation(self, rfp_id: str) -> str:
        return self.award_recommendations[rfp_id] if rfp_id in self.award_recommendations else ""

    @gl.public.view
    def get_clarification(self, clarification_id: str) -> str:
        return self.clarifications[clarification_id] if clarification_id in self.clarifications else ""

    @gl.public.view
    def get_clarification_review(self, clarification_id: str) -> str:
        return self.clarification_reviews[clarification_id] if clarification_id in self.clarification_reviews else ""

    @gl.public.view
    def get_appeal(self, appeal_id: str) -> str:
        return self.appeals[appeal_id] if appeal_id in self.appeals else ""

    @gl.public.view
    def get_appeal_review(self, appeal_id: str) -> str:
        return self.appeal_reviews[appeal_id] if appeal_id in self.appeal_reviews else ""

    @gl.public.view
    def get_user_bids(self, user: Address) -> str:
        k = str(user)
        return self.user_bids[k] if k in self.user_bids else "[]"

    @gl.public.view
    def get_user_rfps(self, user: Address) -> str:
        k = str(user)
        return self.user_rfps[k] if k in self.user_rfps else "[]"

    @gl.public.view
    def get_rfp_bids(self, rfp_id: str) -> str:
        return self.rfp_bids[rfp_id] if rfp_id in self.rfp_bids else "[]"

    @gl.public.view
    def get_bid_commitment(self, bid_id: str) -> str:
        return self.bid_commitments[bid_id] if bid_id in self.bid_commitments else ""

    @gl.public.view
    def list_rfps(self) -> str:
        return json.dumps(list(self.rfps.keys()))

    @gl.public.view
    def get_protocol_stats(self) -> str:
        return json.dumps({
            "rfp_count": int(self.rfp_count),
            "bid_count": int(self.bid_count),
            "evidence_count": int(self.evidence_count),
            "review_count": int(self.review_count),
            "ranking_count": int(self.ranking_count),
            "clarification_count": int(self.clarification_count),
            "appeal_count": int(self.appeal_count),
        })