# Profils de dirigeants sans accès et invitations ciblées (issue #204)

## Contexte

Les référentiels de fonctions (arbitre club, encadrant, accompagnateur) créaient des
**comptes actifs** dotés d'une adresse technique `@sans-acces.local` et d'un mot de
passe aléatoire inconnu. Ces comptes ne pouvaient pas se connecter, et l'acceptation
d'une invitation créait systématiquement un **second utilisateur**, laissant les
fonctions et affectations sur l'ancien profil.

## Modèle retenu

Un profil de dirigeant possède deux états explicites, portés par `users.claimedAt` :

- `claimedAt IS NULL` — **profil sans accès** : créé par un référentiel de fonction
  ou l'import JSON, sans identifiants connus. Il peut être affecté et publié, mais
  ne peut ni se connecter ni réinitialiser de mot de passe, et il est affiché
  « Sans accès » (jamais « Actif ») dans l'administration des utilisateurs.
- `claimedAt` renseigné — **compte activé** : le titulaire dispose d'identifiants.

L'activation passe par une **invitation ciblée** : `POST /api/invitations` accepte
`personId` (ou un `personNom` non ambigu) désignant un profil sans accès du club ;
`POST /api/invitations/[token]/accept` attache alors email et mot de passe **au
profil existant** — même `users.id`, donc fonctions, affectations et historique
préservés, sans doublon. Les fonctions de l'invitation complètent celles du profil
sans jamais en retirer. Le rôle d'accès appliqué est celui de l'invitation
(`dirigeant` par défaut, `admin` uniquement si explicitement choisi).

## Migration des comptes placeholder existants

La migration `0012 — profils_dirigeants_sans_acces` ajoute `claimedAt` puis marque
comme activés tous les comptes dont l'email n'est **pas** une adresse technique
`@sans-acces.local` (`claimedAt = createdAt`). Les profils techniques restent non
réclamés et deviennent activables par invitation ciblée. La migration est rejouable
(seules les lignes encore `NULL` avec email réel sont réécrites) et couverte par
`app/lib/db/migrations/unclaimed-profiles.test.ts`.

## Garde-fous

- Connexion et réinitialisation de mot de passe refusées pour un profil sans accès,
  même si le hash technique était deviné.
- Une seule invitation en attente par profil ; un profil déjà activé ne peut plus
  être ciblé (409).
- Un `personNom` désignant plusieurs profils sans accès est refusé (400) : cibler
  par `personId` lève l'ambiguïté des homonymes.
