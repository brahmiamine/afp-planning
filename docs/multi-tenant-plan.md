# Plan — Multi-tenant multi-club

## Pourquoi ce document et pas du code

C'est le plus gros chantier envisagé sur ce projet, plus gros que tout ce qui a été construit jusqu'ici réuni (auth, RBAC, invitations, audit log, calendrier, conflits, iCal — cf. l'historique du projet). Ça touche potentiellement 60 à 100+ fichiers, presque chaque table de la base, et des décisions d'infra (routing, DNS) qui ne se corrigent pas facilement après coup. Vu la demande explicite de "plan détaillé d'abord", ce document sert de base de décision avant d'ouvrir le chantier — probablement sur sa propre branche dédiée, pas mélangé aux autres demandes en cours.

## Problème de nommage à trancher en premier

L'entité `Club` existe déjà dans le code (`app/lib/db/schemas.ts` → `ClubSchema`, `useClubs`, `ClubCombobox`) et désigne **le club adverse** dans un match (ex: "AFP Paris 18 vs FC Adverse"). Le nouveau concept de "tenant" (l'organisation propriétaire de l'instance — AFP Paris 18, ou un autre club qui rejoindrait la plateforme) mérite naturellement le nom "Club" dans le langage courant.

**Recommandation** : renommer l'entité existante `Club` → `ClubAdverse` (table `clubs_adverses`, composant `ClubAdverseCombobox`, hook `useClubsAdverses`), et réserver `Club` (table `clubs`) pour le tenant. C'est le renommage le plus petit des deux options — l'entité adverse est référencée dans moins d'endroits que ne le serait un concept de tenant appelé autrement (`Tenant`, `Organisation`) qui devrait ensuite être répété dans 60+ fichiers.

Alternative : garder `Club` pour les adversaires et introduire `Tenant`/`Organisation` pour le nouveau concept — évite un renommage, mais "Tenant" est un terme technique qui devra être traduit en français dans toute l'UI ("organisation" est le candidat naturel). À trancher avant de commencer.

## Modèle de données

### Nouvelle entité `Club` (le tenant)
```
Club {
  id: number
  slug: string (unique, pour le routing — ex: "afp-paris-18")
  nom: string
  logo: string | null (URL ou data URI)
  primaryColor: string
  accentColor: string
  active: boolean
  createdAt, updatedAt
}
```
Reprend et étend `AppSettings` (`app/lib/settings.ts`), qui existe déjà en version mono-tenant (clubName, clubLogo, primaryColor, themeMode stockés en clé/valeur dans `AppMeta`). La logique de personnalisation (`applyThemeVariables()`) est réutilisable presque telle quelle — il s'agit surtout de la faire dépendre du tenant résolu plutôt que d'un seul enregistrement global.

### `tenantId` (FK vers `Club.id`) à ajouter sur :
Toutes les tables métier existantes : `users`, `user_sessions` (via user), `invitations`, `match_officials`, `matches_amicaux`, `entrainements`, `plateaux`, `match_extras`, `clubs_adverses` (ex-`Club`), `categories`, `stades`, `officiels`, `encadrants`, `accompagnateurs`, `match_audit_log`, `notifications`, `password_reset_tokens`, `app_meta` (ou remplacé par les colonnes du nouveau `Club`).

C'est le point le plus risqué : ~15 entités, donc ~15 endroits où un `where` sans filtre `tenantId` devient une fuite de données entre clubs. Recommandation : ne pas compter sur la discipline manuelle route par route — construire un wrapper (`scopedRepo(db, 'Match', tenantId)` ou équivalent) qui refuse de fonctionner sans tenantId explicite, et n'autoriser l'accès repository "brut" qu'au rôle plateforme (voir plus bas). Prévoir des tests d'isolation dédiés (créer 2 tenants, vérifier qu'aucune requête ne fait fuiter les données de l'un vers l'autre) — c'est le genre de bug qui ne se voit qu'en audit, pas en usage normal.

