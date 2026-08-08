/**
 * Kiểm thử các bộ đếm trạng thái, phân trang 10 dòng, quản lý biểu mẫu và
 * cấu hình luồng duyệt:
 *
 *   npm run db:seed && npm run dev:api
 *   node scripts/status-counts-test.mjs
 *
 * Mỗi bộ đếm được đối chiếu với chính danh sách nó mô tả: tổng phải khớp
 * `meta.total` và số của một trạng thái phải khớp danh sách lọc theo trạng thái
 * đó. Nếu điều kiện lọc của hai đường tách nhau thì phép so này sẽ đỏ.
 */
const API = process.env.API_URL ?? 'http://localhost:4000/api';
let pass = 0, fail = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const check = (n, c, e) => c ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}`, e !== undefined ? JSON.stringify(e).slice(0, 300) : ''));

async function login(email, password = 'Admin@123') {
  const r = await call('POST', '/auth/login', { body: { email, password } });
  if (r.status > 201) throw new Error(`login ${email}: ${JSON.stringify(r.data)}`);
  return r.data.accessToken;
}

const admin = await login('admin@pms.local');
const buyer = await login('buyer@pms.local');
const enduser = await login('user@pms.local');
const nccA = await login('ncc-a@pms.local');

// ---------------------------------------------------------------------------
console.log('\n== Bộ đếm trạng thái khớp với chính danh sách nó mô tả ==');

const SECTIONS = [
  ['yeu cau mua hang', '/purchase-requests/status-counts', '/purchase-requests', 'APPROVED'],
  ['rfq', '/rfqs/status-counts', '/rfqs', 'AWARDED'],
  ['don hang', '/purchase-orders/status-counts', '/purchase-orders', 'ISSUED'],
  ['nha cung cap', '/suppliers/status-counts', '/suppliers', 'APPROVED'],
  ['vat tu', '/materials/status-counts', '/materials', 'ACTIVE'],
  ['de xuat ma vat tu', '/materials/change-requests/status-counts', '/materials/change-requests', 'APPROVED'],
  ['hop dong', '/contracts/status-counts', '/contracts', 'EXPIRING'],
  ['chung chi', '/certificates/status-counts', '/certificates', 'EXPIRING'],
  ['tai khoan', '/users/status-counts', '/users', 'ACTIVE'],
];

for (const [name, countPath, listPath, status] of SECTIONS) {
  const counts = await call('GET', countPath, { token: admin });
  check(`${name}: endpoint dem tra 200`, counts.status === 200, counts.data);
  if (counts.status !== 200) continue;

  const all = await call('GET', `${listPath}?pageSize=1`, { token: admin });
  const one = await call('GET', `${listPath}?pageSize=1&status=${status}`, { token: admin });
  check(`${name}: tong khop meta.total`, counts.data.total === all.data.meta.total,
    { dem: counts.data.total, danhSach: all.data.meta.total });
  check(`${name}: dem ${status} khop danh sach loc`, counts.data.counts[status] === one.data.meta.total,
    { dem: counts.data.counts[status], danhSach: one.data.meta.total });
  check(`${name}: liet ke du moi trang thai cua enum`,
    Object.keys(counts.data.counts).length >= 3, counts.data.counts);
}

// Bộ đếm phải bỏ qua chính bộ lọc trạng thái nhưng vẫn tôn trọng bộ lọc khác.
{
  const a = await call('GET', '/purchase-requests/status-counts?status=DRAFT', { token: admin });
  const b = await call('GET', '/purchase-requests/status-counts', { token: admin });
  check('dem khong doi khi bam qua lai giua cac trang thai',
    a.data.total === b.data.total, { coLoc: a.data.total, khongLoc: b.data.total });

  const filtered = await call('GET', '/purchase-requests/status-counts?search=NaOH', { token: admin });
  const list = await call('GET', '/purchase-requests?pageSize=1&search=NaOH', { token: admin });
  check('dem ton trong bo loc tim kiem',
    filtered.data.total === list.data.meta.total,
    { dem: filtered.data.total, danhSach: list.data.meta.total });
}

// ---------------------------------------------------------------------------
console.log('\n== Pham vi du lieu cua bo dem giong het danh sach ==');
{
  const rfq = await call('GET', '/rfqs/status-counts', { token: nccA });
  const rfqList = await call('GET', '/rfqs?pageSize=1', { token: nccA });
  check('NCC: tong RFQ khop danh sach cua chinh minh',
    rfq.data.total === rfqList.data.meta.total, { dem: rfq.data.total, danhSach: rfqList.data.meta.total });
  check('NCC: khong dem RFQ nhap cua ben mua', rfq.data.counts.DRAFT === 0, rfq.data.counts);

  const po = await call('GET', '/purchase-orders/status-counts', { token: nccA });
  const poList = await call('GET', '/purchase-orders?pageSize=1', { token: nccA });
  check('NCC: tong don hang khop danh sach cua chinh minh',
    po.data.total === poList.data.meta.total, { dem: po.data.total, danhSach: poList.data.meta.total });
  check('NCC: khong dem don nhap cua ben mua', po.data.counts.DRAFT === 0, po.data.counts);

  const q = await call('GET', '/rfqs/my-quotations/status-counts', { token: nccA });
  const qList = await call('GET', '/rfqs/my-quotations?pageSize=1', { token: nccA });
  check('NCC: tong bao gia khop danh sach', q.data.total === qList.data.meta.total,
    { dem: q.data.total, danhSach: qList.data.meta.total });

  const buyerQuote = await call('GET', '/rfqs/my-quotations/status-counts', { token: buyer });
  check('ben mua khong goi duoc bo dem bao gia cua NCC', buyerQuote.status >= 400, buyerQuote.status);
}

// ---------------------------------------------------------------------------
console.log('\n== Hang cho duyet: phan trang 10 va dem tren ca hang cho ==');
{
  const q = await call('GET', '/purchase-requests/pending-approval?pageSize=10', { token: buyer });
  check('moi trang toi da 10 ho so', q.data.data.length <= 10, q.data.data.length);
  check('tra ve phan dem', q.data.counts !== undefined, Object.keys(q.data));
  const sum = Object.values(q.data.counts ?? {}).reduce((a, b) => a + b, 0);
  check('tong dem bang meta.total (ca hang cho, khong rieng trang)',
    sum === q.data.meta.total, { sum, total: q.data.meta.total });
}

// ---------------------------------------------------------------------------
console.log('\n== Xoa bieu mau khong can thiet ==');
{
  const cats = await call('GET', '/categories?pageSize=5', { token: admin });
  const cid = cats.data.data[0].id;
  const before = await call('GET', `/categories/${cid}/form`, { token: admin });
  const versions = await call('GET', `/categories/${cid}/forms`, { token: admin });
  check('liet ke duoc cac phien ban bieu mau',
    versions.status === 200 && Array.isArray(versions.data), versions.data);

  const made = await call('POST', `/categories/${cid}/form`, {
    token: admin,
    body: { name: 'Bieu mau kiem thu', fields: [{ key: 'tam', label: 'Tam', type: 'TEXT' }] },
  });
  check('phat hanh phien ban moi', made.status === 201, made.status);

  const denied = await call('DELETE', `/categories/${cid}/forms/${made.data.id}`, { token: enduser });
  check('nguoi dung thuong khong xoa duoc bieu mau (403)', denied.status === 403, denied.status);

  const removed = await call('DELETE', `/categories/${cid}/forms/${made.data.id}`, { token: admin });
  check('admin xoa duoc bieu mau', removed.status === 200 && removed.data.success, removed.data);

  const active = await call('GET', `/categories/${cid}/form`, { token: admin });
  check('phien ban cu duoc dua len dung lai', active.data.id === before.data.id,
    { truoc: before.data.version, sau: active.data.version });

  const again = await call('DELETE', `/categories/${cid}/forms/${made.data.id}`, { token: admin });
  check('xoa lan hai bao khong tim thay (404)', again.status === 404, again.status);
}

// ---------------------------------------------------------------------------
console.log('\n== Admin tu cau hinh luong duyet va han muc ==');
{
  const list = await call('GET', '/approval-workflows?appliesTo=PURCHASE_ORDER', { token: admin });
  check('liet ke luong duyet', list.status === 200 && Array.isArray(list.data.data), list.status);

  const created = await call('POST', '/approval-workflows', {
    token: admin,
    body: {
      name: 'Luong kiem thu tu dong', appliesTo: 'PURCHASE_ORDER',
      minAmount: 1, maxAmount: 2, priority: 99,
      steps: [{ name: 'Cap A' }, { name: 'Cap B' }],
    },
  });
  check('tao luong hai cap', created.status === 201 && created.data.steps.length === 2, created.data);
  check('cap duoc danh so tu 1 theo thu tu',
    created.data.steps.map((s) => s.stepOrder).join(',') === '1,2',
    created.data.steps?.map((s) => s.stepOrder));

  const preview = await call('POST', '/approval-workflows/preview', {
    token: admin, body: { amount: 1, appliesTo: 'PURCHASE_ORDER' },
  });
  check('thu so tien ra dung luong vua tao',
    preview.data.matched && preview.data.workflowId === created.data.id, preview.data);
  check('thu so tien tra ve dung thu tu cap',
    preview.data.steps?.map((s) => s.name).join(',') === 'Cap A,Cap B', preview.data.steps);

  const updated = await call('PUT', `/approval-workflows/${created.data.id}`, {
    token: admin,
    body: {
      name: 'Luong kiem thu doi ten', appliesTo: 'PURCHASE_ORDER',
      minAmount: 1, maxAmount: 2, priority: 99, steps: [{ name: 'Chi mot cap' }],
    },
  });
  check('sua xuong con mot cap', updated.status === 200 && updated.data.steps.length === 1, updated.status);

  const badBand = await call('POST', '/approval-workflows', {
    token: admin, body: { name: 'Khoang nguoc', steps: [{ name: 'X' }], minAmount: 10, maxAmount: 5 },
  });
  check('chan khoang gia tri nguoc (409)', badBand.status === 409, badBand.status);

  const noStep = await call('POST', '/approval-workflows', {
    token: admin, body: { name: 'Khong cap nao', steps: [] },
  });
  check('chan luong khong co cap nao (400)', noStep.status === 400, noStep.status);

  const gone = await call('DELETE', `/approval-workflows/${created.data.id}`, { token: admin });
  check('xoa luong', gone.status === 200, gone.status);
  const after = await call('GET', '/approval-workflows?appliesTo=PURCHASE_ORDER', { token: admin });
  check('luong da xoa bien mat khoi danh sach',
    !after.data.data.some((w) => w.id === created.data.id));

  const buyerTry = await call('GET', '/approval-workflows', { token: buyer });
  check('buyer khong xem duoc cau hinh luong (403)', buyerTry.status === 403, buyerTry.status);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
