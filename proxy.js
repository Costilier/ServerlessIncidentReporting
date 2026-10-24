// proxy.js — Local CORS proxy for IncidentHub
// Forwards all /api/* requests to the AWS API Gateway, adding CORS headers.
// Usage: node proxy.js
// Then open http://localhost:3000

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const STATIC_DIR = __dirname;
const PROXY_PORT = 3000;
const AWS_HOST   = '8f1hpjb7m5.execute-api.ap-southeast-2.amazonaws.com';

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── Handle CORS preflight ──────────────────────────
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // ── Proxy /api/* → AWS API Gateway ────────────────
  if (pathname.startsWith('/api/')) {
    const awsPath = pathname.slice(4) + (parsed.search || ''); // strip /api prefix
    const chunks  = [];

    const options = {
      hostname: AWS_HOST,
      port:     443,
      path:     awsPath,
      method:   req.method,
      headers:  { 'Content-Type': 'application/json' },
    };

    const proxy = https.request(options, (awsRes) => {
      awsRes.on('data', c => chunks.push(c));
      awsRes.on('end', () => {
        const body = Buffer.concat(chunks);
        res.writeHead(awsRes.statusCode, {
          ...CORS_HEADERS,
          'Content-Type': awsRes.headers['content-type'] || 'application/json',
        });
        res.end(body);
      });
    });

    proxy.on('error', (err) => {
      res.writeHead(502, CORS_HEADERS);
      res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }));
    });

    if (req.method === 'POST' || req.method === 'PUT') {
      req.pipe(proxy);
    } else {
      proxy.end();
    }
    return;
  }

  // ── Serve static files ─────────────────────────────
  let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(STATIC_DIR, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────────┐`);
  console.log(`  │  IncidentHub running on                 │`);
  console.log(`  │  → http://localhost:${PROXY_PORT}               │`);
  console.log(`  │  → Proxying AWS API through /api/*      │`);
  console.log(`  └─────────────────────────────────────────┘\n`);
});
