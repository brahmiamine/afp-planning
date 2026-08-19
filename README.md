# AFP Planning - Interface de Planning des Matchs

Interface web moderne pour visualiser et gérer le planning des matchs de l'Academie Football Paris 18.

## 🚀 Fonctionnalités

- ✅ Stockage applicatif 100% MariaDB via TypeORM
- ✅ Bouton pour actualiser les données via scraping automatique
- ✅ Interface responsive et moderne avec Tailwind CSS et shadcn/ui
- ✅ Détails complets de chaque match (stade, adresse, staff, etc.)
- ✅ Statistiques des matchs (total, domicile, extérieur)
- ✅ Filtres avancés (club, arbitre AFP, lieu, statut complété)
- ✅ Mode sombre/clair
- ✅ Vue carte et vue liste
- ✅ Édition des matchs avec gestion des officiels
- ✅ Planning consolidé : matchs officiels, amicaux, entraînements et plateaux
- ✅ Affectation drag & drop des arbitres, encadrants et accompagnateurs
- ✅ Gestion des indisponibilités
- ✅ Authentification email/mot de passe avec rôles
- ✅ Super Admin avec accès complet et gestion des comptes
- ✅ Espace personnel en lecture seule pour arbitres, encadrants et accompagnateurs

## 👤 Rôles

- `SUPER_ADMIN` : accès complet aux écrans de planning, configuration, scraping, exports et gestion des comptes.
- `ARBITRE` : accès uniquement à `/me` avec ses matchs affectés comme arbitre.
- `ENCADRANT` : accès uniquement à `/me` avec ses matchs, entraînements et plateaux affectés.
- `ACCOMPAGNATEUR` : accès uniquement à `/me` avec ses matchs affectés comme accompagnateur.

Les comptes personnels sont créés par le Super Admin et liés à une personne déjà présente dans la configuration.

## 📦 Installation

```bash
pnpm install
```

## 🛠️ Développement

Lancer le serveur de développement :

```bash
pnpm dev
```

Importer (ou synchroniser) les catégories et clubs JSON vers MariaDB :

```bash
pnpm db:import:categories-clubs
```

L'application sera accessible sur `http://localhost:3000`.

## 🔧 Configuration

Configurer les variables d'environnement :

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=afp_planning
DB_USER=afp_user
DB_PASSWORD=afp_password

# Secret HMAC utilisé pour signer les sessions.
# Utiliser une valeur aléatoire d'au moins 32 caractères.
AUTH_SECRET=change-me-with-a-long-random-secret

# Compte initial Super Admin.
# Il est créé automatiquement en base au premier login si aucun SUPER_ADMIN n'existe.
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=change-me

CRON_SECRET=change-me
```

Une fois le premier Super Admin créé en base, les comptes arbitres, encadrants et accompagnateurs se gèrent depuis `/users`.

Au premier démarrage, l'application importe automatiquement les fichiers JSON historiques vers MariaDB, puis toutes les routes API utilisent la base de données.

## 🔐 Authentification

Les mots de passe sont hachés avec `scrypt`. La session est stockée dans un cookie `HttpOnly`, `SameSite=Lax`, signé par HMAC-SHA256 avec `AUTH_SECRET` et limité à 8 heures.

Les routes existantes d'administration restent accessibles uniquement à `SUPER_ADMIN`. Les utilisateurs personnels sont redirigés vers `/me` et ne peuvent pas appeler les API d'administration.

## 🚂 Déploiement sur Railway

Ce projet est configuré pour être déployé sur Railway avec Next.js, Playwright et MariaDB.

Variables à configurer dans Railway :

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `AUTH_SECRET`
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD`
- `CRON_SECRET`
- `NODE_ENV=production`

## 🎨 Technologies

- **Next.js 16** - Framework React avec App Router
- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui**
- **MariaDB + TypeORM**
- **Playwright**
- **next-themes**
- **sonner**
- **Lucide React**
- **pnpm**
