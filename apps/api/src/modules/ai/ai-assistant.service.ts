import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuotationStatus, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AiService } from './ai.service';
import {
  ContractReviewSchema,
  PurchaseRequestAnalysisSchema,
  QuotationAnalysisSchema,
  QuotationExtractionSchema,
  SupplierSuggestionSchema,
} from './ai.schemas';

/**
 * The system prompts are stable across calls so they sit behind a cache
 * breakpoint; only the per-request payload is billed at full rate.
 */
const ROLE = `Bạn là chuyên gia mua hàng (procurement) giàu kinh nghiệm, hỗ trợ bộ phận mua hàng của một doanh nghiệp sản xuất tại Việt Nam.

Nguyên tắc:
- Trả lời bằng tiếng Việt, ngắn gọn và cụ thể, dùng thuật ngữ mua hàng chuẩn.
- Chỉ kết luận dựa trên dữ liệu được cung cấp. Nếu dữ liệu không đủ để kết luận, nói rõ là không đủ căn cứ thay vì suy đoán.
- Không bịa số liệu, tên nhà cung cấp, hay điều khoản không có trong dữ liệu.
- Ưu tiên nêu vấn đề thực sự ảnh hưởng tới quyết định mua hàng, bỏ qua nhận xét hiển nhiên.`;

