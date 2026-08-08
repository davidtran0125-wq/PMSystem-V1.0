/**
 * Kiểm thử duyệt đơn hàng theo cấp, chỉnh sửa và bảng khác biệt, cùng việc
 * nhà cung cấp thua thầu không xem được thông tin của bên trúng:
 *
 *   npm run db:seed && npm run dev:api
 *   npm run orders-test
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
  return { status: res.status, data, text };
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
const director = await login('director@pms.local');
const finance = await login('finance@pms.local');
const nccA = await login('ncc-a@pms.local');
const nccB = await login('ncc-b@pms.local');
const stamp = Date.now().toString().slice(-6);

/** Dựng một RFQ hai dòng hàng với hai báo giá để có đơn hàng thật mà thử. */
async function seedOrder() {
  const cats = await must('GET', '/categories?pageSize=100', { token: enduser });
  const chemical = cats.data.find((c) => c.code === 'CHEMICAL');
  const mats = await must('GET', '/materials?activeOnly=true&pageSize=100', { token: buyer });
  const naoh = mats.data.find((m) => m.code === 'HC-NAOH-32');
  const can = mats.data.find((m) => m.code === 'BB-CAN-25L');

  const pr = await must('POST', '/purchase-requests', { token: enduser, body: {
    title: `Don hang kiem thu ${stamp}`, categoryId: chemical.id,
    items: [
      { materialId: naoh.id, name: naoh.name, quantity: 500, unit: naoh.unit, estimatedPrice: 20000 },
      { materialId: can.id, name: can.name, quantity: 100, unit: can.unit, estimatedPrice: 50000 },
    ],
    dynamicValues: { casNumber: '1310-73-2', quantity: 500 },
  }});
  await must('POST', `/purchase-requests/${pr.id}/submit`, { token: enduser });
  await must('POST', `/purchase-requests/${pr.id}/approve`, { token: buyer, body: {} });

  const sups = await must('GET', '/suppliers?status=APPROVED&pageSize=100', { token: buyer });
  const sa = sups.data.find((s) => s.email === 'ncc-a@pms.local');
  const sb = sups.data.find((s) => s.email === 'ncc-b@pms.local');
  const rfq = await must('POST', '/rfqs', { token: buyer, body: {
    purchaseRequestId: pr.id, supplierIds: [sa.id, sb.id],
  }});
  await must('POST', `/rfqs/${rfq.id}/send`, { token: buyer });
  for (const [tok, price] of [[nccA, 18000], [nccB, 21000]]) {
    await must('POST', `/rfqs/${rfq.id}/quotations`, { token: tok, body: {
      leadTimeDays: 7,
      items: [
        { name: naoh.name, quantity: 500, unit: naoh.unit, unitPrice: price },
        { name: can.name, quantity: 100, unit: can.unit, unitPrice: 50000 },
      ],
    }});
  }
  const cmp = await must('GET', `/rfqs/${rfq.id}/compare`, { token: buyer });
  // Đối chiếu theo id nhà cung cấp. Bảng so sánh không trả về email, nên bản
  // trước lọc theo `q.supplier.email` luôn khớp dòng đầu tiên — thứ tự dòng phụ
  // thuộc dữ liệu nên bài kiểm thử lúc đúng lúc sai. Phần khẳng định bên dưới
  // giả định NCC A trúng và NCC B thua, nên chỗ này phải đúng đích danh.
  const winner = cmp.quotations.find((q) => q.supplier.id === sa.id);
  const loser = cmp.quotations.find((q) => q.supplier.id === sb.id);
  if (!winner || !loser) {
    throw new Error('Không tìm thấy báo giá của cả hai nhà cung cấp trong bảng so sánh');
  }
  await must('POST', `/rfqs/${rfq.id}/award`, { token: buyer, body: {
    awards: [{ quotationId: winner.quotationId }],
  }});
  const po = await must('POST', '/purchase-orders/from-rfq', { token: buyer, body: {
    rfqId: rfq.id, quotationId: winner.quotationId, taxRate: 10,
  }});
  return { rfq, po, winner, loser };
}

// ===========================================================================
console.log('\n=== 0. Đấu thầu kín: không ai xem được giá tới khi chào giá xong ===');

