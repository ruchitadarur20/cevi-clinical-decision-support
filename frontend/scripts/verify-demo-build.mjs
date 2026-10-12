// Post-build guard for the static portfolio demo. Fails the build if the output could leak configuration or
// call a private backend, or if the CSP no longer matches the inline theme bootstrap script.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const out = 'dist-demo';
const fail = (m) => { console.error(`✗ demo build check failed: ${m}`); process.exit(1); };
if (!existsSync(join(out, 'index.html'))) fail(`${out}/index.html missing`);

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(out);
const text = files.filter((f) => ['.js', '.css', '.html', '.json', '.svg'].includes(extname(f)) || /_headers|_redirects/.test(f));

// 1. CSP hash matches the inline script in index.html
const html = readFileSync(join(out, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const headers = readFileSync(join(out, '_headers'), 'utf8');
for (const body of inline) {
  const h = `sha256-${createHash('sha256').update(body).digest('base64')}`;
  if (!headers.includes(h)) fail(`inline script hash ${h} is not allowed by _headers CSP`);
}

// 2. No secrets / private endpoints in any shipped text asset
const forbidden = [
  [/localhost|127\.0\.0\.1|0\.0\.0\.0/i, 'loopback address'],
  [/JWT_SECRET|DATABASE_URL|mysql:\/\/|BEGIN (RSA |EC )?PRIVATE KEY/i, 'backend configuration / credential marker'],
  [/CeviDemo2026/, 'local demo password'],
  [/cevi_local_dev_pw/, 'local database password'],
];
const problems = [];
for (const f of text) {
  const body = readFileSync(f, 'utf8');
  for (const [re, label] of forbidden) {
    const m = re.exec(body);
    if (m) problems.push(`${f}: ${label} (“${m[0]}”)`);
  }
}
if (problems.length) fail(`\n  ${problems.join('\n  ')}`);

// 3. No backend sources shipped
if (files.some((f) => /prisma|\.sql$|\.env/i.test(f))) fail('backend or env files present in output');

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const total = files.reduce((n, f) => n + statSync(f).size, 0);
console.log(`✓ demo build verified: ${files.length} files, ${kb(total)}; CSP hash ok; no secrets, loopback hosts or backend files`);
