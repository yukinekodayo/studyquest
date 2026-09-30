// dist/ を SPA として配信する(存在しないパスは index.html へ)。  node scripts/e2e/serve.mjs [port]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../dist');
const port = Number(process.argv[2] ?? 8081);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.map': 'application/json', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving dist on http://localhost:${port}`));
