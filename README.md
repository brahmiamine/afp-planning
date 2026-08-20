# AFP Planning

Application Next.js de pilotage du planning de l'Académie Football Paris 18, avec MariaDB, PWA installable et espaces personnalisés pour administrateurs, arbitres, encadrants et accompagnateurs.

## Fonctionnalités

### Planning et affectations

- matchs officiels synchronisés par scraping, matchs amicaux, entraînements et plateaux ;
- vues carte, liste et calendrier, événements récurrents, duplication et modèles ;
- cycle `brouillon → publié → modifié → annulé`, actions en masse et filtres sauvegardés ;
- affectations arbitres/encadrants/accompagnateurs avec identité stable `personType + personId` ;
- acceptation/refus, motif de refus, relances 48 h / J-3 / J-1, remplacement et liste d'attente ;
- échanges d'affectations entre utilisateurs : proposition → accord de la cible → validation admin → remplacement effectif ;
- revalidation disponibilité/conflits avant toute approbation d'un échange ;
- auto-affectation tenant compte des indisponibilités, conflits et charge ;
- détection de conflits avec durée réelle et marge de déplacement.

### Organisation opérationnelle

- dashboard Super Admin avec alertes, publication, charge, week-end, présence, météo et historique ;
- demandes de disponibilité ponctuelles et gestion autonome des indisponibilités ;
- préférences personnelles de planning ;
- suivi `présent / excusé / absent / remplacé` ;
- commentaires, checklist, documents et rapports post-événement ;
- ressources, réservations, transport et covoiturage ;
- statistiques : acceptation, présence, délai de réponse, remplacement, couverture, charge et coefficient d'équité ;
- vue dédiée **Planning du week-end** avec statut `prêt / à traiter` ;
- météo par événement via Open-Meteo, visible par les administrateurs et les personnes réellement affectées.

### Comptes, rôles et notifications

Un utilisateur peut cumuler plusieurs rôles, par exemple arbitre et encadrant :

- **Super administrateur** : pilotage complet de son club — utilisateurs, invitations, dashboard et configuration ;
- **Administrateur** : gestion opérationnelle du planning et des référentiels ;
- **Arbitre / Encadrant / Accompagnateur** : leurs affectations publiées, disponibilités, préférences, échanges et espaces événement autorisés.

Les comptes personnels ne disposent pas d'une lecture globale des contacts ou des affectations des autres personnes.

