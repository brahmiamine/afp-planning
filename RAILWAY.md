# Guide de déploiement Railway

Ce guide détaille la configuration et le déploiement de l'application AFP Planning sur Railway.

## 📋 Configuration actuelle

Le projet est déjà configuré avec :

- ✅ `railway.json` - Configuration Railway
- ✅ Script `postinstall` dans `package.json` pour installer Playwright
- ✅ Configuration optimisée de Chromium dans `scraper.js` pour les environnements serveur
- ✅ `.railwayignore` - Fichiers à exclure du déploiement

## 🚀 Déploiement rapide

### Option 1 : Via l'interface Railway (Recommandé)

1. **Créer un compte Railway**
   - Aller sur [railway.app](https://railway.app)
   - S'inscrire avec GitHub

2. **Créer un nouveau projet**
   - Cliquer sur "New Project"
   - Sélectionner "Deploy from GitHub repo"
   - Autoriser Railway à accéder à vos repositories
   - Choisir le repository `afp_planning`

3. **Configuration automatique**
   - Railway détecte automatiquement Next.js
   - Le build démarre automatiquement
   - Aucune configuration supplémentaire nécessaire

4. **Attendre le déploiement**
   - Le premier build prend 5-10 minutes (installation de Chromium)
   - Vous pouvez suivre les logs en temps réel
   - Une fois terminé, Railway génère une URL publique

### Option 2 : Via Railway CLI

```bash
# Installer Railway CLI
npm i -g @railway/cli

# Se connecter
railway login

# Initialiser le projet
railway init

# Lier au projet Railway existant ou créer un nouveau
railway link

# Déployer
railway up
```

## ⚙️ Variables d'environnement

Par défaut, aucune variable d'environnement n'est requise. Cependant, vous pouvez en ajouter dans Railway :

### Variables optionnelles

- `NODE_ENV=production` - Déjà défini automatiquement par Railway
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0` - Pour forcer l'installation de Chromium (défaut: installé automatiquement)

### Comment ajouter des variables

1. Dans Railway, aller dans votre projet
2. Cliquer sur l'onglet "Variables"
3. Ajouter les variables nécessaires
4. Le service redémarre automatiquement

## 🔧 Configuration du build

Le fichier `railway.json` configure :

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install && pnpm run build"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Processus de build

1. **Installation des dépendances** : `pnpm install`
2. **Installation de Playwright** : Script `postinstall` installe Chromium
3. **Build Next.js** : `pnpm run build`
4. **Démarrage** : `pnpm start`

## 📊 Monitoring et logs

### Voir les logs

1. Dans Railway, aller dans votre projet
2. Cliquer sur le service déployé
3. Onglet "Deployments" → Sélectionner un déploiement → "View Logs"

### Métriques

Railway affiche automatiquement :
- Utilisation CPU
- Utilisation mémoire
- Requêtes réseau
- Temps de réponse

## 🔄 Mise à jour automatique

Railway peut être configuré pour déployer automatiquement à chaque push sur GitHub :

1. Aller dans "Settings" du projet
2. Activer "Auto Deploy"
3. Sélectionner la branche (généralement `main` ou `master`)

## 💰 Coûts et limites

### Plan gratuit (Hobby)

- **$5 de crédit gratuit/mois**
- **500 heures d'exécution gratuites**
- **Mise en veille** après 5 minutes d'inactivité
- **Réveil automatique** au premier appel

### Estimation des coûts

Pour ce projet :
- Build : ~$0.01-0.02 par déploiement
- Runtime : ~$0.01-0.05 par heure d'activité
- Avec le plan gratuit, vous pouvez faire **plusieurs centaines de déploiements** par mois

## 🐛 Dépannage

### Le build échoue

1. **Vérifier les logs** dans Railway
2. **Erreur Playwright** : Vérifier que `postinstall` s'exécute correctement
3. **Erreur de mémoire** : Railway peut nécessiter un upgrade de plan pour les gros builds

### Le scraping ne fonctionne pas

1. **Vérifier les logs** de l'API `/api/scraper`
2. **Timeout** : Le timeout est de 2 minutes dans `route.ts`, augmenter si nécessaire
3. **Chromium** : Vérifier que Chromium est bien installé (visible dans les logs de build)

### L'application se met en veille

- C'est normal avec le plan gratuit
- Le réveil prend 10-30 secondes au premier appel
- Pour éviter la mise en veille, utiliser un service de monitoring (UptimeRobot, etc.)

## 🔐 Sécurité

### Fichiers sensibles

- Les fichiers `.env*.local` sont ignorés par `.railwayignore`
- Ne jamais commiter de secrets dans le code
- Utiliser les variables d'environnement Railway pour les secrets

### Permissions

- Railway a accès en lecture seule à votre repository GitHub
- Vous pouvez révoquer l'accès à tout moment

## 📚 Ressources

- [Documentation Railway](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Exemples Next.js sur Railway](https://docs.railway.app/guides/nextjs)

## ✅ Checklist de déploiement

- [ ] Code poussé sur GitHub
- [ ] Compte Railway créé
- [ ] Projet Railway créé et lié au repository
- [ ] Premier déploiement réussi
- [ ] URL publique testée
- [ ] Scraping testé via l'interface
- [ ] Variables d'environnement configurées (si nécessaire)
- [ ] Auto-deploy activé (optionnel)

---

**Besoin d'aide ?** Consultez les logs Railway ou la documentation officielle.
