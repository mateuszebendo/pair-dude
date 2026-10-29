import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'src');
const files = readdirSync(source).filter((name) => name.endsWith('.js'));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (manifest.name !== 'pair-dude' || manifest.displayName !== 'Pair Dude') {
  throw new Error('Nome da extensão divergente do projeto.');
}
if (!files.includes('extension.js')) {
  throw new Error('Ponto de entrada da extensão ausente.');
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', join(source, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`${files.length} módulos JavaScript válidos; manifesto Pair Dude OK.`);
