/**
 * Quay clip demo toàn bộ chức năng bằng Chrome thật.
 *
 *   npm run dev:api          (cửa sổ 1)
 *   npm run dev:web          (cửa sổ 2)
 *   npm run demo-clip        (cửa sổ 3)
 *
 * Kết quả nằm ở thư mục `demo/`: một file .webm quay lại toàn bộ thao tác, và
 * `demo/kich-ban.md` là lời thuyết minh tiếng Việt khớp theo từng cảnh.
 *
 * Mỗi cảnh hiện một tấm thẻ tiêu đề ngay trên trang rồi mới thao tác, nên xem
 * lại là biết đang ở phần nào mà không cần lời thoại.
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const WEB = process.env.DEMO_WEB_URL ?? 'http://localhost:3000';
const API = process.env.DEMO_API_URL ?? 'http://localhost:4000/api';
const OUT = join(process.cwd(), 'demo');
const PASSWORD = 'Admin@123';

// Dọn sạch trước mỗi lần quay: còn file của lần trước là dễ đóng gói nhầm.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const scenes = [];
/** Đặt lại đúng lúc phiên quay mở ra, để mốc thời gian khớp với clip. */
let startedAt = Date.now();

function timecode() {
  const s = Math.round((Date.now() - startedAt) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/** Phiên quay được mở muộn, ngay trước cảnh đầu tiên. */
let context;
let page;

/** Thẻ tiêu đề cảnh, vẽ đè lên trang để người xem bám được mạch. */
async function scene(title, narration) {
  scenes.push({ time: timecode(), title, narration });
  console.log(`  ${timecode()}  ${title}`);
  await page.evaluate(
    ({ title, narration }) => {
      document.getElementById('demo-card')?.remove();
      const el = document.createElement('div');
      el.id = 'demo-card';
      el.style.cssText = `position:fixed;inset:0;z-index:2147483647;display:flex;
        align-items:center;justify-content:center;background:rgba(6,32,28,.94);
        color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:4rem`;
      el.innerHTML = `<div><div style="font-size:2.6rem;font-weight:650;letter-spacing:-.02em">${title}</div>
        <div style="margin-top:1rem;font-size:1.15rem;opacity:.82;max-width:56rem;line-height:1.6">${narration}</div></div>`;
      document.body.appendChild(el);
    },
    { title, narration },
  );
  // Dừng 5 giây để người xem kịp đọc hết thẻ tiêu đề.
  await page.waitForTimeout(5000);
  await page.evaluate(() => document.getElementById('demo-card')?.remove());
  await page.waitForTimeout(600);
}

/**
 * Chú thích nhỏ ở góc màn hình trong lúc thao tác, để người xem biết đang nhìn
 * cái gì mà không cần lời thoại.
 */
async function caption(text, ms = 5000) {
  scenes.push({ time: timecode(), title: '', narration: text });
  await page.evaluate((text) => {
    document.getElementById('demo-caption')?.remove();
    const el = document.createElement('div');
    el.id = 'demo-caption';
    el.style.cssText = `position:fixed;left:50%;bottom:28px;transform:translateX(-50%);
      z-index:2147483646;background:rgba(6,32,28,.95);color:#fff;padding:.75rem 1.4rem;
      border-radius:.65rem;font:500 1rem/1.5 system-ui,-apple-system,sans-serif;
      max-width:70vw;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.35)`;
    el.textContent = text;
    document.body.appendChild(el);
  }, text);
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.getElementById('demo-caption')?.remove());
  await page.waitForTimeout(300);
}

/** Vòng tròn nhấn vào vị trí sắp bấm, để người xem theo kịp con trỏ. */
async function spotlight(locator) {
  const box = await locator.boundingBox();
  if (!box) return;
  await page.evaluate(
    ({ x, y }) => {
      const dot = document.createElement('div');
      dot.style.cssText = `position:fixed;left:${x - 26}px;top:${y - 26}px;width:52px;height:52px;
        border:3px solid #f59e0b;border-radius:50%;z-index:2147483646;pointer-events:none;
        transition:opacity .6s;box-shadow:0 0 0 4px rgba(245,158,11,.25)`;
      document.body.appendChild(dot);
      setTimeout(() => (dot.style.opacity = '0'), 700);
      setTimeout(() => dot.remove(), 1400);
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  await page.waitForTimeout(750);
}

async function click(locator) {
  await spotlight(locator);
  await locator.click();
  await page.waitForTimeout(900);
}

async function login(email) {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  // Bấm đúng dòng tài khoản demo thay vì gõ tay: form là controlled component,
  // gõ quá sớm có lúc chưa kịp vào state và submit đi mất giá trị cũ.
  await page.locator(`button:has-text("${email}")`).first().click();
  await page.waitForTimeout(500);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
  await page.waitForTimeout(1800);

  // Đăng nhập nhầm người là cả đoạn sau quay sai màn hình mà không ai biết.
  const who = await page
    .locator('header button[aria-label="Tài khoản của tôi"]')
    .innerText()
    .catch(() => '');
  console.log(`      (${email} → ${who.trim() || 'không đọc được tên'})`);
}

async function go(path, waitFor) {
  try {
    await page.goto(WEB + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    console.log(`      (chậm ở ${path}, thử lại)`);
    await page.goto(WEB + path, { waitUntil: 'commit', timeout: 60000 }).catch(() => {});
  }
  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: 30000 }).catch(() => {});
  }
  await page.waitForTimeout(1400);
}

/** Bấm nút hai bước: bấm lần đầu để hỏi lại, rồi bấm nút xác nhận. */
async function confirmClick(locator) {
  await click(locator);
  const group = page.locator('[data-confirm-step="2"]').last();
  await group.waitFor({ state: 'visible', timeout: 8000 });
  await click(group.getByRole('button').first());
}

// ---------------------------------------------------------------------------
// Dựng sẵn dữ liệu để clip luôn có thứ để quay
// ---------------------------------------------------------------------------
async function api(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
const tokenOf = async (email) =>
  (await api('POST', '/auth/login', { body: { email, password: PASSWORD } }))
    .accessToken;

async function seedDemoData() {
  const buyer = await tokenOf('buyer@pms.local');
  const enduser = await tokenOf('user@pms.local');
  const nccA = await tokenOf('ncc-a@pms.local');
  const nccB = await tokenOf('ncc-b@pms.local');
  const stamp = Date.now().toString().slice(-4);

  const cats = await api('GET', '/categories?pageSize=100', { token: enduser });
  const chemical = cats.data.find((c) => c.code === 'CHEMICAL');
  const mats = await api('GET', '/materials?activeOnly=true&pageSize=100', {
    token: buyer,
  });
  const naoh = mats.data.find((m) => m.code === 'HC-NAOH-32');
  const can = mats.data.find((m) => m.code === 'BB-CAN-25L');

  const pr = await api('POST', '/purchase-requests', {
    token: enduser,
    body: {
      title: `Mua hóa chất và bao bì quý 3 — bản demo ${stamp}`,
      reason: 'Bổ sung tồn kho cho dây chuyền 2',
      categoryId: chemical.id,
      items: [
        { materialId: naoh.id, name: naoh.name, quantity: 500, unit: naoh.unit, estimatedPrice: 20000 },
        { materialId: can.id, name: can.name, quantity: 100, unit: can.unit, estimatedPrice: 55000 },
      ],
      dynamicValues: { casNumber: '1310-73-2', quantity: 500 },
    },
  });
  await api('POST', `/purchase-requests/${pr.id}/submit`, { token: enduser });

  const sups = await api('GET', '/suppliers?status=APPROVED&pageSize=100', { token: buyer });
  const sa = sups.data.find((s) => s.email === 'ncc-a@pms.local');
  const sb = sups.data.find((s) => s.email === 'ncc-b@pms.local');

  return { pr, buyer, enduser, nccA, nccB, sa, sb, naoh, can };
}

console.log('Dựng dữ liệu demo…');
const seed = await seedDemoData();

/**
 * Next ở chế độ dev biên dịch từng route lúc truy cập lần đầu, có route mất
 * hàng chục giây. Nếu để việc đó xảy ra giữa buổi quay thì clip đứng hình rất
 * lâu, nên đi trước một vòng bằng phiên không quay.
 */
console.log('Nạp trước các trang…');
const warm = await browser.newContext();
const warmPage = await warm.newPage();
await warmPage.goto(`${WEB}/login`, { waitUntil: 'networkidle' }).catch(() => {});
await warmPage.locator('button:has-text("admin@pms.local")').first().click().catch(() => {});
await warmPage.click('button[type=submit]').catch(() => {});
await warmPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {});
for (const path of [
  '/dashboard', '/purchase-requests', '/purchase-requests/new', '/materials',
  '/rfqs', '/purchase-orders', '/suppliers', '/contracts', '/certificates',
  '/supplier-performance', '/settings', '/categories', '/users', '/account',
]) {
  await warmPage.goto(WEB + path, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await warmPage.waitForTimeout(400);
  process.stdout.write('.');
}
// Cổng nhà cung cấp là bộ route riêng, cũng phải nạp trước.
await warmPage.goto(`${WEB}/login`, { waitUntil: 'networkidle' }).catch(() => {});
await warmPage.evaluate(() => window.localStorage.clear()).catch(() => {});
await warmPage.goto(`${WEB}/login`, { waitUntil: 'networkidle' }).catch(() => {});
await warmPage.locator('button:has-text("ncc-b@pms.local")').first().click().catch(() => {});
await warmPage.click('button[type=submit]').catch(() => {});
await warmPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {});
for (const path of ['/supplier/rfqs', '/supplier/quotations', '/supplier/purchase-orders']) {
  await warmPage.goto(WEB + path, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  process.stdout.write('.');
}
await warm.close();

context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  locale: 'vi-VN',
});
page = await context.newPage();
startedAt = Date.now();
console.log('\nBắt đầu quay:');

