# AFP Planning - Interface de Planning des Matchs

Interface web moderne pour visualiser et gérer le planning des matchs de l'Academie Football Paris 18.

## 🚀 Fonctionnalités

- ✅ Affichage des matchs extraits depuis le JSON
- ✅ Bouton pour lancer le scraping automatique
- ✅ Interface responsive et moderne avec Tailwind CSS
- ✅ Détails complets de chaque match (stade, adresse, staff, etc.)
- ✅ Statistiques des matchs
- ✅ Design ergonomique et agréable

## 📦 Installation

Les dépendances sont déjà installées. Si besoin, vous pouvez réinstaller :

```bash
npm install
```

## 🛠️ Développement

Lancer le serveur de développement :

```bash
npm run dev
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

## 🎨 Technologies

- **Next.js 14** - Framework React
- **TypeScript** - Typage statique
- **Tailwind CSS** - Styles modernes et responsives
- **Lucide React** - Icônes
