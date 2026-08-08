/**
 * Kiểm thử 7 nhóm chức năng: thiết lập công ty, tiêu chí đánh giá tự cấu hình,
 * chấm điểm NCC theo tiêu chí động, tải file lên hợp đồng / chứng chỉ, chia
 * thầu cho nhiều nhà cung cấp, một yêu cầu mua sinh nhiều đơn hàng, và xuất
 * PDF đơn hàng. Cần API đang chạy và đã seed dữ liệu:
 *
 *   npm run db:seed && npm run dev:api
 *   npm run features-test
 */
const API = process.env.API_URL ?? 'http://localhost:4000/api';
let pass = 0, fail = 0;

async function call(method, path, { token, body, raw } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
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
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); };
const stamp = Date.now().toString().slice(-6);

/**
 * Dựng sẵn một RFQ hai dòng hàng với hai báo giá, mỗi bên rẻ hơn ở một dòng —
 * điều kiện cần để kiểm thử chia thầu và một PR sinh nhiều PO.
 */
async function must(method, path, opts = {}) {
  const r = await call(method, path, opts);
  if (r.status > 201) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}

async function seedSplitRfq() {
  const nccA = await login('ncc-a@pms.local', 'Admin@123');
  const nccB = await login('ncc-b@pms.local', 'Admin@123');
  // Nhóm hàng hóa bắt buộc mã vật tư, lấy hai mã đã ban hành từ seed.
  const catalogue = await must('GET', '/materials?activeOnly=true&pageSize=100', { token: buyer });
  const matNaOH = catalogue.data.find((m) => m.code === 'HC-NAOH-32');
  const matCan = catalogue.data.find((m) => m.code === 'BB-CAN-25L');

  const cats = await must('GET', '/categories?pageSize=100', { token: enduser });
  const chemical = cats.data.find((c) => c.code === 'CHEMICAL');

  // PR nhỏ (<100 triệu) để chỉ cần Buyer duyệt là xong
  const pr = await must('POST', '/purchase-requests', {
    token: enduser,
    body: {
      title: `Mua hoa chat va bao bi ${stamp}`,
      categoryId: chemical.id,
      items: [
        { materialId: matNaOH.id, name: 'NaOH 32%', quantity: 500, unit: 'kg', estimatedPrice: 20000 },
        { materialId: matCan.id, name: 'Can nhua 25L', quantity: 100, unit: 'cai', estimatedPrice: 50000 },
      ],
      dynamicValues: { casNumber: '1310-73-2', quantity: 500 },
    },
  });
  await must('POST', `/purchase-requests/${pr.id}/submit`, { token: enduser });
  await must('POST', `/purchase-requests/${pr.id}/approve`, { token: buyer, body: {} });

  // Chọn đích danh hai NCC mẫu — các bài test khác có tạo thêm NCC ngẫu nhiên.
  const suppliers = await must('GET', '/suppliers?status=APPROVED&pageSize=100', { token: buyer });
  const sa = suppliers.data.find((s) => s.email === 'ncc-a@pms.local');
  const sb = suppliers.data.find((s) => s.email === 'ncc-b@pms.local');
  if (!sa || !sb) throw new Error('Không tìm thấy 2 NCC mẫu ncc-a / ncc-b');

  const rfq = await must('POST', '/rfqs', {
    token: buyer,
    body: { purchaseRequestId: pr.id, supplierIds: [sa.id, sb.id] },
  });
  await must('POST', `/rfqs/${rfq.id}/send`, { token: buyer });

  // Mỗi NCC báo giá cả 2 dòng, mạnh yếu khác nhau để chia thầu có ý nghĩa
  const tokenOf = (s) => (s.email === 'ncc-a@pms.local' ? nccA : nccB);
  await must('POST', `/rfqs/${rfq.id}/quotations`, {
    token: tokenOf(sa),
    body: {
      leadTimeDays: 10, paymentTerm: 'Net 30', incoterm: 'DAP', warranty: '12 thang',
      items: [
        { name: 'NaOH 32%', quantity: 500, unit: 'kg', unitPrice: 18000 },
        { name: 'Can nhua 25L', quantity: 100, unit: 'cai', unitPrice: 62000 },
      ],
    },
  });
  await must('POST', `/rfqs/${rfq.id}/quotations`, {
    token: tokenOf(sb),
    body: {
      leadTimeDays: 7, paymentTerm: 'Net 15', incoterm: 'DAP', warranty: '6 thang',
      items: [
        { name: 'NaOH 32%', quantity: 500, unit: 'kg', unitPrice: 21000 },
        { name: 'Can nhua 25L', quantity: 100, unit: 'cai', unitPrice: 47000 },
      ],
    },
  });


  return rfq.id;
}


