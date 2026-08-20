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
npm i -g @railway/cli
railway login
railway init
railway link
railway up
```

## ⚙️ Variables d'environnement

### Variables requises (MariaDB + sécurité)

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `CRON_SECRET`
- `BOOTSTRAP_SUPERADMIN_EMAIL` — email du premier superadministrateur, créé automatiquement au premier démarrage si aucun utilisateur n'existe en base
- `BOOTSTRAP_SUPERADMIN_PASSWORD` — mot de passe du premier superadministrateur (à retirer de Railway une fois la première connexion effectuée)
- `SESSION_TTL_DAYS` (optionnel, défaut 30) — durée de validité d'une session de connexion

> L'authentification par code partagé (`AUTH_CODE`) a été remplacée par des comptes nominatifs
> (email + mot de passe) avec gestion des rôles. Le premier superadministrateur est créé via
> `BOOTSTRAP_SUPERADMIN_EMAIL`/`BOOTSTRAP_SUPERADMIN_PASSWORD`, puis peut inviter d'autres
> utilisateurs depuis Configuration → Utilisateurs.

### Variables optionnelles (email des notifications)

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` — identifiants du compte SMTP utilisé
  pour l'envoi des notifications par email
- `SMTP_SECURE` (optionnel, `true` ou `false`, défaut `false`) — connexion chiffrée (TLS direct,
  généralement le port 465) plutôt que STARTTLS
- `SMTP_FROM` (optionnel, défaut : la valeur de `SMTP_USER`) — adresse d'expéditeur affichée

Sans ces variables, le canal email reste inactif et les autres canaux continuent de fonctionner.

### WhatsApp — Meta Cloud API

L'infrastructure est prête mais reste automatiquement désactivée tant que les variables Meta complètes ne sont pas présentes. Les secrets doivent être saisis uniquement dans Railway.

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_DEFAULT_COUNTRY_CODE=33
WHATSAPP_META_PHONE_NUMBER_ID=123456789012345
WHATSAPP_META_ACCESS_TOKEN=change-me
WHATSAPP_META_GRAPH_VERSION=vXX.X

# Recommandé pour les notifications initiées par l'application :
WHATSAPP_META_TEMPLATE_NAME=planning_notification
WHATSAPP_META_TEMPLATE_LANGUAGE=fr
```

Le template `planning_notification` doit être créé et approuvé côté WhatsApp Business et accepter deux paramètres de corps : le titre de la notification puis le message. Ne mettez jamais `WHATSAPP_META_ACCESS_TOKEN` dans GitHub, les logs, un fichier `.env` commité ou le frontend.

Un provider webhook générique reste disponible si nécessaire :

```env
WHATSAPP_PROVIDER=webhook
NOTIFICATION_WHATSAPP_WEBHOOK_URL=https://provider.example/whatsapp
NOTIFICATION_WHATSAPP_WEBHOOK_TOKEN=change-me
```

### Météo gratuite — Open-Meteo

Open-Meteo est le provider par défaut pour Paris et l'Île-de-France. L'application fonctionne sans clé API ni compte pour l'usage gratuit non commercial et affiche l'attribution de la source.

Aucune variable n'est nécessaire. Les variables suivantes servent uniquement à remplacer les endpoints par défaut :

```env
OPEN_METEO_GEOCODING_URL=https://geocoding-api.open-meteo.com/v1/search
OPEN_METEO_FORECAST_URL=https://api.open-meteo.com/v1/forecast
```

Les appels météo utilisent un timeout court et la route applicative applique un cache privé de 5 minutes. Une indisponibilité d'Open-Meteo n'empêche jamais la consultation ou la modification du planning. Si AFP Planning devient un service commercial, vérifiez et adaptez l'offre/licence Open-Meteo.

### Routage optionnel

```env
ROUTING_API_BASE_URL=https://router.project-osrm.org
```

### PWA / Web Push

Les clés VAPID doivent également être configurées dans Railway selon les instructions du README. Générez-les avec :

```bash
pnpm push:generate-keys
```

Ne commitez jamais la clé privée VAPID.

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

Dans Railway : service → **Deployments** → déploiement → **View Logs**.

Railway affiche automatiquement l'utilisation CPU, mémoire, réseau et les temps de réponse.

Pour WhatsApp, les erreurs de fournisseur consignent uniquement le statut HTTP ; le token Meta n'est pas écrit dans les logs.

## 🔄 Mise à jour automatique

Railway peut être configuré pour déployer automatiquement à chaque push sur GitHub :

1. Aller dans "Settings" du projet
2. Activer "Auto Deploy"
3. Sélectionner la branche `main`

## 🐛 Dépannage

### Le build échoue

1. Vérifier les logs Railway
2. Pour une erreur Playwright, vérifier l'exécution de `postinstall`
3. Pour une erreur de mémoire, ajuster les ressources Railway si nécessaire

### Le scraping ne fonctionne pas

1. Vérifier les logs de `/api/scraper`
2. Vérifier Chromium/Playwright
3. Vérifier les délais d'exécution réseau

### WhatsApp n'envoie rien

1. Vérifier que `WHATSAPP_PROVIDER=meta`
2. Vérifier `WHATSAPP_META_PHONE_NUMBER_ID`, `WHATSAPP_META_ACCESS_TOKEN` et `WHATSAPP_META_GRAPH_VERSION`
3. Pour les messages initiés par AFP Planning, vérifier que le template configuré est approuvé
4. Vérifier que le numéro de la personne est présent dans sa fiche et peut être normalisé en E.164
5. Vérifier les logs Railway sans jamais afficher le token

### La météo est indisponible

1. Vérifier que l'événement possède un lieu ou qu'une ressource avec coordonnées lui est associée
2. Vérifier l'accès réseau vers Open-Meteo
3. Une erreur fournisseur est volontairement non bloquante

## 🔐 Sécurité

- Les fichiers `.env*.local` sont ignorés du déploiement/versionnement approprié
- Ne jamais commiter de secrets
- Utiliser les variables d'environnement Railway pour `DB_PASSWORD`, `CRON_SECRET`, SMTP, VAPID et WhatsApp
- Les comptes personnels n'accèdent à la météo que pour les événements publiés auxquels ils sont effectivement affectés
- Les échanges d'affectations sont revalidés côté serveur avant approbation administrateur

## ✅ Checklist de déploiement

- [ ] Code poussé sur GitHub
- [ ] Projet Railway lié au repository
- [ ] MariaDB configurée
- [ ] `CRON_SECRET` configuré
- [ ] Secrets bootstrap retirés après création du premier admin
- [ ] VAPID configuré si Web Push activé
- [ ] SMTP configuré si email activé
- [ ] Variables Meta + template approuvé si WhatsApp activé
- [ ] Météo testée sur un événement avec lieu en Île-de-France
- [ ] URL publique testée
- [ ] Auto-deploy sur `main` activé si souhaité
