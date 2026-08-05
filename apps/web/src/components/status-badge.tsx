import { Badge } from '@/components/ui';
import type {
  CertificateStatus,
  ContractStatus,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  Priority,
  RfqStatus,
  SupplierStatus,
  QuotationStatus,
} from '@/lib/types';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const PR_STATUS: Record<PurchaseRequestStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  SUBMITTED: { label: 'Đã gửi', tone: 'info' },
  BUYER_REVIEW: { label: 'Đang xem xét', tone: 'info' },
  NEED_CLARIFICATION: { label: 'Cần bổ sung', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  LOW: { label: 'Thấp', tone: 'neutral' },
  NORMAL: { label: 'Bình thường', tone: 'info' },
  HIGH: { label: 'Cao', tone: 'warning' },
  URGENT: { label: 'Khẩn cấp', tone: 'danger' },
};

const RFQ_STATUS: Record<RfqStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  SENT: { label: 'Đã gửi NCC', tone: 'info' },
  CLOSED: { label: 'Đã đóng', tone: 'warning' },
  AWARDED: { label: 'Đã chọn NCC', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

const SUPPLIER_STATUS: Record<SupplierStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
  SUSPENDED: { label: 'Tạm ngưng', tone: 'neutral' },
};

const QUOTATION_STATUS: Record<QuotationStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  SUBMITTED: { label: 'Đã gửi', tone: 'info' },
  SHORTLISTED: { label: 'Vào vòng trong', tone: 'info' },
  AWARDED: { label: 'Trúng thầu', tone: 'success' },
  REJECTED: { label: 'Không trúng', tone: 'neutral' },
};

const PO_STATUS: Record<PurchaseOrderStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'Chờ phê duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã phê duyệt', tone: 'info' },
  ISSUED: { label: 'Đã phát hành', tone: 'info' },
  ACKNOWLEDGED: { label: 'NCC đã xác nhận', tone: 'success' },
  PARTIALLY_RECEIVED: { label: 'Nhận một phần', tone: 'warning' },
  COMPLETED: { label: 'Hoàn tất', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
};

const CONTRACT_STATUS: Record<ContractStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  ACTIVE: { label: 'Đang hiệu lực', tone: 'success' },
  EXPIRING: { label: 'Sắp hết hạn', tone: 'warning' },
  EXPIRED: { label: 'Đã hết hạn', tone: 'danger' },
  TERMINATED: { label: 'Đã chấm dứt', tone: 'neutral' },
  RENEWED: { label: 'Đã gia hạn', tone: 'info' },
};

const CERTIFICATE_STATUS: Record<CertificateStatus, { label: string; tone: Tone }> = {
  VALID: { label: 'Còn hiệu lực', tone: 'success' },
  EXPIRING: { label: 'Sắp hết hạn', tone: 'warning' },
  EXPIRED: { label: 'Đã hết hạn', tone: 'danger' },
  REVOKED: { label: 'Đã thu hồi', tone: 'neutral' },
};

function render(entry: { label: string; tone: Tone } | undefined, fallback: string) {
  if (!entry) return <Badge tone="neutral">{fallback}</Badge>;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export const PrStatusBadge = ({ status }: { status: PurchaseRequestStatus }) =>
  render(PR_STATUS[status], status);

export const PriorityBadge = ({ priority }: { priority: Priority }) =>
  render(PRIORITY[priority], priority);

export const RfqStatusBadge = ({ status }: { status: RfqStatus }) =>
  render(RFQ_STATUS[status], status);

export const SupplierStatusBadge = ({ status }: { status: SupplierStatus }) =>
  render(SUPPLIER_STATUS[status], status);

export const QuotationStatusBadge = ({ status }: { status: QuotationStatus }) =>
  render(QUOTATION_STATUS[status], status);

export const PoStatusBadge = ({ status }: { status: PurchaseOrderStatus }) =>
  render(PO_STATUS[status], status);

export const ContractStatusBadge = ({ status }: { status: ContractStatus }) =>
  render(CONTRACT_STATUS[status], status);

export const CertificateStatusBadge = ({ status }: { status: CertificateStatus }) =>
  render(CERTIFICATE_STATUS[status], status);

/** Colours the countdown so an imminent expiry stands out in a long list. */
export function DaysRemaining({ days }: { days: number }) {
  const tone: Tone =
    days < 0 ? 'danger' : days <= 15 ? 'danger' : days <= 30 ? 'warning' : days <= 90 ? 'info' : 'neutral';
  const label =
    days < 0 ? `Quá hạn ${Math.abs(days)} ngày` : `Còn ${days} ngày`;
  return <Badge tone={tone}>{label}</Badge>;
}