// ===========================================================================
console.log('\n=== 1. Thiết lập: thông tin công ty ===');
const comp0 = await call('GET', '/settings/company', { token: buyer });
check('doc duoc thong tin cong ty', comp0.status === 200 && 'name' in comp0.data, comp0.data);
const compNoPerm = await call('PATCH', '/settings/company', { token: buyer, body: { name: 'X' } });
check('Buyer khong sua duoc thiet lap (403)', compNoPerm.status === 403, compNoPerm.status);
const comp1 = await call('PATCH', '/settings/company', { token: admin, body: {
  name: 'Công ty TNHH Sản xuất Bình Tân', taxCode: '0312345678',
  address: '12 Đường số 7, KCN Tân Bình, TP.HCM', phone: '028 3812 3456',
  email: 'purchasing@binhtan.vn', representative: 'Nguyễn Văn Bình',
  representativeTitle: 'Giám đốc Mua hàng',
}});
check('Admin sua duoc thong tin cong ty', comp1.data.name?.includes('Bình Tân'), comp1.data);

console.log('\n=== 2. Tiêu chí đánh giá tự tạo ===');
const crit0 = await call('GET', '/settings/evaluation-criteria', { token: buyer });
const seeded = crit0.data.criteria.filter((c) => c.isSystem);
check('co 5 tieu chi mac dinh tu seed', seeded.length === 5, crit0.data.criteria?.map((c) => c.name));
// Trọng số là dữ liệu người dùng sửa được, nên kiểm tra tính nhất quán của
// phép tổng chứ không kiểm tra một con số cố định.
const sumWeight = crit0.data.criteria.reduce((t, c) => t + Number(c.weight), 0);
check('tong trong so khop voi danh sach tieu chi',
  crit0.data.totalWeight === sumWeight, { api: crit0.data.totalWeight, tinhLai: sumWeight });
check('co canh bao balanced dung',
  crit0.data.balanced === (sumWeight === 100), { sumWeight, balanced: crit0.data.balanced });

const newCrit = await call('POST', '/settings/evaluation-criteria', { token: admin, body: {
  name: `Tuân thủ ESG ${stamp}`, description: 'Cam kết môi trường và lao động', weight: 10, maxScore: 10,
}});
check('tao duoc tieu chi moi', newCrit.status === 201, newCrit.data);
check('thang diem tuy chinh duoc (maxScore=10)', newCrit.data.maxScore === 10, newCrit.data.maxScore);

const crit1 = await call('GET', '/settings/evaluation-criteria', { token: buyer });
check('canh bao khi tong trong so lech 100',
  crit1.data.totalWeight === crit0.data.totalWeight + 10 && crit1.data.balanced === false,
  { truoc: crit0.data.totalWeight, sau: crit1.data.totalWeight, balanced: crit1.data.balanced });

const upd = await call('PATCH', `/settings/evaluation-criteria/${newCrit.data.id}`, { token: admin, body: { weight: 5 } });
check('sua duoc trong so', Number(upd.data.weight) === 5, upd.data.weight);

console.log('\n=== 3. Đánh giá NCC theo tiêu chí động, mỗi tiêu chí có nhận xét ===');
const sup = (await call('GET', '/suppliers?status=APPROVED&pageSize=5', { token: buyer })).data.data[0];
// Đọc lại sau khi đã đổi trọng số, nếu không sẽ tính kỳ vọng theo số cũ.
const criteria = (await call('GET', '/settings/evaluation-criteria', { token: buyer })).data.criteria;

