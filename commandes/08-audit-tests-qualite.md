# Commande — Audit Tests et Qualité

Réalise un **audit complet et approfondi des tests, de la qualité du code et de la protection contre les régressions** du projet **AFP Planning** à partir du code réel présent sur `main`.

Repository : `https://github.com/brahmiamine/afp-planning`

## Objectif principal

Je veux répondre à cette question :

> Si un développeur modifie demain le planning, le scraping, les rôles, le multi-tenant, les notifications ou le chat, est-ce que la CI détectera réellement une régression importante ?

Détecte : fonctionnalités critiques sans tests, tests superficiels, assertions faibles, mocks excessifs, faux positifs/négatifs, manque de tests négatifs/cross-tenant/API/DB/E2E, flaky tests, fixtures incohérentes, tests ignorés, couverture trompeuse, CI incomplète, dette TypeScript et code difficile à tester.

## Infrastructure de tests

Cartographie tous les outils réellement utilisés : Vitest, React Testing Library, Playwright, tests Node/API/DB, mocks, fixtures, factories, seeds et scripts npm.

Pour chacun : configuration, commande, type de tests et exécution ou non dans CI.

## Inventaire complet

Recense tous les fichiers `*.test.*`, `*.spec.*`, dossiers de tests et E2E. Classe chaque test : Unit, Component, Integration, API, Database, E2E ou Contract.

## Matrice fonctionnalités → tests

Construis une matrice couvrant au minimum : auth, rôles, permissions, multi-tenant, utilisateurs, invitations, clubs, SportCorico, matching/doublons, planning, affectations, publication/republication, indisponibilités, Mon Planning, archives, notifications, chat, mentions, Socket.IO, Web Push/PWA, configuration, exports, API, DB et responsive.

Pour chaque domaine, indique présence de Unit/Component/API/Integration/E2E et niveau de confiance.

## Règles métier et permissions

Vérifie les tests de séparation `accessRole` vs fonction sur le match, admin vs dirigeant vs plateforme, actions autorisées et interdites.

Je veux autant d'attention aux tests négatifs qu'aux happy paths.

## Multi-Tenant

Construis une matrice Cross-Tenant GET/POST/PATCH/DELETE pour événements, utilisateurs, affectations, indisponibilités, invitations, conversations, messages, notifications, configuration, archives, exports et autres ressources tenant-scoped.

Scénario : `User Club A -> resource Club B` doit être explicitement protégé par des tests sur les zones critiques.

## SportCorico

Vérifie les tests : nouveau match, inchangé, changement heure/date/terrain, report, annulation, disparition, réapparition, erreur réseau, parser retourne 0, doublon, double scraping, concurrence, match manuel + scraping, cross-tenant.

Analyse les fixtures HTML et leur robustesse.

## Planning / publication

Vérifie les tests de préparation, affectations, indisponibilité, publication valide/invalide, règles obligatoires, modification post-publication, désaffectation, report, annulation, double publication et deux admins simultanés.

Les règles critiques doivent être testées côté API et pas seulement via un bouton disabled.

## Mon Planning

Vérifie qu'un utilisateur voit uniquement les événements autorisés, sa fonction réelle et les changements après publication.

## Notifications / Chat / Temps réel

Vérifie : bon destinataire, absence de notification quand elle ne doit pas partir, déduplication, message privé, discussion événement, mentions, unread, Socket.IO auth/rooms/reconnect/cross-tenant, Web Push, plusieurs appareils, logout et subscription expirée.

## API

Pour chaque endpoint critique, cherche : happy path, body invalide, non authentifié, mauvais rôle, ressource inexistante, autre tenant, erreur métier.

## DB et migrations

Vérifie les tests de FK, UNIQUE, cascade, soft delete, transactions, contraintes métier et reconstruction d'une DB vide via migrations.

## Playwright / E2E

Analyse configuration, baseURL, auth, retries, traces, screenshots, timeouts, parallélisation et sélecteurs.

Vérifie si les E2E sont réellement lancés dans CI.

Scénarios E2E critiques minimum à rechercher : login → club ; match → préparation → affectation → publication ; publication → Mon Planning ; modification après publication ; indisponibilité user → admin ; message User A → User B ; cross-tenant refusé.