try {
  // =========================================================================
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await scene(
    'Hệ thống quản lý mua hàng — PMS',
    'Đi hết một vòng nghiệp vụ thật: lập yêu cầu → duyệt → mời báo giá → chia thầu → lên đơn hàng → duyệt đơn theo cấp → phát hành.',
  );

  await scene(
    'Bước 1 — Đăng nhập',
    'Trang đăng nhập liệt kê sẵn 10 tài khoản demo kèm vai trò. Bấm một dòng là điền luôn email và mật khẩu.',
  );
  await caption('Danh sách tài khoản demo nằm ngay bên phải form đăng nhập');
  await click(page.locator('button:has-text("user@pms.local")'));
  await caption('Bấm dòng "user@pms.local" — email và mật khẩu tự điền');
  await click(page.locator('button[type=submit]'));
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
  await page.waitForTimeout(2000);

  // =========================================================================
  await scene(
    'Bước 2 — Người dùng lập yêu cầu mua hàng',
    'Mỗi lĩnh vực mua hàng có biểu mẫu riêng, cấu hình được mà không cần sửa mã nguồn.',
  );
  await go('/purchase-requests/new', 'text=Danh sách hàng hóa / dịch vụ');
  await caption('Chọn lĩnh vực trước — biểu mẫu riêng của lĩnh vực sẽ hiện ra');
  const cat = page.locator('select[name="categoryId"]');
  await spotlight(cat);
  const chemVal = await cat.locator('option', { hasText: 'Hóa chất' }).getAttribute('value');
  await cat.selectOption(chemVal);
  await page.waitForTimeout(1500);
  await caption('Nhóm hàng hóa bắt buộc chọn mã vật tư cho từng dòng', 5000);

  const picker = page.locator('select[name="items.0.materialId"]');
  await spotlight(picker);
  await picker.selectOption({ index: 1 });
  await page.waitForTimeout(1500);
  await caption('Chọn mã xong, tên hàng — đơn vị tính — giá tham chiếu tự điền theo danh mục');

  await caption('Đổi sang lĩnh vực Dịch vụ thì ô mã vật tư biến mất');
  const svcVal = await cat.locator('option', { hasText: /^Dịch vụ/ }).getAttribute('value');
  await cat.selectOption(svcVal);
  await page.waitForTimeout(1800);
  await caption('Nhóm dịch vụ nhập tự do nội dung công việc, không cần mã');

  // =========================================================================
  await scene(
    'Bước 3 — Danh mục vật tư',
    'Mã vật tư dùng chung cho yêu cầu, báo giá và đơn hàng. Mã mới do người dùng đề xuất, admin duyệt mới dùng được.',
  );
  await go('/materials', 'table tbody tr');
  await caption('Danh mục có mã, tên, đơn vị, giá tham chiếu và trạng thái');
  await caption('Người dùng bấm "Đề xuất mã mới" để xin thêm mã');
  await click(page.locator('button:has-text("Đề xuất mã mới")'));
  await page.waitForTimeout(1200);
  await page.fill('input[name="code"]', `DEMO-${Date.now().toString().slice(-4)}`);
  await page.fill('input[name="name"]', 'Vật tư đề xuất trong clip demo');
  await page.fill('input[name="unit"]', 'cái');
  await page.fill('textarea[name="reason"]', 'Cần cho dây chuyền mới');
  await caption('Điền tên, đơn vị và lý do cần mã — lý do giúp người duyệt quyết định');
  await click(page.locator('button[type="submit"]:has-text("Gửi đề xuất")'));
  await page.waitForTimeout(2000);
  await caption('Đề xuất đã gửi. Mã ở trạng thái "Chờ duyệt", chưa đặt hàng được');

  // =========================================================================
  await scene(
    'Bước 4 — Admin duyệt mã vật tư',
    'Mọi thay đổi lên danh mục đều đi qua một luồng đề xuất → duyệt, kể cả sửa và ngừng dùng mã.',
  );
  await login('admin@pms.local');
  await go('/materials', 'table tbody tr');
  await click(page.getByRole('button', { name: /Chờ duyệt/ }).first());
  await page.waitForTimeout(1800);
  await caption('Hàng chờ của admin: từng đề xuất ghi rõ ai xin, xin gì và vì sao');
  const approveBtn = page.getByRole('button', { name: 'Duyệt', exact: true }).first();
  if (await approveBtn.isVisible().catch(() => false)) {
    await caption('Nút xác nhận hai bước — bấm nhầm một cái không gây hậu quả');
    await confirmClick(approveBtn);
    await page.waitForTimeout(2000);
    await caption('Duyệt xong, mã chuyển sang "Đang dùng" và dùng được ngay');
  }

  // =========================================================================
  await scene(
    'Bước 5 — Buyer duyệt yêu cầu mua hàng',
    'Người duyệt cần biết lần trước mua bao nhiêu trước khi đặt bút — lịch sử giá nằm ngay trên màn duyệt.',
  );
  await login('buyer@pms.local');
  await go('/purchase-requests', 'table tbody tr');
  await caption('Danh sách yêu cầu, lọc theo trạng thái và có phân trang');
  await click(page.locator('table tbody tr a[href^="/purchase-requests/"]').first());
  await page.waitForSelector('text=Hàng hóa / dịch vụ', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await caption('Mỗi dòng hàng có biểu tượng lịch sử ở cột cuối');

  const historyChip = page.locator('button[aria-label="Xem lịch sử giá"]').first();
  if (await historyChip.isVisible().catch(() => false)) {
    await click(historyChip);
    await page.waitForTimeout(1500);
    await caption('Giá thấp nhất, bình quân, cao nhất và 6 đơn gần nhất', 6000);
    await caption('Màu biểu tượng cho biết giá đang xét đắt hay rẻ hơn lần trước');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }

  await scene(
    'Trao đổi có nhắc tên',
    'Gõ @ để kéo đúng người vào việc. Người được nhắc nhận thông báo riêng, và chỉ nhắc được người thực sự đọc được yêu cầu này.',
  );
  const box = page.locator('textarea').first();
  if (await box.isVisible().catch(() => false)) {
    await box.scrollIntoViewIfNeeded();
    await box.click();
    await box.type('Nhờ anh xem giúp @', { delay: 110 });
    await page.waitForTimeout(2500);
    await caption('Danh sách gợi ý hiện ra, chọn bằng phím mũi tên hoặc chuột');
    const suggestion = page.locator('ul li button').first();
    if (await suggestion.isVisible().catch(() => false)) {
      await click(suggestion);
      await page.waitForTimeout(1200);
      await caption('Tên người được nhắc hiện thành chip "Sẽ báo cho"');
    }
    await page.keyboard.press('Escape');
  }

  // =========================================================================
  await scene(
    'Bước 6 — So sánh báo giá và chia thầu',
    'Một RFQ có thể chia cho nhiều nhà cung cấp theo từng dòng hàng — mỗi dòng chọn bên chào tốt hơn.',
  );
  await go('/rfqs', 'table tbody tr');
  await caption('Danh sách RFQ đã gửi cho nhà cung cấp');
  const rfqLink = page.locator('table tbody tr a[href^="/rfqs/"]').first();
  if (await rfqLink.isVisible().catch(() => false)) {
    await click(rfqLink);
    await page.waitForSelector('text=So sánh báo giá', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await caption('Bảng so sánh tự tô xanh giá thấp nhất và thời gian giao ngắn nhất', 6000);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1500);
    await caption('Bảng chia thầu: mỗi dòng hàng chọn một nhà cung cấp', 6000);
    await caption('Mặc định gợi ý sẵn bên chào rẻ nhất cho từng dòng');
    await caption('Chọn cùng một dòng cho hai bên thì hệ thống chặn lại');
  }

  // =========================================================================
  await scene(
    'Bước 7 — Đơn hàng và duyệt theo cấp',
    'Mỗi nhà cung cấp trúng thầu sinh một đơn hàng riêng từ cùng một yêu cầu mua.',
  );
  await go('/purchase-orders', 'table tbody tr');
  await caption('Danh sách đơn hàng, mỗi trang 10 dòng');
  await click(page.locator('table tbody tr a[href^="/purchase-orders/"]').first());
  await page.waitForTimeout(2000);
  await caption('Thanh tiến trình duyệt nằm ngay đầu trang', 6000);
  await caption('Dấu tick là cấp đã qua, ô cam là cấp đang chờ', 6000);
  await caption('Dòng dưới cùng nói rõ bước tiếp theo là ai', 6000);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1500);
  await caption('Chi tiết hàng hóa, điều khoản và tiến trình xử lý');
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1500);
  await caption('Lịch sử chỉnh sửa: sửa đơn đã duyệt thì phải duyệt lại từ đầu', 6000);
  await caption('Bảng khác biệt chỉ rõ trước là gì, sau là gì', 6000);

  // =========================================================================
  await scene(
    'Bước 8 — Cổng nhà cung cấp',
    'Nhà cung cấp chỉ thấy phần của mình. Bên thua thầu không thấy giá, cũng không biết đối thủ là ai.',
  );
  await login('ncc-b@pms.local');
  await go('/supplier/rfqs', 'table tbody tr, text=Chưa có');
  await caption('Nhà cung cấp chỉ thấy RFQ mình được mời');
  const supRfq = page.locator('table tbody tr a[href^="/supplier/rfqs/"]').first();
  if (await supRfq.isVisible().catch(() => false)) {
    await click(supRfq);
    await page.waitForTimeout(2000);
    await caption('Chỉ thấy báo giá của chính mình, không thấy của ai khác', 6000);
    await caption('Chỉ biết có bao nhiêu đối thủ cùng được mời, không biết là ai', 6000);
    await caption('Trúng hay trượt đều được báo, nhưng không kèm giá của bên trúng', 6000);
  }

  // =========================================================================
  await scene(
    'Bước 9 — Đánh giá nhà cung cấp',
    'Bộ tiêu chí tự cấu hình: trọng số và thang điểm riêng, mỗi tiêu chí có ô nhận xét.',
  );
  await login('buyer@pms.local');
  await go('/supplier-performance', 'text=Lịch sử đánh giá');
  await caption('Xếp hạng theo điểm trung bình, kèm điểm từng tiêu chí');
  await caption('Lịch sử 5 lần gần nhất mỗi trang, tìm được theo tên nhà cung cấp');
  const evalRow = page.locator('ul li button').first();
  if (await evalRow.isVisible().catch(() => false)) {
    await click(evalRow);
    await page.waitForTimeout(1800);
    await caption('Bấm vào một dòng để xem điểm và nhận xét từng tiêu chí', 6000);
    await page.getByRole('button', { name: 'Đóng' }).last().click().catch(() => {});
  }

  // =========================================================================
  await scene(
    'Bước 10 — Tổng quan cho người quản lý',
    'Câu hỏi "hệ thống này mang lại gì" được trả lời bằng con số: chênh lệch giữa dự toán và giá chốt.',
  );
  await go('/dashboard', 'text=Chênh lệch dự toán và giá chốt');
  await caption('Khối lượng công việc: PR mới, đang xem xét, chờ bổ sung, quá hạn');
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1200);
  await caption('So dự toán ghi trên yêu cầu với giá thật đã chốt trên đơn hàng', 6000);
  await caption('Một yêu cầu chia thầu nhiều bên được cộng dồn lại rồi mới so', 6000);
  await caption('Kèm danh sách tiết kiệm nhiều nhất và vượt dự toán nhiều nhất', 6000);

  // =========================================================================
  await scene(
    'Bước 11 — Hợp đồng, chứng chỉ và tài liệu',
    'Hợp đồng và chứng chỉ tự chuyển trạng thái theo hạn, hệ thống nhắc trước 90/60/30/15/7/1 ngày.',
  );
  await go('/contracts', 'table tbody tr');
  await caption('Cột "Còn lại" đếm ngược tới ngày hết hạn');
  await caption('Bấm "Tài liệu" để tải file lên — trùng tên sẽ tạo phiên bản mới');
  await go('/certificates', 'table tbody tr');
  await caption('Chứng chỉ gắn theo nhà cung cấp, cũng theo dõi hạn như hợp đồng');

  // =========================================================================
  await scene(
    'Bước 12 — Thiết lập và phân quyền',
    'Thông tin công ty in trên PDF đơn hàng, bộ tiêu chí chấm điểm, biểu mẫu từng lĩnh vực, tài khoản và vai trò.',
  );
  await login('admin@pms.local');
  await go('/settings', 'text=Thông tin in trên đơn hàng');
  await caption('Thông tin công ty ở đây chính là phần in đầu file PDF đơn hàng');
  await click(page.locator('button:has-text("Tiêu chí đánh giá NCC")'));
  await page.waitForTimeout(1500);
  await caption('Thêm, sửa, sắp xếp tiêu chí chấm điểm nhà cung cấp', 6000);

  await go('/categories', 'text=Lĩnh vực mua hàng');
  await click(page.locator('button:has-text("Hóa chất")').first());
  await page.waitForTimeout(1500);
  await caption('Mỗi lĩnh vực chọn được là mua hàng hóa hay mua dịch vụ', 6000);
  await caption('Biểu mẫu riêng của lĩnh vực cũng sửa ngay tại đây', 6000);

  await go('/users', 'table tbody tr');
  await caption('Tạo tài khoản, gán nhiều vai trò, khóa hoặc đặt lại mật khẩu', 6000);

  await scene(
    'Hết phần demo',
    'Cách chạy: HUONG-DAN-CHAY.md · Cách đưa lên mạng: HUONG-DAN-TRIEN-KHAI.md · Kịch bản clip: demo/kich-ban.md',
  );
} catch (error) {
  console.error('Lỗi khi quay:', error.message);
} finally {
  await page.waitForTimeout(1200);
  await context.close();
  await browser.close();
}

