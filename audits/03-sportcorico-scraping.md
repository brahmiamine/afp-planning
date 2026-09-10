# Audit 03 — SportCorico Scraping

**Projet :** AFP Planning  
**Périmètre :** code sur `main` au 2026-09-10  
**Méthode :** analyse statique du code, recensement des tests, scénarios déduits (aucun scraping production)

---

## Score global : **78 / 100**

| Dimension | Note | Commentaire |
|-----------|------|-------------|
| Identification des matchs | 85 | Réconciliation exacte + fuzzy score ≥ 85, historique `sourceMatchIds` |
| Idempotence | 88 | Verrous `GET_LOCK`, upserts, déduplication source |
| Mises à jour | 84 | Overrides admin préservés, détection horaire/stade |
| Disparition / annulation / report | 80 | 2 observations avant « missing », garde-fou snapshot incomplet |
| Robustesse parsing | 52 | Sélecteurs CSS fragiles, logique AFP codée en dur |
| Intégrité données métier | 86 | Affectations/planning non effacés au rescrape |
| Gestion erreurs | 87 | Snapshot vide → abort ; sync partielle protégée |
| Tenant / sécurité | 74 | Isolation DB solide ; scraper encore centré AFP |
| Performance | 68 | 15 pages Playwright en parallèle par match |
| Tests | 66 | Bonne couverture réconciliation/sync ; pas de fixtures HTML |

**Findings :** P0 **0** · P1 **2** · P2 **6** · P3 **3**

---

## Architecture

| Fichier | Responsabilité | Entrée | Sortie | Appelé par |
|---------|----------------|--------|--------|------------|
| `scraper.js` | Playwright : liste + détail matchs SportCorico | `SCRAPER_MATCHES_URL_KEY` | stdout `__AFP_SCRAPER_RESULT__=…` | `run-scraper.ts` via `execFile` |
| `app/lib/scraper/run-scraper.ts` | Verrou club, lance scraper, identité club, sync DB | `clubId` | `{ runId, sync, stdout }` | `POST /api/scraper`, `POST /api/cron/scraper` |
| `app/lib/scraper/output.ts` | Parse la dernière ligne structurée stdout | stdout | `MatchesData` | `run-scraper.ts` |
| `app/lib/scraper/match-reconciliation.ts` | Matching identité source ↔ interne | existing + incoming | décisions + `syncOfficialMatchesData` | `run-scraper.ts` |
| `app/lib/scraper/runs.ts` | Journal `scraper_sync_runs` | clubId, résultats sync | runId / historique | API scraper GET, run-scraper |
| `app/lib/db/json-migrator.ts` | Persistance officielle, missing, overrides, garde-fous | `MatchesData`, `clubId` | compteurs + notifications internes | reconciliation, migration legacy |
| `app/api/scraper/route.ts` | Déclenchement manuel + liste runs | session WRITE | JSON sync | UI club |
| `app/api/cron/scraper/route.ts` | Cron multi-clubs | `CRON_SECRET` | résultats par club | GitHub Actions / cron externe |
| `app/api/plateforme/clubs/*.ts` | Config `matchesUrlKey` / `scraperClubName` | body plateforme | tenant DB | `/plateforme` |
| `app/lib/planning/official-match-overrides.ts` | Préservation corrections admin au rescrape | source vs effective | override JSON | `json-migrator.ts` |
| `types/match.ts` | Schéma match (`sourceMatchId`, `sourceStatus`, …) | — | — | partout |

### Déclencheurs

1. **Manuel** — `POST /api/scraper` (rôle WRITE, feature `scraperSync`)
2. **Cron** — `POST /api/cron/scraper` (secret, boucle `listActiveClubIds`)
3. **Script** — `node scraper.js` (dev ; fallback URL par défaut AFP)

### Concurrence