/** RFQ mời hai NCC nhưng chỉ một bên nộp — vòng chào giá chưa khép lại. */
async function seedSealedRfq() {
  const cats = await must('GET', '/categories?pageSize=100', { token: enduser });
  const chemical = cats.data.find((c) => c.code === 'CHEMICAL');
  const mats = await must('GET', '/materials?activeOnly=true&pageSize=100', { token: buyer });
  const naoh = mats.data.find((m) => m.code === 'HC-NAOH-32');

  const pr = await must('POST', '/purchase-requests', { token: enduser, body: {
    title: `Dau thau kin ${stamp}`, categoryId: chemical.id,
    items: [{ materialId: naoh.id, name: naoh.name, quantity: 300, unit: naoh.unit, estimatedPrice: 20000 }],
    dynamicValues: { casNumber: '1310-73-2', quantity: 300 },
  }});
  await must('POST', `/purchase-requests/${pr.id}/submit`, { token: enduser });
  await must('POST', `/purchase-requests/${pr.id}/approve`, { token: buyer, body: {} });

  const sups = await must('GET', '/suppliers?status=APPROVED&pageSize=100', { token: buyer });
  const sa = sups.data.find((s) => s.email === 'ncc-a@pms.local');
  const sb = sups.data.find((s) => s.email === 'ncc-b@pms.local');
  const rfq = await must('POST', '/rfqs', { token: buyer, body: {
    purchaseRequestId: pr.id, supplierIds: [sa.id, sb.id],
  }});
  await must('POST', `/rfqs/${rfq.id}/send`, { token: buyer });
  // Chỉ NCC A nộp, NCC B im lặng.
  await must('POST', `/rfqs/${rfq.id}/quotations`, { token: nccA, body: {
    leadTimeDays: 6,
    items: [{ name: naoh.name, quantity: 300, unit: naoh.unit, unitPrice: 17777 }],
  }});
  return rfq;
}

const sealedRfq = await seedSealedRfq();
const SECRET = '17777';

const sealedCmp = await call('GET', `/rfqs/${sealedRfq.id}/compare`, { token: buyer });
check('bang so sanh bao dang niem phong', sealedCmp.data.sealed === true, sealedCmp.data.sealed);
check('khong lo don gia cho nguoi mua', !sealedCmp.text.includes(SECRET), 'lo gia');
check('khong lo tong tien', sealedCmp.data.summary.lowestTotal === null, sealedCmp.data.summary);
check('van biet ai da nop va nop luc nao',
  sealedCmp.data.quotations.length === 1 && Boolean(sealedCmp.data.quotations[0].submittedAt),
  sealedCmp.data.quotations?.[0]);
check('neu ro con bao nhieu NCC chua tra loi',
  sealedCmp.data.seal.pendingSuppliers === 1, sealedCmp.data.seal);

const sealedDetail = await call('GET', `/rfqs/${sealedRfq.id}`, { token: buyer });
check('chi tiet RFQ cung che gia', sealedDetail.data.sealed === true, sealedDetail.data.sealed);
check('chi tiet RFQ khong lo gia', !sealedDetail.text.includes(SECRET), 'lo gia');

const adminCmp = await call('GET', `/rfqs/${sealedRfq.id}/compare`, { token: admin });
check('ke ca admin cung khong xem duoc gia', !adminCmp.text.includes(SECRET), 'lo gia');

const earlyAward = await call('POST', `/rfqs/${sealedRfq.id}/award`, { token: buyer, body: {
  awards: [{ quotationId: sealedCmp.data.quotations[0].quotationId }],
}});
check('khong trao thau khi con niem phong (400)', earlyAward.status === 400, earlyAward.data?.message);

const earlyAi = await call('POST', `/ai/rfqs/${sealedRfq.id}/analyze-quotations`, { token: buyer });
check('AI cung khong phan tich duoc khi con niem phong',
  earlyAi.status === 400 || earlyAi.status === 503, earlyAi.status);

// Nhà cung cấp vẫn xem được báo giá của chính mình
const ownQuote = await call('GET', `/rfqs/${sealedRfq.id}`, { token: nccA });
check('NCC van xem duoc bao gia cua chinh minh',
  ownQuote.text.includes(SECRET), 'khong thay gia cua chinh minh');

// Đóng nhận báo giá thì mở niêm phong
await must('POST', `/rfqs/${sealedRfq.id}/close`, { token: buyer });
const opened = await call('GET', `/rfqs/${sealedRfq.id}/compare`, { token: buyer });
check('dong nhan bao gia thi mo niem phong', opened.data.sealed === false, opened.data.sealed);
check('luc nay moi thay gia', opened.text.includes(SECRET), 'van chua thay gia');
check('tinh lai duoc gia thap nhat', opened.data.summary.lowestTotal !== null, opened.data.summary);

// ===========================================================================
console.log('\n=== 1. Nhà cung cấp thua thầu ===');
const { rfq, po, winner, loser } = await seedOrder();

