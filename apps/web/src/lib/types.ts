export type PurchaseRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'BUYER_REVIEW'
  | 'NEED_CLARIFICATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type SupplierStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type RfqStatus = 'DRAFT' | 'SENT' | 'CLOSED' | 'AWARDED' | 'CANCELLED';
export type QuotationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'SHORTLISTED'
  | 'AWARDED'
  | 'REJECTED';

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ISSUED'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export type FieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'DECIMAL'
  | 'DATE'
  | 'DATETIME'
  | 'SELECT'
  | 'MULTISELECT'
  | 'CHECKBOX'
  | 'RADIO'
  | 'FILE'
  | 'EMAIL'
  | 'URL';

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface UserRef {
  id: string;
  fullName: string;
  email?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface Category {
  id: string;
  name: string;
  nameEn: string | null;
  code: string;
  isActive: boolean;
}

export interface DynamicFieldOption {
  value: string;
  label: string;
}

export interface DynamicField {
  id: string;
  key: string;
  label: string;
  labelEn: string | null;
  type: FieldType;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  sortOrder: number;
  options: DynamicFieldOption[] | null;
  defaultValue: string | null;
}

export interface DynamicForm {
  id: string | null;
  name: string | null;
  version: number;
  fields: DynamicField[];
}

export interface PurchaseRequestItem {
  id: string;
  lineNo: number;
  name: string;
  description: string | null;
  specification: string | null;
  quantity: string;
  unit: string;
  estimatedPrice: string | null;
}

export interface ApprovalHistory {
  id: string;
  decision: string;
  comment: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
  actor: UserRef;
}

export interface PurchaseRequest {
  id: string;
  code: string;
  title: string;
  description: string | null;
  reason: string | null;
  status: PurchaseRequestStatus;
  priority: Priority;
  currency: string;
  budgetAmount: string | null;
  estimatedTotal: string | null;
  neededByDate: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  clarificationNote: string | null;
  createdAt: string;
  requesterId: string;
  requester: UserRef;
  buyer: UserRef | null;
  department: Department;
  category: Category;
  project: { id: string; name: string; code: string } | null;
  items: PurchaseRequestItem[];
  dynamicValues: { id: string; value: string | null; field: DynamicField }[];
  approvalHistories: ApprovalHistory[];
  _count?: { comments: number; rfqs: number; items?: number };
}

export interface Supplier {
  id: string;
  code: string;
  companyName: string;
  taxCode: string | null;
  address: string | null;
  country: string | null;
  website: string | null;
  email: string;
  contactPerson: string | null;
  phone: string | null;
  bankAccount: string | null;
  bankName: string | null;
  swiftCode: string | null;
  paymentTerm: string | null;
  mainProducts: string | null;
  mainServices: string | null;
  status: SupplierStatus;
  ratingAvg: string | null;
  rejectReason: string | null;
  categories?: { categoryId: string; category: Category }[];
  _count?: { quotations: number; contracts: number };
}

export interface QuotationItem {
  id: string;
  lineNo: number;
  name: string;
  description: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
}

export interface Rfq {
  id: string;
  code: string;
  title: string;
  status: RfqStatus;
  instructions: string | null;
  dueDate: string | null;
  sentAt: string | null;
  awardedQuotationId: string | null;
  createdAt: string;
  buyer?: UserRef;
  purchaseRequest: Pick<PurchaseRequest, 'id' | 'code' | 'title'> & {
    items?: PurchaseRequestItem[];
  };
  suppliers?: { id: string; supplierId: string; status: string; supplier: Supplier }[];
  quotations?: Quotation[];
  _count?: { suppliers: number; quotations: number };
}

export interface Quotation {
  id: string;
  code: string;
  supplierId: string;
  status: QuotationStatus;
  currency: string;
  totalAmount: string;
  moq: string | null;
  leadTimeDays: number | null;
  paymentTerm: string | null;
  incoterm: string | null;
  validUntil: string | null;
  warranty: string | null;
  deliveryTerm: string | null;
  remark: string | null;
  submittedAt: string | null;
  supplier?: Supplier;
  items: QuotationItem[];
  rfq?: Pick<Rfq, 'id' | 'code' | 'title' | 'status'>;
}

export interface ComparisonRow {
  quotationId: string;
  code: string;
  supplier: { id: string; code: string; companyName: string; ratingAvg: string | null };
  status: QuotationStatus;
  currency: string;
  totalAmount: string;
  isLowestPrice: boolean;
  diffFromLowestPercent: number;
  leadTimeDays: number | null;
  isShortestLeadTime: boolean;
  moq: string | null;
  paymentTerm: string | null;
  incoterm: string | null;
  deliveryTerm: string | null;
  warranty: string | null;
  validUntil: string | null;
  remark: string | null;
  submittedAt: string | null;
  items: QuotationItem[];
  attachments: { id: string; originalName: string; documentType: string | null }[];
}

export interface Comparison {
  rfq: {
    id: string;
    code: string;
    title: string;
    status: RfqStatus;
    dueDate: string | null;
    awardedQuotationId: string | null;
    purchaseRequest: { id: string; code: string; title: string; items: PurchaseRequestItem[] };
  };
  summary: {
    invited: number;
    responded: number;
    lowestTotal: string | null;
    shortestLeadTime: number | null;
  };
  quotations: ComparisonRow[];
}

export interface Notification {
  id: string;
  event: string;
  channel: 'IN_APP' | 'EMAIL';
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author: UserRef;
}

export interface AuthProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  jobTitle: string | null;
  locale: string;
  status: string;
  department: Department | null;
  supplier: Supplier | null;
  roles: string[];
  permissions: string[];
}

