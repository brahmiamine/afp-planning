# Décisions d'architecture : nommage publication et proxy

Ce document enregistre deux décisions prises lors de l'audit de septembre 2026
(issue #141), afin d'éviter de rouvrir la question à chaque relecture.

## 1. Endpoints `/api/planning/publication` et `/api/planning/publication-all`

Ces deux routes ont des noms proches mais des responsabilités différentes :

| Route | Méthodes | Rôle |
| --- | --- | --- |
| `/api/planning/publication` | POST | Action de publication sur **un** événement (`cancel`, `reopen`), via `publication-service.ts`. |
| `/api/planning/publication-all` | GET, POST | **Publication globale** du planning : prévisualisation (GET) et publication atomique de tous les événements (POST), via `global-publication.ts`. |

**Décision : conserver les noms actuels.**

- Renommer une route est un changement cassant pour les clients déjà déployés
  (PWA installées, service workers, onglets ouverts) : le coût/bénéfice est défavorable.
- La distinction est documentée ici et dans les fonctions appelées
  (`applyPlanningPublicationAction` vs `publishGlobalPlanning`).

Si un renommage est un jour souhaité, la cible cohérente serait
`/api/planning/events/[id]/publication` (action unitaire) et
`/api/planning/publication` (globale), avec période de double exposition.

## 2. Requête base de données par navigation dans `proxy.ts`

`proxy.ts` résout la session en base (`getSessionUser`, TypeORM) à chaque
navigation — mais **uniquement** sur les routes qui en ont besoin :
`/`, `/login` et `/club/*` (voir `needsSessionUser`).

**Décision : conserver ce comportement.**

- Le seul format du token (64 hex) ne permet pas de distinguer une session
  révoquée/expirée : se fier au format renverrait des utilisateurs déconnectés
  vers l'espace admin, et créerait la boucle de redirection `/login` ↔
  `/mon-planning` que `clearStaleSession` purge aujourd'hui.
- Le runtime Node.js est obligatoire (TypeORM), ce qui interdit le runtime
  edge plus léger — c'est le prix de la cohérence avec `/api/auth/me`.
- Le coût est borné : une requête indexée par token de session, sur trois
  familles de routes seulement ; toutes les autres routes se contentent du
  contrôle de format du cookie.

Si le volume de trafic le justifie un jour, la piste d'optimisation est un
cache court (quelques secondes) de la résolution token → utilisateur, avec
invalidation à la déconnexion — pas un retrait du contrôle.
