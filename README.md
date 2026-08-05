# Procurement Management System (PMS)

Hệ thống quản lý mua hàng: số hóa quy trình từ lúc phát sinh nhu cầu, qua
review của bộ phận mua hàng, gửi yêu cầu báo giá tới nhà cung cấp, so sánh báo
giá và chọn nhà cung cấp trúng thầu.

## Kiến trúc

| Thành phần | Công nghệ |
| --- | --- |
| Backend | NestJS 11, Prisma 6, PostgreSQL 16, class-validator, Swagger |
| Frontend | Next.js 15 (App Router), TypeScript, TailwindCSS 4, TanStack Query, React Hook Form, Zustand |
| Hạ tầng | Docker Compose (PostgreSQL, Redis, MinIO) |
| Xác thực | JWT access token + refresh token xoay vòng, RBAC theo permission |

```
apps/
├── api/          NestJS REST API (cổng 4000, Swagger tại /docs)
│   ├── prisma/   schema, migrations, seed
│   └── src/
│       ├── common/     guards, decorators, permissions, pagination
│       ├── prisma/     PrismaService
│       └── modules/    auth, purchase-requests, rfq, suppliers, categories,
│                       comments, notifications, dashboard, audit, master-data
└── web/          Next.js frontend (cổng 3000)
    └── src/
        ├── app/(app)/  các trang sau khi đăng nhập
        ├── components/ app shell, dynamic form renderer, UI primitives
        ├── lib/        API client, kiểu dữ liệu, tiện ích
        └── store/      auth store (Zustand)
```

## Chạy dự án

Yêu cầu: Node.js 20+, PostgreSQL 16 (hoặc Docker).

### 1. Hạ tầng

```bash
cp .env.example .env
docker compose up -d          # PostgreSQL, Redis, MinIO
```

Nếu không dùng Docker, hãy tạo database PostgreSQL và cập nhật `DATABASE_URL`.

### 2. Backend

```bash
cd apps/api
npm install
cp ../../.env.example .env    # chỉnh DATABASE_URL nếu cần
npx prisma migrate deploy     # hoặc: npm run db:migrate
npm run db:seed
npm run start:dev             # http://localhost:4000, Swagger: /docs
```

### 3. Frontend

```bash
cd apps/web
npm install
echo 'NEXT_PUBLIC_API_URL=http://localhost:4000/api' > .env.local
npm run dev                   # http://localhost:3000
```

### Tài khoản demo

Sau khi chạy seed (mật khẩu mặc định `Admin@123`):

| Email | Vai trò |
| --- | --- |
| `admin@pms.local` | Super Admin |
| `buyer@pms.local` | Buyer |
| `user@pms.local` | End User |
| `manager@pms.local` | Department Manager |

Nhà cung cấp tự đăng ký tại `/register` và cần Procurement Manager duyệt trước
khi được mời tham gia RFQ.

## Quy trình đã triển khai

```
End User tạo PR (Draft)
   └─ điền form động theo lĩnh vực
        ↓ Submit
Buyer Review
   ├─ Approve            → PR Approved → tạo RFQ
   ├─ Need Clarification → End User bổ sung → Submit lại
   └─ Reject (bắt buộc nêu lý do)
        ↓
RFQ gửi tới nhiều nhà cung cấp đã được duyệt
        ↓
Nhà cung cấp gửi báo giá (đơn giá, lead time, payment term, incoterm, …)
        ↓
So sánh báo giá: tự động highlight giá thấp nhất, lead time ngắn nhất,
tính chênh lệch %, chọn nhà cung cấp trúng thầu
        ↓
Tạo Purchase Order từ RFQ đã chốt — dòng hàng và đơn giá lấy từ báo giá
trúng thầu, cộng thuế VAT
        ↓
Phát hành PO → Nhà cung cấp xác nhận → Hoàn tất
```

## Biểu mẫu động theo lĩnh vực

Mỗi lĩnh vực mua hàng (Chemical, Machine, Logistics, Service, …) có biểu mẫu
riêng, cấu hình tại `/categories` mà không cần sửa mã nguồn. Lưu biểu mẫu sẽ
phát hành một **phiên bản mới**; các yêu cầu đã tạo trước đó vẫn giữ nguyên nhãn
và cấu trúc trường tại thời điểm nhập liệu.

Seed sẵn 18 lĩnh vực, trong đó Chemical / Machine / Logistics / Service /
IT Equipment đã có biểu mẫu mẫu.

## Phân quyền

Quyền được biểu diễn bằng mã `<module>:<action>` (ví dụ `purchase_request:approve`),
gán cho role và giải quyết ở thời điểm request. Guard toàn cục kiểm tra JWT rồi
kiểm tra permission.

9 role hệ thống: Super Admin, Procurement Manager, Buyer, Department Manager,
End User, Supplier, Finance, QA, Warehouse.

Một số ràng buộc quan trọng:

- Người dùng không có `purchase_request:read_all` chỉ thấy yêu cầu của chính mình.
- Nhà cung cấp chỉ thấy RFQ mình được mời và **không bao giờ** thấy báo giá của
  đối thủ hay màn hình so sánh.
- Ghi chú nội bộ của buyer không hiển thị cho người tạo yêu cầu.
- Audit log chỉ ghi thêm, không có API sửa hoặc xóa.

## Kiểm thử nhanh

Với API đang chạy và đã seed dữ liệu:

```bash
npm run smoke-test
```

