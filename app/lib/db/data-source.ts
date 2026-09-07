import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { allSchemas } from './schemas';
import { runSchemaMigrations } from './migrations/runner';
import { schemaMigrations } from './migrations/schema-migrations';

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
    entities: allSchemas,
    // `synchronize` reste le mécanisme de création/évolution des tables portées
    // par les entités, mais il est exécuté explicitement APRÈS les migrations
    // versionnées (issue #125) : une migration qui convertit une clé primaire
    // doit pouvoir vérifier les collisions avant toute modification physique.
    synchronize: false,
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
    // Migrations de schéma versionnées (issue #129) : exécutées avant toute
    // utilisation de la base, un échec bloque le démarrage applicatif.
    await runSchemaMigrations(dataSource, schemaMigrations);
    // Synchronisation TypeORM des tables d'entités, après les migrations
    // versionnées (issue #125) — sans effet quand le schéma physique est déjà
    // conforme aux entités.
    await dataSource.synchronize();
    return dataSource;
  })().finally(() => {
    globalThis.__afpDataSourceInitPromise = undefined;
  });

  await globalThis.__afpDataSourceInitPromise;
  return dataSource;
}