export interface DashboardOverview {
  purchaseRequests: {
    new: number;
    inReview: number;
    needClarification: number;
    approved: number;
    overdue: number;
  };
  rfqs: { open: number; awaitingQuotes: number };
  expiring: { contracts: number; certificates: number };
}

export interface PurchaseOrderItem {
  id: string;
  lineNo: number;
  name: string;
  description: string | null;
  specification: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  receivedQty: string;
}

export interface PurchaseOrder {
  id: string;
  code: string;
  title: string;
  status: PurchaseOrderStatus;
  currency: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  paymentTerm: string | null;
  incoterm: string | null;
  deliveryTerm: string | null;
  warranty: string | null;
  deliveryDate: string | null;
  deliveryAddress: string | null;
  note: string | null;
  issuedAt: string | null;
  acknowledgedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  supplierId: string;
  supplier: Supplier;
  buyer: UserRef;
  purchaseRequest: {
    id: string;
    code: string;
    title: string;
    department?: { id: string; name: string } | null;
    requester?: UserRef | null;
  };
  rfq: { id: string; code: string; title: string } | null;
  quotation: { id: string; code: string; totalAmount: string } | null;
  items: PurchaseOrderItem[];
  _count?: { items: number };
}

// ---------------------------------------------------------------------------
// Phase 2
// ---------------------------------------------------------------------------

export type ContractStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'TERMINATED'
  | 'RENEWED';

export type CertificateStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'REVOKED';

export interface ApprovalStep {
  id: string;
  stepOrder: number;
  name: string;
  roleId: string | null;
  slaHours: number | null;
  role?: { id: string; code: string; name: string } | null;
}

export interface ApprovalWorkflowRef {
  id: string;
  name: string;
  steps?: ApprovalStep[];
}

export interface Contract {
  id: string;
  contractNumber: string;
  title: string;
  status: ContractStatus;
  startDate: string;
  endDate: string;
  currency: string;
  contractValue: string;
  renewalOption: boolean;
  note: string | null;
  daysRemaining: number;
  supplier: { id: string; code: string; companyName: string };
  category: { id: string; name: string; nameEn: string | null } | null;
  department: { id: string; name: string } | null;
  buyer: UserRef | null;
  reminders?: { id: string; daysBefore: number; remindAt: string; status: string }[];
}

export interface Certificate {
  id: string;
  name: string;
  type: string | null;
  issuedBy: string | null;
  issueDate: string;
  expiryDate: string;
  status: CertificateStatus;
  note: string | null;
  daysRemaining: number;
  supplierId: string;
  supplier: { id: string; code?: string; companyName: string };
}

export interface SupplierPerformance {
  id: string;
  periodStart: string;
  periodEnd: string;
  priceScore: number;
  qualityScore: number;
  deliveryScore: number;
  responseScore: number;
  cooperationScore: number;
  complaintRate: string;
  totalScore: string;
  note: string | null;
  createdAt: string;
  supplier: { id: string; code: string; companyName: string };
  evaluator: UserRef;
}

export interface SupplierRanking {
  supplier: { id: string; code: string; companyName: string; status: string } | null;
  evaluations: number;
  averageScore: number;
  breakdown: {
    price: number;
    quality: number;
    delivery: number;
    response: number;
    cooperation: number;
  };
}

export interface ReportTable {
  title: string;
  columns: { key: string; header: string; width?: number }[];
  rows: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Phase 3 — Trợ lý AI
// ---------------------------------------------------------------------------

export type AiSeverity = 'info' | 'warning' | 'critical';

export interface AiStatus {
  enabled: boolean;
  model: string;
  features: string[];
}

export interface PurchaseRequestAnalysis {
  summary: string;
  completenessScore: number;
  readyForRfq: boolean;
  missingInformation: { field: string; why: string; severity: AiSeverity }[];
  risks: { title: string; detail: string; severity: AiSeverity }[];
  suggestedQuestions: string[];
  budgetAssessment: string;
}

export interface SupplierSuggestionResult {
  reasoning: string;
  suggestions: {
    supplierId: string;
    companyName: string;
    fitScore: number;
    strengths: string[];
    concerns: string[];
    recommendation: 'mời_ngay' | 'cân_nhắc' | 'không_phù_hợp';
  }[];
}

export interface QuotationAnalysis {
  recommendedQuotationId: string | null;
  recommendationReason: string;
  totalCostOfOwnership: string;
  comparison: {
    quotationId: string;
    supplierName: string;
    valueScore: number;
    pros: string[];
    cons: string[];
  }[];
  redFlags: { quotationId: string | null; issue: string; severity: AiSeverity }[];
  negotiationPoints: string[];
}

export interface ContractReview {
  summary: string;
  riskLevel: 'thấp' | 'trung_bình' | 'cao';
  findings: {
    clause: string;
    finding: string;
    suggestion: string;
    severity: AiSeverity;
  }[];
  missingClauses: { clause: string; why: string }[];
  keyDates: { label: string; date: string; note: string }[];
}

export interface QuotationExtraction {
  supplierName: string | null;
  quotationNumber: string | null;
  quotationDate: string | null;
  currency: string | null;
  paymentTerm: string | null;
  incoterm: string | null;
  leadTimeDays: number | null;
  warranty: string | null;
  validUntil: string | null;
  items: {
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
  }[];
  totalAmount: number | null;
  confidence: number;
  warnings: string[];
}
