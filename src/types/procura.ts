export type ProcurementCategory =
  | "SOFTWARE" | "CLOUD_INFRASTRUCTURE" | "CYBERSECURITY" | "CONSULTING"
  | "CONSTRUCTION" | "EQUIPMENT" | "LOGISTICS" | "HEALTHCARE_SUPPLY"
  | "EDUCATION_TECH" | "PROFESSIONAL_SERVICES" | "RESEARCH_SERVICES"
  | "PUBLIC_SECTOR_SERVICES" | "DAO_VENDOR_SELECTION" | "OTHER";

export type RfpStatus =
  | "DRAFT" | "OPEN" | "CLOSED" | "REVEALING" | "UNDER_EVALUATION" | "RANKED"
  | "AWARD_RECOMMENDED" | "CLARIFICATIONS_OPEN" | "APPEALS_OPEN"
  | "FINALIZED" | "ARCHIVED";

export type BidStatus =
  | "DRAFT" | "SUBMITTED" | "EVIDENCE_PENDING" | "UNDER_CONSENSUS_EVALUATION"
  | "ELIGIBLE" | "INELIGIBLE" | "SHORTLISTED" | "RANKED" | "RECOMMENDED"
  | "NOT_RECOMMENDED" | "NEEDS_CLARIFICATION" | "ESCALATED" | "APPEALED" | "FINALIZED";

export type Verdict =
  | "ELIGIBLE" | "INELIGIBLE" | "SHORTLISTED" | "RANKED"
  | "RECOMMENDED" | "NOT_RECOMMENDED" | "NEEDS_CLARIFICATION" | "ESCALATE";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Eligibility = "ELIGIBLE" | "INELIGIBLE" | "CONDITIONALLY_ELIGIBLE" | "UNCLEAR";

export type RankingStatus = "RANKED" | "PARTIALLY_RANKED" | "NEEDS_MORE_INFORMATION" | "ESCALATE";

export type AwardRecommendation =
  | "PRIMARY_AWARD" | "BACKUP_VENDOR" | "SHORTLIST_ONLY"
  | "DO_NOT_AWARD" | "NEEDS_CLARIFICATION";

export interface RubricItem {
  id: string;
  category: string;
  weight: number;
  description: string;
  mandatory: boolean;
  excellent: string;
  weak: string;
  red_flags: string;
  required_evidence: string;
  minimum_standard: string;
}

export interface Rubric {
  items: RubricItem[];
}

export interface RFP {
  rfp_id: string;
  title: string;
  buyer?: string;
  buyer_org: string;
  category: ProcurementCategory;
  summary: string;
  full_text: string;
  mandatory_requirements: string[];
  optional_requirements: string[];
  budget_min: number;
  budget_max: number;
  currency: string;
  submission_deadline: string;
  evaluation_deadline: string;
  required_documents: string[];
  compliance_requirements: string;
  security_requirements: string;
  delivery_requirements: string;
  pricing_model: string;
  clarification_rules: string;
  appeal_rules: string;
  conflict_of_interest_rules: string;
  status?: RfpStatus;
  bid_count?: number;
  ranking_status?: RankingStatus;
}

export interface Bid {
  bid_id: string;
  rfp_id: string;
  vendor?: string;
  vendor_name: string;
  vendor_profile: string;
  executive_summary: string;
  technical_approach: string;
  implementation_plan: string;
  timeline: string;
  pricing_proposal: string;
  bid_amount: number;
  currency: string;
  compliance_responses: string;
  team_capability: string;
  case_studies: string;
  references: string;
  risk_disclosures: string;
  assumptions: string;
  exceptions: string;
  status?: BidStatus | Verdict;
  procurement_score?: number;
  rank?: number;
  decision?: string;
  award_recommendation?: AwardRecommendation;
}

export type EvidenceType =
  | "RFP_DOCUMENT" | "TECHNICAL_PROPOSAL" | "COMMERCIAL_PROPOSAL" | "PRICING_SHEET"
  | "COMPLIANCE_CERTIFICATE" | "SECURITY_DOCUMENT" | "CASE_STUDY" | "REFERENCE_LETTER"
  | "IMPLEMENTATION_PLAN" | "PROJECT_TIMELINE" | "INSURANCE_DOCUMENT" | "LEGAL_DOCUMENT"
  | "FINANCIAL_STATEMENT" | "TEAM_PROFILE" | "PRODUCT_DEMO" | "ARCHITECTURE_DIAGRAM"
  | "SERVICE_LEVEL_AGREEMENT" | "OTHER";

export type PrivacyLevel = "PUBLIC" | "REDACTED" | "PRIVATE_HASH_ONLY";

export interface Evidence {
  evidence_id: string;
  rfp_id: string;
  bid_id: string;
  type: EvidenceType;
  title: string;
  description: string;
  uri: string;
  hash: string;
  source: string;
  date: string;
  relevance_note: string;
  privacy: PrivacyLevel;
}

export interface SubScore { score: number; reason: string; }

export interface BidReview {
  verdict: Verdict;
  eligibility: Eligibility;
  procurement_score: number;
  confidence: number;
  risk_level: RiskLevel;
  recommended_action: string;
  technical_fit: SubScore;
  commercial_value: SubScore;
  delivery_feasibility: SubScore;
  vendor_capability: SubScore;
  compliance_security: SubScore;
  qualitative_fit: SubScore;
  risk_and_exceptions: SubScore;
  mandatory_failures: string[];
  clarification_requests: string[];
  positive_signals: string[];
  red_flags: string[];
  missing_information: string[];
  reasoning_summary: string;
}

export interface RankedBid {
  bid_id: string;
  rank: number;
  procurement_score: number;
  decision: string;
  award_recommendation: AwardRecommendation;
  reason: string;
}

export interface RfpRanking {
  rfp_id: string;
  ranking_status: RankingStatus;
  total_bids_reviewed: number;
  ranking_confidence: number;
  ranked_bids: RankedBid[];
  award_summary: {
    recommended_bid_id: string;
    backup_bid_id?: string;
    recommended_contract_value: number;
    currency: string;
  };
  rfp_findings: string[];
  tie_breaks: string[];
  red_flags: string[];
  reasoning_summary: string;
}

export interface Clarification {
  clarification_id: string;
  bid_id: string;
  reason: string;
  question: string;
  status?: string;
  response?: { answer: string; evidence?: string };
}

export interface ClarificationReview {
  clarification_decision: string;
  updated_bid_status: string;
  confidence: number;
  resolved_items: string[];
  unresolved_items: string[];
  score_delta: number;
  reasoning_summary: string;
  recommended_action: string;
}

export interface Appeal {
  appeal_id: string;
  bid_id: string;
  reason: string;
  argument: string;
  new_evidence?: string;
}

export interface AppealReview {
  appeal_decision: string;
  new_bid_decision: string;
  new_procurement_score: number;
  confidence: number;
  accepted_arguments: string[];
  rejected_arguments: string[];
  reasoning_summary: string;
  final_recommendation: string;
}

export interface ProtocolStats {
  rfp_count: number;
  bid_count: number;
  evidence_count: number;
  review_count: number;
  ranking_count: number;
  clarification_count: number;
  appeal_count: number;
}
