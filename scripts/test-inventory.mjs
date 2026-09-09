import { readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [relative(root, path)];
  }));
  return nested.flat();
}

const apiFiles = await walk(resolve(root, 'app/api'));
const routeCount = apiFiles.filter((path) => path.endsWith('/route.ts')).length;
const integrationTests = apiFiles.filter((path) => path.endsWith('/route.test.ts'));
const e2eFiles = (await walk(resolve(root, 'e2e'))).filter((path) => path.endsWith('.spec.ts'));

console.log(`API routes: ${routeCount}`);
console.log(`API route integration tests: ${integrationTests.length}`);
console.log(`Playwright specifications: ${e2eFiles.length}`);
for (const file of [...integrationTests, ...e2eFiles].sort()) console.log(`- ${file}`);
