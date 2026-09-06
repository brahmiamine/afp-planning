# Migrations de schéma base de données

Issue de référence : [#129](https://github.com/brahmiamine/afp-planning/issues/129).

## Principe

Toute évolution du schéma qui n'est pas portée par une entité TypeORM passe par une
**migration versionnée** — jamais par un `CREATE TABLE IF NOT EXISTS` exécuté au
premier appel d'un module métier.

- Le registre ordonné des migrations vit dans
  [`app/lib/db/migrations/schema-migrations.ts`](../app/lib/db/migrations/schema-migrations.ts).
- Le runner ([`app/lib/db/migrations/runner.ts`](../app/lib/db/migrations/runner.ts))
  journalise chaque migration appliquée dans la table `schema_migrations`
  (version, nom, empreinte SHA-256, date).
- Les migrations sont appliquées automatiquement à l'initialisation de la connexion
  (`getDataSource()`), donc avant toute requête applicative. Un échec est
  **bloquant** : l'application refuse de démarrer sur un schéma incohérent.
- Un verrou consultatif MariaDB (`GET_LOCK`) empêche deux instances d'exécuter le
  DDL simultanément au démarrage.
- Les tables portées par les `EntitySchema` de `app/lib/db/schemas.ts` restent gérées
  par TypeORM (`synchronize`) ; les migrations couvrent tout le schéma hors entités.

## Règles d'écriture d'une migration

1. Nouvelle migration = nouvelle entrée en fin de registre, version sur 4 chiffres
   strictement croissante (`0008`, `0009`, …).
2. **Immuabilité** : ne jamais modifier une migration déjà fusionnée sur `main` —
   l'empreinte est revérifiée à chaque démarrage et toute divergence bloque le boot.
3. **Idempotence** : chaque instruction doit pouvoir être rejouée sans erreur
   (`IF NOT EXISTS`, `INSERT IGNORE`, …) car MariaDB ne transactionne pas le DDL.
4. La logique dépendant de l'existant (backfills) va dans `up(db)` et doit être
   elle aussi idempotente.

## Exploitation

### Commande

```bash
pnpm run db:migrate
```

Applique les migrations manquantes puis affiche le journal. Variables d'environnement
habituelles : `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

### Ordre de déploiement

```
build → db:migrate → start
```

En pratique le démarrage applicatif rejoue le runner (sans effet si tout est déjà
appliqué), donc un oubli de l'étape explicite ne laisse pas le schéma à la traîne —
mais l'étape `db:migrate` permet de faire échouer le déploiement **avant** la mise en
service.

### CI

Le job `test` de `.github/workflows/ci.yml` exécute `pnpm run db:migrate` contre une
MariaDB vierge avant `pnpm run test`. La suite contient en outre des tests
d'intégration du runner (`app/lib/db/migrations/runner.test.ts`) : base vierge,
réexécution idempotente, immuabilité, détection de dérive.

### Docker / local

En local, `start.sh` et `pnpm dev` déclenchent les migrations au premier accès DB.
Avec Docker Compose, ajouter un service one-shot `migrate` (même image, commande
`pnpm run db:migrate`) dont le service applicatif dépend (`depends_on` +
`condition: service_completed_successfully`).

### Rollback

Les migrations sont à sens unique et sans `down` automatisé. Stratégie :

- erreur détectée avant mise en production : supprimer la ligne correspondante de
  `schema_migrations`, annuler manuellement le DDL, corriger la migration **tant
  qu'elle n'a pas été fusionnée** ;
- erreur détectée après fusion : écrire une nouvelle migration corrective, ne jamais
  réécrire l'historique.

## Inventaire du DDL migré (étape 1 de l'issue)

| Table | Ancien propriétaire runtime | Migration |
|---|---|---|
| `planning_records`, `planning_attachments` | `app/lib/planning/records.ts` | `0001` |
| `planning_event_state` | `app/lib/planning/event-lifecycle.ts` | `0002` |
| `push_subscriptions` | `app/lib/push/store.ts` | `0003` |
| `planning_notification_outbox` | `app/lib/notifications/outbox.ts` | `0004` |
| `chat_attachments` | `app/lib/chat/attachments.ts` | `0005` |
| `scraper_sync_runs` | `app/lib/scraper/runs.ts` | `0006` |
| `planning_assignment_state` | `app/lib/planning/assignment-state-store.ts` | `0007` |

Restent hors périmètre volontairement : les `ALTER TABLE` défensifs du
`json-migrator` (migration de données héritées JSON → SQL, bornée par marqueur et
vérifications `information_schema`) et le `synchronize` TypeORM des entités.
