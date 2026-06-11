"use client";
import { readMethod } from "./contracts";
import type {
  RFP, Bid, Evidence, BidReview, RfpRanking,
  Clarification, ClarificationReview, Appeal, AppealReview, ProtocolStats,
} from "@/types/procura";

export const getRfp = (id: string) => readMethod<RFP>("get_rfp", [id]);
export const getRubric = (id: string) => readMethod<{ items: unknown[] }>("get_rubric", [id]);
export const getBid = (id: string) => readMethod<Bid>("get_bid", [id]);
export const getBidCommitment = (id: string) =>
  readMethod<{ bid_id: string; rfp_id: string; vendor: string; commitment_hash: string; status: string }>(
    "get_bid_commitment", [id]
  );
export const getBidEvidence = (id: string) => readMethod<Evidence[]>("get_bid_evidence", [id]);
export const getBidReview = (id: string) => readMethod<BidReview>("get_bid_review", [id]);
export const getRfpRanking = (id: string) => readMethod<RfpRanking>("get_rfp_ranking", [id]);
export const getRfpBids = (id: string) => readMethod<string[]>("get_rfp_bids", [id]);
export const getClarification = (id: string) => readMethod<Clarification>("get_clarification", [id]);
export const getClarificationReview = (id: string) => readMethod<ClarificationReview>("get_clarification_review", [id]);
export const getAppeal = (id: string) => readMethod<Appeal>("get_appeal", [id]);
export const getAppealReview = (id: string) => readMethod<AppealReview>("get_appeal_review", [id]);
export const getProtocolStats = () => readMethod<ProtocolStats>("get_protocol_stats");
export const listRfps = () => readMethod<string[]>("list_rfps");
