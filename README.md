# AFP Planning

Application Next.js de pilotage du planning de l'Académie Football Paris 18, avec MariaDB, PWA installable et espaces personnalisés pour administrateurs, arbitres, encadrants et accompagnateurs.

## Fonctionnalités

### Planning et affectations

- matchs officiels synchronisés par scraping, matchs amicaux, entraînements et plateaux ;
- vues carte, liste et calendrier, événements récurrents, duplication et modèles ;
- cycle `brouillon → publié → modifié → annulé`, actions en masse et filtres sauvegardés ;
- affectations arbitres/encadrants/accompagnateurs avec identité stable `personType + personId` ;
- acceptation/refus, motif de refus, relances 48 h / J-3 / J-1, remplacement et liste d'attente ;
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
- vue dédiée **Planning du week-end** avec statut `prêt / à traiter`.

### Comptes, rôles et notifications

Un utilisateur peut cumuler plusieurs rôles, par exemple arbitre et encadrant :

- **Super administrateur** : pilotage complet, utilisateurs, invitations, dashboard et configuration ;
- **Administrateur** : gestion opérationnelle du planning et des référentiels ;
- **Arbitre / Encadrant / Accompagnateur** : leurs affectations publiées, disponibilités, préférences et espaces événement autorisés.

Les comptes personnels ne disposent pas d'une lecture globale des contacts ou des affectations des autres personnes.

Notifications disponibles :

- in-app ;
- Web Push/PWA sur smartphone ;
- email SMTP optionnel ;
- WhatsApp optionnel via webhook ;
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

BOOTSTRAP_SUPERADMIN_EMAIL=admin@exemple.fr
BOOTSTRAP_SUPERADMIN_PASSWORD=change-me
SESSION_TTL_DAYS=30

CRON_SECRET=change-me
APP_BASE_URL=https://planning.exemple.fr
```

Les variables bootstrap servent uniquement à créer le premier superadministrateur lorsque la base ne contient aucun utilisateur. Retirez-les après la première connexion.

### Email SMTP optionnel

```env
SMTP_HOST=smtp.exemple.fr
SMTP_PORT=587
SMTP_USER=notifications@exemple.fr
SMTP_PASSWORD=change-me
SMTP_SECURE=false
SMTP_FROM=notifications@exemple.fr
```

Sans SMTP, l'application continue de fonctionner avec les notifications in-app et les autres canaux configurés.

### WhatsApp optionnel

```env
NOTIFICATION_WHATSAPP_WEBHOOK_URL=https://provider.example/whatsapp
NOTIFICATION_WHATSAPP_WEBHOOK_TOKEN=change-me
```

### PWA / Web Push

Générez les clés VAPID avec :

```bash
node scripts/generate-vapid-keys.mjs
```

Configurez ensuite les variables VAPID indiquées par le script dans votre `.env`. Ne commitez jamais les clés privées.

### Routage et météo optionnels

```env
ROUTING_API_BASE_URL=https://router.project-osrm.org
OPEN_METEO_GEOCODING_URL=https://geocoding-api.open-meteo.com/v1/search
OPEN_METEO_FORECAST_URL=https://api.open-meteo.com/v1/forecast
```

Une panne du routage ou de la météo ne bloque jamais une écriture du planning ; l'information est simplement signalée comme indisponible.

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
