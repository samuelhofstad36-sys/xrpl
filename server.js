// Attestry coming-soon site — zero-dependency Node server for Railway.
// Serves ./public and stores waitlist signups as CSV.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// Point DATA_DIR at a Railway volume mount (e.g. /data) so signups survive redeploys.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const WAITLIST_FILE = path.join(DATA_DIR, 'waitlist.csv');
// Set ADMIN_KEY in Railway to enable downloading signups at /admin/waitlist.csv?key=...
const ADMIN_KEY = process.env.ADMIN_KEY || '';

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(WAITLIST_FILE)) fs.writeFileSync(WAITLIST_FILE, 'timestamp,email\n');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

const EMAIL_RE = /^[^\s@,"]+@[^\s@,"]+\.[^\s@,"]+$/;
const recent = new Map(); // simple per-IP rate limit

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
  res.end(body);
}

function safeEqual(a, b) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function handleWaitlist(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 5) return send(res, 429, 'Too many requests');
  hits.push(now);
  recent.set(ip, hits);

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 2048) req.destroy();
  });
  req.on('end', () => {
    let data;
    try { data = JSON.parse(raw); } catch { return send(res, 400, 'Bad request'); }
    if (data.website) return send(res, 200, 'ok'); // honeypot: silently drop bots
    const email = String(data.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return send(res, 400, 'Invalid email');

    const existing = fs.readFileSync(WAITLIST_FILE, 'utf8');
    if (!existing.includes(',' + email + '\n')) {
      fs.appendFileSync(WAITLIST_FILE, `${new Date().toISOString()},${email}\n`);
      console.log(`[waitlist] new signup: ${email}`);
    }
    send(res, 200, 'ok');
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, buf) => {
      if (err2) {
        // Unknown paths fall back to the landing page.
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e3, home) =>
          e3 ? send(res, 404, 'Not found') : send(res, 200, home, TYPES['.html']));
      }
      const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=86400',
        ...SECURITY_HEADERS,
      });
      res.end(buf);
    });
  });
}

http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://x');

  if (pathname === '/healthz') return send(res, 200, 'ok');
  if (pathname === '/api/waitlist' && req.method === 'POST') return handleWaitlist(req, res);
  if (pathname === '/admin/waitlist.csv') {
    const key = searchParams.get('key') || '';
    if (!ADMIN_KEY || !safeEqual(key, ADMIN_KEY)) return send(res, 404, 'Not found');
    return send(res, 200, fs.readFileSync(WAITLIST_FILE), 'text/csv; charset=utf-8');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  serveStatic(req, res);
}).listen(PORT, () => console.log(`Attestry site listening on port ${PORT}`));
