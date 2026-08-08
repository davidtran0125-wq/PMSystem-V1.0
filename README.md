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
tính chênh lệch %
        ↓
Trao thầu theo từng dòng hàng — một RFQ có thể chia cho nhiều nhà cung cấp,
mỗi dòng chỉ thuộc về một bên
        ↓
Mỗi nhà cung cấp trúng thầu sinh một Purchase Order riêng từ cùng yêu cầu mua,
dòng hàng và đơn giá lấy từ báo giá trúng thầu, cộng thuế VAT
        ↓
Phát hành PO → Nhà cung cấp xác nhận → Hoàn tất
```

## Danh mục vật tư

Mã vật tư là dữ liệu dùng chung cho yêu cầu mua hàng, báo giá và đơn hàng. Mọi
thay đổi lên danh mục — **tạo mã mới, điều chỉnh, ngừng dùng** — đều đi qua một
luồng đề xuất → admin duyệt, kể cả xóa: một mã đã nằm trong đơn hàng không được
biến mất mà không ai rà soát. Người đề xuất mà đã có quyền `material:approve`
thì thay đổi áp dụng ngay, nhưng vẫn ghi vào lịch sử để truy vết.

- Mã do người dùng đặt (`HC-NAOH-32`) hoặc để trống cho hệ thống tự cấp
  (`MAT-2026-00001`). Mã đã ban hành thì không sửa được, vì chứng từ cũ trỏ tới nó.
- Một mã chỉ có một đề xuất chờ duyệt tại một thời điểm, tránh hai người sửa chồng nhau.
- Ngừng dùng mã **chưa từng xuất hiện** ở đâu thì xóa hẳn; mã **đã dùng** chỉ
  chuyển sang trạng thái ngừng dùng và vẫn tra cứu được, có thể khôi phục lại.
- Mã đi theo dòng hàng từ yêu cầu mua → báo giá → đơn hàng, nên lịch sử giá của
  một mã vẫn liền mạch dù nhà cung cấp tự gõ lại tên hàng.

**Lịch sử đặt hàng** của từng mã cho biết số lần đặt, tổng sản lượng, giá bình
quân gia quyền theo sản lượng, khoảng giá cao–thấp, tổng hợp theo nhà cung cấp,
và mức lệch so với giá tham chiếu.

**Bắt buộc mã khi lập yêu cầu.** Lĩnh vực mua hàng có cờ `requiresMaterial`:
nhóm hàng hóa bắt buộc chọn mã cho từng dòng, nhóm dịch vụ thì không (mặc định
tắt cho Dịch vụ, Phần mềm, Logistics, Vận tải, Hải quan, Marketing). Bản nháp
chấp nhận mã đang chờ duyệt để người dùng chuẩn bị song song, nhưng **gửi duyệt
thì mã phải đã được ban hành**.

## Tài khoản người dùng

Quản trị viên tạo tài khoản tại `/users`: đặt email, mật khẩu ban đầu, phòng ban
và nhiều vai trò cùng lúc; khóa / mở khóa, đặt lại mật khẩu hộ, hoặc xóa mềm
(giữ lại lịch sử thao tác). Khóa tài khoản hay đổi mật khẩu đều thu hồi phiên
đăng nhập, nếu không người đó vẫn dùng được access token tới khi hết hạn.

Mỗi người tự quản lý tài khoản của mình tại `/account` — bấm vào tên ở chân
thanh bên: sửa họ tên, điện thoại, chức danh, ngôn ngữ; đổi mật khẩu (các thiết
bị khác bị đăng xuất, thiết bị hiện tại nhận cặp token mới nên không bị văng);
và nút đăng xuất.

## Đấu thầu kín

**Không ai xem được giá cho tới khi vòng chào giá khép lại** — kể cả người mua và
quản trị viên. Biết giá sớm là biết ai đang rẻ nhất, và chỉ cần một câu gợi ý là
cuộc thầu mất ý nghĩa.

Niêm phong tự mở khi xảy ra một trong ba điều, tuỳ điều nào đến trước:

1. Người mua bấm **Đóng nhận báo giá**
2. Quá hạn nộp ghi trên RFQ
3. Mọi nhà cung cấp được mời đều đã trả lời — nộp giá hoặc từ chối

Điều kiện thứ ba tránh việc cả cuộc thầu bị treo vì một bên không hồi âm, mà vẫn
không cho phép nhìn trộm khi còn người chưa nộp.

Trong lúc còn niêm phong, người mua vẫn theo dõi được tiến độ: ai đã nộp, nộp lúc
nào, bao nhiêu dòng hàng, có mấy tệp đính kèm — chỉ không thấy con số nào. Không
trao thầu được, và trợ lý AI cũng từ chối phân tích báo giá, vì đó sẽ là đường
vòng để xem giá sớm.

Nhà cung cấp luôn xem được báo giá của chính mình.

## Trao thầu theo dòng hàng và nhiều đơn hàng từ một yêu cầu

Một báo giá gồm nhiều dòng hàng, và nhiều nhà cung cấp có thể cùng trúng thầu
trên cùng một RFQ — mỗi bên thắng ở những dòng khác nhau. Màn hình so sánh có
bảng chia thầu: mỗi dòng hàng chọn một nhà cung cấp, mặc định gợi ý bên chào
giá thấp nhất cho dòng đó.

Hệ thống chặn việc trao cùng một dòng hàng cho hai nhà cung cấp. Sau khi chốt,
mỗi nhà cung cấp trúng thầu sinh một đơn hàng riêng từ cùng yêu cầu mua, chỉ
gồm những dòng bên đó thắng. Màn hình tạo đơn hàng liệt kê đủ các bên trúng
thầu, đánh dấu bên nào đã có đơn, và tạo nhiều đơn trong một lần bấm.

## Tài liệu đính kèm

Hợp đồng, chứng chỉ và đơn hàng đều có khung tải file (kéo thả hoặc chọn từ
máy). Giới hạn 25 MB, chấp nhận PDF / Word / Excel / ảnh / ZIP. Tải lên file
**trùng tên trên cùng đối tượng sẽ tạo phiên bản mới** và giữ nguyên bản cũ,
liên kết ngược qua `parentId`.

Khóa lưu trữ là UUID không đoán được, tên file gốc chỉ nằm trong cơ sở dữ liệu,
và đường dẫn được kiểm tra để không thoát khỏi thư mục gốc.

## Xuất PDF đơn hàng

Nút **Tải PDF** trên chi tiết đơn hàng (cả phía mua và phía nhà cung cấp) sinh
đơn đặt hàng A4: thông tin công ty, hai bên, bảng dòng hàng, thuế, điều khoản
và phần chữ ký. Tài liệu nhúng font Roboto nên tiếng Việt có dấu hiển thị đúng
— font mặc định của PDFKit là WinAnsi và sẽ nuốt dấu. Nhà cung cấp chỉ tải được
đơn hàng của chính mình và chỉ sau khi đơn đã phát hành.

## Thiết lập

Trang `/settings` (cần quyền `setting:write`) gồm ba phần:

- **Thông tin công ty** — tên, MST, địa chỉ, liên hệ, người đại diện, tài khoản
  ngân hàng, ghi chú cuối đơn. Đây chính là phần in trên PDF đơn hàng.
- **Tiêu chí đánh giá nhà cung cấp** — thêm / sửa / sắp xếp / xóa tiêu chí, đặt
  trọng số và thang điểm riêng cho từng tiêu chí. Tiêu chí đã được dùng trong
  đánh giá cũ thì chỉ bị tắt chứ không xóa hẳn, để dữ liệu lịch sử không mất
  ngữ cảnh.
- **Luồng duyệt & hạn mức** — xem mục dưới.

### Luồng duyệt & hạn mức tự cấu hình

Admin tự dựng chuỗi duyệt cho **yêu cầu mua hàng** và **đơn hàng** mà không cần
sửa mã nguồn:

- Mỗi luồng là một **khoảng giá trị** (từ — đến, VND) cộng danh sách **cấp
  duyệt** theo đúng thứ tự; mỗi cấp gắn với một vai trò và hạn xử lý (giờ).
- Khoảng tính từ giá trị đầu (bao gồm) đến giá trị cuối (không bao gồm), nên các
  khoảng nối tiếp nhau không chồng lấn. Bỏ trống nghĩa là không giới hạn.
- Thu hẹp thêm theo **lĩnh vực** và **bộ phận**. Nhiều luồng cùng khớp thì luồng
  có **độ ưu tiên** cao hơn thắng; hòa thì luồng cụ thể hơn thắng.
- **Thử một số tiền** ngay trên trang để xem hồ sơ ở mức đó sẽ đi qua những cấp
  nào — cách nhanh nhất để phát hiện khoảng bị hở hoặc chồng nhau.

Sửa luồng cập nhật tại chỗ theo thứ tự cấp nên hồ sơ đang chạy dở vẫn trỏ đúng
cấp của mình; cấp nào đã phát sinh lịch sử duyệt thì không xóa được, và luồng
còn hồ sơ đang chạy chỉ tắt được chứ không xóa.

API: `GET|POST /approval-workflows`, `PUT|DELETE /approval-workflows/:id`,
`POST /approval-workflows/preview`.

## Lịch sử giá khi ra quyết định

Người duyệt yêu cầu mua, người so sánh báo giá và người tạo đơn hàng đều nhìn
thấy một biểu tượng lịch sử ở cuối mỗi dòng hàng có mã vật tư. Bấm vào mở popup
gồm giá thấp nhất / bình quân / cao nhất, lần mua gần nhất kèm nhà cung cấp và
mã đơn, mức chênh so với giá đang xét, và 6 đơn gần nhất.

Toàn bộ dòng hàng của một màn hình chỉ tốn **một** request
(`GET /materials/price-summary?ids=…`); danh sách đơn chi tiết chỉ tải khi popup
được mở. Nhà cung cấp **không** truy cập được dữ liệu này — giá đối thủ từng bán
là thông tin thương mại nhạy cảm.

Trang Tổng quan có thêm khối **chênh lệch dự toán và giá chốt**: so giá trị ghi
trên yêu cầu mua với giá thật trên đơn hàng, cộng dồn theo từng yêu cầu (một yêu
cầu chia thầu nhiều nhà cung cấp vẫn tính là một), kèm danh sách tiết kiệm nhiều
nhất và vượt dự toán nhiều nhất.

## Giao diện

- **Header cố định** với ảnh đại diện và menu tài khoản ở góc phải; thanh điều
  hướng bên trái đứng yên, phần danh sách bên trong tự cuộn.
- **Nút xác nhận hai bước** cho mọi thao tác đổi trạng thái hoặc xóa: bấm lần
  đầu chỉ hiện câu hỏi, phải bấm tiếp mới chạy, tự hủy sau 6 giây.
- **Ngăn thu gọn được** trên các trang chi tiết, trạng thái gập được nhớ lại.
- **Phân trang** trên mọi danh sách dài, mặc định 10 dòng mỗi trang, đổi được
  10/20/50/100.
- **Dải trạng thái kèm số lượng** thay cho ô chọn trạng thái ở mọi danh sách có
  trạng thái. Bấm một trạng thái để lọc; con số là tổng trên toàn bộ dữ liệu
  khớp bộ lọc hiện hành **trừ chính bộ lọc trạng thái**, nên không nhảy khi bấm
  qua lại. Áp dụng cho: Yêu cầu mua hàng, Chờ tôi duyệt, RFQ, Đơn hàng, Nhà
  cung cấp, Danh mục vật tư, Đề xuất thay đổi mã, Hợp đồng, Chứng chỉ, Người
  dùng, và cả ba màn hình của cổng nhà cung cấp.

  | Màn hình | Endpoint đếm |
  | --- | --- |
  | Yêu cầu mua hàng | `GET /purchase-requests/status-counts` |
  | Chờ tôi duyệt | trường `counts` trong `GET /purchase-requests/pending-approval` |
  | RFQ | `GET /rfqs/status-counts` |
  | Báo giá của tôi (NCC) | `GET /rfqs/my-quotations/status-counts` |
  | Đơn hàng | `GET /purchase-orders/status-counts` |
  | Nhà cung cấp | `GET /suppliers/status-counts` |
  | Danh mục vật tư | `GET /materials/status-counts` |
  | Đề xuất thay đổi mã | `GET /materials/change-requests/status-counts` |
  | Hợp đồng | `GET /contracts/status-counts` |
  | Chứng chỉ | `GET /certificates/status-counts` |
  | Người dùng | `GET /users/status-counts` |

  Tất cả dùng chung `countByStatus()` trong `apps/api/src/common/status-counts.ts`
  và component `StatusFilterBar`, nên mọi trạng thái của enum đều xuất hiện kể
  cả khi đang bằng 0 — người dùng thấy được là "không có", chứ không phải "thiếu".
  Phạm vi dữ liệu vẫn bị chặn như danh sách: nhà cung cấp không đếm được hồ sơ
  nháp của bên mua.

## Biểu mẫu động theo lĩnh vực

Mỗi lĩnh vực mua hàng (Chemical, Machine, Logistics, Service, …) có biểu mẫu
riêng, cấu hình tại `/categories` mà không cần sửa mã nguồn. Lưu biểu mẫu sẽ
phát hành một **phiên bản mới**; các yêu cầu đã tạo trước đó vẫn giữ nguyên nhãn
và cấu trúc trường tại thời điểm nhập liệu.

Seed sẵn 18 lĩnh vực, trong đó Chemical / Machine / Logistics / Service /
IT Equipment đã có biểu mẫu mẫu.

Trang `/categories` còn cho **xóa những biểu mẫu không cần thiết**: liệt kê mọi
phiên bản của lĩnh vực (số trường, ngày phát hành, phiên bản nào đang dùng) và
xóa từng phiên bản một. Nếu lỡ xóa đúng phiên bản đang dùng thì phiên bản còn
lại mới nhất tự được đưa lên thay, để lĩnh vực không âm thầm mất biểu mẫu. Xóa
được cả **lĩnh vực mua hàng** khi chưa có yêu cầu mua hàng nào dùng tới nó.

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

## Clip demo

```bash
npm run demo-clip
```

Quay lại toàn bộ nghiệp vụ bằng Chrome thật (cần API và web đang chạy). Kết quả:

- **`demo/pms-demo.mp4`** — bản để gửi đi, khoảng 10 phút / 55 MB / 1280×800.
  Mở được ở mọi nơi: QuickTime, PowerPoint, Zalo, iPhone, Google Drive.
- `demo/pms-demo.webm` — bản gốc Playwright quay ra (37 MB, 1440×900), mở bằng
  trình duyệt.
- `demo/kich-ban.md` — lời thuyết minh khớp theo từng mốc thời gian, kèm gợi ý
  nên nhấn vào đâu khi trình bày.

Clip đi qua 12 bước, mỗi thẻ tiêu đề và mỗi chú thích dừng 5 giây để người xem
kịp đọc. Trước khi quay, script nạp trước toàn bộ trang bằng một phiên riêng —
Next ở chế độ dev biên dịch route lúc truy cập lần đầu, để việc đó xảy ra giữa
buổi quay thì clip đứng hình rất lâu.

**Về việc xuất MP4:** Playwright chỉ quay được WebM, và bản ffmpeg đi kèm nó chỉ
mã hoá được VP8. Script tách khung hình bằng ffmpeg rồi ghép thành H.264 bằng
AVFoundation của macOS (`scripts/webm-to-mp4.swift`), nên không cần cài thêm gì.
Trên Linux hoặc Windows bước này tự bỏ qua, file WebM vẫn dùng được.

## Kiểm thử nhanh

Với API đang chạy và đã seed dữ liệu:

```bash
npm run smoke-test      # 54 kiểm tra: luồng nghiệp vụ chính + phân quyền
npm run features-test   # 52 kiểm tra: thiết lập, tiêu chí, file, chia thầu, PDF
npm run materials-test  # 63 kiểm tra: danh mục vật tư, duyệt mã, lịch sử giá
npm run users-test      # 45 kiểm tra: tài khoản, hồ sơ, cấu hình lĩnh vực
npm run orders-test     # 55 kiểm tra: đấu thầu kín, duyệt đơn theo cấp, sửa đơn
npm run status-test     # 64 kiểm tra: bộ đếm trạng thái, biểu mẫu, luồng duyệt
npm run test:all        # chạy tất cả
npm run perf-bench      # đo thời gian đáp của 18 endpoint hay dùng nhất
```

`smoke-test` chạy toàn bộ luồng nghiệp vụ (tạo PR → duyệt nhiều cấp → RFQ →
báo giá → so sánh → trao thầu) và kiểm tra các ràng buộc phân quyền.

`features-test` tự dựng một RFQ hai dòng hàng với hai báo giá rồi kiểm tra
thiết lập công ty, tiêu chí đánh giá tự cấu hình, chấm điểm theo tiêu chí động,
tải file lên và phiên bản hóa, chia thầu theo dòng hàng, một yêu cầu mua sinh
nhiều đơn hàng, và xuất PDF.

## API

Swagger UI: `http://localhost:4000/docs`

