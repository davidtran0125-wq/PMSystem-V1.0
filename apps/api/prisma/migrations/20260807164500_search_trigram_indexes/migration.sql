-- Chỉ mục trigram cho ô tìm kiếm.
--
-- Ô tìm kiếm dịch thành `ILIKE '%tu khoa%'`. Dấu % ở đầu làm btree vô dụng nên
-- PostgreSQL phải quét toàn bảng: ở mức một triệu yêu cầu là khoảng 1,4 giây
-- mỗi lần gõ. GIN + trigram xử lý được đúng dạng "chứa chuỗi" này.
--
-- Prisma không khai báo được chỉ mục GIN có toán tử lớp nên viết tay ở đây;
-- schema.prisma ghi chú lại để không ai xóa nhầm khi sinh migration mới.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "purchase_requests_title_trgm_idx"
  ON "purchase_requests" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "purchase_requests_code_trgm_idx"
  ON "purchase_requests" USING gin ("code" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "materials_code_trgm_idx"
  ON "materials" USING gin ("code" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "materials_name_trgm_idx"
  ON "materials" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "purchase_orders_code_trgm_idx"
  ON "purchase_orders" USING gin ("code" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "purchase_orders_title_trgm_idx"
  ON "purchase_orders" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "rfqs_code_trgm_idx"
  ON "rfqs" USING gin ("code" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "rfqs_title_trgm_idx"
  ON "rfqs" USING gin ("title" gin_trgm_ops);

-- Ô tìm kiếm của yêu cầu mua hàng còn quét cả phần mô tả. Thiếu chỉ mục cho
-- nhánh này thì cả mệnh đề OR phải quét tuần tự, hai chỉ mục trên không dùng
-- được — nên nó phải có mặt cùng bộ.
CREATE INDEX IF NOT EXISTS "purchase_requests_description_trgm_idx"
  ON "purchase_requests" USING gin ("description" gin_trgm_ops);
