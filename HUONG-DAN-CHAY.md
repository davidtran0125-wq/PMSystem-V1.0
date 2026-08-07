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

Trang đăng nhập liệt kê sẵn toàn bộ tài khoản demo kèm vai trò và mô tả — bấm
vào một dòng là điền luôn email và mật khẩu, khỏi phải mở tài liệu này ra tra.

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
   (giá thấp nhất và thời gian giao ngắn nhất được tô xanh)
7. Kéo xuống bảng **Trao thầu theo dòng hàng** → mỗi dòng chọn một nhà cung cấp
   (mặc định đã gợi ý bên rẻ nhất cho từng dòng) → **Trao thầu**
8. Vẫn ở trang RFQ, bấm **Tạo đơn hàng** → tích các nhà cung cấp trúng thầu →
   nhập thuế VAT, ngày giao, địa chỉ → **Tạo đơn hàng (nháp)** → **Phát hành**
9. Mở chi tiết đơn hàng → **Tải PDF** để xem đơn đặt hàng in được
10. Đăng nhập lại tài khoản nhà cung cấp → **Đơn hàng** → mở đơn →
    **Xác nhận đơn hàng**
11. Về `buyer@pms.local` → **Đơn hàng** → **Hoàn tất**

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

Hai vai trò còn lại cũng có tài khoản demo: `qa@pms.local` và
`warehouse@pms.local`.

### Thử danh mục vật tư

Nhóm hàng hóa bắt buộc chọn mã vật tư cho từng dòng, nhóm dịch vụ thì không.

1. Đăng nhập `user@pms.local` → **Danh mục vật tư**: có sẵn 5 mã mẫu
2. **Đề xuất mã mới** → điền tên, đơn vị tính, lý do → **Gửi đề xuất**
   Mã hiện trong danh mục ở trạng thái *Chờ duyệt*, chưa dùng để đặt hàng được
3. Đăng nhập `admin@pms.local` → **Danh mục vật tư** → tab **Chờ duyệt** →
   **Duyệt**. Mã chuyển sang *Đang dùng*
4. Quay lại `user@pms.local` → **Tạo yêu cầu** → chọn lĩnh vực *Hóa chất* →
   ô **Mã vật tư** giờ có mã vừa duyệt. Chọn mã sẽ tự điền tên, đơn vị và giá
   tham chiếu
5. Đổi lĩnh vực sang *Dịch vụ*: ô mã vật tư biến mất, nhãn đổi thành
   **Nội dung dịch vụ**

Bấm biểu tượng đồng hồ ở cuối dòng `HC-NAOH-32` để xem **lịch sử đặt hàng**:
giá bình quân gia quyền, khoảng giá, tổng hợp theo nhà cung cấp.

### Thử tạo tài khoản và trang cá nhân

Đăng nhập `admin@pms.local` → **Người dùng** → **Tạo tài khoản**: nhập email,
mật khẩu ban đầu, chọn một hoặc nhiều vai trò. Trong bảng còn có nút khóa /
mở khóa, đặt lại mật khẩu và xóa.

Bấm vào **tên mình ở chân thanh bên trái** để mở **Tài khoản của tôi**: sửa
thông tin cơ bản, đổi mật khẩu, và nút đăng xuất.

### Thử đấu thầu kín

Ở bước 4, mời **hai** nhà cung cấp nhưng chỉ cho **một** bên gửi báo giá.

Quay lại `buyer@pms.local` → mở RFQ đó: thay cho bảng so sánh là khung vàng
**"Giá đang được niêm phong"**, chỉ liệt kê ai đã nộp và nộp lúc nào. Bấm
**Trao thầu** cũng không được.

Bấm **Đóng nhận báo giá** — bảng so sánh và bảng chia thầu hiện ra ngay. Niêm
phong cũng tự mở nếu quá hạn nộp, hoặc khi cả hai nhà cung cấp đều đã trả lời.

### Thử chia thầu cho nhiều nhà cung cấp

Ở bước 4, mời **hai** nhà cung cấp và tạo yêu cầu có **hai dòng hàng trở lên**.
Cho mỗi bên báo giá rẻ hơn ở một dòng khác nhau.

Ở bảng **Trao thầu theo dòng hàng**, chọn NCC A cho dòng 1 và NCC B cho dòng 2 —
nút sẽ đổi thành **Chia thầu cho 2 NCC**. Sau khi chốt, màn hình tạo đơn hàng
liệt kê cả hai bên và tạo **hai đơn hàng riêng từ cùng một yêu cầu mua**, mỗi
đơn chỉ chứa dòng bên đó thắng.

Nếu chọn cùng một dòng hàng cho hai nhà cung cấp, hệ thống sẽ báo lỗi và không
cho lưu.

### Thử tải file lên

Vào **Hợp đồng** hoặc **Chứng chỉ** → bấm **Tài liệu** ở cuối dòng → kéo thả
file vào khung. Tải lên lại đúng file trùng tên sẽ tạo **phiên bản 2**, bản cũ
vẫn còn trong danh sách.

### Thử đặt tiêu chí đánh giá riêng

Đăng nhập `admin@pms.local` → **Thiết lập** → tab **Tiêu chí đánh giá NCC** →
**Thêm tiêu chí** (đặt trọng số và thang điểm tùy ý).

Sang **Đánh giá NCC** → **Chấm điểm**: tiêu chí vừa thêm xuất hiện trong form,
mỗi tiêu chí có ô nhận xét riêng và điểm tổng được tính ngay khi chấm.

Tab **Thông tin công ty** của trang Thiết lập là phần in ở đầu file PDF đơn hàng.

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

## Web chạy chậm?

`npm run dev:web` là **chế độ phát triển**: Next biên dịch từng trang ngay lúc
bạn mở nó lần đầu, nên lần đầu vào mỗi trang mất khoảng 1,3 giây. Đó là đặc
điểm của chế độ này, không phải hệ thống chậm.

Muốn thấy tốc độ thật:

```bash
cd apps/web
npm run build
npm start
```

Đo trên máy này, bản build sẵn nhanh gấp đôi: tải trang đầu khoảng 0,64 giây,
còn chuyển qua lại giữa các trang trong ứng dụng chỉ 50–150 ms.

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
