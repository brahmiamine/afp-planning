# Audit 06 — Base de données et API

**Projet :** AFP Planning  
**Date :** 2026-09-10  
**Méthode :** revue statique schémas + migrations + 92 routes API

---

## Score : **73 / 100**

| Dimension | Note |
|-----------|------|
| Modèle de données | 70 |
| Intégrité / relations | 62 |
| Multi-tenant | 78 |
| Contrats API | 75 |
| Validation | 72 |
| Transactions / concurrence | 74 |
| Migrations | 80 |
| Performance | 68 |
| Tests | 76 |

**Findings :** P0 **0** · P1 **3** · P2 **8** · P3 **6**

---

## Architecture Data / API

```mermaid
flowchart LR
  Route[app/api/route.ts] --> Require[requireAuth/requireRole]
  Require --> ALS[setCurrentClubId]
  ALS --> Service[lib/planning|chat|notifications]
  Service --> ORM[TypeORM EntitySchema]
  Service --> RawSQL[planning_records SQL]
  ORM --> MariaDB[(MariaDB)]
  RawSQL --> MariaDB
```

| Composant | Fichier |
|-----------|---------|
| DataSource | `app/lib/db/data-source.ts` — `synchronize: false` |
| Entités | `app/lib/db/schemas.ts` — 22 EntitySchema |
| Migrations | `app/lib/db/migrations/schema-migrations.ts` — 18 versions |
| Runner | `app/lib/db/migrations/runner.ts` → table `schema_migrations` |
| Bootstrap | `app/lib/db/index.ts` |
| Validation | `app/lib/validation/request.ts` |

---

## Modèle de données — entités

### TypeORM (22 tables)

Voir Audit 00 pour inventaire complet. Points critiques :

| Entité | PK | Tenant | Soft delete |
|--------|-----|--------|-------------|
| `User` | `id` | `clubId` | `active` boolean |
| `MatchOfficial` | `(clubId, id)` | composite | non — missing/cancel |
| `MatchExtra` | `(clubId, matchId)` | composite | — |
| `ChatMessage` | `id` | via `roomId` | `deletedAt` |
| `ClubTenant` | `id` string | root tenant | `active` |
| `Notification` | `id` | via `userId→clubId` | non |

### Tables SQL (non-EntitySchema)

| Table | PK | Tenant |
|-------|-----|--------|
| `planning_records` | `id` | `club_id` |
| `planning_event_state` | `(club_id, event_type, event_id)` | composite |
| `planning_assignment_state` | `(club_id, event_type, event_id, role, person_key)` | composite |
| `push_subscriptions` | `id` | via `user_id` |
| `planning_notification_outbox` | `id` | via `user_id` |
| `scraper_sync_runs` | `id` | `club_id` |
| `chat_attachments` | `id` | `club_id` |

### Diagramme ER

Voir `audits/00-global-cartography.md` section 5.

---

## Ownership multi-tenant

| Pattern sûr | Exemple |
|-------------|---------|
| `findOneBy({ id, clubId: auth.user.clubId })` | `users/[id]/route.ts` |
| `getCurrentClubId()` + throw | `event-store.ts` |
| `WHERE club_id = ?` | `records.ts` |

| Pattern risqué | Exemple |
|----------------|---------|
| `defaultClubId()` fallback `APP_CLUB_ID \|\| 'afp'` | `records.ts:53-55` — **DB-001** |

---

## Relations et intégrité

**Constat majeur : aucune FOREIGN KEY au niveau MariaDB.**

| Risque | Impact |
|--------|--------|
| User supprimé, sessions/notifications orphelines | P2 — cleanup applicatif partiel |
| Room supprimée, messages orphelins | P2 |
| Match supprimé, MatchExtra orphelin | P2 — sync gère via composite PK |

**Cascade :** logique dans services (ex. deactivate user → alerts), pas DB.

---

## Unicité

| Contrainte | Table | Migration |
|------------|-------|-----------|
| `(clubId, email)` | users | 0017 |
| `(clubId, nom)` | clubs, stades, categories | 0018 |
| `(roomId, sequence)` | chat_messages | 0018 |
| `endpoint_hash` | push_subscriptions | 0003 |
| `idempotency_key` | outbox | 0016 |
| `icalToken` | users | column unique |

**Race `find→insert` :** invitations, push subscribe — partiellement couvert par UNIQUE ; certaines ops sans contrainte (P2).

---

## Index (justifiés)

| Index | Justification |
|-------|---------------|
| `idx_notifications_unread (userId, readAt)` | inbox fréquent |
| `idx_chat_messages_created_at (roomId, createdAt)` | pagination chat |
| `idx_planning_records_club_event` | lookup event |
| Quota chat attachments `(club_id, uploaded_by_user_id, created_at)` | migration 0011 |

---

## Enums et legacy

| Enum | Valeurs actuelles | Legacy |
|------|-------------------|--------|
| `ClubAccessRole` | admin, dirigeant | ancien `roles` JSON supprimé mig 0018 |
| `PlanningFunction` | arbitre_club, encadrant, accompagnateur | `"arbitre"` renommé mig 0010 |
| `planningStatus` | draft, published, modified, cancelled | — |
| `ChatRoomKind` | direct, event, channel | — |

---

## Dates et timezone

- DB `timezone: 'Z'` (`data-source.ts`)
- Fenêtre publication : TZ club via `club_tenants.timeZone` / settings
- Indisponibilités : day-range vs time-slot — risque décalage si date-only mal interprétée (P2)

