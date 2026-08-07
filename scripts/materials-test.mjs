/**
 * Kiểm thử danh mục vật tư: đề xuất mã mới do người dùng tạo và admin duyệt,
 * điều chỉnh mã, ngừng dùng mã, và lịch sử đặt hàng theo mã. Cần API đang chạy
 * và đã seed dữ liệu:
 *
 *   npm run db:seed && npm run dev:api
 *   npm run materials-test
 */
const API = 'http://localhost:4000/api';
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
async function must(method, path, opts = {}) {
  const r = await call(method, path, opts);
  if (r.status > 201) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.data).slice(0, 250)}`);
  return r.data;
}

const admin = await login('admin@pms.local');
const buyer = await login('buyer@pms.local');
const enduser = await login('user@pms.local');
const nccA = await login('ncc-a@pms.local', 'Admin@123');
const stamp = Date.now().toString().slice(-6);

// ===========================================================================
console.log('\n=== 1. Danh mục ===');
const list = await call('GET', '/materials?pageSize=50', { token: enduser });
check('doc duoc danh muc', list.status === 200 && list.data.data.length >= 5, list.data.meta);
check('co du 5 ma seed',
  ['HC-NAOH-32', 'HC-H2SO4-98', 'BB-CAN-25L', 'BB-IBC-1000', 'MTB-BOM-CN40']
    .every((c) => list.data.data.some((m) => m.code === c)),
  list.data.data?.map((m) => m.code));
check('sap xep theo ma', list.data.data[0].code <= list.data.data[1].code,
  list.data.data.slice(0, 2).map((m) => m.code));

const search = await call('GET', '/materials?search=naoh', { token: enduser });
check('tim kiem khong phan biet hoa thuong',
  search.data.data.length >= 1 && search.data.data.every((m) => /naoh/i.test(m.code + m.name)),
  search.data.data?.map((m) => m.code));

const naoh = list.data.data.find((m) => m.code === 'HC-NAOH-32');

// ===========================================================================
console.log('\n=== 2. Người dùng tạo mã mới, admin duyệt ===');
const proposed = await call('POST', '/materials', { token: enduser, body: {
  code: `HC-TEST-${stamp}`,
  name: 'Hoa chat thu nghiem',
  unit: 'lit',
  specification: 'Dung cho kiem thu tu dong',
  standardPrice: 15000,
  reason: 'Line 3 can dung tu quy sau',
}});
check('End User de xuat duoc ma moi', proposed.status === 201, proposed.data);
check('de xuat o trang thai cho duyet', proposed.data.status === 'PENDING', proposed.data.status);
check('loai de xuat la CREATE', proposed.data.type === 'CREATE', proposed.data.type);

const created = await call('GET', `/materials/${proposed.data.materialId}`, { token: enduser });
check('ma moi chua duoc ban hanh', created.data.status === 'PENDING', created.data.status);

const activeOnly = await call('GET', '/materials?activeOnly=true&pageSize=100', { token: enduser });
check('ma cho duyet khong lot vao danh sach dung duoc',
  !activeOnly.data.data.some((m) => m.id === proposed.data.materialId),
  activeOnly.data.data?.length);

const nccSees = await call('GET', '/materials?pageSize=100', { token: nccA });
check('NCC khong thay ma cho duyet',
  !nccSees.data.data.some((m) => m.status !== 'ACTIVE'), nccSees.data.data?.length);

const euApprove = await call('POST', `/materials/change-requests/${proposed.data.id}/approve`, { token: enduser });
check('End User khong tu duyet duoc (403)', euApprove.status === 403, euApprove.status);

const queue = await call('GET', '/materials/change-requests?status=PENDING', { token: admin });
check('de xuat nam trong hang cho cua admin',
  queue.data.data.some((r) => r.id === proposed.data.id), queue.data.meta);

const euQueue = await call('GET', '/materials/change-requests', { token: buyer });
check('nguoi khong co quyen duyet chi thay de xuat cua minh',
  euQueue.data.data.every((r) => r.requestedBy.email === 'buyer@pms.local'),
  euQueue.data.data?.map((r) => r.requestedBy.email));

const approved = await call('POST', `/materials/change-requests/${proposed.data.id}/approve`, {
  token: admin, body: { note: 'Dung nhu cau' },
});
check('admin duyet duoc', approved.data.status === 'APPROVED', approved.data.status);

const nowActive = await call('GET', `/materials/${proposed.data.materialId}`, { token: enduser });
check('ma chuyen sang dang dung', nowActive.data.status === 'ACTIVE', nowActive.data.status);
check('ghi nhan nguoi duyet', nowActive.data.approvedBy?.id, nowActive.data.approvedBy);

const twice = await call('POST', `/materials/change-requests/${proposed.data.id}/approve`, { token: admin });
check('khong duyet lai lan hai (400)', twice.status === 400, twice.data?.message);

// ===========================================================================
console.log('\n=== 3. Mã trùng và mã tự cấp ===');
const dup = await call('POST', '/materials', { token: enduser, body: {
  code: 'HC-NAOH-32', name: 'Trung ma', unit: 'kg',
}});
check('chan ma trung (400)', dup.status === 400, dup.data?.message);

const badCode = await call('POST', '/materials', { token: enduser, body: {
  code: 'a b', name: 'Ma sai dinh dang', unit: 'kg',
}});
check('chan ma sai dinh dang (400)', badCode.status === 400, badCode.data?.message);

const auto = await call('POST', '/materials', { token: admin, body: {
  name: `Vat tu tu cap ma ${stamp}`, unit: 'cai',
}});
const autoMat = await call('GET', `/materials/${auto.data.materialId}`, { token: admin });
check('bo trong thi tu cap ma MAT-yyyy-nnnnn',
  /^MAT-\d{4}-\d{5}$/.test(autoMat.data.code), autoMat.data.code);
check('admin tao thi duyet luon', auto.data.status === 'APPROVED', auto.data.status);
check('ma cua admin dung duoc ngay', autoMat.data.status === 'ACTIVE', autoMat.data.status);

// ===========================================================================
console.log('\n=== 4. Điều chỉnh mã ===');
const edit = await call('PATCH', `/materials/${proposed.data.materialId}`, { token: enduser, body: {
  name: 'Hoa chat thu nghiem (da sua)', standardPrice: 17000, reason: 'Cap nhat gia thi truong',
}});
check('de xuat sua duoc gui', edit.status < 300 && edit.data.type === 'UPDATE',
  { status: edit.status, type: edit.data.type });
check('luu lai gia tri truoc khi sua', edit.data.snapshot?.name === 'Hoa chat thu nghiem',
  edit.data.snapshot?.name);

const beforeApply = await call('GET', `/materials/${proposed.data.materialId}`, { token: enduser });
check('chua duyet thi chua doi', beforeApply.data.name === 'Hoa chat thu nghiem',
  beforeApply.data.name);

const second = await call('PATCH', `/materials/${proposed.data.materialId}`, { token: buyer, body: {
  name: 'Nguoi khac sua chen',
}});
check('chan 2 de xuat cho duyet tren cung 1 ma (400)', second.status === 400, second.data?.message);

const noChange = await call('PATCH', `/materials/${naoh.id}`, { token: enduser, body: { reason: 'khong doi gi' }});
check('chan de xuat rong (400)', noChange.status === 400, noChange.data?.message);

await must('POST', `/materials/change-requests/${edit.data.id}/approve`, { token: admin });
const afterApply = await call('GET', `/materials/${proposed.data.materialId}`, { token: enduser });
check('duyet xong moi doi', afterApply.data.name === 'Hoa chat thu nghiem (da sua)',
  afterApply.data.name);
check('gia tham chieu da cap nhat', Number(afterApply.data.standardPrice) === 17000,
  afterApply.data.standardPrice);

// ===========================================================================
console.log('\n=== 5. Từ chối và rút lại ===');
const toReject = await call('PATCH', `/materials/${proposed.data.materialId}`, { token: enduser, body: {
  unit: 'tan', reason: 'Doi don vi tinh',
}});
const noReason = await call('POST', `/materials/change-requests/${toReject.data.id}/reject`, { token: admin });
check('tu choi phai neu ly do (400)', noReason.status === 400, noReason.data?.message);

const rejected = await call('POST', `/materials/change-requests/${toReject.data.id}/reject`, {
  token: admin, body: { note: 'Don vi tinh phai giu la lit' },
});
check('tu choi duoc kem ly do', rejected.data.status === 'REJECTED', rejected.data.status);
const stillLit = await call('GET', `/materials/${proposed.data.materialId}`, { token: enduser });
check('bi tu choi thi khong doi gi', stillLit.data.unit === 'lit', stillLit.data.unit);

const toCancel = await call('PATCH', `/materials/${proposed.data.materialId}`, { token: enduser, body: {
  brand: 'Thu nghiem',
}});
const otherCancel = await call('POST', `/materials/change-requests/${toCancel.data.id}/cancel`, { token: buyer });
check('nguoi khac khong rut lai duoc (403)', otherCancel.status === 403, otherCancel.status);
const cancelled = await call('POST', `/materials/change-requests/${toCancel.data.id}/cancel`, { token: enduser });
check('nguoi de xuat rut lai duoc', cancelled.data.status === 'CANCELLED', cancelled.data.status);

const rejectedNew = await call('POST', '/materials', { token: enduser, body: {
  code: `HC-BODI-${stamp}`, name: 'Ma se bi tu choi', unit: 'kg',
}});
await must('POST', `/materials/change-requests/${rejectedNew.data.id}/reject`, {
  token: admin, body: { note: 'Da co ma tuong duong' },
});
const gone = await call('GET', `/materials/${rejectedNew.data.materialId}`, { token: admin });
check('ma moi bi tu choi khong con trong danh muc (404)', gone.status === 404, gone.status);

// ===========================================================================
console.log('\n=== 6. Ngừng dùng mã ===');
const unusedRemove = await call('DELETE', `/materials/${auto.data.materialId}`, {
  token: admin, body: { reason: 'Tao nham' },
});
check('admin xoa ma chua dung', unusedRemove.data.status === 'APPROVED', unusedRemove.data);
const removedUnused = await call('GET', `/materials/${auto.data.materialId}`, { token: admin });
check('ma chua dung thi bien mat han (404)', removedUnused.status === 404, removedUnused.status);

// ===========================================================================
console.log('\n=== 7. Lịch sử đặt hàng theo mã ===');
// Dựng một vòng mua hàng đầy đủ gắn mã NaOH, để lịch sử có số liệu thật
const cats = await must('GET', '/categories?pageSize=100', { token: enduser });
const chemical = cats.data.find((c) => c.code === 'CHEMICAL');
const pr = await must('POST', '/purchase-requests', { token: enduser, body: {
  title: `Mua theo ma vat tu ${stamp}`,
  categoryId: chemical.id,
  items: [{ materialId: naoh.id, name: naoh.name, quantity: 800, unit: naoh.unit, estimatedPrice: 19000 }],
  dynamicValues: { casNumber: '1310-73-2', quantity: 800 },
}});
check('dong hang giu duoc ma vat tu', pr.items[0].materialId === naoh.id, pr.items[0].materialId);
check('tra ve kem thong tin ma', pr.items[0].material?.code === 'HC-NAOH-32', pr.items[0].material);

await must('POST', `/purchase-requests/${pr.id}/submit`, { token: enduser });
await must('POST', `/purchase-requests/${pr.id}/approve`, { token: buyer, body: {} });

const suppliers = await must('GET', '/suppliers?status=APPROVED&pageSize=100', { token: buyer });
const sa = suppliers.data.find((s) => s.email === 'ncc-a@pms.local');
const rfq = await must('POST', '/rfqs', { token: buyer, body: {
  purchaseRequestId: pr.id, supplierIds: [sa.id],
}});
await must('POST', `/rfqs/${rfq.id}/send`, { token: buyer });
const quote = await must('POST', `/rfqs/${rfq.id}/quotations`, { token: nccA, body: {
  leadTimeDays: 7,
  items: [{ name: naoh.name, quantity: 800, unit: naoh.unit, unitPrice: 18500 }],
}});
check('bao gia ke thua ma tu yeu cau mua', quote.items[0].materialId === naoh.id,
  quote.items[0].materialId);

const cmp = await must('GET', `/rfqs/${rfq.id}/compare`, { token: buyer });
await must('POST', `/rfqs/${rfq.id}/award`, { token: buyer, body: {
  awards: [{ quotationId: cmp.quotations[0].quotationId }],
}});
const po = await must('POST', '/purchase-orders/from-rfq', { token: buyer, body: {
  rfqId: rfq.id, taxRate: 10,
}});
check('don hang ke thua ma tu bao gia', po.items[0].materialId === naoh.id, po.items[0].materialId);
// Đơn hàng giờ phải qua chuỗi duyệt trước khi phát hành.
const director = await login('director@pms.local');
const finance = await login('finance@pms.local');
await must('POST', `/purchase-orders/${po.id}/submit-for-approval`, { token: buyer });
let poState = await must('GET', `/purchase-orders/${po.id}`, { token: buyer });
while (poState.status === 'PENDING_APPROVAL') {
  const role = poState.currentStep?.role?.code;
  const approver = role === 'FINANCE' ? finance : role === 'SUPER_ADMIN' ? admin : director;
  poState = await must('POST', `/purchase-orders/${po.id}/approve`, { token: approver, body: {} });
}
await must('POST', `/purchase-orders/${po.id}/issue`, { token: buyer });

const history = await call('GET', `/materials/${naoh.id}/order-history`, { token: buyer });
check('doc duoc lich su dat hang', history.status === 200, history.data);
check('don hang vua tao co trong lich su',
  history.data.orders.some((o) => o.purchaseOrder.code === po.code),
  history.data.orders?.map((o) => o.purchaseOrder.code));
check('thong ke so don hang', history.data.summary.orders >= 1, history.data.summary);
check('gia binh quan gia quyen nam trong khoang gia',
  history.data.summary.averagePrice >= history.data.summary.lowestPrice &&
  history.data.summary.averagePrice <= history.data.summary.highestPrice,
  history.data.summary);
check('tong hop theo nha cung cap',
  history.data.bySupplier.some((s) => s.supplier.companyName === sa.companyName),
  history.data.bySupplier?.map((s) => s.supplier.companyName));
check('lich su nhu cau tu yeu cau mua',
  history.data.requests.some((r) => r.purchaseRequest.code === pr.code),
  history.data.requests?.map((r) => r.purchaseRequest.code));

// Đảm bảo mã đang ACTIVE trước khi thử ngừng dùng, để chạy lại nhiều lần vẫn đúng
const naohNow = await must('GET', `/materials/${naoh.id}`, { token: admin });
if (naohNow.status !== 'ACTIVE') {
  await must('POST', `/materials/${naoh.id}/restore`, { token: admin, body: {} });
}
// --- Tóm tắt giá dùng cho màn duyệt yêu cầu và màn tạo đơn hàng
const others = list.data.data.filter((m) => m.code.startsWith('BB-')).map((m) => m.id);
const bulk = await call('GET', `/materials/price-summary?ids=${[naoh.id, ...others].join(',')}`,
  { token: buyer });
check('tom tat gia tra ve theo id', bulk.status === 200 && naoh.id in bulk.data,
  Object.keys(bulk.data ?? {}));
const sum = bulk.data[naoh.id];
check('co so lan mua', sum.orders >= 1, sum.orders);
check('co gia thap nhat va cao nhat',
  sum.lowestPrice !== null && sum.highestPrice !== null && sum.lowestPrice <= sum.highestPrice,
  { thap: sum.lowestPrice, cao: sum.highestPrice });
check('gia binh quan nam trong khoang',
  sum.averagePrice >= sum.lowestPrice && sum.averagePrice <= sum.highestPrice, sum);
check('co lan mua gan nhat kem NCC va ma don',
  Boolean(sum.lastOrderedAt && sum.lastSupplier && sum.lastPurchaseOrder?.code), sum);
check('khop voi lich su chi tiet cua chinh ma do',
  sum.orders === history.data.summary.orders &&
  sum.lowestPrice === history.data.summary.lowestPrice,
  { bulk: sum.orders, detail: history.data.summary.orders });

const empty = await call('GET', '/materials/price-summary?ids=', { token: buyer });
check('khong truyen id thi tra ve rong',
  empty.status === 200 && Object.keys(empty.data).length === 0, empty.data);

const nccBulk = await call('GET', `/materials/price-summary?ids=${naoh.id}`, { token: nccA });
check('NCC khong tra cuu duoc gia lich su (403)', nccBulk.status === 403, nccBulk.status);
const nccHistory = await call('GET', `/materials/${naoh.id}/order-history`, { token: nccA });
check('NCC khong xem duoc lich su dat hang (403)', nccHistory.status === 403, nccHistory.status);
const nccCatalogue = await call('GET', '/materials?pageSize=5', { token: nccA });
check('NCC van tra cuu duoc danh muc ma', nccCatalogue.status === 200, nccCatalogue.status);

const usedRemove = await call('DELETE', `/materials/${naoh.id}`, {
  token: admin, body: { reason: 'Thu xoa ma da dung' },
});
check('xoa ma da dung', usedRemove.data.status === 'APPROVED', usedRemove.data);
const stillThere = await call('GET', `/materials/${naoh.id}`, { token: admin });
check('ma da dung chi ngung dung, van tra cuu duoc',
  stillThere.status === 200 && stillThere.data.status === 'INACTIVE', stillThere.data?.status);
const historyAfter = await call('GET', `/materials/${naoh.id}/order-history`, { token: buyer });
check('lich su dat hang van con sau khi ngung dung',
  historyAfter.status === 200 && historyAfter.data.orders.length >= 1,
  historyAfter.data?.summary);

const restored = await call('POST', `/materials/${naoh.id}/restore`, {
  token: admin, body: { reason: 'Khoi phuc sau kiem thu' },
});
check('khoi phuc duoc ma da ngung dung', restored.data.status === 'APPROVED', restored.data);
const backActive = await must('GET', `/materials/${naoh.id}`, { token: admin });
check('ma tro lai dung duoc', backActive.status === 'ACTIVE', backActive.status);
const restoreTwice = await call('POST', `/materials/${naoh.id}/restore`, { token: admin, body: {} });
check('ma dang dung thi khong khoi phuc lai (400)', restoreTwice.status === 400,
  restoreTwice.data?.message);

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