Các nhóm endpoint chính: `/auth`, `/purchase-requests`, `/rfqs`, `/suppliers`,
`/categories`, `/purchase-orders`, `/contracts`, `/certificates`,
`/supplier-performance`, `/reports`, `/ai`, `/attachments`, `/settings`,
`/materials`,
`/notifications`, `/dashboard`, `/audit-logs`, `/departments`, `/projects`,
`/roles`, `/users`.

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
- [x] Supplier Performance: bộ tiêu chí **tự cấu hình** (trọng số, thang điểm,
      thứ tự), mỗi tiêu chí có ô nhận xét riêng; điểm được chuẩn hóa về thang
      100 rồi trừ tỷ lệ khiếu nại, tự cập nhật điểm trung bình và xếp hạng.
      Seed sẵn 5 tiêu chí: giá 25, chất lượng 30, giao hàng 20, phản hồi 10,
      hợp tác 15
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

## Hệ thống thiết kế

Toàn bộ giao diện dùng một bộ quy ước, khai báo ở `apps/web/src/app/globals.css`
và `apps/web/src/components/ui/index.tsx`.

**Chữ** — một họ chữ duy nhất (Geist) và sáu bậc cỡ. Cỡ nền của cả ứng dụng là
14px: đây là phần mềm nghiệp vụ nhiều bảng biểu, 16px chỉ làm trang dài ra chứ
không dễ đọc hơn.

