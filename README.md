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
- ✅ Design ergonomique et agréable
- ✅ Authentification email/mot de passe avec rôles
- ✅ Super Admin avec accès complet et gestion des comptes
- ✅ Espace personnel en lecture seule pour arbitres, encadrants et accompagnateurs

## 👤 Rôles

- `SUPER_ADMIN` : accès complet aux écrans de planning, configuration, scraping, exports et gestion des comptes.
- `ARBITRE` : accès uniquement à `/me` avec ses matchs affectés comme arbitre.
- `ENCADRANT` : accès uniquement à `/me` avec ses matchs, entraînements et plateaux affectés.
- `ACCOMPAGNATEUR` : accès uniquement à `/me` avec ses matchs affectés comme accompagnateur.

Les comptes personnels sont créés par le Super Admin et liés à une personne déjà présente dans la configuration du planning.

## 📦 Installation

Les dépendances sont déjà installées. Si besoin, vous pouvez réinstaller :

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

L'application sera accessible sur [http://localhost:3000](http://localhost:3000)

## 📋 Structure

```
planning/
├── app/
│   ├── api/
│   │   ├── matches/route.ts    # API pour lire les matchs depuis MariaDB
│   │   └── scraper/route.ts    # API pour lancer le scraping
│   ├── components/
│   │   ├── MatchCard.tsx       # Carte d'affichage d'un match
│   │   ├── MatchList.tsx       # Liste des matchs par date
│   │   └── ScraperButton.tsx   # Bouton pour lancer le scraping
│   ├── layout.tsx              # Layout principal
│   └── page.tsx                # Page d'accueil
├── types/
│   └── match.ts                # Types TypeScript pour les matchs
└── package.json
```

## 🔧 Configuration

Configurer les variables d'environnement (fichier `.env`) :

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

## 📱 Utilisation

1. **Visualiser les matchs** : Les matchs sont automatiquement chargés depuis MariaDB
2. **Lancer le scraping** : Cliquez sur le bouton "Lancer le scraping" pour mettre à jour les données
3. **Voir les détails** : Chaque carte de match affiche toutes les informations disponibles
4. **Gérer les accès** : Le Super Admin crée les comptes personnels depuis `/users`
5. **Consulter son planning** : Un arbitre, encadrant ou accompagnateur connecté est dirigé vers `/me`

## 🚂 Déploiement sur Railway

Ce projet est configuré pour être déployé sur [Railway](https://railway.app), une plateforme idéale pour les applications Next.js avec scraping Playwright.

### Prérequis

- Un compte GitHub
- Un compte Railway (gratuit avec $5 de crédit/mois)

### Étapes de déploiement

1. **Pousser le code sur GitHub**

   ```bash
   git add .
   git commit -m "Configure Railway deployment"
   git push origin main
   ```

2. **Créer un projet Railway**
   - Aller sur [railway.app](https://railway.app)
   - Cliquer sur "New Project"
   - Sélectionner "Deploy from GitHub repo"
   - Choisir votre repository

3. **Configuration automatique**
   - Railway détecte automatiquement Next.js
   - Le fichier `railway.json` configure le build et le démarrage
   - Playwright sera installé automatiquement via le script `postinstall`

4. **Variables d'environnement**
   - Dans Railway, aller dans "Variables"
   - Ajouter :
     - `NODE_ENV=production`
     - `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0` (pour installer Chromium)
     - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
     - `AUTH_SECRET`
     - `SUPERADMIN_EMAIL`
     - `SUPERADMIN_PASSWORD`
     - `CRON_SECRET`

5. **Déploiement**
   - Railway démarre automatiquement le build
   - Une fois terminé, votre application sera accessible via l'URL fournie

### Avantages Railway pour ce projet

- ✅ Support natif de Playwright/Chromium
- ✅ Timeout de 5 minutes (suffisant pour le scraping)
- ✅ Support de `exec()` et `child_process`
- ✅ Plan gratuit avec $5 de crédit/mois
- ✅ Auto-déploiement depuis GitHub

### Notes importantes

- Le premier déploiement peut prendre 5-10 minutes (installation de Chromium)
- L'application se met en veille après 5 minutes d'inactivité
- Le réveil se fait automatiquement au premier appel

## 🎨 Technologies

- **Next.js 16** - Framework React avec App Router
- **TypeScript** - Typage statique
- **Tailwind CSS** - Styles modernes et responsives
- **shadcn/ui** - Composants UI modernes
- **Playwright** - Scraping web automatisé
- **next-themes** - Gestion du thème sombre/clair
- **sonner** - Notifications toast
- **Lucide React** - Icônes
- **pnpm** - Gestionnaire de paquets rapide
