import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = normalize(decodeURIComponent(new URL('../dist/', import.meta.url).pathname).replace(/^\/(.:\/)/, '$1'));
const basePath = process.env.MAHJONG_BASE_PATH || '/';
const port = Number(process.env.MAHJONG_PORT || 4173);
const sampleDir = process.env.MAHJONG_SAMPLE_DIR;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (sampleDir && /^\/__sample\/[1-3]\.jpg$/.test(pathname)) {
      const number = pathname.at(-5);
      const body = await readFile(join(sampleDir, `${number}-照片-${number}.jpg`));
      response.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
      response.end(body); return;
    }
    if (!pathname.startsWith(basePath)) throw new Error('Outside site base');
    let file = join(root, pathname.slice(basePath.length));
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}${basePath}`));