- Verrou applicatif par club : `GET_LOCK(afp_planning_scraper_<hash>, 0)` dans `run-scraper.ts`
- Verrou sync matchs : `GET_LOCK(afp_planning_official_match_sync_v1:<clubId>, 15)` dans `json-migrator.ts`
- Transaction + `pessimistic_write` sur lignes existantes

Deux scrapings simultanés **même club** → rejet « déjà en cours ». Clubs différents → isolés.

---

## Configuration : `matchesUrlKey` et `scraperClubName`

### Où c’est stocké / validé

| Paramètre | Stockage | Validation | Obligatoire |
|-----------|----------|------------|-------------|
| `matchesUrlKey` | `club_tenants.matchesUrlKey` | Pattern `^[a-z0-9-]{1,255}$`, trim lowercase | Oui si scraping activé |
| `scraperClubName` | `club_tenants.scraperClubName` | Non vide si `matchesUrlKey` présent, max 255 | Oui dès qu’une source est configurée |

Validation à la création/mise à jour : `app/api/plateforme/clubs/route.ts`, `[id]/route.ts`.  
Masqué côté club : `app/api/settings/route.ts` (contrôle plateforme uniquement).

### Usage

```29:30:scraper.js
const matchesUrlKey = normalizeMatchesUrlKey(process.env.SCRAPER_MATCHES_URL_KEY);
const URL = `https://www.sportcorico.com/clubs/${matchesUrlKey}`;
```

```72:88:app/lib/scraper/run-scraper.ts
export function assertScrapedClubIdentity(config: ScraperSourceConfig, parsed: MatchesData): void {
  const actualName = parsed.club?.name ?? '';
  const expected = normalizeClubIdentity(config.scraperClubName);
  // … égalité normalisée ou forme compacte (sigles A-S / AS / a-s-de-…)
}
```

### Réponse : faut-il les deux ?

**Oui, les deux sont nécessaires et complémentaires.**

| Paramètre | Rôle |
|-----------|------|
| **`matchesUrlKey`** | Identifiant d’URL SportCorico (`/clubs/<key>`). Seul moyen de cibler la page source. Validé strictement → **pas de SSRF** (hostname fixe `www.sportcorico.com`). |
| **`scraperClubName`** | Nom attendu du club sur la page (h1). Vérifie qu’on ne scrape pas le mauvais tenant si la clé URL est erronée ou partagée. |

Le repli `compactClubIdentity` accepte aussi la clé URL comme candidat, mais **`scraperClubName` reste requis** pour les cas où le nom affiché ne se compacte pas vers la clé (ex. « AS de Football Tallard » vs `a-s-de-football-tallard` — test `run-scraper.test.ts`).

Recopier la clé URL dans `scraperClubName` **sans** correspondance compacte → rejet (test explicite).

---

## HTTP et sécurité (SSRF)

- URL finale : **`https://www.sportcorico.com/clubs/${matchesUrlKey}`** uniquement
- `matchesUrlKey` : whitelist alphanum + tirets, pas de `/`, pas de schéma
- Pas de proxy URL configurable, pas de redirection suivie côté app (Playwright suit les redirects du site)
- Timeout scraper : 20 s/page, 120 s process global
- **SSRF applicatif : risque faible** sur ce chemin (contrairement à `/api/logo-proxy` qui a des garde-fous dédiés)

Erreurs réseau / parser :

```260:262:app/lib/db/json-migrator.ts
if (incomingById.size === 0 && activeExistingRows.length > 0) {
  throw new Error('Le scraper n’a retourné aucun match ; la synchronisation a été annulée');
}
```

```265:268:app/lib/db/json-migrator.ts
if (isSuspiciousOfficialSnapshot(...)) {
  throw new Error(`Snapshot du scraper probablement incomplet … synchronisation annulée`);
}
```

→ Une panne ne déclenche **pas** une vague de « matchs disparus » si le snapshot est vide ou tronqué (>50 % absents avec ≥4 matchs actifs).

