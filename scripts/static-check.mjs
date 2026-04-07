import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const targets = ['src'];
const explicitTestFiles = [
  path.join(ROOT, 'test', 'smoke.mjs'),
  path.join(ROOT, 'test', 'explore.mjs'),
  path.join(ROOT, 'test', 'capture-portfolio-screenshot.mjs'),
];
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) checkFile(full);
  }
}

function checkFile(file) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, 'utf8');

  if (!rel.startsWith(`src${path.sep}`) && !rel.startsWith(`test${path.sep}`)) return;

  if (/localStorage\.(getItem|setItem)\((['"])clowder_save\2\)/.test(text)) {
    failures.push(`${rel}: uses legacy clowder_save key`);
  }

  if (rel.startsWith(`src${path.sep}`) && /\.includes\((['"])(Brave|Lazy|Curious|Pious|Night Owl|Skittish|Loyal|Mischievous)\1\)/.test(text)) {
    failures.push(`${rel}: compares title-cased trait labels instead of normalized trait ids`);
  }
}

for (const target of targets) walk(path.join(ROOT, target));
for (const file of explicitTestFiles) checkFile(file);

if (failures.length > 0) {
  console.error('Static checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Static checks passed.');
