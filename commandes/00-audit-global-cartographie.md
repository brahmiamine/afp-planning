# Commande — Audit global et cartographie

Analyse en profondeur le projet **AFP Planning** à partir du code réel présent sur `main`.

Repository : `https://github.com/brahmiamine/afp-planning`

## Objectif

Construire une cartographie fiable de l'application avant toute correction : architecture, routes, API, modèles de données, rôles, permissions, workflows, scraping, planning, notifications, chat, PWA, Design System, tests et CI.

Ne te base pas uniquement sur le README. Vérifie les informations directement dans le code. Si la documentation et le code se contredisent, considère le code actuel comme source principale et signale la contradiction.

## Travail demandé

1. Analyse la structure complète du repository et identifie frontend, backend, App Router, composants client/server, API Routes, services, hooks, providers, middleware, utilitaires, ORM, DB, migrations, Socket.IO, PWA, scraping, exports, tests et CI/CD.
2. Recense récursivement toutes les routes `app/**/page.tsx`. Classe-les par espace : public/auth, `/club/**`, `/mon-planning/**`, `/plateforme/**` et toute autre route réelle.
3. Recense récursivement toutes les API `app/api/**/route.ts`. Pour chaque endpoint, indique méthode HTTP, responsabilité, authentification, rôle/permission, données principales et consommateurs frontend lorsque possible.
4. Cartographie les utilisateurs, rôles d'accès, fonctions sur les matchs et permissions. Distingue explicitement rôle d'accès au club et fonction exercée sur un événement.
5. Cartographie toutes les entités DB, relations, clés étrangères, enums, statuts, contraintes, migrations et chemin d'ownership vers le club/tenant.
6. Construis la liste complète des fonctionnalités réellement implémentées, classées par domaine.
7. Reconstitue les principaux workflows métier de bout en bout : création/configuration club, invitation/utilisateur, scraping SportCorico, préparation match, affectations, publication, Mon Planning, indisponibilités, chat, notifications, archives.
8. Documente l'architecture SportCorico : configuration, déclenchement, parsing, matching club, matching match, création/mise à jour/disparition.
9. Reconstitue le cycle de vie réel des matchs/événements et leurs statuts.
10. Cartographie toutes les notifications et tous les flux de chat/Socket.IO.
11. Documente l'architecture PWA : manifest, service worker, push, VAPID, subscriptions, standalone.
12. Cartographie le Design System existant : `app/globals.css`, `app/components/ui/**`, `app/components/layout/**`, primitives de page, navigation, tokens, thèmes et branding dynamique.
13. Recense les tests Unit/Component/API/Integration/E2E ainsi que les scripts npm et workflows CI.
14. Identifie les contradictions évidentes, éléments legacy, zones sensibles et sujets nécessitant un audit spécialisé.

## Format attendu

Produis notamment :

- une vue d'architecture globale ;
- un inventaire des routes ;
- un inventaire des API ;
- une matrice rôles/permissions ;
- un diagramme des entités et relations ;
- une cartographie des fonctionnalités ;
- des diagrammes Mermaid pour les workflows importants ;
- une liste des zones à risque ;
- les contradictions code/documentation ;
- les parties non vérifiables en exécution clairement marquées.

Pour chaque affirmation importante, cite le fichier, la fonction/composant ou l'endpoint concerné. Ne suppose aucune fonctionnalité absente du code.

## Rapport

Après avoir terminé l'analyse, crée ou remplace :

`/audits/00-global-cartography.md`

Le rapport doit être suffisamment précis pour permettre à un autre développeur de comprendre l'application sans recommencer l'analyse.

## Contraintes

Pendant cette tâche :

- ne corrige aucun bug ;
- ne refactore pas ;
- ne modifie ni UI, ni API, ni DB, ni migrations ;
- ne crée pas d'issue ;
- ne crée pas de PR de correction ;
- seuls les fichiers sous `/audits/**` peuvent être ajoutés ou modifiés.

## Fin de tâche

À la fin, présente :

- résumé de l'architecture ;
- principales zones à risque ;
- contradictions importantes ;
- fichiers d'audit créés ou modifiés.

Arrête-toi après cet audit.