---

## Parsing SportCorico

### Données extraites

| Champ | Source liste | Source détail |
|-------|--------------|---------------|
| `id` | slug URL `/match/…` | URL finale |
| `date` | texte date section | — |
| `time`, équipes | lien match | — |
| `competition` | `championnat-head` ou regex | `details.competition` |
| `venue` | heuristique « afp » dans localTeam | — |
| `horaireRendezVous` | time − 90 min | — |
| `details.stadium`, `address`, `terrainType`, `itineraryLink` | — | parsing texte « Détails du match » |
| `staff` (arbitres FF) | — | regex Staff du match |
| Logos | conteneur match + page détail | alt / flex-col-reverse |
| **`categorie`** | **non extrait** | **non extrait** |

### Fragilité

- Dépendance forte aux classes Tailwind (`section.mb-10`, `div.my-5`, `border-l-8`, …)
- Logique domicile/extérieur et logos **hardcodée « afp »** :

```752:752:scraper.js
const isHomeMatch = localTeamLower.includes("afp") || localTeamLower.includes("afp 18");
```

Impact multi-tenant : **SCRAPE-001**.

---

## Normalisation et matching club

- `normalizeClubIdentity` / `compactClubIdentity` dans `run-scraper.ts`
- Tests : rejet club scrapé ≠ configuré ; acceptation variantes sigles

---

## Identité d’un match (critique)

### Algorithme (`match-reconciliation.ts`)

1. **Exact** — `sourceMatchId` ou alias dans `sourceMatchIds` / legacy PK
2. **Fuzzy** — score ≥ 85, écart ≥ 10 vs 2ᵉ candidat :
   - Équipes local/away normalisées (obligatoire)
   - Compétition (sans numéro journée)
   - `venue` identique
   - Catégorie si présente des deux côtés
   - Date ≤ 14 jours
3. **Nouveau** — `scr_<sha256(clubId+sourceId)>`

Signature slug : suffixe volatile `-xxxx` ignoré pour bonus score.

### Stabilité si changement SportCorico

| Changement | Comportement |
|------------|--------------|
| Heure / RDV | Fuzzy reconcile si équipes+compétition OK |
| Date ≤ 14 j | Fuzzy |
| Date > 14 j | Nouveau match (risque doublon planning) |
| Nouveau slug URL | Alias historique ou fuzzy |
| Adversaire / compétition | Score 0 → nouveau match |
| Domicile ↔ extérieur | Score 0 |

---

## Matrice champs : scraper vs interne

| Champ | Créé scraper | MAJ scraper | Édition manuelle | Préservé rescrape |
|-------|--------------|-------------|------------------|-------------------|
| date, time, équipes, compétition, venue, RDV | ✓ | ✓ | ✓ (override) | override appliqué |
| details, staff, logos | ✓ | ✓ | ✓ (override) | override |
| `sourceMatchId(s)`, `sourceStatus`, `sourceLastSeenAt` | ✓ | ✓ | ✗ | métadonnées source |
| `planningRevision` | hérité | **non remis à 0** | incrément UI | ✓ |
| MatchExtra : affectations, `planningStatus`, publication | init draft | MAJ si missing/schedule | API planning | **jamais effacées** |
| Chat, notifications, historique publié | — | — | — | liés à `eventId` interne stable |

Admin override : `official-match-overrides.ts` + snapshot source dans extras.

---

## Scénarios obligatoires

