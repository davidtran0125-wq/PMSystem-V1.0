-- Xóa sạch dữ liệu đo hiệu năng, trả cơ sở dữ liệu về đúng trạng thái trước đó.
--
--   docker exec -i pms-postgres psql -U pms -d pms < scripts/perf-clean.sql
--
-- Chỉ chạm vào bản ghi có mã tiền tố PERF-. Dữ liệu thật không có tiền tố này.

\set ON_ERROR_STOP on
\timing on

DELETE FROM purchase_request_items i
USING purchase_requests pr
WHERE i."purchaseRequestId" = pr.id AND pr.code LIKE 'PR-PERF-%';

DELETE FROM purchase_requests WHERE code LIKE 'PR-PERF-%';

VACUUM ANALYZE purchase_requests;
VACUUM ANALYZE purchase_request_items;

SELECT
  (SELECT count(*) FROM purchase_requests) AS purchase_requests,
  (SELECT count(*) FROM purchase_request_items) AS items,
  pg_size_pretty(pg_database_size('pms')) AS db_size;