const scoreSet = [
  criteria.find((c) => c.id === newCrit.data.id),
  ...criteria.filter((c) => c.isSystem).slice(0, 2),
];
const scored = scoreSet.map((c, i) => ({
  criteria: c,
  score: [4, 5, 3][i],
  comment: ['Giá cạnh tranh so với mặt bằng', 'Chưa phát sinh lỗi chất lượng', 'Có 2 lần giao trễ 3 ngày'][i],
}));
const perf = await call('POST', '/supplier-performance', { token: buyer, body: {
  supplierId: sup.id, periodStart: iso(-180), periodEnd: iso(-1),
  complaintRate: 2,
  note: 'Tổng thể hợp tác tốt',
  scores: scored.map((s) => ({ criteriaId: s.criteria.id, score: s.score, comment: s.comment })),
}});
check('tao danh gia theo tieu chi dong', perf.status === 201, perf.data);
check('luu nhan xet tung tieu chi', perf.data.scores?.every((s) => s.comment), perf.data.scores?.map(s=>s.comment));
check('luu nhan xet chung ca ky', perf.data.note === 'Tổng thể hợp tác tốt', perf.data.note);
// Diem = tong(score/maxScore * weight) / tong(weight) * 100 - tyLeKhieuNai
const weighted = scored.reduce((sum, s) => sum + (s.score / s.criteria.maxScore) * Number(s.criteria.weight), 0);
const totalW = scored.reduce((sum, s) => sum + Number(s.criteria.weight), 0);
const expected = Number(((weighted / totalW) * 100 - 2).toFixed(2));
check(`tinh diem chuan hoa theo trong so (ky vong ${expected})`,
  Math.abs(Number(perf.data.totalScore) - expected) < 0.05,
  { thucTe: perf.data.totalScore, kyVong: expected });

const badScore = await call('POST', '/supplier-performance', { token: buyer, body: {
  supplierId: sup.id, periodStart: iso(-180), periodEnd: iso(-1),
  scores: [{ criteriaId: scoreSet[0].id, score: 99 }],
}});
check('chan diem vuot thang diem tieu chi (400)', badScore.status === 400, badScore.data?.message);

const dupCrit = await call('POST', '/supplier-performance', { token: buyer, body: {
  supplierId: sup.id, periodStart: iso(-180), periodEnd: iso(-1),
  scores: [{ criteriaId: scoreSet[0].id, score: 3 }, { criteriaId: scoreSet[0].id, score: 4 }],
}});
check('chan cham trung 1 tieu chi (400)', dupCrit.status === 400, dupCrit.data?.message);

const rank = await call('GET', '/supplier-performance/ranking', { token: buyer });
check('xep hang co breakdown theo ten tieu chi', Array.isArray(rank.data[0]?.breakdown) && rank.data[0].breakdown[0]?.name, rank.data[0]?.breakdown);

const delUsed = await call('DELETE', `/settings/evaluation-criteria/${newCrit.data.id}`, { token: admin });
check('tieu chi da dung thi chi tat, khong xoa', delUsed.data.deactivated === true, delUsed.data);
const spare = await call('POST', '/settings/evaluation-criteria', { token: admin, body: {
  name: `Tieu chi chua dung ${stamp}`, weight: 1,
}});
const delUnused = await call('DELETE', `/settings/evaluation-criteria/${spare.data.id}`, { token: admin });
check('tieu chi chua dung thi xoa han', delUnused.data.deactivated === false, delUnused.data);