| Bậc | Cỡ | Dùng cho |
| --- | --- | --- |
| `text-xs` | 12px | Nhãn cột, chú thích, siêu dữ liệu |
| `text-sm` | 14px | Mặc định — mọi nội dung trong bảng và biểu mẫu |
| `text-base` | 16px | Đoạn văn cần nhấn |
| `text-lg` | 17px | Tiêu đề thẻ |
| `text-2xl` | 24px | Tiêu đề trang |
| `text-3xl` | 30px | Con số lớn trên thẻ chỉ số ở Tổng quan |

Không dùng cỡ tự đặt kiểu `text-[11px]`. Chữ số trong mọi bảng tự động thẳng cột
(`font-variant-numeric: tabular-nums`).

**Bảng** — hai lớp `.cell` và `.cell-head` quyết định toàn bộ phần đệm và kiểu
tiêu đề cột. Trước đây mỗi trang tự đặt padding riêng, tổng cộng sáu kiểu khác
nhau nên bảng ở mỗi màn hình lại cao thấp một khác. Dùng `DataTable`, `Th`, `Td`,
`Tr` khi dựng bảng mới.

**Màu** — nền ngả xanh nhạt để thẻ trắng nổi lên mà không cần viền đậm; màu chính
là xanh mòng két. Mục đang chọn ở thanh bên dùng nền nhạt kèm vạch dọc thay vì
khối màu đặc. Mọi màu khai báo bằng biến CSS nên chế độ tối chỉ là một bộ giá trị
khác, không phải một bộ lớp riêng.

