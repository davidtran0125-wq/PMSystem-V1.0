# Hướng dẫn chạy dự án trong Visual Studio Code

## Chuẩn bị

Cài 2 thứ này trước (nếu máy chưa có):

| Phần mềm | Link tải | Ghi chú |
| --- | --- | --- |
| Node.js 20 trở lên | https://nodejs.org | Chọn bản **LTS** |
| Docker Desktop | https://docker.com/products/docker-desktop | Dùng để chạy PostgreSQL |

Kiểm tra sau khi cài, mở Terminal trong VS Code (menu **Terminal → New Terminal**):

```bash
node -v      # phải ra v20.x hoặc cao hơn
docker -v    # phải ra thông tin Docker
```

## Mở dự án

1. Giải nén file ZIP
2. Mở VS Code → **File → Open Folder** → chọn thư mục vừa giải nén
3. VS Code sẽ hiện thông báo gợi ý cài extension → bấm **Install All**

## Chạy lần đầu

Có 2 cách, chọn 1.

### Cách A — Dùng menu VS Code (dễ hơn)

> **Quan trọng:** chạy đủ và đúng thứ tự từ bước 1. Bỏ qua bước tạo file cấu
> hình sẽ dẫn tới lỗi không đăng nhập được, vì database chưa có tài khoản nào.

Nhấn `Ctrl+Shift+P` (Mac: `Cmd+Shift+P`) → gõ `Run Task` → chọn **Tasks: Run Task**, rồi chạy lần lượt:

1. **1. Tạo file cấu hình (.env)** — vài giây
2. **2. Cài đặt thư viện** — chờ khoảng 2–3 phút
3. **3. Khởi động database (Docker)** — chờ khoảng 30 giây
4. **4. Tạo bảng và dữ liệu mẫu** — bước này tạo các tài khoản đăng nhập
5. **5. Chạy API**
6. **6. Chạy Web** (mở Terminal mới, đừng tắt cái đang chạy API)

### Cách B — Gõ lệnh trong Terminal

```bash
# 1. Tạo file cấu hình
npm run setup

# 2. Cài thư viện
npm install --prefix apps/api
npm install --prefix apps/web

# 3. Khởi động database
docker compose up -d

# 4. Tạo bảng + dữ liệu mẫu (bước này tạo tài khoản đăng nhập)
cd apps/api
npx prisma generate
npx prisma migrate deploy
npm run db:seed

# 5. Chạy API (giữ terminal này)
npm run start:dev
```

Mở **Terminal mới** rồi chạy web:

```bash
cd apps/web
npm run dev
```

## Truy cập

| Địa chỉ | Nội dung |
| --- | --- |
| http://localhost:3000 | Giao diện chính |
| http://localhost:4000/docs | Tài liệu API (Swagger) |

## Tài khoản đăng nhập

Mật khẩu chung: `Admin@123`

| Email | Vai trò | Xem được gì |
| --- | --- | --- |
| `buyer@pms.local` | Buyer | Duyệt yêu cầu, tạo RFQ, so sánh báo giá |
| `user@pms.local` | End User | Tạo yêu cầu mua hàng |
| `admin@pms.local` | Super Admin | Toàn quyền, duyệt nhà cung cấp |
| `manager@pms.local` | Department Manager | Xem yêu cầu của bộ phận |

### Tài khoản nhà cung cấp

Cùng mật khẩu `Admin@123`:

| Email | Công ty | Lĩnh vực |
| --- | --- | --- |
| `ncc-a@pms.local` | Công ty TNHH Hóa chất Miền Nam | Chemical, Raw Material |
| `ncc-b@pms.local` | Công ty CP Thiết bị Công nghiệp Việt | Machine, Spare Part |

Cả hai đã được duyệt sẵn nên nhận được RFQ ngay.

Muốn thử luồng duyệt hồ sơ: đăng ký nhà cung cấp mới tại
http://localhost:3000/register (chọn tab **Nhà cung cấp**), rồi đăng nhập
`admin@pms.local` → mục **Nhà cung cấp** để duyệt.

## Thử luồng đầy đủ

1. Đăng nhập `user@pms.local` → **Yêu cầu mua hàng** → **Tạo yêu cầu**
   Chọn lĩnh vực (ví dụ *Hóa chất*) — biểu mẫu riêng của lĩnh vực sẽ tự hiện ra
2. Điền hàng hóa, bấm **Gửi duyệt**
3. Đăng xuất, đăng nhập `buyer@pms.local` → mở yêu cầu đó → **Duyệt**
4. Bấm **Tạo RFQ** → chọn nhà cung cấp → **Tạo và gửi ngay**
5. Đăng nhập bằng tài khoản nhà cung cấp → gửi báo giá
6. Quay lại `buyer@pms.local` → **RFQ & Báo giá** → mở RFQ → xem bảng so sánh
   (giá thấp nhất và thời gian giao ngắn nhất được tô xanh) → **Chọn** nhà cung cấp
