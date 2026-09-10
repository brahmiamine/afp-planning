# Commande — Audit sécurité et Multi-Tenant

Réalise un **audit complet de sécurité et d'isolation Multi-Tenant** du projet **AFP Planning** à partir du code réel présent sur `main`.

Repository : `https://github.com/brahmiamine/afp-planning`

## Objectif principal

Je veux pouvoir répondre avec certitude à cette question :

> Un utilisateur du Club A peut-il lire, modifier, supprimer ou déclencher une action concernant le Club B ?

L'isolation doit être vérifiée côté serveur, jamais uniquement dans l'UI.

Analyse également la séparation entre utilisateur non authentifié, dirigeant, administrateur club, administration plateforme/Superadmin et éventuels rôles legacy.

## Architecture de sécurité

Cartographie : authentification, sessions/tokens, cookies, middleware, récupération de l'utilisateur courant, `accessRole`, club/tenant courant, helpers d'autorisation, protections API, Socket.IO, Web Push, routes publiques, partage, uploads, exports et scraping.

Pour chaque ressource, identifie son chemin d'ownership vers le club/tenant.

## Audit API exhaustif

Parcours toutes les routes `app/api/**/route.ts`.

Pour chaque endpoint, documente : méthode, authentification, rôle, tenant check, ownership check et risque.

Teste ou vérifie conceptuellement les accès Cross-Tenant sur GET, POST, PATCH/PUT et DELETE.

Recherche activement :

- IDOR / BOLA ;
- requêtes par `id` sans filtre tenant ;
- `clubId`, `userId`, `eventId`, `conversationId`, etc. acceptés sans contrôle ;
- mass assignment ;
- élévation horizontale et verticale de privilèges ;
- règles protégées seulement côté UI.

## Rôles et privilèges

Vérifie qu'un dirigeant ne peut pas appeler directement les actions admin et qu'un administrateur club ne peut pas obtenir de droits plateforme.

Teste notamment : rôle, configuration, publication, scraping, invitations, suppressions, exports et gestion utilisateurs.

## Authentification et sessions

Analyse login, logout, expiration, cookies, changement de mot de passe, reset password, invitation, utilisateur/club désactivé et anciennes sessions.

Vérifie notamment : HttpOnly, Secure, SameSite, expiration, invalidation et éventuelle persistance d'anciens privilèges.

## Entrées et vulnérabilités Web

Analyse selon l'architecture réelle :

- SQL/ORM injection ;
- XSS ;
- CSRF ;
- CORS ;
- SSRF dans le scraping ;
- validation des inputs ;
- mass assignment ;
- rate limiting sur opérations sensibles ;
- fuite d'informations dans erreurs/logs.

Ne crée pas de finding générique sans preuve concrète.

## Chat / Socket.IO

Vérifie authentification Socket.IO, rooms, conversation ownership, tenant scope, participants et payloads contrôlés par client.

Scénario critique : `User Club A -> room/conversation/event Club B` doit être impossible côté serveur.

## Notifications / Push

Vérifie ownership des notifications et PushSubscriptions.

Scénarios importants :

- User A ne peut pas lire/modifier la notification de User B ;
- un client ne peut pas enregistrer une subscription pour un autre utilisateur ;
- logout/changement de compte ne provoque pas de push vers le mauvais utilisateur.

## Données et exports

Vérifie que toutes les ressources sensibles sont tenant-scoped : événements, utilisateurs, affectations, indisponibilités, conversations, messages, notifications, configuration, archives, exports et autres entités réelles.

## Secrets

Recherche les secrets potentiellement committés ou exposés dans `.env*`, CI, code, tests et variables `NEXT_PUBLIC_*`.

Ne recopie jamais une valeur sensible dans le rapport. Utilise `[REDACTED]`.

## Tests

Analyse les tests existants de sécurité et construis une matrice Cross-Tenant par ressource et méthode HTTP.

Lorsque l'environnement le permet, utilise des comptes de test Club A / Club B et réalise uniquement des tests non destructifs en environnement local/test.

Sinon marque `Non vérifié dynamiquement — preuve statique uniquement`.

## Findings

Utilise `SEC-001`, `SEC-002`, etc.

Pour chaque finding : sévérité, domaine, observation, preuve (fichier/fonction/endpoint), scénario, exploitabilité, impact et correction recommandée.

Ajoute un statut :

- 🔴 Confirmé ;
- 🟠 Très probable ;
- 🟡 À vérifier dynamiquement ;
- ⚪ Hardening.

Priorités :

- P0 : fuite/modification Cross-Tenant, élévation Superadmin, secret critique ;
- P1 : endpoint sensible mal protégé, élévation de privilège ;
- P2 : défense en profondeur / validation / exposition limitée ;
- P3 : hardening mineur.

## Score

Donne une note sécurité `/100`, avec une pondération forte pour isolation Multi-Tenant, auth, autorisation/ownership, API, Socket/Chat, secrets et tests sécurité.

## Rapport

Crée ou remplace :

`/audits/02-security-multitenancy.md`

Le rapport doit contenir : architecture sécurité, modèle tenant, inventaire API, matrice permissions, findings, scénarios Cross-Tenant, auth, Socket.IO, push, secrets, correspondance OWASP pertinente, score et plan de remédiation.

## Contraintes

- ne modifie pas le produit ;
- ne corrige pas les vulnérabilités ;
- ne modifie ni API, ni DB, ni UI ;
- ne crée ni issue ni PR de correction ;
- seuls `/audits/**` peuvent être modifiés.

## Fin de tâche

Présente : score `/100`, nombre de P0/P1/P2/P3, vulnérabilités Cross-Tenant en premier, confirmées vs potentielles, 10 risques principaux, causes racines, plan de remédiation et fichier d'audit créé.

Arrête-toi après cet audit.