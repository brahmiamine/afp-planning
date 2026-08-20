import { DataSource } from 'typeorm';
import { getDataSource } from './data-source';
import { ensureDbSchemaForAvailability, ensureJsonDataMigrated } from './json-migrator';
import { ensureSuperadminBootstrap } from './user-bootstrap';
import { ensurePlatformAdminBootstrap } from './platform-bootstrap';

declare global {
  var __afpDbBootstrapped: boolean | undefined;
  var __afpDbBootstrapPromise: Promise<void> | undefined;
}

export async function getDb(): Promise<DataSource> {
  const dataSource = await getDataSource();

  if (!globalThis.__afpDbBootstrapped) {
    if (!globalThis.__afpDbBootstrapPromise) {
      globalThis.__afpDbBootstrapPromise = (async () => {
        await ensureDbSchemaForAvailability(dataSource);
        await ensureJsonDataMigrated(dataSource);
        await ensureSuperadminBootstrap(dataSource);
        await ensurePlatformAdminBootstrap(dataSource);
        globalThis.__afpDbBootstrapped = true;
      })().finally(() => {
        globalThis.__afpDbBootstrapPromise = undefined;
      });
    }

    await globalThis.__afpDbBootstrapPromise;
  }

  return dataSource;
}
