# Audit 08 — Tests et Qualité

**Projet :** AFP Planning  
**Date :** 2026-09-10  
**Méthode :** inventaire 181 fichiers test + exécution locale `pnpm test` + analyse CI

---

## Score : **77 / 100**

**Confiance actuelle avant mise en production : 7 / 10**

| Dimension | Note |
|-----------|------|
| Couverture fonctionnelle | 72 |
| Règles métier | 78 |
| Sécurité / multi-tenant | 80 |
| API / DB | 82 |
| E2E | 55 |
| Fiabilité tests | 85 |
| CI | 88 |
| Qualité TypeScript | 74 |

**Findings :** P0 **0** · P1 **5** · P2 **8** · P3 **6**

---

## Exécution locale (2026-09-10)

```
pnpm test (sans MariaDB local)
→ 114 passed | 64 skipped (178 files)
→ 656 passed | 269 skipped (925 tests)
→ Duration ~18s
```

**Classification :** 64 fichiers skipped = `describe.skipIf(!dbAvailable)` — **normal sans DB** ; CI force `REQUIRE_DB_TESTS=1` + MariaDB.

**Non exécuté localement :** E2E Playwright (nécessite DB + server), lint, type-check, build.

---

## Infrastructure de tests

| Outil | Config | Commande | CI |
|-------|--------|----------|-----|
| Vitest 4 | `vitest.config.ts`, `vitest.setup.ts` | `pnpm test` | ✅ job test |
| RTL | `@testing-library/react` | composants | partiel |
| Playwright | `playwright.config.ts` | `pnpm e2e` | ✅ job e2e |
| jsdom | vitest env | unit/component | ✅ |
| Route coverage | `scripts/route-test-coverage.mjs` | `--check` | ✅ |

**Fixtures :** helpers DB dans tests integration ; pas de factory globale unique.

---

## Inventaire tests

| Type | Fichiers | Exemples |
|------|--------:|----------|
| API route | 59 | `app/api/**/route.test.ts` |
| Lib unit/integration | 98 | `app/lib/**/*.test.ts` |
| Component | 18 | `app/components/**/*.test.tsx` |
| E2E | 3 | `e2e/*.spec.ts` |
| Autre | 3 | `proxy.test.ts`, `sw.test.ts`, ui tests |
| **Total** | **181** | |

**Patterns absents :**
- `it.skip` / `describe.skip` : **0**
- `waitForTimeout` dans tests app/e2e : **0**
- `fixme` / `todo` tests : négligeable

---

## Matrice fonctionnalités → tests

| Domaine | Unit | API | Integration | E2E | Confiance |
|---------|:----:|:---:|:-----------:|:---:|:---------:|
| Auth login | ✅ | ✅ | ✅ | ❌ | Haute |
| Rôles admin/dirigeant | ✅ | ✅ | — | partiel | Haute |
| Multi-tenant events | ✅ | ✅ | ✅ | ✅ | Haute |
| Invitations | ✅ | ✅ | ✅ | ❌ | Haute |
| Publication globale | ✅ | ✅ | ✅ | ✅ | Haute |
| Mon Planning | ✅ | ✅ | — | ✅ | Moyenne |
| Indisponibilités | ✅ | ✅ | — | ❌ | Moyenne |
| Affectations save vs publish | partiel | partiel | — | ❌ | **Faible** |
| Scraping SportCorico | ✅ | cron | — | ❌ | Moyenne (pas HTML fixtures) |
| Chat HTTP | ✅ | ✅ | ✅ | ✅ DM | Haute |
| Socket cross-tenant | — | — | partiel | ❌ | **Faible** |
| Web Push | ✅ | ✅ | — | ❌ | Moyenne |
| Notifications matrix | ✅ | ✅ | ✅ | ❌ | Haute |
| Responsive UI | — | — | — | ❌ | **Faible** |
| Drag-drop planning | — | — | — | ❌ | **Faible** |
| Feature flags nav | ✅ | ✅ | — | ❌ | Moyenne |
| Migrations DB | — | — | CI migrate | — | Moyenne |
| iCal public | ✅ | ✅ | — | ❌ | Moyenne |

---

## Multi-tenant — matrice tests