Au-dessus des clubs, un compte **plateforme** (`/plateforme`, authentification totalement
distincte) crée/active/désactive les clubs et leurs superadministrateurs — voir
[Multi-club](#multi-club) ci-dessous.

### Chat temps réel

- conversations privées entre deux utilisateurs actifs du même club ;
- chat attaché à chaque événement publié, lisible par tous les utilisateurs du club ;
- plusieurs canaux de groupe créés par le Super Admin, avec liste de participants explicite ;
- messages persistés et ordonnés côté serveur, reprise après reconnexion et déduplication par identifiant client ;
- interface façon messagerie mobile : séparateurs de date, accusés de lecture (un ✓ envoyé, deux ✓ lu), emoji, envoi d'images/GIF/vidéos/audio ;
- messages chiffrés au repos (AES-256-GCM, voir `APP_ENCRYPTION_KEY`) ;
- isolation par `clubId`, contrôle d’accès à chaque lecture/envoi, limite de débit et authentification Socket.IO par la session existante.

Notifications disponibles :

- in-app ;
- Web Push/PWA sur smartphone ;
- email SMTP optionnel ;
- WhatsApp via provider configurable (`meta`, `webhook` ou désactivé) ;
- préférences de canaux et d'urgence par utilisateur.

### Partage, calendriers et exports

- liens publics temporaires de 1 à 90 jours ;
- seul le SHA-256 du token de partage est enregistré ;
- partage public limité aux données de calendrier, sans téléphone, `personId`, commentaires, rapports ni audit ;
- export CSV UTF-8 protégé contre l'injection de formules tableur ;
- vue imprimable HTML et export PDF ;
- abonnement iCal personnel et raccourcis `webcal://`, Google Calendar et Outlook.

## Installation et développement

```bash
pnpm install
pnpm dev
```

`pnpm dev` exécute `start.sh`, qui démarre Docker si besoin, lance des conteneurs MariaDB et phpMyAdmin, attend que MariaDB accepte les connexions, puis lance l'application (`next dev`). Voir [Base de données locale](#base-de-données-locale-docker) ci-dessous.

Importer/synchroniser les catégories et clubs historiques :

```bash
pnpm db:import:categories-clubs
```

Contrôles qualité :

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

Voir aussi [TESTING.md](./TESTING.md) et [PLANNING_REMINDERS.md](./PLANNING_REMINDERS.md).

## Base de données locale (Docker)

`start.sh` gère toute l'infrastructure locale :

1. Vérifie que Docker tourne (le démarre sur macOS si besoin).
2. Télécharge/démarre un conteneur MariaDB (`afp_mariadb`) et un conteneur phpMyAdmin (`afp_phpmyadmin`) sur un réseau Docker dédié (`afp_network`).
3. Attend que MariaDB réponde réellement aux connexions (`mariadb-admin ping`), pas juste que le conteneur soit démarré.
4. Installe les dépendances si `node_modules` est absent, puis lance l'application.

```bash
./start.sh
```

Accès une fois lancé :

- Application : http://localhost:3000
- phpMyAdmin : http://localhost:8080 (utilisateur/mot de passe = `DB_USER`/`DB_PASSWORD` ci-dessous)
- MariaDB : `127.0.0.1:3306`

Variables surchargeables (toutes optionnelles, valeurs par défaut ci-dessous) : `DB_CONTAINER`, `PMA_CONTAINER`, `DOCKER_NETWORK`, `DB_NAME=afp_planning`, `DB_USER=afp_user`, `DB_PASSWORD=afp_password`, `DB_ROOT_PASSWORD`, `DB_PORT=3306`, `PMA_PORT=8080`, `MARIADB_IMAGE=mariadb:latest`, `PHPMYADMIN_IMAGE=phpmyadmin:latest`. Placez-les dans un fichier `.env` à la racine, il est chargé automatiquement par `start.sh`.

## Configuration

### Base, sessions et cron

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=afp_planning
DB_USER=afp_user
DB_PASSWORD=afp_password

# Club par défaut de ce déploiement (voir "Multi-club" ci-dessous). Plusieurs clubs peuvent
# partager la même base ; APP_CLUB_ID ne sert plus qu'à amorcer le premier club et de repli
# pour les tâches sans contexte de requête (migration JSON initiale, etc.).
APP_CLUB_ID=afp

# Clé de chiffrement (AES-256-GCM) des messages de chat et des mots de passe SMTP par club
# enregistrés en base. Obligatoire en production — sans elle, ces données restent en clair
# et un avertissement est loggé au démarrage. Générez-la par exemple avec `openssl rand -hex 32`.
APP_ENCRYPTION_KEY=change-me

BOOTSTRAP_SUPERADMIN_EMAIL=admin@exemple.fr
BOOTSTRAP_SUPERADMIN_PASSWORD=change-me
SESSION_TTL_DAYS=30

CRON_SECRET=change-me
APP_BASE_URL=https://planning.exemple.fr
```

Les variables bootstrap servent uniquement à créer le premier superadministrateur lorsque la base ne contient aucun utilisateur. Retirez-les après la première connexion.

### Multi-club

Plusieurs clubs peuvent partager la même base de données et le même déploiement : chaque
enregistrement (officiels, encadrants, accompagnateurs, stades, catégories, matchs,
entraînements, plateaux, conversations…) est isolé par `clubId`. Chaque club dispose de ses
propres réglages (thème, couleurs, logo, clé et nom de scraper, SMTP) gérés dans
**Configuration → Personnalisation**, stockés en base plutôt qu'en variables d'environnement
globales.

Un rôle **super-superadministrateur** (« plateforme »), entièrement distinct des comptes de
club, gère la liste des clubs et leurs superadministrateurs depuis `/plateforme` :

```env
PLATFORM_ADMIN_EMAIL=plateforme@exemple.fr
PLATFORM_ADMIN_PASSWORD=change-me
```

Comme pour le bootstrap superadmin, ces variables ne servent qu'à créer le premier compte
plateforme lorsque la table est vide ; retirez-les après la première connexion à `/plateforme`.

### Email SMTP

```env
SMTP_HOST=smtp.exemple.fr
SMTP_PORT=587
SMTP_USER=notifications@exemple.fr
SMTP_PASSWORD=change-me
SMTP_SECURE=false
SMTP_FROM=notifications@exemple.fr
```

Ces variables servent de repli global. Chaque club peut définir son propre serveur SMTP dans
**Configuration → Personnalisation** (réservé au superadmin du club) ; le mot de passe est
chiffré en base avec `APP_ENCRYPTION_KEY`. Sans SMTP (ni global ni par club), l'application
continue de fonctionner avec les notifications in-app et les autres canaux configurés.

### WhatsApp optionnel

Aucun secret WhatsApp n'est présent dans le dépôt. Sans configuration, le canal reste désactivé.

#### Meta WhatsApp Cloud API

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_DEFAULT_COUNTRY_CODE=33
WHATSAPP_META_PHONE_NUMBER_ID=123456789012345
WHATSAPP_META_ACCESS_TOKEN=change-me
WHATSAPP_META_GRAPH_VERSION=vXX.X

# Recommandé pour les notifications business-initiated hors fenêtre de service :
WHATSAPP_META_TEMPLATE_NAME=planning_notification
WHATSAPP_META_TEMPLATE_LANGUAGE=fr
```

Le template Meta attendu reçoit deux paramètres de corps : le titre puis le message. Il doit être créé et approuvé dans WhatsApp Business Manager avant activation. Si aucun template n'est configuré, l'adaptateur envoie un message texte, utilisable uniquement lorsque les règles de la fenêtre de conversation Meta le permettent.

#### Webhook générique conservé

```env
WHATSAPP_PROVIDER=webhook
NOTIFICATION_WHATSAPP_WEBHOOK_URL=https://provider.example/whatsapp
NOTIFICATION_WHATSAPP_WEBHOOK_TOKEN=change-me
```

### PWA / Web Push

Générez les clés VAPID avec :

```bash
node scripts/generate-vapid-keys.mjs
```

Configurez ensuite les variables VAPID indiquées par le script dans votre `.env`. Ne commitez jamais les clés privées.

### Routage et météo

Open-Meteo est le provider météo par défaut. Pour le mode gratuit non commercial, aucune clé API ni compte n'est nécessaire. Les URLs ci-dessous sont optionnelles : elles permettent seulement de remplacer les endpoints par défaut.

```env
ROUTING_API_BASE_URL=https://router.project-osrm.org
OPEN_METEO_GEOCODING_URL=https://geocoding-api.open-meteo.com/v1/search
OPEN_METEO_FORECAST_URL=https://api.open-meteo.com/v1/forecast
```

La météo utilise le lieu de l'événement ou les coordonnées de ressource, avec timeout court et cache côté API. Une panne du routage ou de la météo ne bloque jamais une écriture du planning ; l'information est simplement signalée comme indisponible.

Les données Open-Meteo nécessitent une attribution. L'interface affiche la source. Vérifiez les conditions Open-Meteo si l'application devient commerciale ; leur API publique gratuite est destinée à l'usage non commercial.

### Relances automatiques GitHub Actions

L'application doit avoir la variable d'environnement `CRON_SECRET`. GitHub Actions doit avoir :

```text
AFP_PLANNING_BASE_URL       URL HTTPS publique de l'application
AFP_PLANNING_CRON_SECRET    copie exacte du CRON_SECRET de l'application déployée
```

Le workflow appelle l'endpoint cron sécurisé avec un Bearer token. Voir `PLANNING_REMINDERS.md`.

## Déploiement

L'application est un conteneur Next.js standard (build `pnpm build`, démarrage `pnpm start`) avec une dépendance MariaDB et Playwright/Chromium pour le scraping — déployable sur n'importe quel hébergeur supportant Docker/Node.js (VPS, conteneur managé, etc.). Configurez les variables d'environnement documentées ci-dessus sur votre hébergeur avant le déploiement. La CI GitHub vérifie lint, type-check, tests et build.

## Stack

- Next.js 16 / React 19 / TypeScript strict
- MariaDB + TypeORM
- Tailwind CSS + composants Radix/shadcn
- Vitest
- Playwright
- PWA + Web Push
- pnpm
