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
- ✅ Vue carte, vue liste et vue calendrier
- ✅ Édition des matchs avec gestion des officiels
- ✅ Comptes nominatifs et rôles (superadmin, admin, arbitre, encadrant, accompagnateur)
- ✅ Invitations par lien à copier-coller
- ✅ Historique des modifications de chaque match (audit log)
- ✅ Détection des conflits d'affectation (officiel/stade déjà pris sur le même créneau)
- ✅ Export iCal (ponctuel et abonnement personnel)
- ✅ Design ergonomique et agréable

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

Lancer les tests (voir [TESTING.md](./TESTING.md) pour le détail) :

```bash
pnpm test
```

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

CRON_SECRET=change-me

# Authentification — création automatique du premier superadministrateur
# au premier démarrage (aucun utilisateur en base). À retirer une fois
# la première connexion effectuée.
BOOTSTRAP_SUPERADMIN_EMAIL=admin@exemple.fr
BOOTSTRAP_SUPERADMIN_PASSWORD=change-me

# Durée de validité d'une session de connexion, en jours (optionnel, défaut 30)
SESSION_TTL_DAYS=30
```

Au premier démarrage, l'application importe automatiquement les fichiers JSON historiques vers MariaDB, crée le premier superadministrateur depuis `BOOTSTRAP_SUPERADMIN_EMAIL`/`BOOTSTRAP_SUPERADMIN_PASSWORD`, puis toutes les routes API utilisent la base de données.

## 👥 Comptes et rôles

L'application utilise des comptes nominatifs (email + mot de passe, hachés avec `scrypt`, sessions stockées en base) avec 5 rôles :

- **Super administrateur** : gestion complète + gestion des utilisateurs et des invitations
- **Administrateur** : gestion complète du planning (matchs, officiels, référentiels)
- **Arbitre / Encadrant / Accompagnateur** : lecture seule du planning complet (tous les événements, toutes les affectations)

Le superadministrateur invite de nouveaux utilisateurs depuis **Configuration → Utilisateurs** en générant un lien d'invitation à copier-coller (aucun email n'est envoyé). Chaque utilisateur dispose également d'un lien iCal personnel (**Mon calendrier**) à ajouter dans son application de calendrier.

## 📱 Utilisation

1. **Visualiser les matchs** : Les matchs sont automatiquement chargés depuis MariaDB
2. **Lancer le scraping** : Cliquez sur le bouton "Lancer le scraping" pour mettre à jour les données
3. **Voir les détails** : Chaque carte de match affiche toutes les informations disponibles
4. **Gérer les accès** : Le superadministrateur crée ou invite des utilisateurs depuis **Configuration → Utilisateurs**

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
     - `CRON_SECRET`
     - `BOOTSTRAP_SUPERADMIN_EMAIL`, `BOOTSTRAP_SUPERADMIN_PASSWORD` (à retirer après la première connexion)
     - `SESSION_TTL_DAYS` (optionnel)

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