| Ressource | GET deny | POST deny | Test |
|-----------|:--------:|:---------:|------|
| Planning events | ✅ | ✅ | `multi-tenant-event-ids.test.ts`, `e2e/club-isolation` |
| Users | ✅ | ✅ | `users/route.test.ts` |
| Invitations | ✅ | ✅ | `invitations/*.test.ts` |
| Availability | ✅ | ✅ | `availability-requests/route.test.ts` |
| Archives | ✅ | — | `club/archives/route.test.ts` |
| Chat HTTP | ✅ | — | `service.test.ts:207` |
| Chat Socket foreign room | ❌ | ❌ | **gap** |
| Notifications | user scope | user scope | pas de negative cross |
| Push subscribe | user scope | — | pas cross negative |
| Settings scraping | ✅ read | — | `settings/route.test.ts` |
| iCal | club disabled | — | `ical/route.test.ts` |

---

## SportCorico — couverture tests

| Scénario | Testé |
|----------|:-----:|
| Réconciliation exact/fuzzy | ✅ `match-reconciliation.test.ts` |
| Snapshot vide abort | ✅ |
| Suspicious snapshot | ✅ |
| Overrides admin preserved | ✅ |
| Double scrape lock | ✅ `run-scraper.test.ts` |
| Fixtures HTML parser | ❌ |
| Logos AFP hardcodés | ❌ |
| Notifications post-sync | ❌ |

---

## Planning / publication tests

| Scénario | Fichier |
|----------|---------|
| Blockers rôles manquants | `validation.test.ts`, `global-publication.test.ts` |
| Publish API 409 | `publication/route.test.ts` |
| Personal snapshot only | `personal-planning.publication.test.ts` |
| Assignment conflicts | `assignment-conflicts.test.ts` |
| P0 rules coverage | `p0-rules.test.ts` |
| Post-publish modify | unit propagation — **pas E2E** |
| Double publish | ❌ |
| 2 admins concurrent | partiel swaps test |

---

## E2E Playwright

| Spec | Scénario |
|------|----------|
| `publication-cycle.spec.ts` | create → publish → mon-planning |
| `club-isolation.spec.ts` | cross-tenant deny |
| `chat-direct-message.spec.ts` | DM + reconnect |

**Config :** chromium, baseURL localhost, retries CI.

