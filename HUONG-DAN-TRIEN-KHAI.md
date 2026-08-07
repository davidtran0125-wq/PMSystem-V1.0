# Đưa PMS lên mạng thành trang web thật

Hệ thống gồm ba phần phải chạy cùng lúc: **PostgreSQL**, **API NestJS** và
**web Next.js**. Tài liệu này đi từ cách rẻ và nhanh nhất tới cách bài bản nhất.

Trước khi bắt đầu, cần chuẩn bị:

- Mã nguồn đã đẩy lên GitHub (xem phần cuối nếu chưa push được)
- Một tên miền — dự án này dùng **pmsystem.io.vn**
- Khoảng 30–60 phút

> Tên miền đã có: **pmsystem.io.vn**, và cách triển khai đã chọn là **Railway**.
> Nhảy thẳng xuống mục *Cách đang dùng — Railway + pmsystem.io.vn* và làm theo
> sáu bước ở đó. Các mục còn lại là phương án thay thế, giữ lại để đối chiếu.
>
> Những file sau đã có sẵn trong repo, đã build thử và chạy thật:
> `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/api/railway.json`,
> `apps/web/railway.json`, `docker-compose.prod.yml`, `Caddyfile`,
> `.env.production.example`.

---

## Chọn phương án

| | Railway *(đang dùng)* | VPS + Docker | Vercel + Neon + Fly.io |
| --- | --- | --- | --- |
| Độ khó | Dễ nhất | Trung bình | Trung bình |
| Chi phí/tháng | ~10–20 USD | ~5–10 USD (VPS 2 GB) | 0–20 USD |
| Tự lo máy chủ | Không | Có | Không |
| HTTPS | Tự động | Caddy làm hộ | Tự động |
| Tên miền gốc `pmsystem.io.vn` | Cần Cloudflare hoặc dùng `www` | Bản ghi A, đơn giản | Cần cấu hình thêm |
| Phù hợp | Nội bộ vài chục người | Dữ liệu phải nằm trong tầm kiểm soát | Web cần nhanh toàn cầu |

--- | --- | --- | --- |
| Độ khó | Dễ nhất | Trung bình | Trung bình |
| Chi phí/tháng | ~5–20 USD | ~5–10 USD (VPS 2 GB) | Có bậc miễn phí, ~0–20 USD |
| Tự lo máy chủ | Không | Có | Không |
| Phù hợp | Demo, nội bộ vài chục người | Dữ liệu phải nằm trong tầm kiểm soát | Web cần nhanh toàn cầu |
| HTTPS | Tự động | Tự cấu hình (Caddy làm hộ) | Tự động |

Nếu bạn chỉ cần đưa lên cho đồng nghiệp và khách hàng xem: **chọn phương án 1**.
Nếu công ty yêu cầu dữ liệu mua hàng nằm trên máy chủ của mình: **phương án 2**.

---

## Việc phải làm trước, chung cho mọi phương án

### 1. Sinh khóa bí mật thật

Trong `.env` hiện tại `JWT_ACCESS_SECRET` vẫn là `change-me-access-secret`. Ai
biết chuỗi này đều tự ký được token và vào hệ thống với bất kỳ tài khoản nào.
Sinh chuỗi ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Chạy hai lần, lấy hai chuỗi khác nhau cho `JWT_ACCESS_SECRET` và
`JWT_REFRESH_SECRET`.

### 2. Đổi mật khẩu tài khoản mẫu

`Admin@123` đang nằm trong tài liệu công khai. Đặt `SEED_ADMIN_PASSWORD` thành
mật khẩu mạnh **trước khi** seed, và sau khi lên mạng thì xóa hoặc khóa các tài
khoản demo (`buyer@`, `user@`, `ncc-a@`…) trong mục **Người dùng**.

### 3. Biến môi trường cần đặt

