# Audit 01 — Règles métier fonctionnelles

**Projet :** AFP Planning  
**Date :** 2026-09-10  
**Méthode :** revue statique code + tests unitaires ; **Audit statique uniquement — non vérifié dynamiquement** pour la majorité des workflows UI

---

## Score fonctionnel : **76 / 100**

| Dimension | Note |
|-----------|------|
| Cohérence workflows | 78 |
| Règles métier | 74 |
| Rôles / permissions | 82 |
| Planning / publication | 72 |
| Cycle matchs | 80 |
| Affectations / indisponibilités | 70 |
| Notifications / chat | 78 |
| Utilisateurs / archives | 75 |

**Findings :** P0 **0** · P1 **4** · P2 **8** · P3 **5**

---

## Résumé exécutif

Le modèle métier distingue correctement **rôle d'accès** (`admin` / `dirigeant`) et **fonctions planning** (`arbitre_club`, `encadrant`, `accompagnateur`) — `app/lib/auth/roles.ts`. La publication globale applique des règles configurables côté serveur. Les principales incohérences concernent : (1) affectations sauvegardables sans validation indisponibilité alors que la publication les bloque ; (2) notifications post-scraping calculées mais non émises ; (3) logique scraper hardcodée « AFP » pour les logos ; (4) divergence UI/API sur certaines actions legacy.

---

## Cartographie fonctionnelle

| Domaine | Routes UI | API | Entités |
|---------|-----------|-----|---------|
| Plateforme | `/plateforme` | `/api/plateforme/**` | `ClubTenant`, `PlatformAdmin` |
| Clubs / config | `/club/configuration` | `/api/settings`, `/api/categories`, `/api/stades` | `Club`, settings JSON |
| Utilisateurs | `/club/utilisateurs/**` | `/api/users/**` | `User` |
| Invitations | `/club/invitations` | `/api/invitations/**` | `Invitation` |
| Matchs scrapés | `/club`, `/club/planning` | `/api/scraper`, `/api/matches/**` | `MatchOfficial`, `MatchExtra` |
| Préparation | `/club/planning/controle` | `/api/planning/**` | `planning_event_state` |
| Publication | `/club/planning` | `/api/planning/publication-all` | `published-planning` record |
| Mon Planning | `/mon-planning/**` | `/api/me/planning` | snapshot publié |
| Indisponibilités | `/club/indisponibilites`, `/mon-planning/mes-indisponibilites` | `/api/club/indisponibilites`, `/api/me/availability` | `users.indisponibilites` JSON |
| Chat | `/club/chat`, `/mon-planning/chat` | `/api/chat/**` + Socket.IO | `chat_*` |
| Notifications | `*/notifications` | `/api/notifications` | `notifications`, outbox |
| Archives | `/club/archives` | `/api/club/archives` | `planning_event_state.archivedAt` |

---

## Matrice permissions UI vs API

| Action | UI (dirigeant) | API | Écart |
|--------|----------------|-----|-------|
| Modifier affectations | ❌ masqué | ❌ 403 | ✅ cohérent |
| Voir événement workspace | ✅ si affecté/publié | ✅ `event-access.ts` | ✅ |
| Sauver affectation indispo | N/A (admin UI) | ✅ **autorisé** sans blocage | ⚠️ API plus permissive que publication |
| Publier planning | ❌ | ❌ 403 dirigeant | ✅ |
| Répondre affectation publiée | ✅ Mon Planning | ✅ `/api/me/assignments/respond` | ✅ |
| Supprimer invitation | ✅ admin | ⚠️ DELETE bug hash (404) | UI/API incohérent |

---

## Workflows vérifiés

### 1. Création / configuration club
**Preuve :** `POST /api/plateforme/clubs` → `ClubTenant` ; admin via `POST .../admins`.  
**Statut :** ✅ complet côté plateforme. Config scraping non modifiable par admin club (`settings/route.ts`).

### 2. Invitation → inscription
**Preuve :** `invitations/route.ts` POST ; `invitations/[token]/accept` ; profils `@sans-acces.local` (migration 0012).  
**Statut :** ✅ ; token hashé SHA-256 (migration 0013).

### 3. Scraping SportCorico
**Preuve :** `run-scraper.ts` → `syncOfficialMatchesData`.  
**Statut :** ✅ avec réserves P1 (logos AFP, notifications sync).

### 4. Match manuel + scrapé
**Preuve :** `reconcileOfficialMatchIdentities` — fuzzy matching ; match manuel sans source peut coexister.  
**Statut :** ✅ ; risque doublon si nom différent du slug SportCorico.

### 5–7. Préparation, affectations, indisponibilités
**Preuve :** `saveRoleAssignments` (`event-store.ts`) ; `validateAssignmentSet` uniquement à la publication si `assignmentValidation` activé.  
**Statut :** ⚠️ indispo bloque suggestions et publication, **pas** la sauvegarde manuelle (FUNC-001).

### 8–9. Publication et Mon Planning
**Preuve :** `publishGlobalPlanning` ; `listPersonalAssignments` lit **uniquement** snapshot publié.  
**Règles prouvées (officiel/amical) :** au moins 1 arbitre, 1 encadrant, 1 accompagnateur actifs (`validation.ts:57-72`, `p0-rules.ts`) — **configurables** via `features.require*ForPublication`.

### 10. Modification après publication
**Preuve :** `propagateAssignmentChangesIfPublished` → `planningStatus: modified`.  
**Statut :** ✅ ; republication globale requise pour notifier les changements.

