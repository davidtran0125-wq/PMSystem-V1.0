/**
 * Tạo tài khoản quản trị thật.
 *
 *   npm run create-admin                          # hỏi từng thứ một
 *   npm run create-admin -- --email a@b.vn --name "Nguyen Van A"
 *   npm run create-admin -- --reset-password --email a@b.vn
 *   npm run create-admin -- --disable-demo
 *
 * Chạy trên database của Railway:
 *
 *   cd apps/api && railway link && railway run npm run create-admin
 *
 * Mật khẩu **không** nhận qua tham số dòng lệnh: tham số nằm lại trong lịch sử
 * shell và hiện ra với mọi tiến trình khác trên máy qua `ps`. Script hỏi trực
 * tiếp và không hiện ký tự lên màn hình.
 */
import { PrismaClient, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as readline from 'node:readline';

const prisma = new PrismaClient();

const SUPER_ADMIN = 'SUPER_ADMIN';

/** Các tài khoản do seed tạo ra để demo. Không được để sống ở môi trường thật. */
const DEMO_EMAILS = [
  'admin@pms.local',
  'buyer@pms.local',
  'user@pms.local',
  'ncc-a@pms.local',
  'ncc-b@pms.local',
  'finance@pms.local',
  'director@pms.local',
  'qa@pms.local',
  'warehouse@pms.local',
];

// ---------------------------------------------------------------------------
// Tham số dòng lệnh
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

// ---------------------------------------------------------------------------
// Nhập liệu
// ---------------------------------------------------------------------------

/**
 * Một interface dùng chung cho cả script. Tạo rồi đóng một interface cho mỗi
 * câu hỏi sẽ làm hỏng stdin cho những câu sau — câu thứ ba trở đi không bao giờ
 * nhận được gì và script treo.
 */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let muted = false;
// readline không có chế độ ẩn sẵn; chặn ngay chỗ nó ghi ra màn hình.
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (
  s: string,
) => {
  if (!muted) process.stdout.write(s);
};

/**
 * Đọc từng dòng qua async iterator chứ không dùng `rl.question`. Khi stdin là
 * đường ống chứ không phải bàn phím, readline đọc hết rồi tự đóng ngay — câu
 * hỏi đầu tiên sẽ gặp lỗi "readline was closed". Iterator giữ luồng ở trạng
 * thái tạm dừng giữa hai lần đọc nên chạy được với cả hai kiểu đầu vào.
 */
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write('\n');
  if (done) throw new Error('Đầu vào kết thúc giữa chừng');
  return String(value).trim();
}

// ---------------------------------------------------------------------------
// Kiểm tra đầu vào
// ---------------------------------------------------------------------------

/**
 * Ngưỡng chặt hơn `MinLength(8)` của API. Đây là tài khoản làm được mọi thứ
 * trong hệ thống, kể cả đọc toàn bộ giá và xoá dữ liệu.
 */
function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return 'Mật khẩu phải dài ít nhất 12 ký tự';
  if (/^\d+$/.test(pw)) return 'Mật khẩu không được toàn chữ số';
  const weak = ['admin@123', 'password', '123456789012', 'qwertyuiop'];
  if (weak.some((w) => pw.toLowerCase().includes(w))) {
    return 'Mật khẩu chứa chuỗi quá phổ biến';
  }
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------

async function disableDemoAccounts() {
  const found = await prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS }, deletedAt: null },
    select: { id: true, email: true, status: true },
  });

  if (!found.length) {
    console.log('Không còn tài khoản demo nào đang hoạt động.');
    return;
  }

  const active = found.filter((u) => u.status !== UserStatus.SUSPENDED);
  if (!active.length) {
    console.log(`${found.length} tài khoản demo đều đã bị khoá từ trước.`);
    return;
  }

  await prisma.user.updateMany({
    where: { id: { in: active.map((u) => u.id) } },
    data: { status: UserStatus.SUSPENDED },
  });

  console.log(`Đã khoá ${active.length} tài khoản demo:`);
  for (const u of active) console.log(`  - ${u.email}`);
  console.log(
    '\nKhoá chứ không xoá, để lịch sử duyệt và bình luận cũ vẫn còn người đứng tên.',
  );
}

