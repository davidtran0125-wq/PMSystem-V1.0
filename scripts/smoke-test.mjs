/**
 * End-to-end smoke test for the procurement workflow. Requires the API running
 * with seeded data:
 *
 *   npm run db:seed && npm run dev:api
 *   node scripts/smoke-test.mjs
 *
 * Exercises the full path from purchase request through buyer review, supplier
 * approval, RFQ, quotations, comparison and award, and asserts that the RBAC
 * boundaries hold (suppliers cannot see each other, requesters cannot see
 * internal buyer notes, buyers cannot read the audit log).
 */
const API = 'http://localhost:4000/api';
let pass = 0, fail = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
}

async function login(email, password) {
  const r = await call('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 201 && r.status !== 200) throw new Error(`login ${email} failed: ${JSON.stringify(r.data)}`);
  return r.data.accessToken;
}

const run = async () => {
console.log('\n=== 1. Auth ===');
const admin = await login('admin@pms.local', 'Admin@123');
const buyer = await login('buyer@pms.local', 'Admin@123');
const enduser = await login('user@pms.local', 'Admin@123');
const manager = await login('manager@pms.local', 'Admin@123');
check('admin/buyer/enduser logged in', !!(admin && buyer && enduser));

console.log('\n=== 2. Categories & dynamic form ===');
const cats = await call('GET', '/categories?pageSize=100', { token: enduser });
check('end user can list categories', cats.status === 200 && cats.data.data.length >= 18, cats.data);
const chemical = cats.data.data.find(c => c.code === 'CHEMICAL');
const form = await call('GET', `/categories/${chemical.id}/form`, { token: enduser });
check('chemical form has CAS field', form.data.fields.some(f => f.key === 'casNumber'), form.data);
const created = await call('POST', '/categories', { token: enduser, body: { name: 'X', code: 'XX' } });
check('end user cannot create category (403)', created.status === 403, created.data);

console.log('\n=== 3. Purchase Request lifecycle ===');
// Nhóm hàng hóa bắt buộc có mã vật tư. Admin tạo mã thì được duyệt ngay.
const matReq = await call('POST', '/materials', { token: admin, body: {
  code: 'HC-NAOH-37', name: 'NaOH 37%', unit: 'kg', categoryId: chemical.id, standardPrice: 42000,
}});
const naohId = matReq.data.materialId
  ?? (await call('GET', '/materials?search=HC-NAOH-37', { token: admin })).data.data[0].id;
check('material code available for the PR', Boolean(naohId), matReq.data);

const prRes = await call('POST', '/purchase-requests', { token: enduser, body: {
  title: 'Mua NaOH 37% cho line 2',
  reason: 'Bổ sung tồn kho quý 3',
  categoryId: chemical.id,
  priority: 'HIGH',
  budgetAmount: 250000000,
  items: [{ materialId: naohId, name: 'NaOH 37%', quantity: 5000, unit: 'kg', estimatedPrice: 42000 }],
  dynamicValues: { casNumber: '1310-73-2', concentration: '37%', quantity: 5000 },
}});
check('PR created as DRAFT', prRes.status === 201 && prRes.data.status === 'DRAFT', prRes.data);
const pr = prRes.data;
check('PR got a code', /^PR-\d{4}-\d{5}$/.test(pr.code || ''), pr.code);
check('estimatedTotal computed', Number(pr.estimatedTotal) === 5000 * 42000, pr.estimatedTotal);
check('dynamic values stored', pr.dynamicValues.length >= 3, pr.dynamicValues.length);

const badField = await call('POST', '/purchase-requests', { token: enduser, body: {
  title: 'bad', categoryId: chemical.id,
  items: [{ materialId: naohId, name: 'x', quantity: 1, unit: 'kg' }],
  dynamicValues: { notARealField: 'x' },
}});
check('unknown dynamic field rejected (400)', badField.status === 400, badField.data);

const buyerSees = await call('GET', `/purchase-requests/${pr.id}`, { token: buyer });
check('buyer can read the draft PR', buyerSees.status === 200, buyerSees.status);

const reviewTooEarly = await call('POST', `/purchase-requests/${pr.id}/approve`, { token: buyer, body: {} });
check('cannot approve a DRAFT (400)', reviewTooEarly.status === 400, reviewTooEarly.data);

const submitted = await call('POST', `/purchase-requests/${pr.id}/submit`, { token: enduser });
check('PR submitted', submitted.status === 201 && submitted.data.status === 'SUBMITTED', submitted.data);

const endUserApprove = await call('POST', `/purchase-requests/${pr.id}/approve`, { token: enduser, body: {} });
check('end user cannot approve (403)', endUserApprove.status === 403, endUserApprove.data);

// Giá trị 210 triệu rơi vào chuỗi 2 cấp: Department Manager duyệt trước Buyer.
const wrongLevel = await call('POST', `/purchase-requests/${pr.id}/approve`, { token: buyer, body: {} });
check('buyer cannot jump the approval chain (403)', wrongLevel.status === 403, wrongLevel.data);

const clarify = await call('POST', `/purchase-requests/${pr.id}/request-clarification`, { token: manager, body: { comment: 'Bổ sung SDS và thời hạn giao hàng.' }});
check('manager requested clarification', clarify.data.status === 'NEED_CLARIFICATION', clarify.data);

const notif = await call('GET', '/notifications?unreadOnly=true', { token: enduser });
check('requester notified of clarification', notif.data.data.some(n => n.event === 'PR_NEED_CLARIFICATION'), notif.data.meta);

const rejectNoReason = await call('POST', `/purchase-requests/${pr.id}/reject`, { token: manager, body: {} });
check('reject without reason blocked (400)', rejectNoReason.status === 400, rejectNoReason.data);

const edited = await call('PATCH', `/purchase-requests/${pr.id}`, { token: enduser, body: { description: 'Đã bổ sung SDS.' }});
check('requester can edit after clarification', edited.status === 200, edited.data);

await call('POST', `/purchase-requests/${pr.id}/submit`, { token: enduser });
await call('POST', `/purchase-requests/${pr.id}/start-review`, { token: manager });
const lvl1 = await call('POST', `/purchase-requests/${pr.id}/approve`, { token: manager, body: { comment: 'Đúng nhu cầu bộ phận.' }});
check('level 1 approved but chain not finished',
  lvl1.status === 201 && lvl1.data.status !== 'APPROVED', { status: lvl1.status, prStatus: lvl1.data.status });
check('chain moved to the buyer step',
  lvl1.data.currentStep?.role?.code === 'BUYER' || lvl1.data.currentStep?.name?.includes('Buyer'),
  lvl1.data.currentStep);
const approved = await call('POST', `/purchase-requests/${pr.id}/approve`, { token: buyer, body: { comment: 'OK, tiến hành RFQ.' }});
check('PR approved after full chain', approved.data.status === 'APPROVED', approved.data);
check('approval history recorded', approved.data.approvalHistories.length >= 4, approved.data.approvalHistories?.length);

console.log('\n=== 4. Comments ===');
const c1 = await call('POST', `/purchase-requests/${pr.id}/comments`, { token: buyer, body: { body: 'Nội bộ: ưu tiên NCC A', isInternal: true }});
check('buyer internal comment created', c1.status === 201 && c1.data.isInternal === true, c1.data);
const c2 = await call('POST', `/purchase-requests/${pr.id}/comments`, { token: enduser, body: { body: 'Cảm ơn anh', isInternal: true }});
check('end user cannot force internal', c2.data.isInternal === false, c2.data);
const listAsUser = await call('GET', `/purchase-requests/${pr.id}/comments`, { token: enduser });
check('requester does not see internal notes', !listAsUser.data.some(c => c.isInternal), listAsUser.data);
const listAsBuyer = await call('GET', `/purchase-requests/${pr.id}/comments`, { token: buyer });
check('buyer sees all comments', listAsBuyer.data.length === 2, listAsBuyer.data.length);

console.log('\n=== 5. Supplier registration & approval ===');
const stamp = Date.now();
const supA = await call('POST', '/auth/register/supplier', { body: {
  email: `a${stamp}@sup.local`, password: 'Admin@123', contactPerson: 'Nguyen A', companyName: 'Cong ty A', taxCode: `A${stamp}`,
}});
const supB = await call('POST', '/auth/register/supplier', { body: {
  email: `b${stamp}@sup.local`, password: 'Admin@123', contactPerson: 'Tran B', companyName: 'Cong ty B', taxCode: `B${stamp}`,
}});
check('two suppliers registered PENDING', supA.data.user.supplier.status === 'PENDING' && supB.data.user.supplier.status === 'PENDING', supA.data.user?.supplier?.status);
const supAId = supA.data.user.supplier.id, supBId = supB.data.user.supplier.id;
let tokenA = supA.data.accessToken, tokenB = supB.data.accessToken;

const buyerApproveSup = await call('POST', `/suppliers/${supAId}/approve`, { token: buyer });
check('buyer lacks supplier:approve (403)', buyerApproveSup.status === 403, buyerApproveSup.data);
const okA = await call('POST', `/suppliers/${supAId}/approve`, { token: admin });
const okB = await call('POST', `/suppliers/${supBId}/approve`, { token: admin });
check('admin approved both suppliers', okA.data.status === 'APPROVED' && okB.data.status === 'APPROVED', okA.data);

const profA = await call('PATCH', '/suppliers/me', { token: tokenA, body: { address: 'HCMC', paymentTerm: 'Net 30', categoryIds: [chemical.id] }});
check('supplier updated own profile + categories', profA.status === 200 && profA.data.categories.length === 1, profA.data);
const spyB = await call('GET', `/suppliers/${supAId}`, { token: tokenB });
check('supplier cannot read another supplier (403)', spyB.status === 403, spyB.data);

console.log('\n=== 6. RFQ ===');
const rfqRes = await call('POST', '/rfqs', { token: buyer, body: {
  purchaseRequestId: pr.id, instructions: 'Báo giá CIF HCM', supplierIds: [supAId, supBId],
  dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
}});
check('RFQ created as DRAFT', rfqRes.status === 201 && rfqRes.data.status === 'DRAFT', rfqRes.data);
const rfq = rfqRes.data;
check('RFQ code generated', /^RFQ-\d{4}-\d{5}$/.test(rfq.code || ''), rfq.code);

const quoteBeforeSend = await call('POST', `/rfqs/${rfq.id}/quotations`, { token: tokenA, body: { items: [{ name: 'x', quantity: 1, unit: 'kg', unitPrice: 1 }] }});
check('cannot quote a DRAFT RFQ (400)', quoteBeforeSend.status === 400, quoteBeforeSend.data);

const sent = await call('POST', `/rfqs/${rfq.id}/send`, { token: buyer });
check('RFQ sent', sent.data.status === 'SENT', sent.data);
const supNotif = await call('GET', '/notifications', { token: tokenA });
check('supplier notified of RFQ', supNotif.data.data.some(n => n.event === 'RFQ_SENT'), supNotif.data.meta);

console.log('\n=== 7. Quotations ===');
const qA = await call('POST', `/rfqs/${rfq.id}/quotations`, { token: tokenA, body: {
  currency: 'VND', leadTimeDays: 14, paymentTerm: 'Net 30', incoterm: 'CIF', warranty: '12 months',
  items: [{ name: 'NaOH 37%', quantity: 5000, unit: 'kg', unitPrice: 40000 }],
}});
check('supplier A quoted', qA.status === 201 && Number(qA.data.totalAmount) === 200000000, qA.data);
const qB = await call('POST', `/rfqs/${rfq.id}/quotations`, { token: tokenB, body: {
  currency: 'VND', leadTimeDays: 7, paymentTerm: 'Net 15', incoterm: 'CIF', warranty: '6 months',
  items: [{ name: 'NaOH 37%', quantity: 5000, unit: 'kg', unitPrice: 44000 }],
}});
check('supplier B quoted', qB.status === 201 && Number(qB.data.totalAmount) === 220000000, qB.data);

const dup = await call('POST', `/rfqs/${rfq.id}/quotations`, { token: tokenA, body: {
  items: [{ name: 'x', quantity: 1, unit: 'kg', unitPrice: 1 }],
}});
check('duplicate submission blocked (400)', dup.status === 400, dup.data);

const rfqAsA = await call('GET', `/rfqs/${rfq.id}`, { token: tokenA });
check('supplier A sees only its own quotation', rfqAsA.data.quotations.length === 1 && rfqAsA.data.quotations[0].supplierId === supAId, rfqAsA.data.quotations?.length);
const cmpAsA = await call('GET', `/rfqs/${rfq.id}/compare`, { token: tokenA });
check('supplier cannot open comparison (403)', cmpAsA.status === 403, cmpAsA.data);

console.log('\n=== 8. Comparison & award ===');
const cmp = await call('GET', `/rfqs/${rfq.id}/compare`, { token: buyer });
check('comparison lists both quotes', cmp.data.quotations.length === 2, cmp.data.summary);
const rowA = cmp.data.quotations.find(q => q.supplier.id === supAId);
const rowB = cmp.data.quotations.find(q => q.supplier.id === supBId);
check('lowest price flagged on A', rowA.isLowestPrice === true && rowB.isLowestPrice === false, { a: rowA.isLowestPrice, b: rowB.isLowestPrice });
check('shortest lead time flagged on B', rowB.isShortestLeadTime === true && rowA.isShortestLeadTime === false, { a: rowA.isShortestLeadTime, b: rowB.isShortestLeadTime });
check('B price gap computed (10%)', rowB.diffFromLowestPercent === 10, rowB.diffFromLowestPercent);

// Trao trọn gói cho A: bỏ itemIds nghĩa là lấy hết dòng hàng của báo giá đó.
const award = await call('POST', `/rfqs/${rfq.id}/award`, { token: buyer, body: {
  awards: [{ quotationId: rowA.quotationId }], note: 'Giá tốt nhất',
}});
check('RFQ awarded to A', award.data.status === 'AWARDED', award.data);

const afterAward = await call('GET', `/rfqs/${rfq.id}/compare`, { token: buyer });
const wonA = afterAward.data.quotations.find((q) => q.quotationId === rowA.quotationId);
const lostB = afterAward.data.quotations.find((q) => q.quotationId === rowB.quotationId);
check('A trung tron goi, B bi loai',
  wonA.isAwarded && wonA.awardedItemIds.length === wonA.items.length && !lostB.isAwarded,
  { a: wonA.awardedItemIds.length, b: lostB.isAwarded });

const awardAgain = await call('POST', `/rfqs/${rfq.id}/award`, { token: buyer, body: {
  awards: [{ quotationId: rowB.quotationId }],
}});
check('re-award blocked (400)', awardAgain.status === 400, awardAgain.data);

console.log('\n=== 9. Dashboard & audit ===');
const ov = await call('GET', '/dashboard/overview', { token: buyer });
check('overview returns counters', ov.status === 200 && typeof ov.data.purchaseRequests.new === 'number', ov.data);
const spend = await call('GET', '/dashboard/spend', { token: buyer });
const chemicalSpend = spend.data.byCategory.find((c) => c.name === 'Chemical');
check('spend attributes to Chemical', !!chemicalSpend && chemicalSpend.total >= 200000000, spend.data);
const sla = await call('GET', '/dashboard/sla', { token: buyer });
check('SLA computed', sla.data.decided >= 1, sla.data);
const audit = await call('GET', '/audit-logs?pageSize=100', { token: admin });
check('audit trail captured actions', audit.data.data.some(a => a.action === 'AWARD') && audit.data.data.some(a => a.module === 'purchase_request'), audit.data.meta);
const auditAsBuyer = await call('GET', '/audit-logs', { token: buyer });
check('buyer cannot read audit log (403)', auditAsBuyer.status === 403, auditAsBuyer.status);

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error('FATAL', e); process.exit(1); });
