import * as z from 'zod/v4';

/**
 * Output shapes for each AI feature. Structured outputs constrain the model to
 * these schemas, so the API returns typed data the UI can render directly
 * instead of prose the frontend would have to interpret.
 *
 * Every `.describe()` is part of the prompt — the model reads them, so they are
 * written as instructions rather than developer notes.
 */

const severity = z
  .enum(['info', 'warning', 'critical'])
  .describe(
    'Mức độ nghiêm trọng: info = ghi nhận, warning = nên xử lý, critical = phải xử lý trước khi duyệt',
  );

export const PurchaseRequestAnalysisSchema = z.object({
  summary: z
    .string()
    .describe(
      'Tóm tắt yêu cầu trong 1-2 câu tiếng Việt, nêu rõ mua gì và để làm gì',
    ),
  completenessScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      'Điểm đầy đủ thông tin 0-100. Dưới 60 nghĩa là thiếu thông tin quan trọng để đi tiếp',
    ),
  readyForRfq: z
    .boolean()
    .describe('Thông tin đã đủ để lập yêu cầu báo giá gửi nhà cung cấp chưa'),
  missingInformation: z
    .array(
      z.object({
        field: z.string().describe('Thông tin còn thiếu'),
        why: z.string().describe('Vì sao cần thông tin này'),
        severity,
      }),
    )
    .describe(
      'Danh sách thông tin còn thiếu hoặc chưa rõ. Để mảng rỗng nếu đã đầy đủ',
    ),
  risks: z
    .array(
      z.object({
        title: z.string().describe('Tên rủi ro, ngắn gọn'),
        detail: z.string().describe('Mô tả rủi ro và tác động'),
        severity,
      }),
    )
    .describe(
      'Rủi ro về kỹ thuật, ngân sách, tiến độ, tuân thủ. Để mảng rỗng nếu không có',
    ),
  suggestedQuestions: z
    .array(z.string())
    .describe('Câu hỏi cụ thể buyer nên hỏi lại người yêu cầu. Tối đa 5 câu'),
  budgetAssessment: z
    .string()
    .describe(
      'Nhận xét về ngân sách và đơn giá dự kiến so với mặt bằng thị trường. Nếu không đủ dữ liệu, nói rõ là không đủ căn cứ',
    ),
});

export const SupplierSuggestionSchema = z.object({
  reasoning: z
    .string()
    .describe('Giải thích ngắn gọn tiêu chí đã dùng để xếp hạng'),
  suggestions: z
    .array(
      z.object({
        supplierId: z
          .string()
          .describe('id của nhà cung cấp, lấy đúng từ danh sách được cung cấp'),
        companyName: z.string().describe('Tên công ty'),
        fitScore: z
          .number()
          .int()
          .min(0)
          .max(100)
          .describe('Mức độ phù hợp 0-100 với yêu cầu này'),
        strengths: z.array(z.string()).describe('Điểm mạnh cho yêu cầu này'),
        concerns: z
          .array(z.string())
          .describe('Điểm cần lưu ý. Để mảng rỗng nếu không có'),
        recommendation: z
          .enum(['mời_ngay', 'cân_nhắc', 'không_phù_hợp'])
          .describe('Khuyến nghị có nên mời báo giá không'),
      }),
    )
    .describe(
      'Xếp hạng giảm dần theo fitScore. Chỉ dùng nhà cung cấp có trong danh sách đầu vào',
    ),
});

export const QuotationAnalysisSchema = z.object({
  recommendedQuotationId: z
    .string()
    .nullable()
    .describe('id báo giá nên chọn. null nếu chưa đủ căn cứ để khuyến nghị'),
  recommendationReason: z
    .string()
    .describe(
      'Lý do khuyến nghị, cân nhắc cả giá lẫn các yếu tố khác chứ không chỉ giá thấp nhất',
    ),
  totalCostOfOwnership: z
    .string()
    .describe(
      'Nhận xét về tổng chi phí sở hữu: bảo hành, thời gian giao, điều khoản thanh toán ảnh hưởng thế nào ngoài đơn giá',
    ),
  comparison: z
    .array(
      z.object({
        quotationId: z
          .string()
          .describe('id báo giá, lấy đúng từ dữ liệu đầu vào'),
        supplierName: z.string(),
        valueScore: z
          .number()
          .int()
          .min(0)
          .max(100)
          .describe('Điểm giá trị tổng thể 0-100, không chỉ dựa trên giá'),
        pros: z.array(z.string()).describe('Ưu điểm của báo giá này'),
        cons: z.array(z.string()).describe('Nhược điểm của báo giá này'),
      }),
    )
    .describe('Đánh giá từng báo giá'),
  redFlags: z
    .array(
      z.object({
        quotationId: z
          .string()
          .nullable()
          .describe('id báo giá liên quan, null nếu là vấn đề chung'),
        issue: z.string().describe('Dấu hiệu bất thường'),
        severity,
      }),
    )
    .describe(
      'Bất thường như giá lệch quá xa mặt bằng, điều khoản mập mờ, hiệu lực quá ngắn. Để mảng rỗng nếu không có',
    ),
  negotiationPoints: z
    .array(z.string())
    .describe('Điểm nên đàm phán thêm với nhà cung cấp. Tối đa 5 điểm'),
});