## Hiệu năng

Số đo trên máy phát triển với dữ liệu demo (khoảng 80 yêu cầu, 60 đơn hàng):

| | Chế độ dev | Bản build sẵn |
| --- | --- | --- |
| Tải trang đầu | ~1,3 s | ~0,64 s |
| Chuyển trang trong ứng dụng | — | 50–150 ms |
| Thời gian đáp của API | 4–8 ms | 4–8 ms |

Chế độ dev chậm gấp đôi vì Next biên dịch từng route lúc truy cập lần đầu. Muốn
đánh giá tốc độ thật thì chạy `npm run build && npm start` trong `apps/web`.

### Thử tải một triệu dòng

Đã nạp **1.000.000 yêu cầu mua hàng + 2.000.000 dòng hàng** (CSDL 1,3 GB) rồi đo
lại. Bốn chỗ hỏng hẳn, đã sửa và đo lại từng chỗ:

| Phép đo | Trước | Sau | Cách sửa |
| --- | ---: | ---: | --- |
| Danh sách yêu cầu, trang 1 | 1.872 ms | **391 ms** | bỏ `_count`, thêm chỉ mục sắp xếp |
| Danh sách yêu cầu, trang 1000 | 2.357 ms | **263 ms** | như trên |
| Lọc theo trạng thái | 1.068 ms | **83 ms** | chỉ mục `(deletedAt, status, createdAt)` |
| Tìm kiếm | 1.909 ms | **435 ms** | chỉ mục GIN trigram |
| Chờ tôi duyệt | 398 ms | **287 ms** | hưởng lợi từ chỉ mục sắp xếp |
| Tổng quan | 482 ms | **85 ms** | như trên |
| SLA | 1.671 ms | **146 ms** | tính trung vị bằng SQL thay vì JS |
| Đếm theo trạng thái | — | **44 ms** | `GROUP BY` một lượt, vốn đã đúng cách |
| Chi tiết một yêu cầu | 9 ms | **9 ms** | không đổi, vốn đi theo khóa chính |