// Playwright đặt tên file video ngẫu nhiên, đổi lại cho dễ tìm.
const video = readdirSync(OUT)
  .filter((f) => f.endsWith('.webm'))
  .map((f) => ({ f, at: statSync(join(OUT, f)).mtimeMs }))
  .sort((a, b) => b.at - a.at)[0];
if (video) {
  renameSync(join(OUT, video.f), join(OUT, 'pms-demo.webm'));
}

/**
 * Playwright chỉ quay được WebM. Nhiều nơi (Zalo, PowerPoint, iPhone) không mở
 * được định dạng đó, nên đóng gói thêm một bản MP4.
 *
 * Máy thường không có ffmpeg đầy đủ và bản đi kèm Playwright chỉ mã hoá VP8,
 * nên đường đi là: ffmpeg tách khung hình PNG → AVFoundation của macOS ghép
 * thành H.264. Không có công cụ thì bỏ qua, WebM vẫn dùng được.
 */
function toMp4() {
  const ffmpeg = join(
    homedir(),
    'Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac',
  );
  const swiftSource = join(process.cwd(), 'scripts', 'webm-to-mp4.swift');
  if (process.platform !== 'darwin' || !existsSync(ffmpeg) || !existsSync(swiftSource)) {
    console.log('Bỏ qua bước xuất MP4 (chỉ chạy được trên macOS).');
    return;
  }

  const frames = mkdtempSync(join(tmpdir(), 'pms-frames-'));
  const encoder = join(frames, 'png2mp4');
  try {
    console.log('Đang xuất MP4…');
    // Bản ffmpeg rút gọn không có bộ lọc, nên chỉ hạ số khung hình bằng -r.
    execFileSync(
      ffmpeg,
      ['-loglevel', 'error', '-i', join(OUT, 'pms-demo.webm'), '-r', '15',
       join(frames, 'f%05d.png'), '-y'],
      { stdio: 'inherit' },
    );
    execFileSync('swiftc', ['-O', swiftSource, '-o', encoder], { stdio: 'inherit' });
    // 1280 rộng và 1,5 Mbps: chữ trên giao diện vẫn đọc rõ mà file nhẹ đi
    // khoảng bốn lần so với để nguyên 1440 ở 4 Mbps.
    execFileSync(
      encoder,
      [frames, join(OUT, 'pms-demo.mp4'), '15', '1280', '1500000'],
      { stdio: 'inherit' },
    );
  } catch (error) {
    console.log(`Không xuất được MP4 (${error.message}). File WebM vẫn dùng được.`);
  } finally {
    rmSync(frames, { recursive: true, force: true });
  }
}

