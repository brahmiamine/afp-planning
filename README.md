# AFP Planning - Interface de Planning des Matchs

Interface web moderne pour visualiser et gérer le planning des matchs de l'Academie Football Paris 18.

## 🚀 Fonctionnalités

- ✅ Affichage des matchs extraits depuis le JSON
- ✅ Bouton pour actualiser les données via scraping automatique
- ✅ Interface responsive et moderne avec Tailwind CSS et shadcn/ui
- ✅ Détails complets de chaque match (stade, adresse, staff, etc.)
- ✅ Statistiques des matchs (total, domicile, extérieur)
- ✅ Filtres avancés (club, arbitre AFP, lieu, statut complété)
- ✅ Mode sombre/clair
- ✅ Vue carte et vue liste
- ✅ Édition des matchs avec gestion des officiels
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

L'application sera accessible sur [http://localhost:3000](http://localhost:3000)

## 📋 Structure

```
planning/
├── app/
│   ├── api/
│   │   ├── matches/route.ts    # API pour lire matches.json
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

Le script de scraping et le fichier `matches.json` doivent être dans le dossier parent (`../`).

L'application lit automatiquement `../matches.json` et peut lancer `../scraper.js`.

## 📱 Utilisation

1. **Visualiser les matchs** : Les matchs sont automatiquement chargés depuis `matches.json`
2. **Lancer le scraping** : Cliquez sur le bouton "Lancer le scraping" pour mettre à jour les données
3. **Voir les détails** : Chaque carte de match affiche toutes les informations disponibles

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

4. **Variables d'environnement (optionnel)**
   - Dans Railway, aller dans "Variables"
   - Ajouter si nécessaire :
     - `NODE_ENV=production`
     - `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0` (pour installer Chromium)

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