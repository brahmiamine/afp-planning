#!/usr/bin/env node
/**
 * Inventaire générable des routes API avec/sans test d'intégration dédié (issue #207).
 * Remplace le ratio codé en dur dans TESTING.md, qui se périme à chaque route ajoutée.
 *
 * Usage : node scripts/route-test-coverage.mjs [--missing]
 *   --missing  n'affiche que les routes sans route.test.ts, une par ligne.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_DIR = join(import.meta.dirname, '..', 'app', 'api');

function findRouteFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findRouteFiles(full, results);
    } else if (entry === 'route.ts') {
      results.push(full);
    }
  }
  return results;
}

function hasTest(routeFile) {
  return statSync(routeFile.replace(/route\.ts$/, 'route.test.ts'), { throwIfNoEntry: false }) !== undefined;
}

const routes = findRouteFiles(API_DIR).sort();
const tested = routes.filter(hasTest);
const missing = routes.filter((route) => !hasTest(route));

if (process.argv.includes('--missing')) {
  for (const route of missing) console.log(relative(process.cwd(), route));
  process.exit(0);
}

console.log(`Routes API avec test d'intégration dédié : ${tested.length}/${routes.length}`);
if (missing.length) {
  console.log('\nSans route.test.ts :');
  for (const route of missing) console.log(`  - ${relative(process.cwd(), route)}`);
}
