/**
 * Applique les migrations de schéma versionnées (issue #129) puis affiche le journal.
 *
 * Usage : pnpm run db:migrate
 *
 * À exécuter avant le démarrage applicatif en déploiement (build → migrate → start).
 * L'application applique aussi ces migrations automatiquement à l'initialisation de
 * la connexion ; ce script permet de les jouer explicitement en amont et de faire
 * échouer le déploiement tôt si le schéma est incohérent.
 */
import { getDataSource } from '../app/lib/db/data-source';

async function main(): Promise<void> {
  const db = await getDataSource();
  try {
    const rows = await db.query(
      'SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version',
    ) as Array<{ version: string; name: string; appliedAt: Date }>;
    console.log(`Schéma à jour — ${rows.length} migration(s) enregistrée(s) :`);
    for (const row of rows) {
      console.log(`  ${row.version} — ${row.name} (appliquée le ${new Date(row.appliedAt).toISOString()})`);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error('[db:migrate] Échec des migrations :', error);
  process.exit(1);
});