| Biến | Giá trị khi chạy thật | Ghi chú |
| --- | --- | --- |
| `NODE_ENV` | `production` | Tự tắt Swagger |
| `DATABASE_URL` | Chuỗi kết nối của dịch vụ | Nên có `?sslmode=require` |
| `JWT_ACCESS_SECRET` | Chuỗi ngẫu nhiên | Bí mật |
| `JWT_REFRESH_SECRET` | Chuỗi ngẫu nhiên khác | Bí mật |
| `CORS_ORIGIN` | `https://pmsystem.io.vn,https://www.pmsystem.io.vn` | Đúng tên miền web, có `https://`, không có `/` cuối |
| `NEXT_PUBLIC_API_URL` | `https://api.pmsystem.io.vn/api` | Web gọi tới đây. **Phải có mặt lúc build**, đặt lúc chạy không có tác dụng |
| `API_PORT` | `4000` hoặc `${PORT}` | Railway/Render tự cấp `PORT` |
| `AUTH_THROTTLE_LIMIT` | `60` | Nới lên nếu cả văn phòng chung một IP |
| `LOCAL_STORAGE_PATH` | Đường dẫn ổ đĩa gắn thêm | **Xem cảnh báo bên dưới** |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Tài khoản quản trị thật | |
| `ANTHROPIC_API_KEY` | Khóa Claude | Bỏ trống thì tính năng AI tự ẩn |

> **Cảnh báo về file đính kèm.** File hợp đồng, chứng chỉ, đơn hàng đang lưu
> trên ổ đĩa cục bộ của tiến trình API. Trên Railway, Render, Fly.io hay bất kỳ
> nền tảng container nào, **ổ đĩa bị xóa sạch mỗi lần deploy lại**. Bắt buộc
> phải gắn thêm một volume (persistent disk) và trỏ `LOCAL_STORAGE_PATH` vào
> đó, nếu không mọi file đã tải lên sẽ mất sau lần deploy kế tiếp. Nếu chạy
> nhiều bản API song song thì volume cũng không đủ — lúc đó phải viết thêm
> driver S3 cho `StorageService`. Các biến `S3_*` trong `.env.example` mới chỉ
> là chỗ dành sẵn, code chưa đọc tới.

### 4. Chạy migration, không dùng `migrate dev`

Trên máy chủ thật luôn dùng:

```bash
npx prisma migrate deploy   # chỉ áp dụng migration đã có, không sinh mới
npx prisma db seed          # chỉ chạy một lần, lần đầu tiên
```

Tuyệt đối không chạy `prisma migrate reset` hay `migrate dev` trên dữ liệu thật —
hai lệnh đó xóa sạch database.

---

## Cách đang dùng — Railway + pmsystem.io.vn

Railway chạy cả bốn phần trong một project: Postgres, Redis, API, web. Repo đã
có sẵn `apps/api/Dockerfile`, `apps/web/Dockerfile` và hai file `railway.json`
khai báo healthcheck — Railway tự nhận, không phải điền Build/Start Command.

Tổng thời gian khoảng 30 phút, trong đó chờ build mất một nửa.

### Bước 1: Tạo project và hai database

1. https://railway.app → **New Project** → **Deploy PostgreSQL**
2. Trong project đó → **New** → **Database** → **Add Redis**

Không cần chép `DATABASE_URL` ra chỗ nào; ở bước sau sẽ tham chiếu tới nó.

### Bước 2: Deploy API

1. **New** → **GitHub Repo** → chọn repo PMS
2. Service vừa tạo → **Settings**:
   - **Root Directory**: `apps/api`
   - Builder để nguyên **Dockerfile** (Railway đọc `apps/api/railway.json`)
3. **Settings → Volumes** → **Add Volume**, mount vào `/app/storage`

   Bỏ bước này là **mọi file hợp đồng, chứng chỉ đã tải lên sẽ mất sau lần
   deploy kế tiếp**. Ổ đĩa của container không được giữ lại.
4. **Variables** → dán khối dưới đây (`Raw Editor` cho nhanh):

```env
NODE_ENV=production
API_PREFIX=api
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_HOST=${{Redis.REDISHOST}}
REDIS_PORT=${{Redis.REDISPORT}}
LOCAL_STORAGE_PATH=/app/storage
CORS_ORIGIN=https://pmsystem.io.vn,https://www.pmsystem.io.vn
JWT_ACCESS_SECRET=<dán chuỗi ngẫu nhiên>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<dán chuỗi ngẫu nhiên khác>
JWT_REFRESH_EXPIRES_IN=7d
THROTTLE_TTL=60
THROTTLE_LIMIT=120
AUTH_THROTTLE_TTL=60
AUTH_THROTTLE_LIMIT=60
SEED_ADMIN_EMAIL=admin@pmsystem.io.vn
SEED_ADMIN_PASSWORD=<mật khẩu mạnh>
MAIL_FROM=PMS <no-reply@pmsystem.io.vn>
ANTHROPIC_API_KEY=
```

   Cú pháp `${{Postgres.DATABASE_URL}}` là tham chiếu của Railway — nó tự thay
   bằng giá trị thật, và tự cập nhật nếu Railway đổi thông tin kết nối. Chép tay
   thì lần Railway xoay mật khẩu là API chết.

   Sinh khóa bí mật: `openssl rand -base64 48`, chạy hai lần lấy hai chuỗi khác nhau.

   **Không** đặt `PORT` hay `API_PORT` — Railway tự cấp `PORT`, và API đã ưu tiên
   đọc biến đó.

