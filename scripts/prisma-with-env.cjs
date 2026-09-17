const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

const prismaCommand = process.argv[2] || '';
const needsDatabasePassword = !['generate', 'format', 'validate', 'version', '--help', '-h'].includes(prismaCommand);
const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER'];
if (needsDatabasePassword) required.push('DB_PASSWORD');
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  console.error(`Missing database setting: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.DB_PASSWORD) {
  const ssl = process.env.DB_SSL === 'true' ? '&sslmode=require' : '';
  process.env.DATABASE_URL = [
    `postgresql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}`,
    `@${process.env.DB_HOST}:${process.env.DB_PORT}/${encodeURIComponent(process.env.DB_NAME)}?schema=public${ssl}`
  ].join('');
}

const prismaEntry = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [prismaEntry, ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
