-- Sinh dữ liệu tải để đo hiệu năng. Mọi bản ghi đều mang mã tiền tố PERF- nên
-- xóa lại được sạch bằng scripts/perf-clean.sql mà không đụng vào dữ liệu thật.
--
--   docker exec -i pms-postgres psql -U pms -d pms -v rows=1000000 < scripts/perf-data.sql
--
-- Dùng INSERT ... SELECT generate_series thay vì Prisma createMany: một triệu
-- dòng qua ORM mất hàng chục phút, qua SQL thuần mất vài chục giây.

\set ON_ERROR_STOP on
\timing on

-- Khóa ngoại phải trỏ vào dữ liệu có thật, nếu không PostgreSQL sẽ từ chối.
CREATE TEMP TABLE _ref AS
SELECT
  (SELECT array_agg(id) FROM users WHERE "deletedAt" IS NULL AND "supplierId" IS NULL) AS user_ids,
  (SELECT array_agg(id) FROM departments WHERE "deletedAt" IS NULL) AS dept_ids,
  (SELECT array_agg(id) FROM categories WHERE "deletedAt" IS NULL) AS cat_ids,
  (SELECT array_agg(id) FROM materials WHERE "deletedAt" IS NULL) AS mat_ids;

INSERT INTO purchase_requests (
  id, code, title, description, status, priority,
  "requesterId", "departmentId", "categoryId",
  currency, "estimatedTotal", "submittedAt", "approvedAt",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  'PR-PERF-' || lpad(g::text, 8, '0'),
  -- Tiêu đề đa dạng để phép tìm kiếm LIKE không trúng toàn bộ hoặc trượt sạch.
  (ARRAY['Mua hoa chat','Mua bao bi','Thue dich vu','Mua phu tung','Mua thiet bi'])[1 + g % 5]
    || ' lo ' || g,
  'Du lieu do hieu nang, dong so ' || g,
  (ARRAY['DRAFT','SUBMITTED','BUYER_REVIEW','APPROVED','REJECTED','CANCELLED']::"PurchaseRequestStatus"[])[1 + g % 6],
  (ARRAY['LOW','NORMAL','HIGH','URGENT']::"Priority"[])[1 + g % 4],
  r.user_ids[1 + g % array_length(r.user_ids, 1)],
  r.dept_ids[1 + g % array_length(r.dept_ids, 1)],
  r.cat_ids[1 + g % array_length(r.cat_ids, 1)],
  'VND',
  ((g % 900) + 1) * 1000000,
  now() - (g % 730) * interval '1 day',
  CASE WHEN g % 6 = 3 THEN now() - (g % 730) * interval '1 day' + interval '2 day' END,
  now() - (g % 730) * interval '1 day',
  now()
FROM generate_series(1, :rows) AS g, _ref r;

-- Hai dòng hàng cho mỗi yêu cầu: bảng con mới là chỗ join tốn kém nhất.
INSERT INTO purchase_request_items (
  id, "purchaseRequestId", "materialId", "lineNo", name, quantity, unit,
  "estimatedPrice", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), pr.id, r.mat_ids[1 + (n + length(pr.code)) % array_length(r.mat_ids, 1)],
  n,
  'Dong hang ' || n || ' cua ' || pr.code,
  10 * n, 'kg', 250000 * n, now(), now()
FROM purchase_requests pr
CROSS JOIN generate_series(1, 2) AS n
CROSS JOIN _ref r
WHERE pr.code LIKE 'PR-PERF-%';

ANALYZE purchase_requests;
ANALYZE purchase_request_items;

SELECT
  (SELECT count(*) FROM purchase_requests) AS purchase_requests,
  (SELECT count(*) FROM purchase_request_items) AS items,
  pg_size_pretty(pg_database_size('pms')) AS db_size;
