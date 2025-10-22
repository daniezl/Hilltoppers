import { cpSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const copies = [
  {
    from: path.join(rootDir, 'manifest.json'),
    to: path.join(distDir, 'manifest.json')
  },
  {
    from: path.join(rootDir, 'icons'),
    to: path.join(distDir, 'icons')
  }
];

for (const { from, to } of copies) {
  if (!existsSync(from)) {
    console.warn(`[postbuild] Skip missing path: ${from}`);
    continue;
  }
  const destinationDir = path.extname(to) ? path.dirname(to) : to;
  mkdirSync(destinationDir, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[postbuild] Copied ${from} → ${to}`);
}