7. Vẫn ở trang RFQ, bấm **Tạo đơn hàng** → nhập thuế VAT, ngày giao, địa chỉ →
   **Tạo đơn hàng (nháp)** → **Phát hành**
8. Đăng nhập lại tài khoản nhà cung cấp → **Đơn hàng** → mở đơn →
   **Xác nhận đơn hàng**
9. Về `buyer@pms.local` → **Đơn hàng** → **Hoàn tất**

### Thử duyệt nhiều cấp (Phase 2)

Tạo yêu cầu có giá trị **trên 500 triệu** → hệ thống tự áp chuỗi 4 cấp:
Department Manager → Buyer → Finance → Director.

Trang chi tiết yêu cầu hiện khối **Tiến trình duyệt** đánh dấu cấp đang chờ.
Mỗi người chỉ duyệt được đúng cấp của mình; vào menu **Chờ tôi duyệt** để xem
các yêu cầu đang đợi mình.

Tài khoản cho 2 cấp cuối (mật khẩu `Admin@123`):

| Email | Vai trò |
| --- | --- |
| `finance@pms.local` | Finance |
| `director@pms.local` | Procurement Manager (Director) |

## Bật trợ lý AI (tùy chọn)

Các tính năng AI cần một API key của Anthropic. Không có key thì hệ thống vẫn
chạy đầy đủ, chỉ ẩn phần AI đi.

1. Lấy key tại https://platform.claude.com
2. Mở `apps/api/.env`, điền vào dòng cuối:

```
ANTHROPIC_API_KEY=sk-ant-...
```

3. Khởi động lại API (`Ctrl+C` rồi `npm run start:dev` trong `apps/api`)

Sau khi bật, các nút AI xuất hiện ở:

| Nơi | Tính năng |
| --- | --- |
| Chi tiết yêu cầu mua hàng | Rà soát thiếu sót và rủi ro |
| Chi tiết yêu cầu đã duyệt | Gợi ý nhà cung cấp nên mời |
| Chi tiết RFQ (từ 2 báo giá) | Phân tích và khuyến nghị báo giá |
| Danh sách hợp đồng | Rà soát rủi ro điều khoản |
| Menu **Đọc báo giá PDF** | Trích xuất báo giá từ file PDF |

> Mỗi lần gọi AI mất khoảng 15–60 giây và có phát sinh chi phí theo mức giá của
> Anthropic. Chỉ tài khoản có quyền `ai:use` (Buyer, Admin) mới dùng được.

## Xem dữ liệu trong database

Nhấn `Ctrl+Shift+P` → **Tasks: Run Task** → **Xem database (Prisma Studio)**,
rồi mở http://localhost:5555

## Không đăng nhập được? Chạy lệnh kiểm tra

```bash
npm run doctor
```

(hoặc `Ctrl+Shift+P` → **Tasks: Run Task** → **🔍 Kiểm tra lỗi cài đặt**)

Lệnh này kiểm tra lần lượt: Node/Docker, file cấu hình, thư viện, kết nối
database, số tài khoản đã tạo, và hai server có đang chạy không — rồi liệt kê
đúng những lệnh cần chạy để sửa.

Nguyên nhân phổ biến nhất là **chưa chạy bước tạo dữ liệu mẫu**, nên database
chưa có tài khoản nào. Sửa bằng:

```bash
cd apps/api
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

Chạy xong phải thấy dòng `Seed completed`.

## Lỗi thường gặp

| Lỗi | Cách xử lý |
| --- | --- |
| Đăng nhập báo *Invalid credentials* | Chưa chạy `npm run db:seed`. Xem mục trên |
| `@prisma/client did not initialize` | Chạy trong `apps/api`: `npx prisma generate` |
| `ECONNREFUSED ... 5432` | Docker chưa chạy. Mở Docker Desktop rồi chạy lại `docker compose up -d` |
| `Port 3000 already in use` | Đang có ứng dụng khác dùng cổng 3000. Tắt nó, hoặc chạy `npm run dev -- -p 3001` |
| `Can't reach database server` | Chờ thêm 30 giây cho PostgreSQL khởi động xong rồi thử lại |
| Trang web báo lỗi kết nối API | Kiểm tra API còn chạy không, và file `apps/web/.env.local` có đúng nội dung không |
| `prisma: command not found` | Chưa cài thư viện. Chạy lại `npm install --prefix apps/api` |

## Dừng dự án

- Tắt API và Web: nhấn `Ctrl+C` trong từng Terminal
- Tắt database: `docker compose down`
- Xóa luôn dữ liệu database: `docker compose down -v`

---

Chi tiết kiến trúc, phân quyền và trạng thái từng phần nằm trong `README.md`.