### 11. Annulation / report / disparition
**Preuve :** scrape missing → auto-cancel si publié ; admin cancel via `publication-service.ts`.  
**Statut :** ✅ avec garde-fous snapshot vide.

### 12–13. Chat et notifications
**Preuve :** matrice `docs/notifications-matrix.md` ; chat policy club-scoped.  
**Statut :** ✅ ; événement room ouvert à tout le club (by design).

---

## Findings

### P1

#### FUNC-001 — Affectation possible malgré indisponibilité acceptée
- **Domaine :** affectations
- **Observation :** `saveRoleAssignments` ne valide pas les indisponibilités ; seule la publication (si `assignmentValidation`) bloque.
- **Preuve :** `app/lib/planning/event-store.ts` (`saveRoleAssignments`) vs `validateAssignmentSet` dans `global-publication.ts:collectPublicationBlockers`
- **Impact :** admin peut sauver une affectation invalide, découverte seulement à la publication.
- **Cause :** validation déportée uniquement au publish.
- **Correction :** optionnellement bloquer ou avertir à la sauvegarde si feature flag actif.

#### FUNC-002 — Notifications post-scraping jamais émises
- **Domaine :** SportCorico
- **Observation :** `MatchSyncNotification[]` calculées dans `json-migrator.ts` mais non passées à `enqueueNotification`.
- **Preuve :** retour sync contient notifications ; aucun appel `deliverEnqueuedNotifications` post-scrape dans `run-scraper.ts`
- **Impact :** admins non informés des changements scrape (report, annulation auto).
- **Correction :** brancher le pipeline notifications après sync réussi.

#### FUNC-003 — Scraper logos/venue hardcodés « AFP »
- **Domaine :** scraping
- **Preuve :** `scraper.js:936-1122` — commentaires et logique « AFP = home/away »
- **Impact :** clubs non-AFP : logos et domicile/extérieur incorrects.
- **Correction :** utiliser `scraperClubName` / nom club scrapé.

#### FUNC-004 — DELETE invitation incohérent (hash)
- **Domaine :** invitations
- **Preuve :** GET utilise `hashInvitationToken(token)` ; DELETE utilise `id: token` brut — `invitations/[token]/route.ts:19` vs `:60`
- **Impact :** révocation invitation impossible via API.
- **Correction :** aligner sur hash.

### P2

| ID | Domaine | Observation | Preuve |
|----|---------|-------------|--------|
| FUNC-005 | Publication | Pas de publish par événement — UI peut suggérer actions locales | `publication-service.ts` commentaire |
| FUNC-006 | Mon Planning | Admin sans fonction planning : pas d'espace personnel | `me/planning/route.ts` + `hasAnyPlanningFunction` |
| FUNC-007 | Concurrence | Double publication : pas de verrou explicite global | `publishGlobalPlanning` transaction mais pas idempotency key |
| FUNC-008 | Affectations | Même personne plusieurs rôles : autorisé, pas de conflit explicite | `saveRoleAssignments` |
| FUNC-009 | Chat événement | Participant désaffecté garde accès salon événement | `canAccessChatRoom` event = tout le club |
| FUNC-010 | Indisponibilité | Créée après affectation : bloque publish, pas retroactive sur draft | `officiel-availability.ts` |
| FUNC-011 | Login | Email identique sur 2 clubs : premier match password gagne | `auth/login/route.ts:57` |
| FUNC-012 | Unread notif | Compteur limité aux 100 dernières notifications | `notifications/route.ts` |

### P3

| ID | Observation |
|----|-------------|
| FUNC-013 | Terminologie « officiel » vs `arbitre_club` dans UI legacy |
| FUNC-014 | `dirigeant` sans `claimedAt` : compte placeholder |
| FUNC-015 | Feature flags masquent nav mais endpoints parfois testés unitairement seulement |
| FUNC-016 | Export PDF couleurs hardcodées hors tokens club |
| FUNC-017 | README mentionne tables séparées encadrants — obsolète |

---

## Décisions produit nécessaires

1. **Salon chat événement :** accès club entier vs participants affectés uniquement ?
2. **Validation indispo à la sauvegarde :** bloquer, avertir, ou garder blocage publish-only ?
3. **Login multi-club même email :** sélecteur de club requis ?
4. **Notifications scrape :** quels changements doivent notifier (new, reschedule, missing) ?

---

## Causes racines

1. **Validation métier concentrée sur la publication globale** — étapes intermédiaires (save assign, scrape) moins strictes.
2. **Scraper historique mono-club AFP** — non généralisé multi-tenant.
3. **Évolution rôles issue #209** — résidus terminologiques et docs.

---

## Plan de remédiation

| Priorité | Action |
|----------|--------|
| P1 | Corriger hash DELETE invitation |
| P1 | Généraliser scraper logos/venue avec `scraperClubName` |
| P1 | Émettre notifications post-sync scrape |
| P1 | Décider + implémenter validation indispo à la save |
| P2 | Documenter publication globale-only |
| P2 | Idempotence publication / verrou |
| P2 | Clarifier politique chat événement |
| P3 | Aligner docs README avec modèle users unifié |

---

## 10 problèmes principaux

1. Indisponibilité non bloquante à la sauvegarde d'affectation
2. Notifications scrape absentes
3. Logos/domicile scraper hardcodés AFP
4. DELETE invitation cassé
5. Publication globale seule (confusion UX possible)
6. Chat événement ouvert à tout le club
7. Login multi-club ambigu
8. Compteur unread notifications tronqué
9. Match manuel / scrapé — risque doublon fuzzy
10. Docs legacy vs code actuel