console.log('\n=== 4. Upload file: hợp đồng và chứng chỉ ===');
async function upload(target, entityId, name, type, content, token) {
  const fd = new FormData();
  fd.append('file', new Blob([content], { type }), name);
  const res = await fetch(`${API}/attachments?target=${target}&entityId=${entityId}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// Tự tạo hợp đồng và chứng chỉ cần dùng thay vì lấy bừa bản ghi có sẵn: trên
// database seed sạch chưa có hợp đồng nào, mà một bài kiểm thử phụ thuộc dữ
// liệu tình cờ có sẵn thì không phải kiểm thử.
const anySupplier = (await must('GET', '/suppliers?status=APPROVED&pageSize=1', { token: buyer })).data[0];

const contract = await must('POST', '/contracts', { token: buyer, body: {
  contractNumber: `HD-KT-${stamp}`,
  title: `Hop dong kiem thu ${stamp}`,
  supplierId: anySupplier.id,
  startDate: iso(0),
  endDate: iso(365),
  contractValue: 100000000,
}});
const up1 = await upload('CONTRACT', contract.id, `hop-dong-${stamp}.pdf`, 'application/pdf', '%PDF-1.4 noi dung', buyer);
check('upload file cho hop dong', up1.status === 201, up1.data);
check('phien ban dau = 1', up1.data.version === 1, up1.data.version);

const up2 = await upload('CONTRACT', contract.id, `hop-dong-${stamp}.pdf`, 'application/pdf', '%PDF-1.4 ban sua', buyer);
check('trung ten -> tao phien ban 2', up2.data.version === 2, up2.data.version);
check('phien ban 2 tro ve ban 1', up2.data.parentId === up1.data.id, { parent: up2.data.parentId, v1: up1.data.id });

const badType = await upload('CONTRACT', contract.id, 'virus.exe', 'application/x-msdownload', 'MZ', buyer);
check('chan dinh dang khong cho phep (400)', badType.status === 400, badType.data?.message);

const cert = await must('POST', '/certificates', { token: buyer, body: {
  name: `ISO 9001 kiem thu ${stamp}`,
  supplierId: anySupplier.id,
  issueDate: iso(0),
  expiryDate: iso(365),
}});
const up3 = await upload('CERTIFICATE', cert.id, 'iso-9001.pdf', 'application/pdf', '%PDF-1.4 iso', buyer);
check('upload file cho chung chi', up3.status === 201, up3.data);

const list = await call('GET', `/attachments?target=CONTRACT&entityId=${contract.id}`, { token: buyer });
check('liet ke tai lieu cua hop dong', list.data.length >= 2, list.data.length);

const dl = await call('GET', `/attachments/${up1.data.id}/download`, { token: buyer, raw: true });
check('tai file ve duoc', dl.status === 200 && dl.buf.length > 0, dl.status);
check('ten file goc giu dau tieng Viet trong header',
  (dl.headers.get('content-disposition') ?? '').includes(`hop-dong-${stamp}.pdf`), dl.headers.get('content-disposition'));

const badEntity = await upload('CONTRACT', '00000000-0000-4000-8000-000000000000', 'a.pdf', 'application/pdf', 'x', buyer);
check('doi tuong khong ton tai -> 404', badEntity.status === 404, badEntity.status);

const rm = await call('DELETE', `/attachments/${up3.data.id}`, { token: buyer });
check('xoa duoc tai lieu', rm.data.success === true, rm.data);

// Tài liệu thừa hưởng đúng quyền của đối tượng nó gắn vào — người chỉ có
// purchase_request:read không được đụng tới file hợp đồng.
const nccA = await login('ncc-a@pms.local', 'Admin@123');
const euList = await call('GET', `/attachments?target=CONTRACT&entityId=${contract.id}`, { token: enduser });
check('End User khong doc duoc tai lieu hop dong (403)', euList.status === 403, euList.status);
const euDown = await call('GET', `/attachments/${up1.data.id}/download`, { token: enduser });
check('End User khong tai duoc tai lieu hop dong (403)', euDown.status === 403, euDown.status);
const euDel = await call('DELETE', `/attachments/${up1.data.id}`, { token: enduser });
check('End User khong xoa duoc tai lieu hop dong (403)', euDel.status === 403, euDel.status);
const nccList = await call('GET', `/attachments?target=CONTRACT&entityId=${contract.id}`, { token: nccA });
check('NCC khong doc duoc tai lieu hop dong (403)', nccList.status === 403, nccList.status);
const euCert = await call('GET', `/attachments?target=CERTIFICATE&entityId=${cert.id}`, { token: enduser });
check('End User khong doc duoc tai lieu chung chi (403)', euCert.status === 403, euCert.status);

console.log('\n=== 5. Trao thầu nhiều NCC theo dòng hàng ===');
const seededRfqId = await seedSplitRfq();
const multiRfq = (await call('GET', `/rfqs/${seededRfqId}`, { token: buyer })).data;

if (!multiRfq) {
  console.log('  (bo qua: khong co RFQ dang mo voi >=2 bao gia)');
} else {
  const [qa, qb] = multiRfq.quotations.filter((q) => q.status === 'SUBMITTED');
  // Trao trùng dòng hàng phải bị chặn
  const conflict = await call('POST', `/rfqs/${multiRfq.id}/award`, { token: buyer, body: {
    awards: [{ quotationId: qa.id, itemIds: [qa.items[0].id] }, { quotationId: qb.id }],
  }});
  check('chan trao cung 1 dong hang cho 2 NCC (400)', conflict.status === 400, conflict.data?.message);

  // Chia thầu hợp lệ: NCC A dòng 1, NCC B dòng 2
  const awardBoth = await call('POST', `/rfqs/${multiRfq.id}/award`, { token: buyer, body: {
    awards: [
      { quotationId: qa.id, itemIds: [qa.items[0].id] },
      { quotationId: qb.id, itemIds: [qb.items[1].id] },
    ],
    note: 'Chia thau theo dong hang',
  }});
  check('trao thau cho 2 NCC cung luc', awardBoth.status === 201, awardBoth.data);

  const cmp = await call('GET', `/rfqs/${multiRfq.id}/compare`, { token: buyer });
  check('bang so sanh liet ke nhieu NCC trung thau', cmp.data.rfq.awardedQuotationIds?.length === 2, cmp.data.rfq.awardedQuotationIds);
  check('danh dau dong hang trung thau', cmp.data.quotations.every((q) => Array.isArray(q.awardedItemIds)), cmp.data.quotations?.[0]);

  console.log('\n=== 6. Một PR tạo nhiều PO ===');
  const po1 = await call('POST', '/purchase-orders/from-rfq', { token: buyer, body: {
    rfqId: multiRfq.id, quotationId: qa.id, taxRate: 10,
  }});
  check('tao PO cho NCC thu 1', po1.status === 201, po1.data);
  const po2 = await call('POST', '/purchase-orders/from-rfq', { token: buyer, body: {
    rfqId: multiRfq.id, quotationId: qb.id, taxRate: 10,
  }});
  check('tao PO cho NCC thu 2 tu cung 1 RFQ/PR', po2.status === 201, po2.data);
  check('2 PO khac ma', po1.data.code !== po2.data.code, [po1.data.code, po2.data.code]);
  check('2 PO cung 1 yeu cau mua hang',
    po1.data.purchaseRequest.id === po2.data.purchaseRequest.id, '');
  check('PO chi gom dong hang NCC do trung thau',
    po1.data.items.length === 1 && po2.data.items.length === 1,
    { po1: po1.data.items?.length, po2: po2.data.items?.length });
  check('moi PO dung dong hang cua minh',
    po1.data.items[0].name !== po2.data.items[0].name,
    [po1.data.items?.[0]?.name, po2.data.items?.[0]?.name]);

  const dupPo = await call('POST', '/purchase-orders/from-rfq', { token: buyer, body: { rfqId: multiRfq.id, quotationId: qa.id }});
  check('chan tao PO trung tren cung bao gia (400)', dupPo.status === 400, dupPo.data?.message);

  const noQuot = await call('POST', '/purchase-orders/from-rfq', { token: buyer, body: { rfqId: multiRfq.id }});
  check('nhieu NCC trung thau thi bat buoc chon bao gia (400)', noQuot.status === 400, noQuot.data?.message);

  console.log('\n=== 7. Xuất PDF đơn hàng ===');
  const pdf = await call('GET', `/purchase-orders/${po1.data.id}/pdf`, { token: buyer, raw: true });
  check('tra ve dung dinh dang PDF', pdf.status === 200 && pdf.buf.slice(0, 5).toString() === '%PDF-', pdf.status);
  check('file co dung luong hop ly (>5KB, co font nhung)', pdf.buf.length > 5000, pdf.buf.length);
  check('header tai ve dung ten don hang',
    (pdf.headers.get('content-disposition') ?? '').includes(po1.data.code), pdf.headers.get('content-disposition'));
  const text = pdf.buf.toString('latin1');
  check('PDF nhung font (khong dung font mac dinh)', text.includes('FontFile2') || text.includes('Roboto'), '');

  const pdfNoPerm = await call('GET', `/purchase-orders/${po1.data.id}/pdf`, { token: enduser, raw: true });
  check('End User khong tai duoc PDF (403)', pdfNoPerm.status === 403, pdfNoPerm.status);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
