"use client";
import { writeMethod, type TxPhase } from "./contracts";

type Cb = (p: TxPhase, hash?: `0x${string}`) => void;

export const createRfp = (rfpId: string, rfp: unknown, rubric: unknown, cb?: Cb) =>
  writeMethod("create_rfp", [rfpId, JSON.stringify(rfp), JSON.stringify(rubric)], cb);

export const updateRfp = (rfpId: string, rfp: unknown, rubric: unknown, cb?: Cb) =>
  writeMethod("update_rfp", [rfpId, JSON.stringify(rfp), JSON.stringify(rubric)], cb);

export const submitBidCommitment = (bidId: string, rfpId: string, commitmentHash: string, cb?: Cb) =>
  writeMethod("submit_bid_commitment", [bidId, rfpId, commitmentHash], cb);

export const revealBid = (bidId: string, bidJson: string, salt: string, cb?: Cb) =>
  writeMethod("reveal_bid", [bidId, bidJson, salt], cb);

export const addEvidence = (evidenceId: string, bidId: string, evidence: unknown, cb?: Cb) =>
  writeMethod("add_evidence", [evidenceId, bidId, JSON.stringify(evidence)], cb);

export const closeRfp = (rfpId: string, cb?: Cb) => writeMethod("close_rfp", [rfpId], cb);
export const finalizeRfp = (rfpId: string, cb?: Cb) => writeMethod("finalize_rfp", [rfpId], cb);

export const reviewBid = (bidId: string, cb?: Cb) => writeMethod("review_bid", [bidId], cb);
export const rankRfpBids = (rfpId: string, cb?: Cb) => writeMethod("rank_rfp_bids", [rfpId], cb);

export const requestClarification = (id: string, bidId: string, payload: unknown, cb?: Cb) =>
  writeMethod("request_clarification", [id, bidId, JSON.stringify(payload)], cb);

export const submitClarificationResponse = (id: string, payload: unknown, cb?: Cb) =>
  writeMethod("submit_clarification_response", [id, JSON.stringify(payload)], cb);

export const reviewClarification = (id: string, cb?: Cb) =>
  writeMethod("review_clarification", [id], cb);

export const openAppeal = (id: string, bidId: string, payload: unknown, cb?: Cb) =>
  writeMethod("open_appeal", [id, bidId, JSON.stringify(payload)], cb);

export const reviewAppeal = (id: string, cb?: Cb) => writeMethod("review_appeal", [id], cb);

export const detectBidSimilarity = (a: string, b: string, cb?: Cb) =>
  writeMethod("detect_bid_similarity", [a, b], cb);

export const assessCommercialValue = (bidId: string, cb?: Cb) =>
  writeMethod("assess_commercial_value", [bidId], cb);

export const assessDeliveryFeasibility = (bidId: string, cb?: Cb) =>
  writeMethod("assess_delivery_feasibility", [bidId], cb);