Script chạy toàn bộ luồng nghiệp vụ (tạo PR → review → duyệt → RFQ → báo giá →
so sánh → chọn NCC) và kiểm tra các ràng buộc phân quyền.

## API

Swagger UI: `http://localhost:4000/docs`

Các nhóm endpoint chính: `/auth`, `/purchase-requests`, `/rfqs`, `/suppliers`,
`/categories`, `/purchase-orders`, `/contracts`, `/certificates`,
`/supplier-performance`, `/reports`, `/ai`, `/notifications`, `/dashboard`,
`/audit-logs`, `/departments`, `/projects`, `/roles`, `/users`.

## Trạng thái theo lộ trình

**Phase 1 — đã triển khai**

- [x] Đăng ký / đăng nhập, JWT + refresh token, RBAC
- [x] Purchase Request + biểu mẫu động theo lĩnh vực
- [x] Buyer review (approve / reject / need clarification) + lịch sử phê duyệt
- [x] Bình luận giữa End User và Buyer (kèm ghi chú nội bộ)
- [x] Supplier portal: đăng ký, hồ sơ, chọn lĩnh vực, duyệt bởi buyer
- [x] RFQ: tạo từ PR đã duyệt, gửi nhiều nhà cung cấp
- [x] Báo giá và màn hình so sánh, chọn nhà cung cấp trúng thầu
- [x] Purchase Order: tạo từ RFQ đã chốt (hoặc trực tiếp từ PR đã duyệt),
      phát hành, NCC xác nhận, hoàn tất, hủy có lý do
- [x] Notification in-app (bản email được ghi log khi chưa cấu hình SMTP)
- [x] Dashboard: khối lượng công việc, spend, saving, top supplier, SLA
- [x] Audit log

**Phase 2 — đã triển khai**

- [x] Approval workflow nhiều cấp theo ngưỡng giá trị. Chuỗi duyệt được chốt
      tại thời điểm gửi nên thay đổi cấu hình về sau không làm lệch các yêu
      cầu đang chạy. Chỉ người giữ vai trò của cấp đang chờ mới duyệt được
- [x] Contract Management: theo dõi hiệu lực, tự chuyển
      ACTIVE → EXPIRING → EXPIRED, nhắc trước 90/60/30/15/7/1 ngày
- [x] Certificate Management: tương tự, gắn theo nhà cung cấp
- [x] Job nền quét hạn mỗi giờ, sinh thông báo, không gửi trùng
- [x] Supplier Performance: 5 tiêu chí có trọng số (giá 25%, chất lượng 30%,
      giao hàng 20%, phản hồi 10%, hợp tác 15%) trừ tỷ lệ khiếu nại, tự cập
      nhật điểm trung bình và xếp hạng
- [x] Reporting: 9 báo cáo, xuất Excel (.xlsx) và CSV (BOM UTF-8)

**Ngưỡng phê duyệt mặc định** (cấu hình trong bảng `approval_workflows`):

| Giá trị | Chuỗi duyệt |
| --- | --- |
| < 100 triệu | Buyer |
| 100–500 triệu | Department Manager → Buyer |
| > 500 triệu | Department Manager → Buyer → Finance → Director |

**Phase 3 — trợ lý AI đã triển khai**

Dùng Claude API (`claude-opus-5`) với structured outputs, nên kết quả trả về là
dữ liệu có cấu trúc để giao diện render trực tiếp, không phải văn bản tự do.

- [x] **Rà soát yêu cầu mua hàng** — chấm điểm đầy đủ thông tin, chỉ ra thiếu
      sót và rủi ro, gợi ý câu hỏi cần làm rõ với người yêu cầu
- [x] **Gợi ý nhà cung cấp** — xếp hạng NCC đã duyệt theo mức phù hợp, dựa trên
      lĩnh vực, lịch sử đánh giá, số lần trúng thầu và chứng chỉ
- [x] **Phân tích báo giá** — khuyến nghị theo tổng chi phí sở hữu thay vì chỉ
      giá thấp nhất, phát hiện bất thường, gợi ý điểm đàm phán
- [x] **Rà soát hợp đồng** — cảnh báo điều khoản bất lợi cho bên mua và điều
      khoản tiêu chuẩn còn thiếu
- [x] **Đọc báo giá PDF (OCR)** — trích xuất thành dữ liệu có cấu trúc, kèm mức
      độ tin cậy và cảnh báo chỗ đọc không chắc

**Bật tính năng AI:** thêm `ANTHROPIC_API_KEY` vào `apps/api/.env` (lấy tại
https://platform.claude.com) rồi khởi động lại API. Khi chưa có key, toàn bộ
giao diện AI tự ẩn và API trả `503` kèm hướng dẫn — phần còn lại của hệ thống
không bị ảnh hưởng.

**Phase 3 — chưa triển khai:** tích hợp Email/Microsoft Teams, API kết nối
ERP/SAP và phần mềm kế toán.

## Ghi chú triển khai

- Upload file: schema `attachments` hỗ trợ version control và phân loại tài
  liệu; endpoint upload lên S3/MinIO chưa được nối.
- Email: `NotificationsService.sendEmail` hiện ghi log thay vì gửi thật. Cấu hình
  SMTP trong `.env` và thay phần thân hàm này để bật gửi email.
- Reminder hợp đồng / chứng chỉ: bảng `reminder_queue` đã có; worker BullMQ chưa
  được nối.