5. Deploy chạy tự động. `prisma migrate deploy` nằm trong `CMD` của Dockerfile
   nên migration tự áp dụng mỗi lần khởi động.
6. **Settings → Networking → Generate Domain** để có địa chỉ tạm, dùng để kiểm
   tra trong lúc chờ DNS.

Xác nhận API sống:

```bash
curl https://<địa-chỉ-tạm>.up.railway.app/api/health
# {"status":"ok","database":"ok",...}
```

### Bước 3: Seed dữ liệu nền, một lần duy nhất

Cài Railway CLI trên máy của bạn rồi chạy:

```bash
npm i -g @railway/cli
railway login
railway link                       # chọn project, rồi chọn service API
railway run npx prisma db seed
```

Lệnh này tạo 9 vai trò, bộ quyền, danh mục lĩnh vực, tiêu chí đánh giá và tài
khoản quản trị. Chạy lại lần hai sẽ tạo trùng dữ liệu — chỉ chạy một lần.

### Bước 4: Deploy web

1. **New** → **GitHub Repo** → cùng repo
2. **Settings → Root Directory**: `apps/web`
3. **Variables**:

```env
NEXT_PUBLIC_API_URL=https://api.pmsystem.io.vn/api
```

   Railway truyền biến này vào Docker build arg cùng tên. Next nhúng
   `NEXT_PUBLIC_*` thẳng vào mã JavaScript **lúc build**, nên mỗi lần đổi giá
   trị phải **Redeploy** chứ khởi động lại không ăn thua. Dockerfile sẽ dừng
   build kèm thông báo rõ nếu biến này để trống.

### Bước 5: Gắn tên miền pmsystem.io.vn

Trong **Settings → Networking → Custom Domain** của từng service:

| Service | Tên miền khai báo |
| --- | --- |
| web | `pmsystem.io.vn` và `www.pmsystem.io.vn` |
| api | `api.pmsystem.io.vn` |

Railway sẽ hiện bản ghi CNAME cho từng tên miền. Sang trang quản lý DNS của
`pmsystem.io.vn` khai báo đúng các bản ghi đó:

| Loại | Tên | Giá trị |
| --- | --- | --- |
| CNAME | `www` | `<giá trị Railway đưa>` |
| CNAME | `api` | `<giá trị Railway đưa>` |

**Tên miền gốc `pmsystem.io.vn` là chỗ vướng.** Chuẩn DNS không cho đặt CNAME ở
tên miền gốc, mà Railway chỉ cấp CNAME. Hai cách xử lý:

- **Cách 1 (khuyến nghị) — chuyển DNS sang Cloudflare.** Cloudflare có
  *CNAME flattening*, cho phép đặt CNAME ngay tại `@`. Đổi nameserver của
  `pmsystem.io.vn` sang cặp nameserver Cloudflare cấp, rồi khai báo cả ba bản
  ghi CNAME ở đó. Để **DNS only** (mây xám), đừng bật proxy — Railway đã có
  HTTPS riêng, bật thêm proxy dễ thành vòng chuyển hướng vô tận.
- **Cách 2 — chỉ dùng `www`.** Khai báo mỗi `www` và `api`, rồi ở trang quản lý
  tên miền đặt chuyển hướng (URL redirect / web forwarding) từ
  `pmsystem.io.vn` sang `https://www.pmsystem.io.vn`. Đơn giản hơn nhưng địa chỉ
  chính thức sẽ là bản có `www`.

Chứng chỉ HTTPS do Railway tự xin, thường xong trong vài phút sau khi DNS đúng.

Kiểm tra:

```bash
dig +short api.pmsystem.io.vn
curl https://api.pmsystem.io.vn/api/health
```

