import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const moduleDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const distDir = path.resolve(moduleDir, '../../chrome-extension/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.json': 'application/json', '.png': 'image/png' };

function serve(root, port, index) {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
      const filename = path.resolve(root, `.${pathname === '/' ? `/${index}` : pathname}`);
      if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const content = await readFile(filename);
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(content);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Demo module unavailable. Use Reload module to reconnect.'); }
  });
  server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port} (${index})`));
  return server;
}

const servers = [serve(moduleDir, 4174, 'module.html'), serve(distDir, 4173, 'popup.html')];
process.on('SIGINT', () => { for (const server of servers) server.close(); });
