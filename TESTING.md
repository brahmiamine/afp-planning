# Tests

Ce projet utilise [Vitest](https://vitest.dev).

```bash
pnpm test           # exécute la suite une fois
pnpm test:watch     # mode watch
pnpm test:coverage  # avec couverture
```

## Portée actuelle (priorisée par risque)

1. **Nouveau code** (auth, RBAC, invitations, audit log, détection de conflits, export iCal) :
   couvert en priorité — `app/lib/auth/*.test.ts`, `app/lib/db/audit-log.test.ts`,
   `app/lib/utils/assignment-conflicts.test.ts`, `app/lib/utils/ical-export.test.ts`.
2. **Utils critiques existants** : `app/lib/utils/officiel-availability.test.ts`, `app/lib/utils/date.test.ts`.
3. **Routes API sensibles** (tests d'intégration contre une vraie MariaDB, pas de mock) :
   `app/api/auth/login`, `app/api/auth/me`, `app/api/users`, `app/api/invitations/[token]/accept`,
   plus deux routes existantes en exemple de pattern (`app/api/officiels`, `app/api/matches/[id]`).

Les tests d'intégration (fichiers qui appellent `getDb()`) se basent sur les mêmes identifiants
que `start.sh` (`afp_planning`/`afp_user`/`afp_password`, port 3306) et sautent automatiquement
(`describe.skipIf`) si aucune base MariaDB n'est joignable en local — la CI GitHub Actions leur
fournit un service `mariadb`.

## Hors périmètre (suite à donner)

La couverture exhaustive du reste du code legacy (110+ fichiers existants avant cette itération),
le scraper (`scraper.js`/Playwright — à mocker s'il est un jour testé, jamais exécuté contre le
site réel en CI) et les interactions drag-and-drop (nécessiteraient `@testing-library/user-event` +
jsdom + un harnais de test pour dnd-kit) ne sont pas couverts par cette itération. C'est une
décision de périmètre assumée, pas un oubli.