### Bước 6: Việc phải làm ngay sau khi lên mạng

1. **Đăng nhập** bằng `SEED_ADMIN_EMAIL` rồi đổi mật khẩu.
2. **Khóa hết tài khoản demo** trong mục *Người dùng*: `buyer@`, `user@`,
   `ncc-a@`, `ncc-b@`, `finance@`, `director@`, `qa@`, `warehouse@`. Mật khẩu
   của chúng nằm công khai trong README **và hiện ngay trên màn hình đăng nhập**.
3. **Gỡ khối tài khoản demo khỏi màn hình đăng nhập**: sửa
   `apps/web/src/app/login/page.tsx`, xóa danh sách tài khoản mẫu, rồi deploy lại.
4. **Xác nhận Swagger đã tắt**: `https://api.pmsystem.io.vn/docs` phải trả 404.
   Nếu vẫn mở, kiểm tra lại `NODE_ENV=production` và `SWAGGER_ENABLED` phải trống.
5. **Bật sao lưu Postgres**: service Postgres → **Settings → Backups**. Railway
   không tự bật, và file đính kèm trong volume **không** nằm trong bản sao lưu đó.

### Chi phí ước tính

Gói Hobby 5 USD/tháng đã gồm 5 USD tiền tài nguyên. Bốn service (Postgres,
Redis, API, web) với lượng dùng nội bộ vài chục người thường rơi vào khoảng
10–20 USD/tháng. Volume tính riêng theo dung lượng.

### Khi có trục trặc

| Hiện tượng | Nguyên nhân thường gặp |
| --- | --- |
| Deploy đỏ ở bước healthcheck | API không nối được database. Kiểm tra `DATABASE_URL` có dùng đúng cú pháp `${{Postgres.DATABASE_URL}}` |
| Trình duyệt báo lỗi CORS | `CORS_ORIGIN` sai tên miền, thừa dấu `/` cuối, hoặc còn `http://` |
| Web hiện được nhưng mọi lời gọi API hỏng | Ảnh web build với `NEXT_PUBLIC_API_URL` cũ. Phải **Redeploy**, đổi biến rồi restart là không đủ |
| Tải file lên rồi mất sau khi deploy | Chưa gắn volume vào `/app/storage`, hoặc `LOCAL_STORAGE_PATH` trỏ chỗ khác |
| Railway không cho thêm tên miền gốc | Xem cách 1 và cách 2 ở bước 5 |
| PDF đơn hàng lỗi font | Thư mục `assets/fonts` thiếu trong ảnh — Dockerfile đã `COPY assets`, kiểm tra file có được commit lên git chưa |

---

## Cách thay thế — VPS riêng + Docker Compose

Chọn cách này nếu công ty yêu cầu dữ liệu nằm trên máy chủ của mình. Repo đã có
sẵn các file cho việc này, không cần chép đoạn mã nào từ tài liệu:

| File | Vai trò |
| --- | --- |
| `apps/api/Dockerfile` | Ảnh API. Đã kèm font tiếng Việt cho PDF, tự chạy `migrate deploy` khi khởi động |
| `apps/web/Dockerfile` | Ảnh web, bản `standalone` của Next |
| `docker-compose.prod.yml` | Postgres + Redis + API + web + Caddy |
| `Caddyfile` | HTTPS tự động cho `pmsystem.io.vn` và `api.pmsystem.io.vn` |
| `.env.production.example` | Mẫu biến môi trường, chép thành `.env.production` |

### Bước 1: Trỏ DNS

Vào trang quản lý tên miền nơi bạn mua `pmsystem.io.vn`, thêm ba bản ghi trỏ về
IP máy chủ:

| Loại | Tên | Giá trị | TTL |
| --- | --- | --- | --- |
| A | `@` | `<IP máy chủ>` | 300 |
| A | `www` | `<IP máy chủ>` | 300 |
| A | `api` | `<IP máy chủ>` | 300 |

Kiểm tra đã lan truyền chưa (làm từ máy của bạn, không phải trên máy chủ):

```bash
dig +short pmsystem.io.vn
dig +short api.pmsystem.io.vn
```

Cả hai phải trả về đúng IP máy chủ. **Chưa đúng thì đừng chạy bước sau** —
Let's Encrypt sẽ thử cấp chứng chỉ, thất bại, và có giới hạn số lần thử mỗi giờ.