Bốn nguyên nhân, theo thứ tự mức độ:

1. **`_count` trong `include` của Prisma** — nó dịch thành `GROUP BY` trên
   **toàn bộ** bảng con rồi mới `LEFT JOIN`, tức gom nhóm cả hai triệu dòng hàng
   để lấy con số cho mười dòng hiển thị. Riêng phần này tốn ~2 giây. Nay đếm
   theo đúng mười id của trang (`withChildCounts`), phản hồi giữ nguyên hình dạng.
2. **Thiếu chỉ mục cho cột sắp xếp mặc định** — mọi danh sách sắp theo
   `createdAt DESC` nhưng cột này không có chỉ mục, nên mỗi lần mở trang một là
   một lần sắp xếp toàn bảng. Thêm `(deletedAt, createdAt)` và
   `(deletedAt, status, createdAt)`.
3. **Ô tìm kiếm dùng `ILIKE '%…%'`** — dấu `%` đứng đầu làm btree vô dụng. Thêm
   chỉ mục **GIN trigram**. Lưu ý: chỉ mục chỉ có tác dụng khi **mọi** nhánh của
   mệnh đề `OR` đều được đánh chỉ mục — thiếu `description` là cả câu lệnh quay
   về quét tuần tự.
4. **SLA tính bằng JavaScript** — kéo 333.000 dòng về Node rồi sắp xếp để lấy
   trung vị. Nay dùng `percentile_cont` trong SQL, trả về đúng ba con số.

