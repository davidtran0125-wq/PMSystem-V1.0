/**
 * Creates the .env files the apps need, copied from .env.example.
 * Written in Node rather than shell so the same command works on Windows,
 * macOS and Linux. Existing files are left untouched.
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const example = join(root, '.env.example');

if (!existsSync(example)) {
  console.error('Khong tim thay .env.example — ban co dang o thu muc goc du an khong?');
  process.exit(1);
}

const targets = [
  { path: join(root, '.env'), from: example },
  { path: join(root, 'apps', 'api', '.env'), from: example },
];

for (const target of targets) {
  if (existsSync(target.path)) {
    console.log(`Da co, bo qua: ${target.path}`);
    continue;
  }
  copyFileSync(target.from, target.path);
  console.log(`Da tao: ${target.path}`);
}

const webEnv = join(root, 'apps', 'web', '.env.local');
if (existsSync(webEnv)) {
  console.log(`Da co, bo qua: ${webEnv}`);
} else {
  writeFileSync(webEnv, 'NEXT_PUBLIC_API_URL=http://localhost:4000/api\n');
  console.log(`Da tao: ${webEnv}`);
}

console.log('\nXong. Buoc tiep theo: khoi dong database roi chay migrate + seed.');