async function main() {
  const superAdmin = await prisma.role.findUnique({
    where: { code: SUPER_ADMIN },
  });
  if (!superAdmin) {
    throw new Error(
      `Chưa có vai trò ${SUPER_ADMIN} trong database. Chạy \`npx prisma db seed\` trước.`,
    );
  }

  if (flag('disable-demo') && !arg('email')) {
    await disableDemoAccounts();
    return;
  }

  // --- email ---
  let email = arg('email') ?? (await ask('Email quản trị: '));
  email = email.toLowerCase();
  if (!EMAIL.test(email)) throw new Error(`Email không hợp lệ: ${email}`);
  if (email.endsWith('@pms.local')) {
    throw new Error(
      'Đuôi @pms.local là của tài khoản demo. Dùng email thật của bạn.',
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { roles: true },
  });

  if (existing && !flag('reset-password')) {
    throw new Error(
      `Email ${email} đã tồn tại. Thêm --reset-password nếu muốn đặt lại mật khẩu cho tài khoản này.`,
    );
  }

  // --- họ tên ---
  const fullName =
    arg('name') ?? existing?.fullName ?? (await ask('Họ và tên: '));
  if (fullName.length < 2) throw new Error('Họ tên quá ngắn');

  // --- mật khẩu ---
  let password = '';
  for (;;) {
    password = await ask('Mật khẩu (không hiện ra màn hình): ', true);
    const problem = passwordProblem(password);
    if (problem) {
      console.log(`  ${problem}. Thử lại.`);
      continue;
    }
    const again = await ask('Nhập lại mật khẩu: ', true);
    if (again !== password) {
      console.log('  Hai lần nhập không khớp. Thử lại.');
      continue;
    }
    break;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const procurement = await prisma.department.findUnique({
    where: { code: 'PROC' },
  });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          fullName,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          status: UserStatus.ACTIVE,
          departmentId: procurement?.id ?? null,
        },
      });

  // Gán vai trò nếu chưa có. Tài khoản đặt lại mật khẩu có thể đã có sẵn.
  const hasRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: superAdmin.id },
  });
  if (!hasRole) {
    await prisma.userRole.create({
      data: { userId: user.id, roleId: superAdmin.id },
    });
  }

  // Mọi phiên đang mở của tài khoản này bị cắt, phòng trường hợp đặt lại mật
  // khẩu vì nghi bị lộ.
  const killed = await prisma.refreshToken.deleteMany({
    where: { userId: user.id },
  });

  console.log('');
  console.log(existing ? 'Đã đặt lại mật khẩu.' : 'Đã tạo tài khoản quản trị.');
  console.log(`  Email    : ${user.email}`);
  console.log(`  Họ tên   : ${user.fullName}`);
  console.log(`  Vai trò  : ${SUPER_ADMIN}`);
  console.log(`  Trạng thái: ${user.status}`);
  if (killed.count) {
    console.log(`  Đã đăng xuất ${killed.count} phiên đang mở của tài khoản này.`);
  }

  if (flag('disable-demo')) {
    console.log('');
    await disableDemoAccounts();
  } else {
    const stillActive = await prisma.user.count({
      where: {
        email: { in: DEMO_EMAILS },
        deletedAt: null,
        status: { not: UserStatus.SUSPENDED },
      },
    });
    if (stillActive) {
      console.log('');
      console.log(
        `Cảnh báo: còn ${stillActive} tài khoản demo đang hoạt động, mật khẩu của chúng`,
      );
      console.log(
        'nằm công khai trong README. Khoá lại bằng: npm run create-admin -- --disable-demo',
      );
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      `\nKhông thực hiện được: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
    void prisma.$disconnect();
  });