## Responsive

Vérifie si Playwright protège les comportements importants : navigation mobile, absence d'overflow critique, dialogs dans viewport, MobileTabBar/DashboardShell et interfaces principales.

## Qualité des tests

Recherche : assertions faibles (`toBeDefined`, `toBeTruthy` sans preuve métier), tests sans assertion utile, logique testée mockée, mocks excessifs, dépendance à l'ordre, cleanup incomplet, `waitForTimeout`, sleeps, données globales mutables, timers/date non stabilisés et tests flaky.

## Coverage

Analyse statements/branches/functions/lines si configurés. Distingue strictement **code coverage** de **couverture fonctionnelle**.

Identifie les fichiers critiques avec beaucoup de logique mais peu ou pas de tests.

## Tests ignorés

Recherche `.skip`, `fixme`, `todo`, tests conditionnellement ignorés et tests qui catchent des erreurs sans échouer.

## TypeScript et qualité code

Analyse dans les zones critiques : `any`, `as any`, `@ts-ignore`, `@ts-expect-error`, casts dangereux, fonctions trop complexes, responsabilités mélangées, logique DB+HTTP+business+notification dans une même fonction, duplication et dead code.

Ne transforme pas cet audit en refactoring général : concentre-toi sur les risques de régression et la testabilité.

## CI

Analyse `.github/workflows/**` et construis un tableau étape/commande/obligatoire/bloque merge.

Vérifie au minimum type-check, lint, tests, build, E2E, DB/migrations si pertinents.

Crée une section obligatoire : **Ce que la CI ne détecterait pas aujourd'hui** avec des exemples concrets de régressions importantes pouvant passer avec une CI verte.

## Exécution

Lorsque l'environnement le permet, exécute les commandes de validation existantes sans modifier le produit pour les faire passer.

Classe chaque échec : bug produit, test obsolète ou problème d'environnement.

## Findings

Utilise `TEST-001...` pour les tests et `QUAL-001...` pour la qualité structurelle.

Pour chaque finding : priorité, observation, preuve, risque de régression, cause racine et recommandation.

P0 : absence de protection sur scénario critique / CI trompeuse ; P1 : workflow métier/sécurité majeur non testé ; P2 : flaky/mocks/couverture secondaire ; P3 : conventions/nettoyage.

## Tests manquants prioritaires

Construis une liste des 15 scénarios non protégés les plus risqués avec : priorité, scénario, raison et niveau recommandé (Unit/Integration/API/E2E).

Ne recommande pas Playwright pour tout : choisis le niveau le plus adapté.

## Stratégie de tests

Propose une pyramide adaptée à l'application et une règle pour les futures corrections critiques : reproduire le bug avec un test rouge → corriger → test vert → non-régression.

## Score

Donne une note `/100` couvrant couverture fonctionnelle, règles métier, sécurité/multi-tenant, API/DB, E2E, fiabilité des tests, CI, qualité TypeScript/code et cas limites.

Donne également `Confiance actuelle avant mise en production : X/10`.

## Rapport

Crée ou remplace :

`/audits/08-tests-quality.md`

Inclure : infrastructure, inventaire, couverture fonctionnelle, Unit/Component/API/DB/Integration/E2E, sécurité, scraping, planning, notifications/chat, responsive, CI, flaky/mocks, coverage, qualité TypeScript, findings, score, confiance production, tests prioritaires et plan de remédiation.

## Contraintes

- ne modifie pas `app/**` ;
- n'ajoute pas de test permanent ;
- ne modifie ni CI, ni package.json, ni config produit ;
- ne crée ni issue ni PR ;
- seuls `/audits/**` peuvent être modifiés de façon permanente.

Des scripts/tests temporaires locaux sont autorisés uniquement pour investigation et doivent être supprimés avant la fin.

## Fin de tâche

Présente : score `/100`, confiance production `/10`, P0/P1/P2/P3, 15 scénarios critiques non protégés, régressions pouvant passer avec CI verte, causes racines, stratégie de tests, plan de remédiation et fichier d'audit créé.

Arrête-toi après cet audit.