Ngoài ra `docker-compose.yml` đã chỉnh tham số PostgreSQL: `/dev/shm` mặc định
của Docker chỉ 64 MB, không đủ cho truy vấn song song ở bảng cỡ triệu dòng và
gây lỗi *"could not resize shared memory segment"*; `shared_buffers` 128 MB cũng
quá nhỏ so với dữ liệu vài GB.

**Hai chỗ vẫn chậm, và lý do chấp nhận được:**

- *Trang cuối cùng* (trang 100.000) mất ~730 ms. Phân trang kiểu `OFFSET` buộc
  Postgres bỏ qua từng dòng một. Trang 1–1000 đều dưới 300 ms; nhảy tới trang
  cuối của một triệu dòng không phải thao tác có thật.
- *Tìm từ khóa trùng 20% số dòng* ("hoa chat", 200.031 kết quả) mất ~435 ms.
  Chỉ mục vẫn được dùng, nhưng 200.000 dòng phải được sắp xếp để lấy 10 dòng
  đầu. Từ khóa cụ thể hơn ("PERF-00999", 1.000 kết quả) chỉ mất ~90 ms.

Sinh và xóa dữ liệu thử:

```bash
docker exec -i pms-postgres psql -U pms -d pms -v rows=1000000 < scripts/perf-data.sql
node scripts/perf-bench.mjs          # RUNS=15 để bớt nhiễu
docker exec -i pms-postgres psql -U pms -d pms < scripts/perf-clean.sql
```

