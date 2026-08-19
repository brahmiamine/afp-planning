import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { allSchemas } from './schemas';
import { AuthUserSchema } from './auth-schema';

declare global {
  var __afpDataSource: DataSource | undefined;
  var __afpDataSourceInitPromise: Promise<DataSource> | undefined;
}

function getPort(): number {
  const rawPort = process.env.DB_PORT ?? '3306';
  const parsedPort = Number.parseInt(rawPort, 10);
  return Number.isFinite(parsedPort) ? parsedPort : 3306;
}

function createDataSource(): DataSource {
  return new DataSource({
    type: 'mariadb',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: getPort(),
    username: process.env.DB_USER ?? 'afp_user',
    password: process.env.DB_PASSWORD ?? 'afp_password',
    database: process.env.DB_NAME ?? 'afp_planning',
    entities: [...allSchemas, AuthUserSchema],
    synchronize: true,
    logging: false,
    timezone: 'Z',
    charset: 'utf8mb4_unicode_ci',
  });
}

export async function getDataSource(): Promise<DataSource> {
  if (globalThis.__afpDataSource?.isInitialized) {
    return globalThis.__afpDataSource;
  }

  const dataSource = globalThis.__afpDataSource ?? createDataSource();
  globalThis.__afpDataSource = dataSource;

  if (globalThis.__afpDataSourceInitPromise) {
    await globalThis.__afpDataSourceInitPromise;
    return globalThis.__afpDataSource as DataSource;
  }

  globalThis.__afpDataSourceInitPromise = (async () => {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
    return dataSource;
  })().finally(() => {
    globalThis.__afpDataSourceInitPromise = undefined;
  });

  await globalThis.__afpDataSourceInitPromise;
  return dataSource;
}