> Tên miền `.io.vn` do nhà đăng ký Việt Nam quản lý. Nếu trang quản trị của họ
> không cho sửa bản ghi A trực tiếp, chuyển nameserver sang Cloudflare rồi khai
> báo ở đó. Dùng Cloudflare thì để chế độ **DNS only** (mây xám) lúc đầu, vì
> chế độ proxy (mây cam) sẽ chặn Caddy xác thực với Let's Encrypt.

### Bước 2: Chuẩn bị máy chủ

VPS Ubuntu 22.04 trở lên, tối thiểu 2 GB RAM (4 GB thì thoải mái hơn).

```bash
ssh root@<IP máy chủ>
curl -fsSL https://get.docker.com | sh

# Chỉ mở đúng ba cổng cần thiết
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable

git clone https://github.com/<tài-khoản>/<repo>.git /opt/pms
cd /opt/pms
```

### Bước 3: Điền biến môi trường

```bash
cp .env.production.example .env.production

# Sinh ba chuỗi bí mật khác nhau
openssl rand -base64 48   # → POSTGRES_PASSWORD
openssl rand -base64 48   # → JWT_ACCESS_SECRET
openssl rand -base64 48   # → JWT_REFRESH_SECRET

nano .env.production
```

Bắt buộc phải điền: `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `SEED_ADMIN_PASSWORD`. Những biến còn lại đã có giá trị
đúng cho tên miền này.

`.env.production` đã nằm trong `.gitignore` — đừng commit nó.

### Bước 4: Chạy

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Lần build đầu mất khoảng 5–10 phút. `migrate deploy` chạy tự động lúc container
API khởi động. Sau khi các container đã lên, seed dữ liệu nền **một lần duy nhất**:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api npx prisma db seed
```

Theo dõi Caddy xin chứng chỉ:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Vài chục giây sau, mở `https://pmsystem.io.vn` là dùng được.

### Bước 5: Việc phải làm ngay sau khi lên mạng

1. **Đăng nhập bằng tài khoản quản trị** (`SEED_ADMIN_EMAIL`) và đổi mật khẩu.
2. **Khóa các tài khoản demo** trong mục *Người dùng*: `buyer@`, `user@`,
   `ncc-a@`, `ncc-b@`, `finance@`, `director@`, `qa@`, `warehouse@`. Mật khẩu
   của chúng nằm công khai trong README và ngay trên màn hình đăng nhập.
3. **Gỡ khối tài khoản demo khỏi màn hình đăng nhập** — sửa
   `apps/web/src/app/login/page.tsx`, xóa danh sách tài khoản mẫu.
4. **Xác nhận Swagger đã tắt**: `https://api.pmsystem.io.vn/docs` phải trả 404.
5. **Đặt lịch sao lưu** (bước dưới).

### Bước 6: Sao lưu tự động

Không có bước này thì một lần lỡ tay là mất hết.

```bash
mkdir -p /opt/backups
crontab -e
```

Thêm dòng:

```
0 2 * * * cd /opt/pms && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres pg_dump -U pms pms | gzip > /opt/backups/pms-$(date +\%F).sql.gz
30 2 * * 0 find /opt/backups -name 'pms-*.sql.gz' -mtime +30 -delete
```

Rồi **thử phục hồi một lần** vào database tạm. Bản sao lưu chưa từng phục hồi
được coi như chưa có.

File đính kèm nằm trong volume `storage`, `pg_dump` không lấy được. Sao lưu riêng:

```
15 2 * * * docker run --rm -v pms_storage:/data -v /opt/backups:/out alpine tar czf /out/storage-$(date +\%F).tar.gz -C /data .
```

### Cập nhật khi có mã mới

```bash
cd /opt/pms
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migration mới tự chạy khi API khởi động lại. Dữ liệu trong volume không bị đụng.

### Khi có trục trặc

| Hiện tượng | Nguyên nhân thường gặp |
| --- | --- |
| Trình duyệt báo lỗi CORS | `CORS_ORIGIN` sai tên miền, thừa dấu `/` cuối, hoặc còn là `http://` |
| Web tải được nhưng mọi lời gọi API hỏng | Ảnh web build với `NEXT_PUBLIC_API_URL` sai. Phải **build lại**, đặt lại biến lúc chạy không có tác dụng |
| Caddy không xin được chứng chỉ | DNS chưa trỏ đúng, cổng 80 bị chặn, hoặc Cloudflare đang bật proxy (mây cam) |
| Tải file lên rồi mất sau khi deploy | `LOCAL_STORAGE_PATH` không nằm trong volume `storage` |
| PDF đơn hàng lỗi font | Thư mục `assets/fonts` thiếu trong ảnh API |
| API không khởi động, log báo Prisma | `DATABASE_URL` phải trỏ host `postgres`, không phải `localhost` |