const asLoser = await call('GET', `/rfqs/${rfq.id}`, { token: nccB });
check('NCC thua van xem duoc RFQ cua minh', asLoser.status === 200, asLoser.status);
check('khong thay ten ben trung thau',
  !asLoser.text.includes(winner.supplier.companyName), 'lo ten');
check('khong thay don gia ben trung thau',
  !asLoser.text.includes(String(winner.items[0].unitPrice)), 'lo gia');
check('chi thay so doi thu, khong thay ten',
  asLoser.data.competitorCount === 1 &&
  (asLoser.data.suppliers ?? []).every((s) => s.supplierId === loser.supplier.id),
  { count: asLoser.data.competitorCount, n: asLoser.data.suppliers?.length });
check('biet ket qua cua chinh minh', asLoser.data.myResult === 'LOST', asLoser.data.myResult);
check('chi thay bao gia cua chinh minh',
  (asLoser.data.quotations ?? []).length === 1, asLoser.data.quotations?.length);

const asWinner = await call('GET', `/rfqs/${rfq.id}`, { token: nccA });
check('ben trung thau biet minh trung', asWinner.data.myResult === 'WON', asWinner.data.myResult);

const cmpAsSupplier = await call('GET', `/rfqs/${rfq.id}/compare`, { token: nccB });
check('NCC khong mo duoc bang so sanh (403)', cmpAsSupplier.status === 403, cmpAsSupplier.status);

const notif = await must('GET', '/notifications?pageSize=5', { token: nccB });
check('NCC thua nhan duoc thong bao ket qua',
  notif.data.some((n) => n.title.includes('chưa được chọn')),
  notif.data.map((n) => n.title).slice(0, 2));
check('thong bao khong kem gia',
  !notif.data.some((n) => n.body.includes(String(winner.items[0].unitPrice))));

// ===========================================================================
console.log('\n=== 2. Duyệt đơn hàng theo cấp, tuần tự ===');
check('don moi tao o trang thai nhap', po.status === 'DRAFT', po.status);

const issueEarly = await call('POST', `/purchase-orders/${po.id}/issue`, { token: buyer });
check('chua duyet thi khong phat hanh duoc (400)', issueEarly.status === 400, issueEarly.data?.message);

const submitted = await call('POST', `/purchase-orders/${po.id}/submit-for-approval`, { token: buyer });
check('trinh duyet duoc', submitted.status === 201, submitted.data?.message);
check('chuyen sang cho duyet', submitted.data.status === 'PENDING_APPROVAL', submitted.data.status);
check('chot duoc quy trinh theo gia tri don',
  Boolean(submitted.data.approvalWorkflow?.name), submitted.data.approvalWorkflow);
check('dung quy trinh cua don hang, khong phai cua yeu cau mua',
  submitted.data.approvalWorkflow.name.startsWith('Đơn hàng'),
  submitted.data.approvalWorkflow.name);
check('dang cho cap dau tien',
  submitted.data.currentStep?.stepOrder === 1, submitted.data.currentStep);

const steps = submitted.data.approvalWorkflow.steps;
const wrongTurn = await call('POST', `/purchase-orders/${po.id}/approve`, { token: finance, body: {} });
check('nguoi khong dung cap thi khong duyet duoc (403)', wrongTurn.status === 403, wrongTurn.data?.message);

const noPerm = await call('POST', `/purchase-orders/${po.id}/approve`, { token: enduser, body: {} });
check('End User khong co quyen duyet don (403)', noPerm.status === 403, noPerm.status);

const queue = await call('GET', '/purchase-orders/pending-approval/mine', { token: director });
check('don nam trong hang cho cua nguoi duyet cap 1',
  queue.data.some((o) => o.id === po.id), queue.data?.length);

let state = await call('POST', `/purchase-orders/${po.id}/approve`, {
  token: director, body: { comment: 'Gia hop ly' },
});
check('duyet cap 1 thanh cong', state.status === 201, state.data?.message);

if (steps.length > 1) {
  check('chuyen sang cap 2', state.data.currentStep?.stepOrder === 2, state.data.currentStep);
  const repeat = await call('POST', `/purchase-orders/${po.id}/approve`, { token: director, body: {} });
  check('khong duyet lai cap da qua (403)', repeat.status === 403, repeat.status);
  state = await call('POST', `/purchase-orders/${po.id}/approve`, { token: finance, body: {} });
  check('duyet cap 2 thanh cong', state.status === 201, state.data?.message);
}
while (state.data.status === 'PENDING_APPROVAL') {
  state = await call('POST', `/purchase-orders/${po.id}/approve`, { token: admin, body: {} });
}
check('qua het cac cap thi don duoc duyet', state.data.status === 'APPROVED', state.data.status);
check('khong con cap nao cho', state.data.currentStep === null, state.data.currentStep);
check('luu lich su tung cap',
  (state.data.approvalHistories ?? []).filter((h) => h.decision === 'APPROVED').length === steps.length,
  (state.data.approvalHistories ?? []).map((h) => h.decision));