Mọi bản ghi sinh ra đều mang mã tiền tố `PR-PERF-` nên `perf-clean.sql` xóa lại
sạch mà không đụng vào dữ liệu thật.

Những chỗ đã xử lý trước để không thành nút thắt khi dữ liệu lớn lên:

- **Chỉ mục cho `materialId`** trên dòng hàng của yêu cầu, báo giá và đơn hàng.
  Lịch sử giá chạy trên mọi màn duyệt và lọc theo cột này; Postgres không tự
  đánh chỉ mục cho khóa ngoại nên trước đó là quét toàn bảng.
- **Chỉ mục cho `currentStepId`** của đơn hàng, dùng cho danh sách "đơn chờ tôi duyệt".
- **Chỉ mục cho khóa ngoại của tài liệu đính kèm** (hợp đồng, chứng chỉ, đơn hàng).
- **Gộp ghi thông báo** thành một lệnh `createMany`. Một RFQ gửi cho hàng chục
  nhà cung cấp trước đây là từng ấy lượt đi lại với database.
- **Tra giá hàng loạt**: một màn hình nhiều dòng hàng chỉ tốn một request
  `/materials/price-summary`, chi tiết chỉ tải khi mở popup.
- **Form chấm điểm** theo dõi đúng hai trường ảnh hưởng tới điểm thay vì cả
  form, nên gõ nhận xét không render lại toàn trang.
- **Dữ liệu tham chiếu** (lĩnh vực, vai trò, phòng ban, danh mục vật tư) giữ
  trong bộ nhớ 10 phút thay vì 30 giây.

## Đưa lên mạng

Tên miền: **pmsystem.io.vn**. Cách triển khai đang dùng là **Railway**.

- [HUONG-DAN-RAILWAY.md](HUONG-DAN-RAILWAY.md) — từng bước, có kiểm chứng sau
  mỗi bước và bảng tra lỗi. Đọc cái này khi thực sự triển khai.