| Scénario | Comportement observé | Preuve |
|----------|---------------------|--------|
| Nouveau match | `createdCount++`, extras `draft` | `json-migrator.ts` L339-341 |
| Match inchangé | Pas d’incrément update | pas de branche `scheduleChanged` |
| Changement heure/date/stade | `updatedCount`, `planningStatus: modified` si publié | L342-354 |
| Adversaire/compétition renommé | Nouveau match ou fuzzy si proche | tests reconciliation |
| Match reporté (date) | Fuzzy si ≤14j | `scoreOfficialMatchIdentity` |
| Match annulé source | Non modélisé explicitement ; disparition → missing | — |
| Match disparu | 1ʳᵉ sync : pending ; 2ᵉ : `sourceStatus: missing`, cancel si publié | `nextSourceMissingObservation` |
| Disparu puis revenu | `wasMissing` → update, reset missing | L292-317 |
| Manuel puis découvert SportCorico | Fuzzy ou nouveau `scr_*` | reconciliation |
| Supprimé manuellement puis rescrapé | Réapparition si même identité / fuzzy | alias + score |
| Double scraping | 2ᵉ rejet verrou | `run-scraper.ts` L122-124 |
| Scraping concurrent (2 clubs) | Verrous distincts | hash clubId |
| Erreur réseau / exit 1 | `failScraperRun`, pas de sync | catch run-scraper |
| HTML invalide / 0 match | Abort si matchs actifs en base | L260-262 |
| Parser retourne 0 avec base vide | Sync OK (0 actifs) | pas de guard |
| DST été/hiver | Dates `DD/MM/YYYY` sans TZ explicite ; heures locales texte | pas de conversion TZ scraper |
| Club A ≠ Club B | `clubId` sur toutes requêtes | `findBy({ clubId })` |

---

## Idempotence et atomicité

- Double run identique : upserts idempotents, compteurs stables
- Run partiel échoué avant commit : rollback transaction sync
- Pas de contrainte unique DB sur slug source (identité = logique applicative)

---

## Archives et publication

- Match confirmé missing + publié → `planningStatus: cancelled`, raison scraping
- Changement horaire post-publication → `modified`, visible Mon Planning **après** prochaine publication globale
- Notifications sync (`MatchSyncNotification[]`) **calculées mais jamais émises** → SCRAPE-002

---

## Performance et observabilité

- N+1 HTTP : 1 page club + N pages détail (concurrence 15)
- Run log : `scraper_sync_runs` (created/updated/missing/active)
- stderr logué si sans ✅

---

## Tests — matrice

| Scénario | Couvert |
|----------|---------|
| Réconciliation slug / fuzzy / ambiguïté | ✓ `match-reconciliation.test.ts` |
| Garde-fou snapshot incomplet | ✓ `json-migrator.test.ts` |
| Missing 2 observations | ✓ idem |
| Identité club | ✓ `run-scraper.test.ts` |
| Policy pas de fichier JSON | ✓ `storage-policy.test.ts` |
| Parser HTML SportCorico | ✗ |
| E2E scraping | ✗ (cron mocké) |
| Overrides admin integration | ✓ `json-migrator.override.integration.test.ts` |
| Cross-tenant sync | ✓ `club/archives/route.test.ts` |

---

## Findings

### SCRAPE-001 — P1 — Logique domicile/logos hardcodée « AFP »

**Observation :** `scraper.js` déduit domicile et assigne logos via `includes("afp")`.  
**Preuve :** L752, L936-1129 `scraper.js`.  
**Scénario :** Club « FC Lyon 69 » — venue et logos inversés ou faux.  
**Impact :** Données incorrectes multi-tenant ; fuzzy matching `venue` peut échouer.  
**Cause :** Scraper historique mono-club AFP.  
**Correction :** Passer `scraperClubName` ou abbreviation club en env ; remplacer heuristique AFP.

### SCRAPE-002 — P1 — Notifications post-sync jamais livrées

**Observation :** `notifications[]` rempli dans `syncOfficialMatchesWithManager` mais aucun consommateur.  
**Preuve :** `json-migrator.ts` L286-420 ; grep sans appel aval.  
**Scénario :** Match publié disparaît de SportCorico → cancel en DB, admins non notifiés automatiquement.  
**Impact :** Workflow planning silencieux jusqu’à observation manuelle.  
**Correction :** Brancher sur `enqueueContactNotificationIntents` ou marquer `modified` + file admin.

