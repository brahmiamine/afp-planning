import { getDataSource } from './data-source';

/**
 * Integration tests need a real MariaDB (CI provisions one as a service container,
 * see .github/workflows/ci.yml). Locally, this lets the same test files degrade to a
 * clean skip instead of hanging/failing when no DB is reachable.
 *
 * In CI, set `REQUIRE_DB_TESTS=1` so an unreachable database fails the suite instead
 * of silently skipping every `describe.skipIf(!isDbAvailable())` block (issue #286).
 */
export async function isDbAvailable(): Promise<boolean> {
  try {
    const dataSource = await Promise.race([
      getDataSource(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    await dataSource.query('SELECT 1');
    return true;
  } catch (error) {
    if (process.env.REQUIRE_DB_TESTS === '1') {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `MariaDB is required for integration tests (REQUIRE_DB_TESTS=1) but is unavailable: ${detail}`,
      );
    }
    return false;
  }
}
