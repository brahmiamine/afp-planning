# Tests

Ce projet utilise [Vitest](https://vitest.dev) pour les tests unitaires et d'intégration,
et [Playwright Test](https://playwright.dev/docs/test-intro) pour les parcours navigateur.

```bash
pnpm test           # exécute la suite une fois
pnpm test:watch     # mode watch
pnpm test:coverage  # avec couverture
pnpm test:e2e       # parcours critiques sur Chromium + vraie MariaDB
pnpm test:inventory # inventaire reproductible des routes et suites
```

## CI

Le workflow `.github/workflows/ci.yml` exécute, dans des jobs séparés et **tous
obligatoires avant merge** : `pnpm lint`, `pnpm type-check`, `pnpm build`, puis
`pnpm run db:migrate` suivi de `pnpm test` contre un service MariaDB, ainsi qu'un job
Playwright dédié (`pnpm test:e2e`) contre son propre service MariaDB. Un échec de
n'importe lequel de ces jobs bloque le merge.

## Parcours E2E Playwright

`playwright.config.ts` démarre le serveur Next sur le port 3100. Le global setup crée
deux clubs isolés, un administrateur, un dirigeant cumulant Arbitre club et Encadrant,
un profil sans accès à inviter et un administrateur d'un second club. Le teardown retire
toutes ces données, ce qui rend la suite rejouable.

La suite `e2e/critical-journeys.spec.ts` vérifie au niveau navigateur et HTTP réel :

- les redirections Administrateur/Dirigeant et l'absence de permissions admin accordées
  par une fonction terrain ;
- la création de plusieurs événements, leur invisibilité avant publication globale,
  leur publication, puis l'acceptation et le refus par le dirigeant ;
- l'affichage de la fonction réellement affectée dans Mon planning ;
- l'invitation ciblée d'un profil existant avec conservation de ses fonctions ;
- le cycle de publication d'une série récurrente et l'isolation stricte entre deux clubs.

Les variantes « modification publiée → reconfirmation », échange sans publication des
autres brouillons et conflit d'identité multi-fonction restent également verrouillées par
les tests d'intégration API dédiés. Playwright complète ces tests en vérifiant les coutures
navigation/session/rendu, sans recopier toute leur combinatoire.

## Tests d'intégration (vraie base, pas de mock)

Les fichiers `*.test.ts` qui appellent `getDb()` sont des tests d'intégration contre une
vraie MariaDB — jamais de mock de la base. Ils utilisent les mêmes identifiants que
`start.sh` (`afp_planning`/`afp_user`/`afp_password`, port 3306), se sautent
automatiquement (`describe.skipIf(!(await isDbAvailable()))`) si aucune base n'est
joignable en local, et la CI leur fournit un service `mariadb`.

### Piège : le contexte club ambiant ne survit pas à un appel de route direct

`getCurrentClubId()` (`app/lib/auth/club-context.ts`) repose sur `AsyncLocalStorage`,
posé par `setCurrentClubId()` (`enterWith`) au début de chaque handler de route. Dans un
test qui appelle un handler de route **directement** (sans passer par HTTP), puis
appelle ensuite une fonction de lib qui lit `getCurrentClubId()` de façon ambiante
(ex. `getPlanningEventSnapshot`, `getPublishedPlanningEventSnapshot`,
`getPlanningRecord`), le contexte observé après le retour de l'`await` sur le handler
n'est **pas garanti** être celui que ce handler vient de poser : selon l'historique
d'exécution du fichier de test (un test précédent ayant lui aussi posé un club via
`enterWith`), l'appel peut lire un club différent — silencieusement, sans lever d'erreur
« contexte manquant », juste en ne trouvant pas la ligne attendue.

**Règle** : après un appel de route direct, si le test doit ensuite appeler une fonction
de lib qui dépend du contexte club ambiant, fixer explicitement ce contexte avec
`runWithClubId(clubId, () => ...)` plutôt que de compter sur ce que le handler a laissé
derrière lui :

```ts
const snapshot = await runWithClubId(clubId, () => getPlanningEventSnapshot(db, 'entrainement', id));
```

Une fonction qui prend `clubId`/`user` en paramètre explicite (ex. `savePublishedPlanning`,
`savePlanningRecord` avec `clubId` fourni) n'a pas ce problème.

## Matrice de couverture par parcours métier

Legend : ✅ couvert (tests d'intégration API et/ou unitaires) — 🟡 partiellement couvert
— ⬜ non couvert par un test navigateur bout-en-bout (Playwright n'est pas configuré dans ce
dépôt : voir « Hors périmètre » ci-dessous).

| Parcours prioritaire (issue #155) | Couverture actuelle |
|---|---|
| 1. Import/scrape → correction → validation → publication globale | 🟡 `global-publication.test.ts` (logique pure, mockée) + `app/api/planning/publication-all/route.test.ts` (bout-en-bout API : aperçu, blocages, publication) ; scraper non testé (voir Hors périmètre) |
| 2. Utilisateur voit uniquement le publié → confirme/refuse | ✅ `app/api/me/assignments/respond/route.test.ts` (accepte puis refuse une affectation publiée, motif de refus requis) |
| 3. Suppression/annulation et notifications | 🟡 `app/api/entrainements/deferred-delete.test.ts` (suppression différée), `app/api/planning/publication/route.test.ts` (annuler/rouvrir) ; notifications testées unitairement (`app/lib/notifications/*.test.ts`), pas bout-en-bout avec un vrai envoi |
| 4. Échange et liste d'attente | ✅ `app/api/planning/assignment-swaps/route.test.ts` (atomicité approbation), `app/lib/planning/assignment-swaps.test.ts` ; liste d'attente : `app/lib/planning/waitlist` unitaire |
| 5. Multi-club négatif | ✅ `app/lib/db/multi-tenant-event-ids.test.ts`, `app/api/matches/[id]/audit-log/route.test.ts`, isolation vérifiée sur audit/échanges/événements |
| 6. Modules optionnels désactivés | 🟡 `app/lib/planning/feature-guard` couvert unitairement ; parcours UI complet (navigation + chargement partiel de l'espace événement) sans test dédié |
| 7. Présence, vue week-end et export | ✅ `app/api/planning/attendance/route.test.ts` (saisie bloquée avant la fin, acceptée après), `app/api/planning/weekend/route.test.ts`, `EventWorkspaceView.attendance.test.tsx` (UI) |

### Routes API critiques avec test d'intégration dédié

La liste et les compteurs se génèrent avec `pnpm test:inventory`; ils ne sont donc plus
maintenus manuellement. Parmi les routes critiques couvertes :
`publication-all`, `publication` (annuler/rouvrir), `shares` (partage public),
`me/assignments/respond`, `planning/attendance`, `planning/weekend`,
`planning/assignment-swaps`, `planning/saved-filters`, `entrainements` (suppression
différée, duplication), `planning/events/[eventType]/[eventId]` (atomicité édition).

## Limites connues

- Le scraper (`scraper.js`) n'est jamais exécuté contre le site réel en CI et n'a pas de
  test dédié (à mocker si testé un jour).
- Les interactions drag-and-drop (dnd-kit) nécessiteraient `@testing-library/user-event`
  + jsdom + un harnais dédié ; non couvertes.
