import { getDataSource } from './data-source';

/**
 * Integration tests need a real MariaDB (CI provisions one as a service container,
 * see .github/workflows/ci.yml). Locally, this lets the same test files degrade to a
 * clean skip instead of hanging/failing when no DB is reachable.
 */
export async function isDbAvailable(): Promise<boolean> {
  try {
    const dataSource = await Promise.race([
      getDataSource(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    await dataSource.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