// ===========================================================================
console.log('\n=== 3. Sửa đơn thì phải duyệt lại từ đầu ===');
const before = state.data;
const item = before.items[0];
const edited = await call('PATCH', `/purchase-orders/${po.id}`, { token: buyer, body: {
  note: 'Doi dia diem giao hang',
  items: [{
    lineNo: 1, name: item.name, quantity: Number(item.quantity) + 50,
    unit: item.unit, unitPrice: Number(item.unitPrice),
  }],
}});
check('sua duoc don da duyet', edited.status === 200, edited.data?.message);
check('sua xong quay ve nhap', edited.data.status === 'DRAFT', edited.data.status);
check('xoa chuoi duyet cu', edited.data.approvalWorkflow === null && edited.data.currentStep === null,
  { wf: edited.data.approvalWorkflow, step: edited.data.currentStep });

const issueAfterEdit = await call('POST', `/purchase-orders/${po.id}/issue`, { token: buyer });
check('sua xong chua duyet lai thi khong phat hanh duoc (400)',
  issueAfterEdit.status === 400, issueAfterEdit.data?.message);

const revs = await must('GET', `/purchase-orders/${po.id}/revisions`, { token: buyer });
check('ghi lai mot ban chinh sua', revs.length === 1, revs.length);
check('ghi dung trang thai truoc khi sua', revs[0].previousStatus === 'APPROVED', revs[0].previousStatus);
check('ghi dung nguoi sua', Boolean(revs[0].changedBy?.fullName), revs[0].changedBy);
const changed = revs[0].changes.map((c) => c.field);
check('neu ro so luong da doi', changed.some((f) => f.startsWith('item.')), changed);
check('neu ro tong tien da doi', changed.includes('totalAmount'), changed);
check('neu ro ghi chu da doi', changed.includes('note'), changed);
check('moi thay doi co gia tri truoc va sau',
  revs[0].changes.every((c) => c.before !== undefined && c.after !== undefined && c.label),
  revs[0].changes[0]);

const noChange = await call('PATCH', `/purchase-orders/${po.id}`, { token: buyer, body: {
  note: 'Doi dia diem giao hang',
}});
check('sua ma khong doi gi thi bi chan (400)', noChange.status === 400, noChange.data?.message);

// Duyệt lại từ đầu
const resubmit = await must('POST', `/purchase-orders/${po.id}/submit-for-approval`, { token: buyer });
check('trinh duyet lai bat dau tu cap 1', resubmit.currentStep?.stepOrder === 1, resubmit.currentStep);

const rejected = await call('POST', `/purchase-orders/${po.id}/reject`, {
  token: director, body: { comment: 'Can thuong luong lai gia' },
});
check('tu choi tra don ve nhap', rejected.data.status === 'DRAFT', rejected.data.status);
const rejectNoReason = await call('POST', `/purchase-orders/${po.id}/submit-for-approval`, { token: buyer });
const noReason = await call('POST', `/purchase-orders/${po.id}/reject`, { token: director, body: {} });
check('tu choi phai neu ly do (400)', noReason.status === 400, noReason.data?.message);
check('trinh lai duoc sau khi bi tra', rejectNoReason.status === 201, rejectNoReason.status);

// Phát hành rồi thì khóa sửa
await must('POST', `/purchase-orders/${po.id}/approve`, { token: director, body: {} });
let cur = await must('GET', `/purchase-orders/${po.id}`, { token: buyer });
while (cur.status === 'PENDING_APPROVAL') {
  const tok = cur.currentStep?.role?.code === 'FINANCE' ? finance : admin;
  cur = await must('POST', `/purchase-orders/${po.id}/approve`, { token: tok, body: {} });
}
await must('POST', `/purchase-orders/${po.id}/issue`, { token: buyer });
const editIssued = await call('PATCH', `/purchase-orders/${po.id}`, { token: buyer, body: { note: 'sua sau khi phat hanh' }});
check('don da phat hanh thi khong sua duoc (400)', editIssued.status === 400, editIssued.data?.message);

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