/** Prisma trả về Decimal; nhúng thẳng vào chuỗi sẽ ra "[object Object]". */
function num(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object'
    ? (value as { toString(): string }).toString()
    : // eslint-disable-next-line @typescript-eslint/no-base-to-string
      String(value);
}

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly audit: AuditService,
  ) {}

  status() {
    return {
      enabled: this.ai.isEnabled,
      model: 'claude-opus-5',
      features: [
        'purchase_request_analysis',
        'supplier_suggestion',
        'quotation_analysis',
        'contract_review',
        'quotation_extraction',
      ],
    };
  }

  // ------------------------------------------------------------ purchase request

  async analyzePurchaseRequest(id: string, userId: string) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        department: true,
        requester: { select: { fullName: true } },
        items: { orderBy: { lineNo: 'asc' } },
        dynamicValues: { include: { field: true } },
      },
    });
    if (!pr) throw new NotFoundException('Không tìm thấy yêu cầu mua hàng');

    const payload = {
      mã: pr.code,
      tiêu_đề: pr.title,
      lĩnh_vực: pr.category.nameEn ?? pr.category.name,
      bộ_phận: pr.department.name,
      người_yêu_cầu: pr.requester.fullName,
      mức_ưu_tiên: pr.priority,
      lý_do_mua: pr.reason ?? '(không có)',
      mô_tả: pr.description ?? '(không có)',
      ngày_cần_hàng:
        pr.neededByDate?.toISOString().slice(0, 10) ?? '(chưa nêu)',
      ngân_sách: pr.budgetAmount
        ? `${num(pr.budgetAmount)} ${pr.currency}`
        : '(chưa nêu)',
      giá_trị_dự_kiến: pr.estimatedTotal
        ? `${num(pr.estimatedTotal)} ${pr.currency}`
        : '(chưa tính được)',
      thông_tin_theo_lĩnh_vực: Object.fromEntries(
        pr.dynamicValues.map((v) => [v.field.label, v.value ?? '(bỏ trống)']),
      ),
      dòng_hàng: pr.items.map((i) => ({
        tên: i.name,
        quy_cách: i.specification ?? '(không có)',
        số_lượng: `${num(i.quantity)} ${i.unit}`,
        đơn_giá_dự_kiến: i.estimatedPrice?.toString() ?? '(chưa có)',
      })),
    };

    const result = await this.ai.ask(PurchaseRequestAnalysisSchema, {
      system: `${ROLE}

Nhiệm vụ: rà soát một yêu cầu mua hàng trước khi bộ phận mua hàng xử lý. Chỉ ra thông tin còn thiếu khiến không thể lập yêu cầu báo giá, rủi ro đáng lưu ý, và câu hỏi cần làm rõ với người yêu cầu.`,
      prompt: `Rà soát yêu cầu mua hàng sau:\n\n${JSON.stringify(payload, null, 2)}`,
    });

    await this.audit.record({
      userId,
      action: 'AI_ANALYZE',
      module: 'purchase_request',
      entityId: id,
      newValue: {
        completenessScore: result.completenessScore,
        readyForRfq: result.readyForRfq,
      },
    });

    return result;
  }

  // ---------------------------------------------------------- supplier suggestion

  async suggestSuppliers(purchaseRequestId: string) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id: purchaseRequestId, deletedAt: null },
      include: { category: true, items: { orderBy: { lineNo: 'asc' } } },
    });
    if (!pr) throw new NotFoundException('Không tìm thấy yêu cầu mua hàng');

    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null, status: SupplierStatus.APPROVED },
      include: {
        categories: { include: { category: true } },
        performances: { orderBy: { periodEnd: 'desc' }, take: 3 },
        quotations: {
          where: { status: QuotationStatus.AWARDED, deletedAt: null },
          select: { id: true, totalAmount: true },
        },
        contracts: {
          where: { deletedAt: null },
          select: { id: true, status: true },
        },
        certificates: {
          where: { deletedAt: null },
          select: { name: true, status: true },
        },
      },
    });

    if (!suppliers.length) {
      throw new BadRequestException(
        'Chưa có nhà cung cấp nào được duyệt để gợi ý',
      );
    }

    const payload = {
      yêu_cầu: {
        tiêu_đề: pr.title,
        lĩnh_vực: pr.category.nameEn ?? pr.category.name,
        giá_trị_dự_kiến: pr.estimatedTotal?.toString() ?? '(chưa có)',
        dòng_hàng: pr.items.map(
          (i) => `${i.name} — ${num(i.quantity)} ${i.unit}`,
        ),
      },
      nhà_cung_cấp: suppliers.map((s) => ({
        id: s.id,
        tên: s.companyName,
        lĩnh_vực_đăng_ký: s.categories.map(
          (c) => c.category.nameEn ?? c.category.name,
        ),
        điểm_đánh_giá_trung_bình: s.ratingAvg?.toString() ?? '(chưa đánh giá)',
        lần_đánh_giá_gần_nhất: s.performances.map((p) => ({
          kỳ: p.periodEnd.toISOString().slice(0, 10),
          tổng_điểm: p.totalScore.toString(),
          giao_hàng: p.deliveryScore,
          chất_lượng: p.qualityScore,
        })),
        số_lần_trúng_thầu: s.quotations.length,
        số_hợp_đồng: s.contracts.length,
        chứng_chỉ: s.certificates.map((c) => `${c.name} (${c.status})`),
        điều_khoản_thanh_toán: s.paymentTerm ?? '(chưa có)',
      })),
    };

    const result = await this.ai.ask(SupplierSuggestionSchema, {
      system: `${ROLE}

Nhiệm vụ: chọn ra những nhà cung cấp phù hợp nhất để mời báo giá cho một yêu cầu mua hàng. Cân nhắc sự phù hợp về lĩnh vực, lịch sử đánh giá, kinh nghiệm trúng thầu và chứng chỉ. Chỉ được dùng các nhà cung cấp có trong danh sách, và phải trả về đúng id đã cho.`,
      prompt: `Gợi ý nhà cung cấp cho yêu cầu sau:\n\n${JSON.stringify(payload, null, 2)}`,
    });

    // The model must not invent suppliers; drop anything not in the input set.
    const validIds = new Set(suppliers.map((s) => s.id));
    return {
      ...result,
      suggestions: result.suggestions.filter((s) => validIds.has(s.supplierId)),
    };
  }

  // ---------------------------------------------------------- quotation analysis

  async analyzeQuotations(rfqId: string, userId: string) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id: rfqId, deletedAt: null },
      include: {
        purchaseRequest: {
          include: { category: true, items: { orderBy: { lineNo: 'asc' } } },
        },
        quotations: {
          where: { deletedAt: null, status: { not: QuotationStatus.DRAFT } },
          include: {
            supplier: {
              select: { companyName: true, ratingAvg: true, paymentTerm: true },
            },
            items: { orderBy: { lineNo: 'asc' } },
          },
        },
        // Cần để biết vòng chào giá đã khép lại chưa.
        suppliers: { select: { status: true } },
      },
    });
    if (!rfq) throw new NotFoundException('Không tìm thấy RFQ');
    if (rfq.quotations.length < 2) {
      throw new BadRequestException('Cần ít nhất 2 báo giá đã gửi để so sánh');
    }

    // Phân tích của AI đọc thẳng vào giá, nên cũng phải chờ mở niêm phong —
    // nếu không thì đây thành đường vòng để xem giá sớm.
    const pending = rfq.suppliers.filter(
      (s) => s.status !== 'QUOTED' && s.status !== 'DECLINED',
    ).length;
    const unsealed =
      rfq.status === 'CLOSED' ||
      rfq.status === 'AWARDED' ||
      (rfq.dueDate !== null && rfq.dueDate.getTime() <= Date.now()) ||
      (rfq.suppliers.length > 0 && pending === 0);
    if (!unsealed) {
      throw new BadRequestException(
        `Giá còn niêm phong nên chưa phân tích được. Còn ${pending} nhà cung cấp chưa trả lời.`,
      );
    }

    const payload = {
      yêu_cầu: {
        tiêu_đề: rfq.purchaseRequest.title,
        lĩnh_vực:
          rfq.purchaseRequest.category.nameEn ??
          rfq.purchaseRequest.category.name,
        ngân_sách: rfq.purchaseRequest.budgetAmount?.toString() ?? '(chưa nêu)',
        dòng_hàng_yêu_cầu: rfq.purchaseRequest.items.map(
          (i) => `${i.name} — ${num(i.quantity)} ${i.unit}`,
        ),
      },
      báo_giá: rfq.quotations.map((q) => ({
        id: q.id,
        nhà_cung_cấp: q.supplier.companyName,
        điểm_đánh_giá: q.supplier.ratingAvg?.toString() ?? '(chưa đánh giá)',
        tổng_tiền: `${num(q.totalAmount)} ${q.currency}`,
        thời_gian_giao_ngày: q.leadTimeDays ?? '(chưa nêu)',
        điều_khoản_thanh_toán: q.paymentTerm ?? '(chưa nêu)',
        incoterm: q.incoterm ?? '(chưa nêu)',
        bảo_hành: q.warranty ?? '(chưa nêu)',
        hiệu_lực_đến: q.validUntil?.toISOString().slice(0, 10) ?? '(chưa nêu)',
        ghi_chú: q.remark ?? '(không có)',
        dòng_hàng: q.items.map((i) => ({
          tên: i.name,
          số_lượng: `${num(i.quantity)} ${i.unit}`,
          đơn_giá: i.unitPrice.toString(),
        })),
      })),
    };

    const result = await this.ai.ask(QuotationAnalysisSchema, {
      system: `${ROLE}

Nhiệm vụ: so sánh các báo giá và khuyến nghị lựa chọn. Giá thấp nhất không mặc nhiên là lựa chọn tốt nhất — cân nhắc thời gian giao, bảo hành, điều khoản thanh toán, uy tín nhà cung cấp và tổng chi phí sở hữu. Chỉ dùng id báo giá có trong dữ liệu.`,
      prompt: `So sánh các báo giá sau:\n\n${JSON.stringify(payload, null, 2)}`,
    });

    await this.audit.record({
      userId,
      action: 'AI_ANALYZE',
      module: 'rfq',
      entityId: rfqId,
      newValue: { recommendedQuotationId: result.recommendedQuotationId },
    });

    const validIds = new Set(rfq.quotations.map((q) => q.id));
    return {
      ...result,
      recommendedQuotationId:
        result.recommendedQuotationId &&
        validIds.has(result.recommendedQuotationId)
          ? result.recommendedQuotationId
          : null,
      comparison: result.comparison.filter((c) => validIds.has(c.quotationId)),
    };
  }

  // ------------------------------------------------------------ contract review

  async reviewContract(id: string, userId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: { select: { companyName: true, paymentTerm: true } },
        category: true,
        department: true,
      },
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');

    const payload = {
      số_hợp_đồng: contract.contractNumber,
      tên: contract.title,
      nhà_cung_cấp: contract.supplier.companyName,
      lĩnh_vực:
        contract.category?.nameEn ??
        contract.category?.name ??
        '(chưa phân loại)',
      bộ_phận: contract.department?.name ?? '(chưa gán)',
      ngày_bắt_đầu: contract.startDate.toISOString().slice(0, 10),
      ngày_kết_thúc: contract.endDate.toISOString().slice(0, 10),
      giá_trị: `${num(contract.contractValue)} ${contract.currency}`,
      có_điều_khoản_gia_hạn: contract.renewalOption,
      trạng_thái: contract.status,
      điều_khoản_thanh_toán_ncc: contract.supplier.paymentTerm ?? '(chưa có)',
      ghi_chú: contract.note ?? '(không có)',
    };

    const result = await this.ai.ask(ContractReviewSchema, {
      system: `${ROLE}

Nhiệm vụ: rà soát thông tin hợp đồng dưới góc nhìn quản trị rủi ro cho BÊN MUA. Chỉ ra điều khoản bất lợi, điều khoản tiêu chuẩn còn thiếu, và mốc thời gian cần theo dõi.

Lưu ý quan trọng: dữ liệu đầu vào chỉ là thông tin quản lý hợp đồng (metadata), không phải toàn văn hợp đồng. Khi nhận xét về nội dung điều khoản, phải nói rõ là chưa có toàn văn để đối chiếu.`,
      prompt: `Rà soát hợp đồng sau:\n\n${JSON.stringify(payload, null, 2)}`,
    });

    await this.audit.record({
      userId,
      action: 'AI_REVIEW',
      module: 'contract',
      entityId: id,
      newValue: {
        riskLevel: result.riskLevel,
        findings: result.findings.length,
      },
    });

    return result;
  }

  // -------------------------------------------------------- quotation extraction

  async extractQuotation(file: { buffer: Buffer; mimetype: string }) {
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Chỉ hỗ trợ đọc file PDF');
    }
    // 32MB is the request ceiling; base64 inflates by ~4/3, so cap the raw file.
    if (file.buffer.length > 20 * 1024 * 1024) {
      throw new BadRequestException('File vượt quá 20MB');
    }

    return this.ai.ask(QuotationExtractionSchema, {
      system: `${ROLE}

Nhiệm vụ: đọc file báo giá PDF do nhà cung cấp gửi và trích xuất thành dữ liệu có cấu trúc để nhập vào hệ thống.

Quy tắc:
- Chỉ trích xuất thông tin thực sự có trên chứng từ. Trường nào không thấy thì để null, không suy đoán.
- Số tiền trả về dạng số thuần, không kèm dấu phân cách hay ký hiệu tiền tệ.
- Nếu chứng từ mờ, thiếu trang, hoặc có chỗ không đọc được, ghi vào warnings và hạ confidence.`,
      prompt:
        'Đọc file báo giá đính kèm và trích xuất thông tin theo cấu trúc yêu cầu.',
      documents: [
        {
          base64: file.buffer.toString('base64'),
          mediaType: 'application/pdf',
        },
      ],
    });
  }
}
