import 'reflect-metadata';

if (process.env.REQUIRE_DB_TESTS === '1') {
  const { isDbAvailable } = await import('./app/lib/db/test-utils');
  await isDbAvailable();
}