### Rôle plateforme : `platform_admin`
Nouveau rôle **au-dessus** de `superadmin`, non rattaché à un tenant (`tenantId: null` sur son propre compte `User`). C'est le "super-superadmin" demandé :
- Crée/désactive des `Club` (tenants).
- Crée/désactive des comptes `superadmin` pour un tenant donné (mais ne gère pas le quotidien du club — pas de vue sur les matchs, officiels, etc. d'un tenant, sauf besoin de support explicite).
- Dashboard dédié, séparé de `/configuration` (ex: `/platform`), avec sa propre vérification d'accès (`requireRole(['platform_admin'])`) — ne doit **jamais** être accessible via un rôle `superadmin` de tenant, même par erreur de code, sinon un client pourrait accéder aux autres clubs.

## Auth et résolution du tenant

Deux options pour déterminer "quel club" à chaque requête :

1. **Sous-domaine** (`afp-paris-18.mondomaine.app`, `club-b.mondomaine.app`) — résolu depuis le header `Host` dans `proxy.ts`. Plus propre pour la marque (chaque club a "son" URL), mais nécessite un wildcard DNS + certificat SSL wildcard, à vérifier côté hébergeur (Railway) avant de s'engager dessus.
2. **Préfixe de chemin** (`mondomaine.app/t/afp-paris-18/...`) — pas de config DNS/SSL supplémentaire, mais URL moins propre et plus de refactoring des routes Next.js (tout doit vivre sous `app/t/[tenantSlug]/...` ou passer le tenant autrement).

**Recommandation** : sous-domaine si l'hébergement le permet simplement (à vérifier sur Railway — coût et configuration du wildcard SSL), sinon repli sur préfixe de chemin. C'est une décision d'infra à valider avant d'écrire du code de routing, indépendamment du reste.

Une fois le tenant résolu (sous-domaine ou chemin), `proxy.ts` (déjà "thin", sans appel DB, cf. commentaire existant dans le code) devra au minimum vérifier que le tenant existe et est actif avant de laisser passer — sinon 404. La résolution complète (utilisateur + son tenant + cohérence entre les deux) reste dans les route handlers, comme le fait déjà `requireAuth`/`requireRole` aujourd'hui.

`SessionUser` (`app/lib/auth/session.ts`) gagne un champ `tenantId: number`. Chaque route handler mutant doit vérifier que la ressource visée (ex: un match) appartient bien à `auth.user.tenantId` avant de la modifier — pas seulement que l'utilisateur est authentifié avec le bon rôle.

## Personnalisation par club

Étend l'existant plutôt que d'inventer : `AppSettings` (nom, logo, couleur primaire, mode de thème) devient des colonnes sur `Club` au lieu d'un enregistrement `AppMeta` global. `applyThemeVariables()` continue de fonctionner à l'identique, juste alimenté par les données du tenant résolu plutôt qu'un singleton. Ajout probable : couleur secondaire/accent (actuellement une seule couleur personnalisable), upload de logo (actuellement une URL — voir si un vrai upload de fichier est souhaité, ce qui ajoute une dépendance de stockage — S3-compatible ou équivalent).

## Migration des données existantes

AFP Paris 18 a déjà des données réelles (matchs, officiels, utilisateurs...) sous le modèle actuel mono-tenant. Avant d'ajouter les colonnes `tenantId` en `NOT NULL`, il faut :
1. Créer le premier `Club` (AFP Paris 18) par script.
2. Renseigner `tenantId` sur toutes les lignes existantes de toutes les tables listées plus haut.
3. Seulement ensuite rendre la colonne `NOT NULL` (`synchronize: true` peut créer la colonne nullable puis la contraindre, mais pas migrer les données existantes tout seul — un script de bootstrap, sur le modèle de `ensureSuperadminBootstrap()` déjà présent dans `app/lib/db/user-bootstrap.ts`, est le bon endroit pour ça).

## Phasage proposé

1. **Schéma + isolation en lecture seule** — ajout de `Club`, `tenantId` partout, script de backfill, wrapper de requêtage scopé. Rien ne change encore pour l'utilisateur final (un seul tenant actif, comportement identique).
2. **Application de l'isolation en écriture** — chaque route mutante vérifie `tenantId`, tests d'isolation dédiés (2 tenants de test, vérifier l'étanchéité).
3. **Dashboard plateforme** (`platform_admin`) — créer/désactiver des clubs, créer/désactiver des superadmins par club.
4. **Résolution du tenant par requête** (sous-domaine ou chemin) + personnalisation (logo/couleurs) branchée sur `Club` au lieu de `AppMeta`.
5. **Hors périmètre pour l'instant, à confirmer si besoin plus tard** : facturation/limites par tenant, invitations cross-tenant, transfert d'un utilisateur d'un club à un autre.

## Risques principaux à garder en tête

- **Fuite de données entre clubs** si une seule route mutante oublie le filtre `tenantId` — le risque le plus grave, d'où le wrapper de requêtage obligatoire plutôt que la discipline manuelle.
- **Emails/notifications déjà par utilisateur** (cf. la demande en cours sur les canaux de notif) — s'assurer que le tenant est bien encodé dans tout ce qui touche l'identité utilisateur pour ne pas avoir à tout refaire une deuxième fois.
- **Taille du chantier** : recommandé de le traiter comme son propre projet avec ses propres jalons de vérification (au minimum : tests d'isolation avant toute mise en production), pas comme un ajout incrémental sur la branche en cours.

## Prochaine étape

Une fois ce document validé (en particulier : nommage `Club`/`ClubAdverse`, choix sous-domaine vs chemin), je peux commencer la Phase 1 (schéma + isolation lecture seule) sur une branche dédiée.
