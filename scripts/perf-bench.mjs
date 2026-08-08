/**
 * Đo thời gian đáp ứng của các endpoint hay dùng nhất, để so trước và sau khi
 * nạp dữ liệu tải:
 *
 *   node scripts/perf-bench.mjs > /tmp/truoc.txt
 *   docker exec -i pms-postgres psql -U pms -d pms -v rows=1000000 < scripts/perf-data.sql
 *   node scripts/perf-bench.mjs > /tmp/sau.txt
 *
 * Mỗi phép đo chạy một lượt làm nóng rồi lấy trung vị của N lượt. Trung vị chứ
 * không phải trung bình: một lần GC hay một lần đọc đĩa lẻ không được phép làm
 * lệch kết quả.
 */
const API = process.env.API_URL ?? 'http://localhost:4000/api';
const RUNS = Number(process.env.RUNS ?? 7);

async function login(email, password = 'Admin@123') {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.accessToken) throw new Error(`login ${email}: ${JSON.stringify(data)}`);
  return data.accessToken;
}

const token = await login('admin@pms.local');
const buyer = await login('buyer@pms.local');

async function time(path, { as = token } = {}) {
  const started = process.hrtime.bigint();
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${as}` } });
  const body = await res.text();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { ms, status: res.status, bytes: body.length };
}

const CASES = [
  ['danh sach YCMH, trang 1', '/purchase-requests?page=1&pageSize=10'],
  ['danh sach YCMH, trang 1000', '/purchase-requests?page=1000&pageSize=10'],
  ['danh sach YCMH, trang cuoi', '/purchase-requests?page=99999&pageSize=10'],
  ['dem trang thai YCMH', '/purchase-requests/status-counts'],
  ['tim kiem YCMH', '/purchase-requests?pageSize=10&search=hoa%20chat'],
  ['loc trang thai YCMH', '/purchase-requests?pageSize=10&status=APPROVED'],
  ['chi tiet mot YCMH', null], // điền ở dưới, cần một id có thật
  ['hang cho duyet', '/purchase-requests/pending-approval?pageSize=10'],
  ['danh sach RFQ', '/rfqs?page=1&pageSize=10'],
  ['dem trang thai RFQ', '/rfqs/status-counts'],
  ['danh sach don hang', '/purchase-orders?page=1&pageSize=10'],
  ['dem trang thai don hang', '/purchase-orders/status-counts'],
  ['danh muc vat tu', '/materials?page=1&pageSize=10'],
  ['dem trang thai vat tu', '/materials/status-counts'],
  ['tong quan (dashboard)', '/dashboard/overview'],
  ['bieu do chi tieu', '/dashboard/spend'],
  ['tiet kiem PR vs PO', '/dashboard/request-to-order-savings'],
  ['SLA', '/dashboard/sla'],
];

// Lấy một yêu cầu bất kỳ để đo trang chi tiết.
const first = await fetch(`${API}/purchase-requests?pageSize=1`, {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());
const sampleId = first.data?.[0]?.id;
CASES[6][1] = sampleId ? `/purchase-requests/${sampleId}` : null;

console.log(`Số lượt mỗi phép đo: ${RUNS} (lấy trung vị), ${new Date().toISOString()}`);
console.log('');
console.log('phép đo                        | trung vị |    thấp |     cao |  mã |    KB');
console.log('-------------------------------|----------|---------|---------|-----|------');

const results = [];
for (const [name, path] of CASES) {
  if (!path) {
    console.log(`${name.padEnd(30)} | (bỏ qua: không có dữ liệu mẫu)`);
    continue;
  }
  const as = name === 'hang cho duyet' ? buyer : token;
  await time(path, { as }); // làm nóng, không tính

  const samples = [];
  let status = 0, bytes = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = await time(path, { as });
    samples.push(r.ms);
    status = r.status;
    bytes = r.bytes;
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  results.push({ name, median, status });
  console.log(
    `${name.padEnd(30)} | ${median.toFixed(0).padStart(6)}ms | ${samples[0].toFixed(0).padStart(5)}ms | ` +
    `${samples[samples.length - 1].toFixed(0).padStart(5)}ms | ${String(status).padStart(3)} | ` +
    `${(bytes / 1024).toFixed(0).padStart(5)}`,
  );
}

const slow = results.filter((r) => r.median > 300);
console.log('');
console.log(
  slow.length
    ? `Chậm hơn 300ms: ${slow.map((r) => `${r.name} (${r.median.toFixed(0)}ms)`).join(', ')}`
    : 'Không phép đo nào vượt 300ms.',
);
const bad = results.filter((r) => r.status >= 400);
if (bad.length) console.log(`Lỗi HTTP: ${bad.map((r) => `${r.name}=${r.status}`).join(', ')}`);
