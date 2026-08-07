/**
 * Kiểm thử tài khoản người dùng và ràng buộc mã vật tư trên yêu cầu mua hàng:
 *
 *   npm run db:seed && npm run dev:api
 *   npm run users-test
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
const stamp = Date.now().toString().slice(-6);

// ===========================================================================
console.log('\n=== 1. Tạo tài khoản người dùng ===');
const roles = await must('GET', '/roles', { token: admin });
const endUserRole = roles.find((r) => r.code === 'END_USER');
const buyerRole = roles.find((r) => r.code === 'BUYER');
const departments = await must('GET', '/departments?pageSize=50', { token: admin });

const email = `nhanvien${stamp}@pms.local`;
const created = await call('POST', '/users', { token: admin, body: {
  email, password: 'NhanVien@123', fullName: `Nhan Vien ${stamp}`,
  phone: '0900000000', jobTitle: 'Chuyen vien mua hang',
  departmentId: departments.data[0].id, roleIds: [endUserRole.id],
}});
check('admin tao duoc tai khoan', created.status === 201, created.data);
check('tai khoan moi active ngay', created.data.status === 'ACTIVE', created.data.status);
check('gan dung vai tro', created.data.roles?.[0]?.role.code === 'END_USER', created.data.roles);
check('khong tra ve mat khau bam', !('passwordHash' in created.data), Object.keys(created.data));

const newUser = await login(email, 'NhanVien@123');
check('tai khoan moi dang nhap duoc', Boolean(newUser));

const dup = await call('POST', '/users', { token: admin, body: {
  email, password: 'NhanVien@123', fullName: 'Trung email', roleIds: [endUserRole.id],
}});
check('chan email trung (400)', dup.status === 400, dup.data?.message);

const weak = await call('POST', '/users', { token: admin, body: {
  email: `yeu${stamp}@pms.local`, password: '123', fullName: 'Mat khau yeu', roleIds: [endUserRole.id],
}});
check('chan mat khau duoi 8 ky tu (400)', weak.status === 400, weak.data?.message);

const noRole = await call('POST', '/users', { token: admin, body: {
  email: `khongvaitro${stamp}@pms.local`, password: 'NhanVien@123', fullName: 'Khong vai tro', roleIds: [],
}});
check('bat buoc it nhat mot vai tro (400)', noRole.status === 400, noRole.data?.message);

const euCreate = await call('POST', '/users', { token: enduser, body: {
  email: `trom${stamp}@pms.local`, password: 'NhanVien@123', fullName: 'Khong duoc phep', roleIds: [endUserRole.id],
}});
check('End User khong tao duoc tai khoan (403)', euCreate.status === 403, euCreate.status);

// ===========================================================================
console.log('\n=== 2. Sửa, đổi vai trò, khóa, xóa ===');
const edited = await call('PATCH', `/users/${created.data.id}`, { token: admin, body: {
  jobTitle: 'Truong nhom mua hang',
}});
check('sua duoc thong tin', edited.data.jobTitle === 'Truong nhom mua hang', edited.data.jobTitle);

const rerole = await call('PATCH', `/users/${created.data.id}/roles`, { token: admin, body: {
  roleIds: [endUserRole.id, buyerRole.id],
}});
check('gan duoc nhieu vai tro', rerole.data.roles?.length === 2, rerole.data.roles?.length);

const selfLock = await call('PATCH', `/users/${(await call('GET', '/users/me', { token: admin })).data.id}`, {
  token: admin, body: { status: 'SUSPENDED' },
});
check('khong tu khoa chinh minh (400)', selfLock.status === 400, selfLock.data?.message);

const locked = await call('PATCH', `/users/${created.data.id}`, { token: admin, body: { status: 'SUSPENDED' }});
check('khoa duoc tai khoan', locked.data.status === 'SUSPENDED', locked.data.status);
const lockedLogin = await call('POST', '/auth/login', { body: { email, password: 'NhanVien@123' }});
check('tai khoan bi khoa khong dang nhap duoc', lockedLogin.status >= 400, lockedLogin.status);
await must('PATCH', `/users/${created.data.id}`, { token: admin, body: { status: 'ACTIVE' }});

const reset = await call('POST', `/users/${created.data.id}/reset-password`, {
  token: admin, body: { newPassword: 'MatKhauMoi@123' },
});
check('admin dat lai mat khau', reset.status === 201, reset.data);
const oldPwd = await call('POST', '/auth/login', { body: { email, password: 'NhanVien@123' }});
check('mat khau cu het hieu luc', oldPwd.status >= 400, oldPwd.status);
const newPwdToken = await login(email, 'MatKhauMoi@123');
check('mat khau moi dung duoc', Boolean(newPwdToken));

// ===========================================================================
console.log('\n=== 3. Hồ sơ cá nhân ===');
const me = await call('GET', '/users/me', { token: newPwdToken });
check('doc duoc ho so cua minh', me.status === 200 && me.data.email === email, me.data?.email);
check('ho so kem vai tro va phong ban', Array.isArray(me.data.roles) && 'department' in me.data,
  Object.keys(me.data));

const profile = await call('PATCH', '/users/me', { token: newPwdToken, body: {
  fullName: 'Ten Da Tu Sua', phone: '0911111111', locale: 'en',
}});
check('tu sua duoc thong tin co ban', profile.data.fullName === 'Ten Da Tu Sua', profile.data.fullName);

const escalate = await call('PATCH', '/users/me', { token: newPwdToken, body: { status: 'ACTIVE' }});
check('khong tu doi duoc trang thai qua ho so (400)', escalate.status === 400, escalate.data?.message);

const wrongPwd = await call('POST', '/users/me/password', { token: newPwdToken, body: {
  currentPassword: 'SaiRoi@123', newPassword: 'ThuNghiem@123',
}});
check('doi mat khau sai mat khau cu (403)', wrongPwd.status === 403, wrongPwd.data?.message);

const samePwd = await call('POST', '/users/me/password', { token: newPwdToken, body: {
  currentPassword: 'MatKhauMoi@123', newPassword: 'MatKhauMoi@123',
}});
check('mat khau moi phai khac cu (400)', samePwd.status === 400, samePwd.data?.message);

const changed = await call('POST', '/users/me/password', { token: newPwdToken, body: {
  currentPassword: 'MatKhauMoi@123', newPassword: 'TuDoi@12345',
}});
check('tu doi duoc mat khau', changed.status === 201, changed.data);
check('dang nhap bang mat khau tu doi', Boolean(await login(email, 'TuDoi@12345')));

const euList = await call('GET', '/users?pageSize=5', { token: enduser });
check('End User khong xem duoc danh sach tai khoan (403)', euList.status === 403, euList.status);
const buyerList = await call('GET', '/users?pageSize=5', { token: buyer });
check('Buyer xem duoc danh sach tai khoan', buyerList.status === 200, buyerList.status);

const removed = await call('DELETE', `/users/${created.data.id}`, { token: admin });
check('xoa duoc tai khoan', removed.status === 200, removed.data);
const goneLogin = await call('POST', '/auth/login', { body: { email, password: 'TuDoi@12345' }});
check('tai khoan da xoa khong dang nhap duoc', goneLogin.status >= 400, goneLogin.status);

// ===========================================================================
console.log('\n=== 4. Bắt buộc mã vật tư, trừ nhóm dịch vụ ===');
const cats = await must('GET', '/categories?pageSize=100', { token: enduser });
const chemical = cats.data.find((c) => c.code === 'CHEMICAL');
const service = cats.data.find((c) => c.code === 'SERVICE');
check('nhom hoa chat bat buoc ma vat tu', chemical.requiresMaterial === true, chemical.requiresMaterial);
check('nhom dich vu khong bat buoc', service.requiresMaterial === false, service.requiresMaterial);

const noMaterial = await call('POST', '/purchase-requests', { token: enduser, body: {
  title: `Thieu ma vat tu ${stamp}`, categoryId: chemical.id,
  items: [{ name: 'Hoa chat khong ma', quantity: 10, unit: 'kg' }],
  dynamicValues: { casNumber: '1310-73-2', quantity: 10 },
}});
check('nhom hang hoa thieu ma bi chan (400)', noMaterial.status === 400, noMaterial.data?.message);
check('bao loi neu ro dong hang nao thieu',
  String(noMaterial.data?.message).includes('Hoa chat khong ma'), noMaterial.data?.message);

const serviceRequest = await call('POST', '/purchase-requests', { token: enduser, body: {
  title: `Thue dich vu ve sinh ${stamp}`, categoryId: service.id,
  items: [{ name: 'Ve sinh cong nghiep nha xuong A', quantity: 1, unit: 'goi', estimatedPrice: 25000000 }],
  dynamicValues: { scopeOfWork: 'Ve sinh toan bo nha xuong A, 2 lan mot thang' },
}});
check('nhom dich vu tao duoc khong can ma', serviceRequest.status === 201, serviceRequest.data?.message);
const serviceSubmit = await call('POST', `/purchase-requests/${serviceRequest.data.id}/submit`, { token: enduser });
check('nhom dich vu gui duyet duoc', serviceSubmit.status === 201, serviceSubmit.data?.message);

const materials = await must('GET', '/materials?activeOnly=true&pageSize=100', { token: enduser });
const naoh = materials.data.find((m) => m.code === 'HC-NAOH-32');
const withMaterial = await call('POST', '/purchase-requests', { token: enduser, body: {
  title: `Co ma vat tu ${stamp}`, categoryId: chemical.id,
  items: [{ materialId: naoh.id, name: naoh.name, quantity: 100, unit: naoh.unit }],
  dynamicValues: { casNumber: '1310-73-2', quantity: 100 },
}});
check('co ma thi tao duoc', withMaterial.status === 201, withMaterial.data?.message);

// Mã chờ duyệt: soạn nháp được nhưng chưa gửi duyệt được
const pendingCode = await must('POST', '/materials', { token: enduser, body: {
  code: `HC-CHO-${stamp}`, name: 'Ma dang cho duyet', unit: 'kg',
}});
const draftWithPending = await call('POST', '/purchase-requests', { token: enduser, body: {
  title: `Dung ma cho duyet ${stamp}`, categoryId: chemical.id,
  items: [{ materialId: pendingCode.materialId, name: 'Ma dang cho duyet', quantity: 5, unit: 'kg' }],
  dynamicValues: { casNumber: '1310-73-2', quantity: 5 },
}});
check('ma cho duyet van soan nhap duoc', draftWithPending.status === 201, draftWithPending.data?.message);
const submitPending = await call('POST', `/purchase-requests/${draftWithPending.data.id}/submit`, { token: enduser });
check('ma cho duyet thi chua gui duyet duoc (400)', submitPending.status === 400, submitPending.data?.message);

await must('POST', `/materials/change-requests/${pendingCode.id}/approve`, { token: admin });
const submitAfter = await call('POST', `/purchase-requests/${draftWithPending.data.id}/submit`, { token: enduser });
check('duyet ma xong thi gui duyet duoc', submitAfter.status === 201, submitAfter.data?.message);

// Mã đã ngừng dùng thì không đặt hàng được nữa
await must('DELETE', `/materials/${pendingCode.materialId}`, { token: admin, body: { reason: 'Ket thuc kiem thu' }});
const inactiveUse = await call('POST', '/purchase-requests', { token: enduser, body: {
  title: `Dung ma ngung dung ${stamp}`, categoryId: chemical.id,
  items: [{ materialId: pendingCode.materialId, name: 'Ma ngung dung', quantity: 1, unit: 'kg' }],
  dynamicValues: { casNumber: '1310-73-2', quantity: 1 },
}});
check('ma ngung dung thi khong dat hang duoc (400)', inactiveUse.status === 400, inactiveUse.data?.message);

// ===========================================================================
console.log('\n=== 5. Admin đổi kiểu lĩnh vực ===');
const flip = await call('PATCH', `/categories/${service.id}`, {
  token: admin, body: { requiresMaterial: true },
});
check('admin bat duoc yeu cau ma vat tu cho linh vuc',
  flip.data.requiresMaterial === true, flip.data?.requiresMaterial);

const nowBlocked = await call('POST', '/purchase-requests', { token: enduser, body: {
  title: `Dich vu gio can ma ${stamp}`, categoryId: service.id,
  items: [{ name: 'Dich vu khong ma', quantity: 1, unit: 'goi' }],
  dynamicValues: { scopeOfWork: 'Thu nghiem' },
}});
check('doi cau hinh xong thi ap dung ngay (400)', nowBlocked.status === 400, nowBlocked.data?.message);

const buyerFlip = await call('PATCH', `/categories/${service.id}`, {
  token: enduser, body: { requiresMaterial: false },
});
check('End User khong doi duoc cau hinh linh vuc (403)', buyerFlip.status === 403, buyerFlip.status);

await must('PATCH', `/categories/${service.id}`, { token: admin, body: { requiresMaterial: false }});
const restored = await must('GET', '/categories?pageSize=100', { token: admin });
check('tra lai cau hinh cu',
  restored.data.find((c) => c.code === 'SERVICE').requiresMaterial === false);

const newCat = await call('POST', '/categories', { token: admin, body: {
  name: `Linh vuc dich vu moi ${stamp}`, code: `SVC_${stamp}`, requiresMaterial: false,
}});
check('tao linh vuc moi dat duoc kieu dich vu',
  newCat.status === 201 && newCat.data.requiresMaterial === false, newCat.data?.requiresMaterial);

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
