/**
 * Checks the local setup and reports what is missing, in order. Run it when
 * something does not work — it is faster than guessing which step was skipped.
 *
 *   node scripts/doctor.mjs
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const ok = (msg) => console.log(`  OK    ${msg}`);
const bad = (msg, fix) => {
  console.log(`  LOI   ${msg}`);
  problems.push(fix);
};

function tryExec(command, options = {}) {
  try {
    return execSync(command, { stdio: 'pipe', encoding: 'utf8', ...options }).trim();
  } catch {
    return null;
  }
}

console.log('\n== 1. Cong cu ==');
const node = tryExec('node -v');
const major = node ? Number(node.replace('v', '').split('.')[0]) : 0;
if (major >= 20) ok(`Node.js ${node}`);
else bad(`Node.js ${node ?? 'chua cai'} (can >= 20)`, 'Cai Node.js 20 LTS tai https://nodejs.org');

if (tryExec('docker -v')) ok('Docker da cai');
else bad('Docker chua cai', 'Cai Docker Desktop tai https://docker.com');

console.log('\n== 2. File cau hinh ==');
for (const [label, path] of [
  ['apps/api/.env', join(root, 'apps', 'api', '.env')],
  ['apps/web/.env.local', join(root, 'apps', 'web', '.env.local')],
]) {
  if (existsSync(path)) ok(label);
  else bad(`Thieu ${label}`, 'Chay: node scripts/setup-env.mjs');
}

console.log('\n== 3. Thu vien ==');
for (const [label, path] of [
  ['apps/api/node_modules', join(root, 'apps', 'api', 'node_modules')],
  ['apps/web/node_modules', join(root, 'apps', 'web', 'node_modules')],
]) {
  if (existsSync(path)) ok(label);
  else bad(`Thieu ${label}`, 'Chay: npm install --prefix apps/api && npm install --prefix apps/web');
}

// Chi tham khao: bai kiem tra that su la ket noi duoc o muc 5 (co the
// dung PostgreSQL cai truc tiep thay vi Docker).
console.log('\n== 4. Container Docker ==');
const containers = tryExec('docker ps --format "{{.Names}}"') ?? '';
if (containers.includes('pms-postgres')) ok('Container pms-postgres dang chay');
else console.log('  ...   Khong thay container pms-postgres (xem muc 5)');

console.log('\n== 5. Du lieu mau ==');
const apiDir = join(root, 'apps', 'api');
if (!existsSync(join(apiDir, 'node_modules', '@prisma', 'client'))) {
  console.log('  BO QUA  (chua cai thu vien)');
} else {
  try {
    const require = createRequire(join(apiDir, 'package.json'));
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const users = await prisma.user.count();
    await prisma.$disconnect();
    if (users > 0) ok(`Co ${users} tai khoan trong database`);
    else bad('Database trong, chua co tai khoan nao', 'Chay trong apps/api: npm run db:seed');
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes('did not initialize')) {
      bad('Prisma Client chua duoc sinh ra', 'Chay trong apps/api: npx prisma generate');
    } else if (message.includes('does not exist') || message.includes('P2021')) {
      bad('Chua tao bang trong database', 'Chay trong apps/api: npx prisma migrate deploy');
    } else if (message.includes('P1001') || message.includes("Can't reach")) {
      bad('Khong ket noi duoc database', 'Chay: docker compose up -d roi doi 30 giay');
    } else if (message.includes('DATABASE_URL')) {
      bad('Thieu DATABASE_URL', 'Chay: node scripts/setup-env.mjs');
    } else {
      bad(`Loi database: ${message.split('\n')[0]}`, 'Xem ky thong bao loi o tren');
    }
  }
}

console.log('\n== 6. Server ==');
for (const [label, url] of [
  ['API (cong 4000)', 'http://localhost:4000/api/auth/me'],
  ['Web (cong 3000)', 'http://localhost:3000/login'],
]) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    ok(`${label} dang chay (HTTP ${res.status})`);
  } catch {
    bad(`${label} chua chay`, label.includes('API')
      ? 'Chay trong apps/api: npm run start:dev'
      : 'Chay trong apps/web: npm run dev');
  }
}

console.log('\n' + '='.repeat(50));
if (!problems.length) {
  console.log('Tat ca deu OK. Dang nhap tai http://localhost:3000');
  console.log('Tai khoan: buyer@pms.local / Admin@123');
} else {
  console.log('CAN XU LY THEO THU TU:\n');
  [...new Set(problems)].forEach((fix, i) => console.log(`  ${i + 1}. ${fix}`));
}
console.log('='.repeat(50) + '\n');
