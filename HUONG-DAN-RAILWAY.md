# Đưa PMS lên pmsystem.io.vn qua GitHub + Railway

Hướng dẫn từng bước, có kiểm chứng sau mỗi bước. Làm đúng thứ tự và **đừng bỏ
qua bước kiểm chứng** — sai ở bước nào thì dừng ngay ở đó dễ sửa hơn nhiều so
với phát hiện ở bước cuối.

Tổng thời gian: khoảng 45 phút làm việc, cộng thời gian chờ DNS (15 phút đến
vài giờ, tùy nhà đăng ký).

**Mục lục**

- [Cần chuẩn bị gì](#cần-chuẩn-bị-gì)
- [Bức tranh tổng thể](#bức-tranh-tổng-thể)
- [Bước 1 — Đưa mã lên GitHub](#bước-1--đưa-mã-lên-github)
- [Bước 2 — Tạo project Railway và database](#bước-2--tạo-project-railway-và-database)
- [Bước 3 — Deploy API](#bước-3--deploy-api)
- [Bước 4 — Nạp dữ liệu nền](#bước-4--nạp-dữ-liệu-nền)
- [Bước 5 — Deploy web](#bước-5--deploy-web)
- [Bước 6 — Gắn tên miền pmsystem.io.vn](#bước-6--gắn-tên-miền-pmsystemiovn)
- [Bước 7 — Khóa lại trước khi dùng thật](#bước-7--khóa-lại-trước-khi-dùng-thật)
- [Bước 8 — Sao lưu](#bước-8--sao-lưu)
- [Làm việc hằng ngày sau khi đã lên mạng](#làm-việc-hằng-ngày-sau-khi-đã-lên-mạng)
- [Bảng tra lỗi](#bảng-tra-lỗi)

---

## Cần chuẩn bị gì

| | Ghi chú |
| --- | --- |
| Tài khoản GitHub | `davidtran0125-wq`, repo `PMSystem-V1.0` |
| Tài khoản Railway | Đăng nhập bằng chính tài khoản GitHub cho tiện |
| Gói Railway **Hobby** (5 USD/tháng) | Bản dùng thử **không tạo được volume**, mà không có volume thì file đính kèm mất sau mỗi lần deploy |
| Quyền sửa DNS của `pmsystem.io.vn` | Ở trang quản trị nơi bạn mua tên miền |
| Terminal trên máy | Để push mã và chạy lệnh seed |

Ước tính chi phí: gói Hobby 5 USD đã gồm 5 USD tài nguyên. Ba service (Postgres,
API, web) dùng nội bộ vài chục người thường tổng khoảng **10–20 USD/tháng**.

> **Không cần Redis.** Gói `bullmq` và `ioredis` có trong `package.json` nhưng
> chưa module nào trong `apps/api/src` nối tới — hàng đợi nhắc hạn hợp đồng hiện
> do `@nestjs/schedule` quét trực tiếp. Thêm service Redis lúc này là trả tiền
> cho một container chạy không.

---

## Bức tranh tổng thể

```
     Bạn push lên GitHub
              │
              ▼
   GitHub Actions chạy CI ──── đỏ ──▶ dừng, sửa rồi push lại
              │ xanh
              ▼
   Railway tự build và deploy
              │
      ┌───────┴────────┐
      ▼                ▼
  service web      service api ──── volume /app/storage  (file đính kèm)
      │                │
      │                └────────▶ service Postgres       (dữ liệu)
      ▼                ▼
pmsystem.io.vn   api.pmsystem.io.vn
```

Ba service riêng biệt trong **một** project Railway, cùng đọc từ **một** repo
GitHub nhưng khác thư mục gốc (`apps/api` và `apps/web`).

Điều quan trọng nhất phải nhớ: **push lên `main` là deploy ngay, không có nút
xác nhận nào.** Vì thế nhánh `main` phải luôn ở trạng thái chạy được.

---

## Bước 1 — Đưa mã lên GitHub

### 1.1. Kiểm tra không có gì bí mật lọt vào

Chạy trước khi push, mỗi lần:

```bash
cd /Users/trantin/Downloads/PMS---BTM-Demo

# Các file này PHẢI hiện ra là đang bị bỏ qua
git check-ignore -v .env apps/api/.env apps/web/.env.local .env.production
```

Mỗi dòng kết quả có dạng `.gitignore:11:.env	.env` nghĩa là file đó bị bỏ qua —
đúng. Nếu một file **không** hiện ra, dừng lại: nó sắp bị đẩy công khai lên mạng.

Quét thêm token bị dán nhầm vào mã:

```bash
git ls-files -mo --exclude-standard | while read -r f; do
  [ -f "$f" ] && grep -lE "ghp_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9-]{20,}" "$f"
done
```

Không in ra gì là sạch.

### 1.2. Push

```bash
git add -A
git commit -m "mô tả ngắn gọn thay đổi"
git push origin main
```

Nếu bị từ chối với `Updates were rejected`, nghĩa là trên GitHub có commit mà máy
bạn chưa có (thường do bạn tạo repo kèm README). Xử lý:

```bash
git pull --rebase origin main
git push origin main
```

### 1.3. Xem CI chạy

Mở `https://github.com/davidtran0125-wq/PMSystem-V1.0/actions`.

Ba job sẽ chạy:

| Job | Thời gian | Nội dung |
| --- | --- | --- |
| **API** | ~4 phút | Dựng Postgres tạm → migration → lint → kiểm tra kiểu → build → seed → khởi động API → chạy **cả 333 kiểm thử** |
| **Web** | ~3 phút | Kiểm tra kiểu, lint, build |
| **Docker** | ~6 phút | Dựng đúng hai ảnh Railway sẽ dựng, xác nhận `NEXT_PUBLIC_API_URL` thật sự vào được bundle |

Job **Docker** chỉ chạy trên `main`, không chạy trên pull request.

**Kiểm chứng bước 1:** cả ba job có dấu tích xanh.

Nếu job **API** đỏ, mở nó ra và kéo xuống bước cuối *"Log API khi hỏng"* — 100
dòng log cuối của tiến trình API nằm ở đó, nguyên nhân thường lộ ngay.

---

## Bước 2 — Tạo project Railway và database

### 2.1. Tạo project

1. Vào https://railway.app → **Login with GitHub**
2. **New Project** → chọn **Deploy PostgreSQL**

Railway tạo project kèm một service Postgres. Nó khởi động trong khoảng 30 giây.

### 2.2. Đặt tên project

Góc trên trái, bấm vào tên project (mặc định là một chuỗi ngẫu nhiên như
`vivid-mountain`) → đổi thành `pmsystem`. Sau này bạn sẽ có nhiều project, tên
ngẫu nhiên rất khó nhớ.

### 2.3. Ghi lại thông tin Postgres

Bấm vào service **Postgres** → tab **Variables**. Bạn sẽ thấy `DATABASE_URL`,
`PGHOST`, `PGPASSWORD`…

**Đừng chép giá trị này ra chỗ nào.** Ở bước sau ta sẽ *tham chiếu* tới nó bằng
cú pháp riêng của Railway, để khi Railway xoay mật khẩu thì API vẫn chạy.

**Kiểm chứng bước 2:** service Postgres hiện chấm xanh và chữ *Active*.

---

## Bước 3 — Deploy API

### 3.1. Tạo service từ GitHub

1. Trong project, bấm **New** (hoặc **Create**) → **GitHub Repo**
2. Lần đầu Railway sẽ yêu cầu quyền truy cập GitHub. Bấm **Configure GitHub App**:
   - Chọn tài khoản `davidtran0125-wq`
   - Chọn **Only select repositories** → tick đúng `PMSystem-V1.0`
   - **Đừng** chọn *All repositories*. Railway chỉ cần đọc repo này.
   - **Install** / **Save**
3. Quay lại Railway, chọn repo `PMSystem-V1.0`

Railway sẽ lập tức thử build và **sẽ hỏng** — bình thường, vì nó đang build từ
thư mục gốc của repo. Sửa ở bước tiếp theo.

### 3.2. Cấu hình service

Bấm vào service vừa tạo → tab **Settings**:

| Mục | Giá trị |
| --- | --- |
| **Service Name** | `api` |
| **Root Directory** | `apps/api` |
| **Branch** | `main` |
| **Builder** | Để nguyên. Railway thấy `apps/api/Dockerfile` và tự dùng nó |
| **Watch Paths** | `apps/api/**` |

**Watch Paths** quan trọng hơn vẻ ngoài của nó: không đặt thì mỗi lần bạn sửa
một dòng CSS bên `apps/web`, service API cũng build lại và khởi động lại, cắt
ngang người đang dùng mà chẳng để làm gì.

Healthcheck không phải đặt tay — Railway đọc `apps/api/railway.json`, trong đó
đã khai `/api/health`.

### 3.3. Tạo volume cho file đính kèm

Vẫn trong **Settings**, kéo xuống mục **Volumes** → **Add Volume**:

- **Mount path**: `/app/storage`

**Bỏ bước này là mọi file hợp đồng, chứng chỉ, báo giá đã tải lên sẽ biến mất
sau lần deploy kế tiếp.** Ổ đĩa của container không được giữ lại giữa các lần
deploy; chỉ volume mới được giữ. Lỗi này không báo gì cả — người dùng chỉ phát
hiện khi bấm tải file và nhận 404, thường là vài tuần sau.

### 3.4. Điền biến môi trường

Sang tab **Variables** → bấm **Raw Editor** → dán nguyên khối dưới đây:

```env
NODE_ENV=production
API_PREFIX=api
DATABASE_URL=${{Postgres.DATABASE_URL}}
LOCAL_STORAGE_PATH=/app/storage
CORS_ORIGIN=https://pmsystem.io.vn,https://www.pmsystem.io.vn
JWT_ACCESS_SECRET=DÁN_CHUỖI_1
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
THROTTLE_TTL=60
THROTTLE_LIMIT=120
AUTH_THROTTLE_TTL=60
AUTH_THROTTLE_LIMIT=60
SEED_ADMIN_EMAIL=admin@pmsystem.io.vn
SEED_ADMIN_PASSWORD=DÁN_MẬT_KHẨU_MẠNH
```

Sinh chuỗi bí mật trên máy bạn:

```bash
openssl rand -base64 48
```

Thay `DÁN_CHUỖI_1` bằng kết quả. Đặt `SEED_ADMIN_PASSWORD` là mật khẩu mạnh —
bạn sẽ đổi lại ngay sau lần đăng nhập đầu, nhưng đừng để nó yếu ngay từ đầu.

Vài điểm cần hiểu rõ:

- **`${{Postgres.DATABASE_URL}}` là cú pháp tham chiếu của Railway**, không phải
  chuỗi văn bản. Railway tự thay bằng giá trị thật lúc chạy, và tự cập nhật nếu
  thông tin kết nối đổi. Chép tay giá trị thì đến lúc Railway xoay mật khẩu là
  API chết mà không rõ vì sao. `Postgres` phải đúng tên service — nếu bạn đã đổi
  tên service database thì sửa theo.
- **Không đặt `PORT` hay `API_PORT`.** Railway tự cấp `PORT`, và code đã ưu tiên
  đọc biến đó.
- **Không có `JWT_REFRESH_SECRET`.** Refresh token trong hệ thống này không phải
  JWT: nó là chuỗi ngẫu nhiên 48 byte, chỉ lưu bản băm SHA-256 trong database và
  xoay vòng mỗi lần dùng. Biến đó có trong `.env.example` nhưng code không đọc.
- **`SWAGGER_ENABLED` để trống.** Với `NODE_ENV=production`, Swagger tự tắt.
  Đặt biến này thành `true` là mở lại toàn bộ hình dạng API cho người ngoài.

Bấm **Deploy** / **Apply**. Railway build lại, khoảng 3–5 phút.

### 3.5. Xem log build

Tab **Deployments** → bấm vào bản deploy đang chạy → **View Logs**.

Trình tự bình thường:

```
=> [build 1/9] FROM node:22-slim
...
=> exporting to image
Starting Container
12 migrations found in prisma/migrations
No pending migrations to apply.        ← hoặc: Applying migration ...
[Nest] LOG [NestApplication] Nest application successfully started
API listening on http://localhost:8080
```

Dòng `12 migrations found` chứng tỏ `prisma migrate deploy` đã chạy — nó nằm
trong `CMD` của Dockerfile nên tự động mỗi lần khởi động.

### 3.6. Lấy địa chỉ tạm và kiểm chứng

**Settings → Networking → Generate Domain**. Railway cho một địa chỉ dạng
`api-production-xxxx.up.railway.app`.

```bash
curl https://api-production-xxxx.up.railway.app/api/health
```

**Kiểm chứng bước 3** — phải nhận được:

```json
{"status":"ok","database":"ok","uptimeSeconds":42,"timestamp":"..."}
```

`"database":"ok"` là phần quan trọng: nó nghĩa là API đã thật sự chạy được một
truy vấn xuống Postgres, chứ không chỉ "tiến trình còn sống".

Kiểm tra thêm Swagger đã tắt:

```bash
curl -o /dev/null -w "%{http_code}\n" https://api-production-xxxx.up.railway.app/docs
# phải là 404
```

> **Mở địa chỉ gốc thì thấy gì?** Mọi route của API nằm sau tiền tố `api`, nên
> `/` trả về một dòng giới thiệu:
>
> ```json
> {"service":"pms-api","message":"API của Hệ thống quản lý mua hàng...","health":"/api/health"}
> ```
>
> Đây cũng là cách nhanh nhất để biết một tên miền đang trỏ vào đâu: thấy JSON
> này là API, thấy trang đăng nhập là web. Nếu mở **tên miền của web** mà lại
> thấy JSON này, nghĩa là service web đang đặt sai **Root Directory** — phải là
> `apps/web`, không phải `apps/api`.

---

## Bước 4 — Nạp dữ liệu nền

Database hiện có bảng nhưng chưa có dữ liệu: chưa có vai trò, chưa có quyền,
chưa có tài khoản nào. Chạy seed **đúng một lần**.

### 4.1. Cài Railway CLI

```bash
npm i -g @railway/cli
railway login
```

Lệnh `login` mở trình duyệt để xác thực.

### 4.2. Nối thư mục với service

```bash
cd /Users/trantin/Downloads/PMS---BTM-Demo/apps/api
railway link
```

CLI hỏi lần lượt: chọn workspace → chọn project `pmsystem` → chọn environment
`production` → chọn service `api`.

### 4.3. Chạy seed

```bash
railway run npx prisma db seed
```

`railway run` nạp biến môi trường của service (gồm `DATABASE_URL` trỏ đúng
Postgres trên Railway) rồi chạy lệnh trên máy bạn.

Kết quả in ra danh sách những thứ được tạo: 9 vai trò, bộ quyền, 18 lĩnh vực
mua hàng, bộ tiêu chí đánh giá, các luồng duyệt mẫu và tài khoản quản trị.

> **Chỉ chạy một lần.** Chạy lại lần hai sẽ tạo trùng dữ liệu danh mục.

**Kiểm chứng bước 4** — đăng nhập thử bằng API:

```bash
curl -X POST https://api-production-xxxx.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@pmsystem.io.vn","password":"MẬT_KHẨU_BẠN_ĐẶT"}'
```

Trả về `{"accessToken":"eyJ...","refreshToken":"..."}` là xong.

---

## Bước 5 — Deploy web

### 5.1. Tạo service thứ hai từ cùng repo

**New** → **GitHub Repo** → chọn lại `PMSystem-V1.0`.

Đúng vậy — cùng một repo, hai service. Railway phân biệt bằng Root Directory.

### 5.2. Cấu hình

Tab **Settings**:

| Mục | Giá trị |
| --- | --- |
| **Service Name** | `web` |
| **Root Directory** | `apps/web` |
| **Branch** | `main` |
| **Watch Paths** | `apps/web/**` |

### 5.3. Biến môi trường

Tab **Variables**:

```env
NEXT_PUBLIC_API_URL=https://api.pmsystem.io.vn/api
```

Đặt thẳng tên miền thật, kể cả khi DNS chưa trỏ xong — bước 6 sẽ làm nốt, và
làm thế thì không phải build lại lần nữa.

> **Đây là chỗ dễ sai nhất khi đưa Next lên Docker.** Next nhúng mọi biến
> `NEXT_PUBLIC_*` **thẳng vào mã JavaScript gửi xuống trình duyệt, lúc build**.
> Đổi giá trị rồi bấm Restart là **không** có tác dụng — phải **Redeploy** để
> build lại ảnh. Dockerfile đã có bước kiểm tra: thiếu biến này thì build dừng
> kèm thông báo `Thiếu build arg NEXT_PUBLIC_API_URL` thay vì lặng lẽ tạo ra một
> bản web gọi nhầm `localhost:4000`.

### 5.4. Kiểm chứng

**Settings → Networking → Generate Domain**, rồi mở địa chỉ tạm đó.

**Kiểm chứng bước 5:** trang đăng nhập hiện ra đầy đủ, không trắng trang.

Lúc này đăng nhập sẽ **chưa** được, vì `NEXT_PUBLIC_API_URL` trỏ tới
`api.pmsystem.io.vn` mà DNS chưa có. Đúng như dự kiến — sang bước 6.

---

## Bước 6 — Gắn tên miền pmsystem.io.vn

### 6.1. Vấn đề với tên miền gốc

Railway chỉ cấp bản ghi **CNAME**. Chuẩn DNS **không cho đặt CNAME tại tên miền
gốc** (`pmsystem.io.vn`, còn gọi là apex hay root). Đây là hạn chế của chính
giao thức DNS, không phải của Railway.

Hai cách xử lý:

| | Cách A — Cloudflare | Cách B — chỉ dùng `www` |
| --- | --- | --- |
| Địa chỉ chính | `pmsystem.io.vn` | `www.pmsystem.io.vn` |
| Việc phải làm | Đổi nameserver sang Cloudflare | Đặt chuyển hướng ở nhà đăng ký |
| Thời gian | 15 phút–24 giờ chờ đổi nameserver | 15 phút |
| Khuyến nghị | ✅ Nếu muốn địa chỉ gọn | Nếu muốn xong nhanh |

Dưới đây trình bày **cách A**.

### 6.2. Chuyển DNS sang Cloudflare

1. Tạo tài khoản tại https://dash.cloudflare.com (gói Free là đủ)
2. **Add a site** → nhập `pmsystem.io.vn` → chọn gói **Free**
3. Cloudflare quét các bản ghi hiện có và đưa ra **hai nameserver**, dạng
   `xxx.ns.cloudflare.com`
4. Về trang quản trị nơi mua `pmsystem.io.vn`, tìm mục **Nameserver** /
   **Quản lý DNS** / **Đổi máy chủ tên miền**, thay hai nameserver cũ bằng hai
   cái Cloudflare đưa
5. Chờ Cloudflare xác nhận. Thường 15–60 phút, đôi khi tới 24 giờ.

### 6.3. Lấy giá trị CNAME từ Railway

Với **từng service**, vào **Settings → Networking → Custom Domain**:

| Service | Nhập tên miền |
| --- | --- |
| web | `pmsystem.io.vn`, rồi thêm tiếp `www.pmsystem.io.vn` |
| api | `api.pmsystem.io.vn` |

Sau mỗi lần nhập, Railway hiện một giá trị CNAME dạng
`xxxxx.up.railway.app`. Ghi lại cả ba.

### 6.4. Khai báo trên Cloudflare

Cloudflare → chọn `pmsystem.io.vn` → tab **DNS** → **Add record**, ba lần:

| Type | Name | Target | Proxy status |
| --- | --- | --- | --- |
| CNAME | `@` | *(giá trị Railway đưa cho web)* | **DNS only** (mây xám) |
| CNAME | `www` | *(giá trị Railway đưa cho web)* | **DNS only** |
| CNAME | `api` | *(giá trị Railway đưa cho api)* | **DNS only** |

Cloudflare cho phép CNAME tại `@` nhờ tính năng *CNAME flattening* — đây chính
là lý do chọn Cloudflare.

> **Để mây xám, đừng bật mây cam.** Chế độ proxy của Cloudflare khiến Railway
> không xác thực được quyền sở hữu tên miền để xin chứng chỉ, và nếu cả hai bên
> cùng ép HTTPS thì trình duyệt báo vòng chuyển hướng vô tận. Railway đã lo
> HTTPS rồi. Muốn dùng proxy thì bật sau, khi mọi thứ đã chạy, và đặt SSL mode
> là **Full (strict)**.

### 6.5. Chờ và kiểm chứng

```bash
dig +short pmsystem.io.vn
dig +short api.pmsystem.io.vn
```

Cả hai phải trả về địa chỉ `up.railway.app` hoặc IP tương ứng.

Trong Railway, mục Custom Domain của từng service sẽ chuyển từ dấu chấm than
vàng sang dấu tích xanh khi chứng chỉ đã cấp xong — thường vài phút sau khi DNS
đúng.

**Kiểm chứng bước 6:**

```bash
curl https://api.pmsystem.io.vn/api/health
# {"status":"ok","database":"ok",...}
```

Rồi mở `https://pmsystem.io.vn`, đăng nhập bằng tài khoản quản trị. Vào được
Tổng quan là xong phần triển khai.

Mở **Console** của trình duyệt (F12) xem có lỗi CORS không. Nếu có, kiểm tra lại
`CORS_ORIGIN` của service api: đúng hai tên miền, có `https://`, **không** có
dấu `/` ở cuối.

---

## Bước 7 — Khóa lại trước khi dùng thật

Đây không phải bước tùy chọn. Ngay lúc này hệ thống đang mở công khai với một
danh sách tài khoản mà mật khẩu nằm trong README trên GitHub.

### 7.1. Đổi mật khẩu quản trị

Đăng nhập → góc phải trên → **Tài khoản của tôi** → đổi mật khẩu.

### 7.2. Khóa toàn bộ tài khoản demo

Vào **Người dùng**, khóa tám tài khoản sau:

`buyer@pms.local`, `user@pms.local`, `ncc-a@pms.local`, `ncc-b@pms.local`,
`finance@pms.local`, `director@pms.local`, `qa@pms.local`, `warehouse@pms.local`

Tất cả đều dùng mật khẩu `Admin@123`, và mật khẩu đó **đang hiện ngay trên màn
hình đăng nhập**.

### 7.3. Gỡ khối tài khoản demo khỏi màn hình đăng nhập

Sửa `apps/web/src/app/login/page.tsx`, xóa phần liệt kê tài khoản mẫu, rồi:

```bash
git add -A && git commit -m "chore: gỡ danh sách tài khoản demo khỏi màn hình đăng nhập"
git push origin main
```

Railway tự deploy lại.

### 7.4. Kiểm tra lần cuối

| Việc | Cách kiểm |
| --- | --- |
| Swagger đã tắt | `curl -o /dev/null -w "%{http_code}\n" https://api.pmsystem.io.vn/docs` → `404` |
| File đính kèm sống sót qua deploy | Vào **Hợp đồng**, tải lên một file, bấm **Redeploy** trên service api, quay lại xem file còn không |
| PDF tiếng Việt có dấu | Vào **Đơn hàng** → **Tải PDF** |
| Không lỗi CORS | F12 → tab Console, bấm quanh vài trang |

---

## Bước 8 — Sao lưu

Railway **không tự bật sao lưu**. Không có bước này thì một lần lỡ tay là mất hết.

### 8.1. Sao lưu database

Service **Postgres** → tab **Backups** → bật lịch sao lưu tự động.

### 8.2. Sao lưu file đính kèm

Bản sao lưu Postgres **không** chứa file trong volume. Sao lưu thủ công định kỳ:

```bash
cd /Users/trantin/Downloads/PMS---BTM-Demo/apps/api
railway run tar czf - -C /app/storage . > ~/pms-storage-$(date +%F).tar.gz
```

### 8.3. Thử phục hồi một lần

Bản sao lưu chưa từng phục hồi thì coi như chưa có. Tạo một database tạm, đổ bản
sao lưu vào, xem có mở được không. Làm việc này vào một ngày rảnh, đừng đợi tới
lúc cần.

---

## Làm việc hằng ngày sau khi đã lên mạng

### Quy trình an toàn

```bash
# 1. Làm trên nhánh riêng, không sửa thẳng main
git checkout -b sua-gi-do

# 2. Kiểm tra tại chỗ trước khi đẩy lên
cd apps/api && npx tsc --noEmit && npm run lint
cd ../web  && npx tsc --noEmit && npx next lint
cd ..      && npm run test:all      # cần API chạy ở máy

# 3. Đẩy lên, mở pull request
git push -u origin sua-gi-do
```

Trên GitHub, mở pull request → hai job **API** và **Web** chạy. Xanh thì
**Merge**. Merge xong Railway deploy ngay.

### Hai thiết lập nên bật

- **GitHub → Settings → Branches → Add rule** cho `main`: bật *Require status
  checks to pass before merging*, chọn `API` và `Web`. Từ đó không ai merge được
  code làm hỏng kiểm thử, kể cả bạn.
- **Railway → service → Settings → Deploy → Wait for CI**: Railway chờ GitHub
  Actions xanh rồi mới deploy, thay vì chạy song song.

### Quay lại bản cũ khi deploy hỏng

Service → tab **Deployments** → tìm bản chạy tốt gần nhất → dấu ba chấm →
**Redeploy**. Khoảng một phút là xong.

> **Rollback không hoàn tác migration.** Nếu bản mới có migration xóa cột thì
> quay lại bản cũ sẽ gặp database đã đổi cấu trúc và hỏng tiếp. Vì vậy:
>
> - Migration nên **cộng thêm**, đừng xóa. Muốn bỏ một cột thì tách hai đợt
>   deploy: đợt một bỏ code dùng tới nó, đợt hai mới xóa cột.
> - Trước migration đụng tới dữ liệu, tạo bản sao lưu thủ công.

### Thêm migration mới

```bash
# Trên máy, sau khi sửa apps/api/prisma/schema.prisma
cd apps/api
npx prisma migrate dev --name mo_ta_thay_doi
```

Commit cả `schema.prisma` lẫn thư mục migration mới. Trên Railway,
`prisma migrate deploy` tự chạy khi container khởi động — **không bao giờ** chạy
`migrate dev` hay `migrate reset` với database thật.

---

## Bảng tra lỗi

| Hiện tượng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| Push lên GitHub mà Railway im lặng | GitHub App chưa được cấp quyền cho repo, hoặc service theo dõi nhánh khác `main` | Railway → Settings → kiểm tra Source và Branch |
| Deploy đỏ ngay ở bước healthcheck | API không nối được database | Kiểm tra `DATABASE_URL` có đúng cú pháp `${{Postgres.DATABASE_URL}}`, và tên service database có đúng là `Postgres` |
| Log API báo `Can't reach database server` | Chép tay `DATABASE_URL` rồi Railway xoay mật khẩu | Đổi sang cú pháp tham chiếu |
| Trình duyệt báo lỗi CORS | `CORS_ORIGIN` sai | Đúng `https://pmsystem.io.vn,https://www.pmsystem.io.vn`, không dấu `/` cuối, không dùng `*` |
| Web hiện được nhưng mọi lời gọi API hỏng | Ảnh web build với `NEXT_PUBLIC_API_URL` cũ | **Redeploy** service web. Restart không đủ |
| Build web dừng với `Thiếu build arg NEXT_PUBLIC_API_URL` | Chưa đặt biến đó cho service web | Thêm vào Variables rồi Redeploy |
| Tải file lên rồi mất sau khi deploy | Chưa gắn volume, hoặc `LOCAL_STORAGE_PATH` trỏ ngoài volume | Volume mount `/app/storage`, biến đặt đúng `/app/storage` |
| PDF đơn hàng mất dấu tiếng Việt | Thư mục `assets/fonts` không vào được ảnh | `git ls-files apps/api/assets` phải liệt kê hai file `.ttf` |
| Railway không cho thêm tên miền gốc | Chuẩn DNS không cho CNAME ở apex | Xem bước 6.1 |
| Custom Domain kẹt ở dấu chấm than vàng | DNS chưa lan truyền, hoặc Cloudflare đang bật proxy | `dig +short`, và chuyển mây cam về mây xám |
| Trang web chuyển hướng vòng vô tận | Cloudflare proxy bật với SSL mode Flexible | Chuyển **DNS only**, hoặc đổi SSL mode sang **Full (strict)** |
| Sửa một dòng CSS mà API cũng khởi động lại | Chưa đặt Watch Paths | `apps/api/**` và `apps/web/**` |
| Mở tên miền api thấy `Cannot GET /` | Bản cũ chưa có trang giới thiệu ở `/` | Bình thường, không phải lỗi. Kiểm tra ở `/api/health`. Bản mới trả về JSON `{"service":"pms-api",...}` |
| Mở tên miền **web** mà thấy JSON `{"service":"pms-api"}` | Service web đặt sai Root Directory | Đổi thành `apps/web` rồi Redeploy |
| GitHub Actions đỏ ở job API | Xem bước *Log API khi hỏng* trong job, có 100 dòng log cuối | |
| Actions xanh nhưng Railway build đỏ | Thường do file cần thiết bị `.gitignore` | Job **Docker** dựng đúng ảnh Railway dựng; nếu nó xanh mà Railway đỏ thì so lại biến môi trường của service |

---

## Tài liệu liên quan

- [README.md](README.md) — tổng quan hệ thống, phân quyền, các tính năng
- [HUONG-DAN-TRIEN-KHAI.md](HUONG-DAN-TRIEN-KHAI.md) — so sánh các phương án
  triển khai và cách chạy trên VPS riêng
- [HUONG-DAN-CHAY.md](HUONG-DAN-CHAY.md) — chạy trên máy cá nhân
