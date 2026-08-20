# Guide de déploiement Railway

Ce guide détaille la configuration et le déploiement de l'application AFP Planning sur Railway.

## 📋 Configuration actuelle

Le projet est déjà configuré avec :

- ✅ `railway.json` - Configuration Railway
- ✅ Script `postinstall` dans `package.json` pour installer Playwright
- ✅ Configuration optimisée de Chromium dans `scraper.js` pour les environnements serveur
- ✅ `.railwayignore` - Fichiers à exclure du déploiement
- ✅ PWA installable avec Service Worker et Web Push VAPID

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

4. **Configurer les variables d'environnement**
   - Ajouter les variables MariaDB, sécurité et Web Push décrites ci-dessous

5. **Attendre le déploiement**
   - Vous pouvez suivre les logs en temps réel
   - Une fois terminé, Railway génère une URL publique HTTPS

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

### Variables optionnelles

- `NODE_ENV=production` - Déjà défini automatiquement par Railway
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0` - Pour forcer l'installation de Chromium
- `SESSION_TTL_DAYS` (défaut 30) - Durée de validité d'une session de connexion

### Variables requises (MariaDB + sécurité)

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `CRON_SECRET`
- `BOOTSTRAP_SUPERADMIN_EMAIL` — email du premier superadministrateur, créé automatiquement au premier démarrage si aucun utilisateur n'existe en base
- `BOOTSTRAP_SUPERADMIN_PASSWORD` — mot de passe du premier superadministrateur (à retirer de Railway une fois la première connexion effectuée)

> L'authentification par code partagé (`AUTH_CODE`) a été remplacée par des comptes nominatifs
> (email + mot de passe) avec gestion des rôles. Le premier superadministrateur est créé via
> `BOOTSTRAP_SUPERADMIN_EMAIL`/`BOOTSTRAP_SUPERADMIN_PASSWORD`, puis peut inviter d'autres
> utilisateurs depuis Configuration → Utilisateurs.

### Variables requises pour les notifications smartphone Web Push

Générer une paire de clés VAPID une seule fois :

```bash
pnpm run push:generate-keys
```

Copier ensuite les trois valeurs dans Railway :

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — clé publique VAPID générée
- `VAPID_PRIVATE_KEY` — clé privée VAPID générée, à garder strictement secrète
- `VAPID_SUBJECT` — identité de contact, par exemple `mailto:admin@votre-domaine.fr`

Ne régénérez pas les clés à chaque déploiement : les abonnements Web Push existants sont liés à cette paire de clés. Une rotation volontaire des clés impose aux utilisateurs de réactiver les notifications.

Le site doit être servi en HTTPS en production pour l'installation PWA, le Service Worker et les notifications Web Push. Railway fournit une URL HTTPS par défaut.

### Comment ajouter des variables

1. Dans Railway, aller dans votre projet
2. Cliquer sur l'onglet "Variables"
3. Ajouter les variables nécessaires
4. Le service redémarre automatiquement

## 📱 Installation PWA et notifications

Sur Android/Chrome, le bandeau mobile **Installer** déclenche l'installation de la PWA lorsque le navigateur expose l'événement d'installation. Une fois l'application installée, AFP Planning propose d'activer les notifications smartphone.

Sur iPhone/iPad, l'utilisateur installe l'application depuis Safari avec **Partager → Sur l'écran d'accueil**, puis ouvre l'application depuis son icône et active les notifications à partir du bandeau affiché dans l'application.

Les abonnements Web Push sont enregistrés par utilisateur dans MariaDB. Lorsqu'une notification AFP Planning est créée, le service de notification existant déclenche aussi un Web Push vers les appareils enregistrés. Les abonnements expirés sont supprimés automatiquement quand le service Push répond 404 ou 410.

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

Les coûts et crédits Railway évoluent. Consultez la page de tarification Railway pour les limites actuelles avant de dimensionner un environnement de production.

Le protocole Web Push/VAPID mis en place dans AFP Planning ne nécessite pas d'abonnement OneSignal ou Firebase. Il utilise directement les services Push standards des navigateurs.

## 🐛 Dépannage

### Le build échoue

1. **Vérifier les logs** dans Railway
2. **Erreur Playwright** : Vérifier que `postinstall` s'exécute correctement
3. **Erreur de mémoire** : Vérifier les ressources allouées au service

### Le scraping ne fonctionne pas

1. **Vérifier les logs** de l'API `/api/scraper`
2. **Timeout** : Vérifier le timeout de la route et du fournisseur d'hébergement
3. **Chromium** : Vérifier que Chromium est bien installé dans les logs de build

### Le bouton Installer n'apparaît pas sur Android

- Vérifier que le site est servi en HTTPS
- Vérifier que `manifest.webmanifest` est accessible
- Vérifier que `/sw.js` est accessible
- Vérifier que l'application n'est pas déjà installée

### Les notifications ne s'activent pas

- Vérifier les trois variables VAPID dans Railway
- Vérifier que l'utilisateur a ouvert l'application installée et autorisé les notifications
- Sur iPhone/iPad, vérifier que l'application a bien été ajoutée à l'écran d'accueil avant la demande d'autorisation
- Vérifier les logs serveur pour les erreurs Web Push

## 🔐 Sécurité

### Fichiers sensibles

- Les fichiers `.env*.local` sont ignorés par `.railwayignore`
- Ne jamais commiter de secrets dans le code
- Utiliser les variables d'environnement Railway pour les secrets
- Ne jamais exposer `VAPID_PRIVATE_KEY` côté navigateur

### Web Push

- L'API d'abonnement nécessite une session AFP Planning authentifiée
- Les endpoints Push acceptés sont limités aux services Push des navigateurs pris en charge
- Les endpoints expirés sont supprimés automatiquement

## 📚 Ressources

- [Documentation Railway](https://docs.railway.app)
- [Documentation Web Push MDN](https://developer.mozilla.org/docs/Web/API/Push_API)
- [Web Push iOS/iPadOS - WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## ✅ Checklist de déploiement

- [ ] Code poussé sur GitHub
- [ ] Projet Railway créé et lié au repository
- [ ] Variables MariaDB et sécurité configurées
- [ ] Clés VAPID générées une seule fois
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` configurées
- [ ] Premier déploiement réussi
- [ ] URL publique HTTPS testée
- [ ] Installation PWA testée sur Android
- [ ] Installation via écran d'accueil testée sur iPhone/iPad si nécessaire
- [ ] Notification de test reçue sur smartphone
- [ ] Auto-deploy activé si souhaité

---

**Besoin d'aide ?** Consultez les logs Railway ou la documentation officielle.