---

## Cách thay thế — Vercel + Neon + Fly.io

- **Web** lên Vercel: import repo, đặt Root Directory `apps/web`, thêm biến
  `NEXT_PUBLIC_API_URL`. Vercel tự nhận diện Next.js.
- **Database** dùng Neon (Postgres serverless, có bậc miễn phí). Lấy chuỗi kết
  nối có `?sslmode=require`.
- **API** lên Fly.io bằng `apps/api/Dockerfile` ở phương án 2:
  `fly launch --no-deploy`, rồi `fly secrets set DATABASE_URL=... JWT_ACCESS_SECRET=...`,
  tạo volume `fly volumes create storage --size 1` và mount vào `/app/storage`,
  cuối cùng `fly deploy`.

Vercel **không** chạy được phần API NestJS như một serverless function — nó là
tiến trình chạy dài, có cron quét hạn hợp đồng và giữ kết nối database.

---

## Kiểm tra sau khi lên mạng

Chạy lần lượt, mỗi mục phải đúng:

1. `curl https://api.pmsystem.io.vn/api/health` → `{"status":"ok","database":"ok",…}`
2. Mở `https://pmsystem.io.vn` → hiện trang đăng nhập, không trắng trang
3. Đăng nhập tài khoản quản trị → vào được Tổng quan
4. Mở Console của trình duyệt (F12) → không có lỗi CORS
5. `https://api.pmsystem.io.vn/docs` → phải trả về **404**. Nếu vẫn mở được
   Swagger thì `NODE_ENV` chưa phải `production`
6. Vào **Hợp đồng** → tải lên một file → deploy lại một lần → quay lại xem file
   còn không. Nếu mất, volume chưa gắn vào `/app/storage` hoặc
   `LOCAL_STORAGE_PATH` trỏ chỗ khác
7. Vào **Đơn hàng** → **Tải PDF** → tiếng Việt phải có dấu. Mất dấu nghĩa là
   thư mục `assets/fonts` chưa vào được ảnh
8. Xóa hoặc khóa toàn bộ tài khoản demo trong mục **Người dùng**. Trang đăng
   nhập đang liệt kê công khai danh sách này, nên đây là bước bắt buộc
9. Đổi mật khẩu tài khoản quản trị tại **Tài khoản của tôi**

---

## Nên làm thêm trước khi dùng thật

Những điểm này chưa có trong mã nguồn, xếp theo mức quan trọng:

1. **Khóa tài khoản sau N lần sai mật khẩu.** Hiện chỉ giới hạn theo IP, kẻ tấn
   công đổi IP là vượt qua.
2. **Cấu hình SMTP.** `NotificationsService.sendEmail` đang ghi log thay vì gửi
   thật, nên người dùng chỉ nhận được thông báo khi mở web.
3. **Chuyển file đính kèm sang S3/MinIO** nếu định chạy nhiều bản API song song.
4. **Giám sát và cảnh báo** (Sentry hoặc tương đương) để biết khi API lỗi.
5. **Dọn `refresh_tokens` hết hạn** định kỳ, bảng này chỉ tăng chứ không tự xóa.

---

## Nếu chưa đẩy được mã lên GitHub

Từ Terminal trên máy của bạn (không dán token vào chỗ nào khác):

```bash
cd /Users/trantin/Downloads/PMS---BTM-Demo
git remote -v                      # kiểm tra remote đã đúng chưa
git add -A && git commit -m "PMS"
git push -u origin main
```

Nếu bị hỏi mật khẩu, GitHub không nhận mật khẩu tài khoản nữa mà cần Personal
Access Token: tạo tại https://github.com/settings/tokens (chọn quyền `repo`),
rồi dán vào ô mật khẩu khi `git push` hỏi. Token là bí mật — không gửi qua chat
hay email; nếu lỡ để lộ, vào đúng trang đó thu hồi ngay.