**Manquants critiques (issue #207 et gaps) :**
- Modification post-publication + republish browser
- Indisponibilité → blocage publish UI
- Invitation claim profil existant browser
- Swaps, recurring, multi-function conflicts
- Responsive overflow check
- Push notification click

---

## CI (`.github/workflows/ci.yml`)

| Job | Commande | Bloque merge |
|-----|----------|:------------:|
| lint | `pnpm lint` | ✅ |
| type-check | `tsc --noEmit` | ✅ |
| build | `pnpm build` | ✅ |
| test | migrate + `pnpm test` + routes:coverage | ✅ |
| e2e | migrate + `pnpm e2e` | ✅ |

**planning-reminders.yml :** cron externe optionnel — hors PR CI.

---

## Ce que la CI ne détecterait PAS aujourd'hui

Exemples concrets de régressions passant avec CI verte :

1. **Logos scraper AFP hardcodés** — pas de test HTML scraper
2. **Notifications scrape non émises** — sync testée sans assert notification
3. **DELETE invitation hash bug** — pas de test DELETE token route
4. **Socket `chat:send` cross-club** — integration test club transfer only
5. **Unread count >100 wrong badge** — pas de test COUNT
6. **Push subscription après logout** — pas de test lifecycle
7. **Table planning overflow mobile** — pas de test visuel
8. **Régression contraste couleur club** — pas axe CI
9. **`defaultClubId()` fallback** — difficile sans test handler sans ALS
10. **Parser SportCorico HTML change** — pas fixtures snapshot

---

## Qualité des tests

### Points forts
- Assertions métier sur publication (`p0-rules`, `global-publication`)
- Matrix notifications exhaustive (`matrix.test.ts`)
- Socket integration tests substantiels
- Pas de flaky `waitForTimeout` dans e2e
- `REQUIRE_DB_TESTS=1` empêche skip silencieux CI

### Faiblesses
- Peu de `toBeDefined` seuls sur chemins critiques — majorité OK
- Mocks Playwright scraper — pas de HTML réel
- 64 tests skipped localement — risque dev sans DB
- Component tests : 18 seulement vs surface UI large

---

## Coverage

- Script `pnpm test:coverage` disponible — **non exécuté** cet audit
- `routes:coverage --check` : couverture présence tests par route API ✅
- **Distinction :** code coverage ≠ couverture fonctionnelle (voir matrice)

---

## TypeScript / qualité code (zones critiques)

| Pattern | Occurrences approx | Risque |
|---------|-------------------|--------|
| `as any` | faible dans lib/planning | P2 |
| `@ts-ignore` | rare | P3 |
| Logique mixte HTTP+DB+notif | `global-publication.ts`, `run-scraper.ts` | testabilité moyenne |
| Fichiers >400 lignes | `json-migrator.ts`, `socket-server.ts`, `scraper.js` | maintenance |

Pas de refactoring recommandé dans cet audit — focus régression.

---

## Findings

### P1

**TEST-001** — Pas test DELETE invitation (hash bug non détecté)  
**TEST-002** — Socket cross-club roomId non testé  
**TEST-003** — Scraping : zero fixtures HTML SportCorico  
**TEST-004** — Save affectation indispo : pas test négatif API  
**TEST-005** — E2E ne couvre pas post-publish edit + republish

### P2

| ID | Observation |
|----|-------------|
| TEST-006 | 64 tests skip sans DB — dev UX |
| TEST-007 | Push lifecycle logout untested |
| TEST-008 | Unread >100 untested |
| TEST-009 | Component coverage faible |
| TEST-010 | Pas visual regression |
| TEST-011 | Scraper notifications sync untested |
| TEST-012 | iCal cross-tenant negative weak |
| TEST-013 | Feature flags E2E absent |

### P3

- QUAL-001 : `scraper.js` non typé JS
- QUAL-002 : duplication tests auth patterns
- QUAL-003 : pas mutation testing
- QUAL-004 : coverage report non gate CI
- QUAL-005 : documentation TESTING.md partiellement dated
- QUAL-006 : pas contract tests OpenAPI

---

## 15 scénarios critiques non protégés (prioritaires)

| # | Priorité | Scénario | Niveau recommandé |
|---|----------|----------|-------------------|
| 1 | P1 | Socket send message room autre club | Integration socket |
| 2 | P1 | DELETE invitation par token hash | API |
| 3 | P1 | Parser scraper fixture HTML réelle | Unit + fixture |
| 4 | P1 | Save affectation user indispo → warn/block | API |
| 5 | P1 | Edit published → republish → mon-planning | E2E |
| 6 | P1 | Notifications émises après scrape sync | Integration |
| 7 | P2 | Logout purge push subscriptions | API |
| 8 | P2 | Unread notifications count >100 | API |
| 9 | P2 | Double publication rapide idempotency | Integration |
| 10 | P2 | iCal token club B disabled | API negative |
| 11 | P2 | Mobile planning overflow 320px | E2E visual |
| 12 | P2 | Mention @user autre club rejetée | Unit chat notif |
| 13 | P2 | Cron scraper auth query param leak pattern | API |
| 14 | P2 | defaultClubId sans ALS throw | Unit |
| 15 | P2 | Drag-drop assignment change persisted | Component/E2E |

---

## Stratégie de tests recommandée

```text
        E2E (3→8 specs)
       /    \
  Integration (DB, socket, outbox)
 /              \
API route tests (59) — happy + negative + tenant
                  \
              Unit pure (rules, validation, reconciliation)
```

**Règle corrections critiques :** repro bug test rouge → fix → test vert → CI.

**Priorité immédiate :** combler gaps P1 sécurité/fonctionnel (socket, invitation DELETE, scrape fixtures, assign indispo).

---

## Plan de remédiation

| Phase | Actions |
|-------|---------|
| 1 | TEST-001 à TEST-005 — 5 tests P1 |
| 2 | Fixtures HTML scraper + notification sync assert |
| 3 | E2E post-publish + visual smoke 390px |
| 4 | Push logout + unread COUNT |
| 5 | Gate coverage optionnel sur lib/planning |

---

## Causes racines

1. **Excellente couverture API/lib** mais **E2E minimal** (3 specs)
2. **Scraper externe** exclu des tests HTML réalistes
3. **Socket tests** focus happy path + club transfer, pas attack scenarios
4. **UI/responsive** non instrumenté

---

## Synthèse réponse question centrale

> Si un dev modifie demain planning, scraping, rôles, multi-tenant, notifications ou chat, la CI détectera-t-elle une régression importante ?

**Partiellement.** La CI détectera la plupart des régressions sur **règles publication, isolation HTTP planning/users, chat HTTP, auth, et réconciliation scrape (unit)**. Elle **ne détectera probablement pas** : changements HTML SportCorico, bugs socket cross-tenant, régressions UX mobile, notifications scrape, lifecycle push, et plusieurs cas limites post-publication — tant que les tests P1 listés ci-dessus manquent.