toMp4();

const script = `# Kịch bản clip demo PMS

Clip có hai bản, nội dung giống hệt nhau:

- **\`demo/pms-demo.mp4\`** — dùng bản này để gửi đi. Mở được ở mọi nơi:
  QuickTime, PowerPoint, Zalo, iPhone, Google Drive.
- \`demo/pms-demo.webm\` — bản gốc Playwright quay ra, nhẹ hơn, mở bằng trình duyệt.

Đây là lời thuyết minh khớp theo từng cảnh. Có thể đọc trực tiếp khi trình chiếu,
hoặc dùng làm lời thoại nếu muốn lồng tiếng.

| Thời điểm | Bước | Nội dung |
| --- | --- | --- |
${scenes.map((s) => `| ${s.time} | ${s.title || '↳'} | ${s.narration} |`).join('\n')}

## Gợi ý khi trình bày

1. **Mở đầu bằng vấn đề, không bằng tính năng.** "Trước đây một yêu cầu mua hàng
   đi qua email và Excel, không ai biết đang nằm ở đâu" — rồi mới chiếu clip.
2. **Dừng ở phút chia thầu.** Đây là chỗ dễ thấy giá trị nhất: cùng một RFQ,
   chia cho hai nhà cung cấp theo từng dòng hàng thì tổng tiền thấp hơn trao trọn
   gói cho một bên.
3. **Nhấn vào phần duyệt đơn theo cấp.** Các cấp đi tuần tự, sửa đơn là phải
   duyệt lại từ đầu và hệ thống chỉ rõ đã đổi những gì — đây là phần kiểm soát
   nội bộ mà kế toán và ban giám đốc quan tâm.
4. **Kết bằng trang Tổng quan.** Con số chênh lệch giữa dự toán và giá chốt là
   thứ trả lời câu "hệ thống này mang lại gì".

## Quay lại clip

\`\`\`bash
npm run dev:api     # cửa sổ 1
npm run dev:web     # cửa sổ 2
npm run demo-clip   # cửa sổ 3
\`\`\`

Mỗi lần chạy sẽ tạo dữ liệu demo mới và ghi đè \`demo/pms-demo.webm\`.
`;

writeFileSync(join(OUT, 'kich-ban.md'), script);
console.log(`\nXong. Clip: demo/pms-demo.webm — kịch bản: demo/kich-ban.md (${scenes.length} cảnh)`);