- [HUONG-DAN-TRIEN-KHAI.md](HUONG-DAN-TRIEN-KHAI.md) — so sánh các phương án và
  cách chạy trên VPS riêng.

Các file phục vụ triển khai, đều đã build thử và chạy thật:

| File | Vai trò |
| --- | --- |
| `apps/api/Dockerfile` | Ảnh API. Tự chạy `prisma migrate deploy`, đã kèm font tiếng Việt cho PDF |
| `apps/web/Dockerfile` | Ảnh web, bản `standalone` của Next. Dừng build nếu thiếu `NEXT_PUBLIC_API_URL` |
| `apps/api/railway.json`, `apps/web/railway.json` | Khai báo builder và healthcheck cho Railway |
| `docker-compose.prod.yml` + `Caddyfile` | Phương án VPS riêng, HTTPS tự động |
| `.github/workflows/ci.yml` | Gác cổng trước khi Railway deploy |
| `.env.production.example` | Mẫu biến môi trường (`.env.production` đã nằm trong `.gitignore`) |

**Ai được tự đăng ký.** Chỉ nhà cung cấp — `POST /auth/register/supplier`, hồ sơ
vào trạng thái chờ bộ phận mua hàng duyệt. Tài khoản nhân viên do quản trị viên
tạo trong mục **Người dùng**. Trước đây có thêm `POST /auth/register` mở công
khai, nghĩa là bất kỳ ai trên internet cũng tạo được tài khoản đọc được danh mục
vật tư, cơ cấu phòng ban và đẩy yêu cầu mua hàng vào hàng chờ duyệt.

**Tạo tài khoản quản trị thật** (không dùng tài khoản demo của seed):

```bash
cd apps/api && npm run create-admin
npm run create-admin -- --disable-demo     # khóa 9 tài khoản demo
```

Mật khẩu được hỏi trực tiếp, không hiện lên màn hình và không nhận qua tham số
dòng lệnh. Chạy trên Railway bằng `railway run npm run create-admin`.

`GET /api/health` là endpoint công khai để nền tảng kiểm tra sức khỏe: nó thật
sự chạy một truy vấn tới database, vì tiến trình còn sống mà mất kết nối
database thì vẫn là hỏng với người dùng.

### Deploy tự động từ GitHub

Repo: `github.com/davidtran0125-wq/PMSystem-V1.0`. Railway nối thẳng vào repo,
**push lên `main` là deploy**. Không có bước bấm tay, nên `main` phải luôn chạy
được — `.github/workflows/ci.yml` lo phần đó với ba job:

| Job | Nội dung |
| --- | --- |
| **API** | Postgres tạm → migration → lint → kiểm tra kiểu → build → seed → khởi động API → chạy cả 333 kiểm thử |
| **Web** | Kiểm tra kiểu, lint, build |
| **Docker** | Dựng đúng hai ảnh Railway sẽ dựng, và xác nhận `NEXT_PUBLIC_API_URL` thật sự vào được bundle gửi xuống trình duyệt |

Job Docker chỉ chạy trên `main`; pull request đã có hai job kia gác.

Nhớ đặt **Watch Paths** trong Railway (`apps/api/**` cho service api,
`apps/web/**` cho web) — nếu không, sửa một dòng CSS cũng làm API khởi động lại.

## Ghi chú triển khai

- Upload file: đã chạy với ổ đĩa cục bộ (`LOCAL_STORAGE_PATH`, mặc định
  `apps/api/storage`). Driver S3/MinIO chưa được nối — các biến `S3_*` trong
  `.env.example` mới là chỗ dành sẵn; thay `StorageService` là đủ, phần còn lại
  không phụ thuộc vào nơi lưu.
- Email: `NotificationsService.sendEmail` hiện ghi log thay vì gửi thật. Cấu hình
  SMTP trong `.env` và thay phần thân hàm này để bật gửi email.
- Reminder hợp đồng / chứng chỉ: bảng `reminder_queue` đã có; worker BullMQ chưa
  được nối.