### SCRAPE-003 — P2 — Champ `categorie` jamais scrapé

**Observation :** Absent de `scraper.js` ; utilisé dans score identité si présent.  
**Impact :** Fuzzy moins discriminant ; affichage planning incomplet.  
**Correction :** Extraire catégorie depuis compétition ou page détail.

### SCRAPE-004 — P2 — Parser fragile aux changements HTML

**Observation :** Sélecteurs CSS classes Tailwind spécifiques.  
**Impact :** Sync vide → abort (safe) ou données partielles.  
**Correction :** Fixtures HTML + tests snapshot ; sélecteurs sémantiques.

### SCRAPE-005 — P2 — Fallback URL AFP si env absent

**Observation :** `DEFAULT_MATCHES_URL_KEY = "academie-football-paris-18"`.  
**Preuve :** `scraper.js` L5-26.  
**Impact :** Dev/script standalone peut scraper le mauvais club.  
**Correction :** Fail fast sans env en dehors du chemin `run-scraper`.

### SCRAPE-006 — P2 — Pas de tests fixtures HTML

**Observation :** Aucun test du parser Playwright.  
**Correction :** Extraire parsing en module testable + HTML capturés.

### SCRAPE-007 — P2 — Concurrence 15 contextes Playwright

**Observation :** `concurrency = 15` sur pages détail.  
**Impact :** Timeouts partiels, charge SportCorico.  
**Correction :** Paramètre env ; backoff.

### SCRAPE-008 — P3 — Playwright `ignoreHTTPSErrors` / `disable-web-security`

**Observation :** Args Chromium assouplis.  
**Impact :** Surface sécurité navigateur headless (contenu distant).  
**Correction :** Durcir en prod si possible.

### SCRAPE-009 — P3 — Duplication normalisation URL key

**Observation :** `normalizeMatchesUrlKey` dans `scraper.js` vs validation plateforme.  
**Correction :** Module partagé ou documenter divergence volontaire.

### SCRAPE-010 — P3 — Observabilité `pendingMissingCount`

**Observation :** Exposé dans sync API mais peu visible UI.  
**Correction :** Dashboard admin « matchs absents temporairement ».

---

## 10 risques principaux

1. Venue/logos incorrects hors club AFP (**SCRAPE-001**)
2. Notifications scrape absentes (**SCRAPE-002**)
3. Changement HTML SportCorico → sync abort ou données vides
4. Fuzzy match ambigu → doublon si score borderline (atténué par gap 10)
5. Report >14 jours → nouveau match + doublon planning
6. `categorie` vide → affaiblissement discriminant identité
7. Charge 15× Playwright → échecs intermittents
8. Overrides admin masquant une vraie annulation source
9. Cron multi-clubs séquentiel → durée totale longue
10. Pas de retry HTTP explicite sur page club

---

## Causes racines

1. Scraper né avant multi-tenant (AFP-centric)
2. Couche sync robuste ajoutée après (garde-fous, reconciliation) — asymétrie qualité parser vs persistance
3. Notifications planning centralisées sur publication globale, pas sur sync scrape

---

## Plan de remédiation

| Priorité | Action |
|----------|--------|
| P1 | Paramétrer club dans scraper (venue/logos) ; tests multi-club |
| P1 | Consommer `MatchSyncNotification` ou intégrer au workflow `modified` |
| P2 | Fixtures HTML + extraction `categorie` |
| P2 | Fail fast URL key ; concurrence configurable |
| P3 | Durcissement Playwright ; UI pending missing |

---

## Réponse synthétique `matchesUrlKey` / `scraperClubName`

**Les deux sont requis** : l’un localise la source HTTP, l’autre authentifie le club scrapé. Le repli compact sur la clé URL ne remplace pas un nom configuré explicite pour tous les cas réels.