export const ContractReviewSchema = z.object({
  summary: z.string().describe('Tóm tắt hợp đồng trong 2-3 câu'),
  riskLevel: z
    .enum(['thấp', 'trung_bình', 'cao'])
    .describe('Mức rủi ro tổng thể của hợp đồng'),
  findings: z
    .array(
      z.object({
        clause: z.string().describe('Điều khoản hoặc chủ đề liên quan'),
        finding: z.string().describe('Vấn đề phát hiện'),
        suggestion: z.string().describe('Đề xuất chỉnh sửa cụ thể'),
        severity,
      }),
    )
    .describe('Các điều khoản có rủi ro cho bên mua'),
  missingClauses: z
    .array(
      z.object({
        clause: z.string().describe('Điều khoản còn thiếu'),
        why: z.string().describe('Vì sao nên có điều khoản này'),
      }),
    )
    .describe(
      'Điều khoản tiêu chuẩn nên có nhưng chưa thấy: phạt chậm giao, bảo hành, chấm dứt, bảo mật, bất khả kháng...',
    ),
  keyDates: z
    .array(
      z.object({
        label: z.string().describe('Tên mốc thời gian'),
        date: z
          .string()
          .describe('Ngày, định dạng YYYY-MM-DD nếu xác định được'),
        note: z.string().describe('Việc cần làm trước mốc này'),
      }),
    )
    .describe('Mốc thời gian cần theo dõi'),
});

export const QuotationExtractionSchema = z.object({
  supplierName: z
    .string()
    .nullable()
    .describe('Tên nhà cung cấp trên chứng từ'),
  quotationNumber: z.string().nullable().describe('Số báo giá'),
  quotationDate: z
    .string()
    .nullable()
    .describe('Ngày báo giá, định dạng YYYY-MM-DD'),
  currency: z.string().nullable().describe('Mã tiền tệ, ví dụ VND hoặc USD'),
  paymentTerm: z.string().nullable(),
  incoterm: z.string().nullable(),
  leadTimeDays: z
    .number()
    .int()
    .nullable()
    .describe('Thời gian giao hàng quy đổi ra số ngày'),
  warranty: z.string().nullable(),
  validUntil: z
    .string()
    .nullable()
    .describe('Hiệu lực báo giá đến ngày, định dạng YYYY-MM-DD'),
  items: z
    .array(
      z.object({
        name: z.string().describe('Tên hàng hóa hoặc dịch vụ'),
        description: z.string().nullable(),
        quantity: z.number().describe('Số lượng'),
        unit: z.string().describe('Đơn vị tính'),
        unitPrice: z.number().describe('Đơn giá'),
      }),
    )
    .describe('Các dòng hàng đọc được từ chứng từ'),
  totalAmount: z.number().nullable().describe('Tổng tiền ghi trên chứng từ'),
  confidence: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      'Mức độ tự tin vào kết quả đọc 0-100. Dưới 70 nghĩa là người dùng nên kiểm tra lại',
    ),
  warnings: z
    .array(z.string())
    .describe(
      'Chỗ đọc không chắc chắn hoặc thiếu trên chứng từ. Để mảng rỗng nếu đọc rõ ràng',
    ),
});

export type PurchaseRequestAnalysis = z.infer<
  typeof PurchaseRequestAnalysisSchema
>;
export type SupplierSuggestion = z.infer<typeof SupplierSuggestionSchema>;
export type QuotationAnalysis = z.infer<typeof QuotationAnalysisSchema>;
export type ContractReview = z.infer<typeof ContractReviewSchema>;
export type QuotationExtraction = z.infer<typeof QuotationExtractionSchema>;
