import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 给两个构建产物目录各写一个 package.json，
 * 声明模块类型。否则 dist/esm/xxx.js 里的 `export` 语法在 Node 眼里是
 * CommonJS 文件，会报 "Unexpected token 'export'"。
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const targets = [
  { dir: join(root, 'dist/cjs'), type: 'commonjs' },
  { dir: join(root, 'dist/esm'), type: 'module' },
];

for (const { dir, type } of targets) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`, 'utf8');
  console.log(`✔ ${dir} → type: ${type}`);
}