---

## Migrations

| Ver | Nom | Risque |
|-----|-----|--------|
| 0008 | PK tenant-scoped events | ✅ collision check |
| 0009 | audit log backfill clubId | fallback APP_CLUB_ID |
| 0010 | roles → accessRole | backfill |
| 0013 | invitation token hash | destructive id change |
| 0018 | create entity tables | harden NOT NULL audit clubId |

**État final ↔ entités :** cohérent. `synchronize: false` en prod ✅.

**Reconstruction CI :** `pnpm db:migrate` + `REQUIRE_DB_TESTS=1` ✅.

---

## Transactions

| Opération | Transaction | Notes |
|-----------|:-----------:|-------|
| Publication globale | ✅ | `publishGlobalPlanning` |
| Sync matchs scrape | ✅ + GET_LOCK | `json-migrator.ts` |
| Chat send | ✅ | message + sequence |
| Mark all read notifications | ✅ | batch update |
| Invitation accept | ✅ | user + invitation usedAt |
| Outbox delivery | ❌ hors TX métier | by design |

---

## Inventaire API (92 routes)

### Par domaine

| Domaine | Routes | Auth default |
|---------|-------:|--------------|
| Planning | 28 | admin / mixed |
| Chat | 9 | auth |
| Auth | 13 | mixte |
| Me | 7 | auth |
| Matchs/events | 12 | admin |
| Club admin | 14 | admin |
| Public/token | 4 | token |
| Cron | 2 | secret |
| Autres | 13 | admin |

### Codes HTTP

- 401 : non authentifié (`requireAuth`)
- 403 : mauvais rôle (`requireRole`) ou event-access
- 404 : ressource absente **ou** autre tenant (masquage)
- 409 : `PlanningValidationError`, conflits revision
- 422 : validation body (`request.ts`)

---

## Validation

| Endpoint critique | Body validé | Preuve |
|-------------------|:-----------:|--------|
| POST users | ✅ email, roles | `users/route.ts` |
| PATCH planning event | ✅ schema partiel | event routes |
| POST chat upload | ✅ size, mime | `chat/upload` |
| POST publication-all | ✅ implicit via blockers | — |
| GET avec query ids | ⚠️ variable | certains parseInt sans range check |

**Mass assignment :** PUT users filtre champs sensibles ; PATCH settings whitelist.

---

## Pagination

| Liste | Mécanisme | Limite |
|-------|-----------|--------|
| Notifications | offset take 100 | fixe |
| Chat messages | cursor sequence | configurable |
| Planning events | filtres date | pas de cursor global |
| Archives | offset | — |

---

## N+1 / performance

| Zone | Observation |
|------|-------------|
| Publication preview | charge snapshots batch — OK |
| Scraper sync | boucle upserts — lock OK |
| Dashboard | agrégations multiples — P2 |
| listRooms + unread | requête par room possible — P2 |

---

## API inutilisées / legacy

| Endpoint | Consommateur | Statut |
|----------|--------------|--------|
| `/api/encadrants` | legacy UI ? | probablement utilisé référentiel |
| `/api/officiels` | idem | redirect person-link unifié |
| `/api/matches-extras` | MatchList | utilisé |

Recherche : aucun endpoint manifestement mort ; certains référentiels legacy coexistent avec users unifiés.

---

## Findings

### P1

**DB-001** — `defaultClubId()` fallback silencieux  
Fichier : `app/lib/planning/records.ts:53-55`. Impact cross-tenant opérationnel.

**DB-002** — Absence FK DB sur relations critiques  
Impact : orphelins, pas de garantie référentielle.

**API-001** — Notifications unread sur subset 100  
Fichier : `notifications/route.ts`.

### P2 (sélection)

- DB-003 : naming camelCase vs snake_case
- DB-004 : push_subscriptions sans clubId column
- API-002 : cron scraper secret query param
- API-003 : GET settings club enumeration
- DB-005 : pas de soft delete User — hard deactivate only
- API-004 : certaines listes sans limite max query
- DB-006 : planning_records JSON — pas de schema DB
- API-005 : ical token lookup global (unique column mitigates)

### P3

- Conventions HTTP mixtes 200 vs 201
- Legacy routes encadrants/officiels
- Logs ORM disabled

---

## Tests DB/API

| Type | Count | Exemples |
|------|------:|----------|
| API route tests | 59 | `users/route.test.ts` |
| Lib integration | 71 skipIf no DB | `multi-tenant-event-ids.test.ts` |
| Migration | via CI migrate | green in CI |

---

## Décisions techniques

1. Ajouter FK DB ou garder intégrité 100% applicative ?
2. Supprimer fallback `defaultClubId()` ?
3. Normaliser snake_case vs camelCase tables ?

---

## Plan de remédiation

1. **P1** — Supprimer fallback tenant ; COUNT unread
2. **P2** — FK sélectives (user_sessions, chat_participants) ou jobs cleanup
3. **P2** — Limites pagination API
4. **P3** — Documenter dual schema TypeORM + raw SQL

---

## 10 problèmes majeurs

1. Pas de FK database
2. Fallback APP_CLUB_ID
3. Unread notifications tronqué
4. Dual naming convention tables
5. JSON payloads sans contrainte schema DB
6. push_subscriptions tenant indirect only
7. Enum legacy dans vieux payloads
8. Pagination inconsistante
9. settings GET enumeration
10. Orphelins possibles user/chat
