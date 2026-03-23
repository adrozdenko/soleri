import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');
const dataSource = join(root, 'src', 'intelligence', 'data');
const dataDest = join(dist, 'intelligence', 'data');

if (existsSync(dataSource)) {
  mkdirSync(dataDest, { recursive: true });
  cpSync(dataSource, dataDest, { recursive: true });
  console.log('Copied intelligence data to dist/');
}
