#!/usr/bin/env node
/**
 * Inventaire générable des routes API avec/sans test d'intégration dédié (issue #207 / #286).
 * Remplace le ratio codé en dur dans TESTING.md, qui se périme à chaque route ajoutée.
 *
 * Usage : node scripts/route-test-coverage.mjs [--missing] [--check]
 *   --missing  n'affiche que les routes sans route.test.ts, une par ligne.
 *   --check    échoue si la couverture redescend sous le socle (baseline) ou si une
 *              route critique n'a plus de test dédié.
 */
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_DIR = join(import.meta.dirname, '..', 'app', 'api');
const BASELINE_PATH = join(import.meta.dirname, 'route-test-coverage.baseline.json');

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
const relativeRoutes = (files) => files.map((file) => relative(process.cwd(), file));

if (process.argv.includes('--missing')) {
  for (const route of missing) console.log(relative(process.cwd(), route));
  process.exit(0);
}

console.log(`Routes API avec test d'intégration dédié : ${tested.length}/${routes.length}`);
if (missing.length) {
  console.log('\nSans route.test.ts :');
  for (const route of missing) console.log(`  - ${relative(process.cwd(), route)}`);
}

if (process.argv.includes('--check')) {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const testedRel = new Set(relativeRoutes(tested));
  const errors = [];
  if (tested.length < baseline.minTested) {
    errors.push(
      `Couverture API en régression : ${tested.length} routes testées, socle ${baseline.minTested}.`,
    );
  }
  for (const required of baseline.requiredRoutes) {
    if (!testedRel.has(required)) {
      errors.push(`Route critique sans route.test.ts : ${required}`);
    }
  }
  if (errors.length) {
    console.error('\nÉchec du socle de couverture des routes (issue #286) :');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`\nSocle de couverture respecté (${tested.length} ≥ ${baseline.minTested}, ${baseline.requiredRoutes.length} routes critiques).`);
}
