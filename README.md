# PlanningClub

Application Next.js multi-club de pilotage du planning des clubs de football, avec MariaDB, PWA installable et espaces séparés pour les administrateurs et les dirigeants (arbitres club, encadrants, accompagnateurs). Plusieurs clubs peuvent partager la même instance, chacun avec ses propres données, réglages et personnalisation (voir [Multi-club](#multi-club) ci-dessous) ; l'Académie Football Paris 18 est un club utilisateur de la plateforme, pas son unique destinataire.

## Fonctionnalités

Matrice fonctionnelle : **Disponible** (parcours UI complet, routes actives), **Partiel**
(backend ou UI existe mais parcours incomplet — la limite est précisée), **Roadmap** (rien
d'utilisable en l'état, renvoie vers l'issue de suivi). Cette matrice est issue de l'audit
[#153](https://github.com/brahmiamine/afp-planning/issues/153) et doit être revérifiée à
chaque release (voir critère d'acceptation de cette issue).

### Planning et affectations

| Fonction | Statut | Détail / parcours |
|---|---|---|
| Matchs officiels (scraping), amicaux, entraînements, plateaux | Disponible | `/club`, `/club/planning`, scraper (`ScraperButton`, `pnpm scrape`) |
| Vues carte, liste et calendrier | Disponible | `ViewToggle` sur `/club` et `/club/planning` |
| Événements récurrents | Disponible | `/club/planning/recurrent`, `app/api/recurring-events` |
| Duplication d'un événement | Disponible | `EventCardDrag` (action « Dupliquer », copie en `draft`) |
| Modèles d'événements | Disponible | `EventCardDrag` (« Enregistrer comme modèle »), `app/api/planning/event-templates` |
| Cycle `brouillon → publié → modifié → annulé` | Disponible | `/club/planning` (préparation + publication) |
| Actions en masse sur les événements | Disponible | `EventsPanel` (sélection multiple + action groupée) |
| Filtres enregistrés | Disponible | `app/api/planning/saved-filters` |
| Affectations arbitres/encadrants/accompagnateurs (`personType` + `personId`) | Disponible | `EventAssignmentsEditor`, `app/lib/planning/event-store.ts` |
| Acceptation/refus, motif de refus | Disponible | `/mon-planning` |
| Relances 48 h / J-3 / J-1 | Disponible | `app/lib/planning/reminders.ts`, workflow `.github/workflows/planning-reminders.yml` (voir [PLANNING_REMINDERS.md](./PLANNING_REMINDERS.md) pour la configuration requise) |
| Remplacement et liste d'attente | Disponible | `app/api/planning/waitlist` |
| Échanges d'affectations (proposition → accord cible → validation admin → remplacement effectif) | Disponible | `/mon-planning/mes-echanges`, `/club/planning/echanges` |
| Revalidation disponibilité/conflits avant approbation d'un échange | Disponible | `app/api/planning/assignment-swaps` |
| Auto-affectation (indisponibilités, conflits, charge) | Disponible | `app/api/planning/auto-assign` |
| Détection de conflits (durée réelle, marge de déplacement) | Disponible | `app/lib/planning/assignment-suggestions.ts` |

### Organisation opérationnelle

| Fonction | Statut | Détail / parcours |
|---|---|---|
| Alertes de publication, charge, historique (préparation du planning) | Disponible | `/club/planning`, `/club/planning/charge`, `/club/planning/historique` |
| Vue dédiée **Planning du week-end** (`prêt` / `à traiter`) | Disponible | `/club/planning/week-end` |
| Présence (`présent / excusé / absent / remplacé`) | Disponible | Espace événement (`EventWorkspaceView`), `app/api/planning/attendance` — saisie possible une fois l'événement terminé |
| Export administrateur (PDF, CSV, iCal) | Disponible | Bouton Export sur `/club` |
| Demandes de disponibilité ponctuelles, gestion des indisponibilités | Disponible | `/club/disponibilites`, `/mon-planning/mes-indisponibilites`, `/mon-planning/disponibilites` |
| Préférences personnelles de planning | Disponible | `/mon-planning/preferences-planning` |
| Commentaires, checklist, documents, rapports post-événement | Disponible | Espace événement (`EventWorkspaceView`) |
| Ressources, réservations, transport | Roadmap | Seule une brique interne (`app/lib/planning/resources.ts`) existe, sans CRUD ni page — [#187](https://github.com/brahmiamine/afp-planning/issues/187) |
| Statistiques (acceptation, présence, délai de réponse, remplacement, couverture, charge, coefficient d'équité) | Disponible | `/club/planning/statistiques`, `app/lib/planning/analytics.ts` |
| Météo par événement (Open-Meteo) | Disponible | Espace événement, visible par les administrateurs et les personnes réellement affectées |

### Comptes, rôles et notifications

Le modèle sépare deux notions indépendantes (`app/lib/auth/roles.ts`) : le **rôle d'accès
au club**, qui porte les permissions, et les **fonctions opérationnelles**, qui portent
l'éligibilité aux affectations.

Un compte possède exactement un rôle d'accès :

- **Administrateur** (`admin`) : seul rôle d'écriture — pilotage complet du club :
  planning, référentiels, utilisateurs, invitations, dashboard et configuration ;
- **Dirigeant** (`dirigeant`) : accès à son espace personnel — ses affectations publiées,
  ses réponses, disponibilités, préférences, échanges et espaces événement autorisés.

Un compte possède en plus zéro, une ou plusieurs fonctions cumulables :
**Arbitre club** (`arbitre_club`), **Encadrant** (`encadrant`), **Accompagnateur**
(`accompagnateur`). Un même dirigeant peut donc cumuler les trois. Les fonctions
déterminent les postes auxquels la personne peut être affectée, ses préférences métier et
le ciblage des campagnes de disponibilité — elles n'accordent **jamais** de droit
d'administration, et le rôle d'accès ne rend jamais un compte affectable.

Il n'existe pas de rôle « super administrateur » distinct au sein d'un club : le premier
compte créé par le bootstrap (`BOOTSTRAP_SUPERADMIN_*`) est simplement un administrateur,
comme ceux créés ensuite depuis `/plateforme` ou par invitation.

Les comptes personnels ne disposent pas d'une lecture globale des contacts ou des affectations des autres personnes.

Au-dessus des clubs, un compte **plateforme** (`/plateforme`, authentification totalement
distincte) crée/active/désactive les clubs et leurs administrateurs — voir
[Multi-club](#multi-club) ci-dessous.

### Chat temps réel

- conversations privées entre deux utilisateurs actifs du même club ;
- chat attaché à chaque événement publié, lisible par tous les utilisateurs du club ;
- plusieurs canaux de groupe créés par un administrateur, avec liste de participants explicite ;
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
pnpm run e2e   # parcours navigateur bout-en-bout Playwright, voir TESTING.md
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

Les variables bootstrap servent uniquement à créer le premier administrateur lorsque la base ne contient aucun utilisateur. Retirez-les après la première connexion.

### Multi-club

Plusieurs clubs peuvent partager la même base de données et le même déploiement : chaque
enregistrement (officiels, encadrants, accompagnateurs, stades, catégories, matchs,
entraînements, plateaux, conversations…) est isolé par `clubId`. Chaque club dispose de ses
propres réglages (thème, couleurs, logo, clé et nom de scraper, SMTP) gérés dans
**Configuration → Personnalisation**, stockés en base plutôt qu'en variables d'environnement
globales.

Un rôle **administrateur plateforme**, entièrement distinct des comptes de
club, gère la liste des clubs et leurs administrateurs depuis `/plateforme` :

```env
PLATFORM_ADMIN_EMAIL=plateforme@exemple.fr
PLATFORM_ADMIN_PASSWORD=change-me
```

Comme pour le bootstrap administrateur, ces variables ne servent qu'à créer le premier compte
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
**Configuration → Personnalisation** (réservé aux administrateurs du club) ; le mot de passe est
chiffré en base avec `APP_ENCRYPTION_KEY`. Sans SMTP (ni global ni par club), l'application
continue de fonctionner avec les notifications in-app et les autres canaux configurés.

**`APP_ENCRYPTION_KEY` en développement et en production.** Cette clé chiffre en base (AES-256-GCM)
les messages de chat et les mots de passe SMTP par club. En développement, son absence dégrade
silencieusement vers un stockage en clair (pratique pour démarrer sans configuration, avec un
avertissement dans les logs serveur). **En production (`NODE_ENV=production`), cette dégradation
n'est plus tolérée : l'application refuse de démarrer sans `APP_ENCRYPTION_KEY`.** Tant qu'elle
n'est pas définie, un bandeau d'alerte s'affiche aussi dans le tableau de bord plateforme
(`/plateforme`).

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

La météo utilise le lieu de l'événement ou les coordonnées de ressource, avec timeout court. Le géocodage et la prévision sont mis en cache en mémoire côté serveur (respectivement 30 et 5 minutes), partagés entre tous les utilisateurs consultant le même lieu ou le même jour — les appels réseau à Open-Meteo eux-mêmes désactivent explicitement le cache HTTP (`cache: 'no-store'`) puisque c'est ce cache applicatif qui fait foi. Une panne du routage ou de la météo ne bloque jamais une écriture du planning ; l'information est simplement signalée comme indisponible.

Les données Open-Meteo nécessitent une attribution. L'interface affiche la source. Vérifiez les conditions Open-Meteo si l'application devient commerciale ; leur API publique gratuite est destinée à l'usage non commercial.

### Relances automatiques GitHub Actions

L'application doit avoir la variable d'environnement `CRON_SECRET`. GitHub Actions doit avoir :

```text
AFP_PLANNING_BASE_URL       URL HTTPS publique de l'application
AFP_PLANNING_CRON_SECRET    copie exacte du CRON_SECRET de l'application déployée
```

Le workflow appelle l'endpoint cron sécurisé avec un Bearer token. Voir `PLANNING_REMINDERS.md`.

## Migrations de schéma

Le schéma hors entités TypeORM est géré par des migrations versionnées exécutées
automatiquement au démarrage (et explicitement via `pnpm run db:migrate` en
déploiement, ordre `build → migrate → start`). Voir
[`docs/database-migrations.md`](docs/database-migrations.md) pour les règles
d'écriture, la CI et la stratégie de rollback.

Les colonnes `simple-json` des entités de planning sont cartographiées, avec la
frontière décidée entre ce qui reste JSON et ce qui est candidat à la normalisation,
dans [`docs/decisions/json-payloads-cartography.md`](docs/decisions/json-payloads-cartography.md).

## Déploiement

L'application est un conteneur Next.js standard (build `pnpm build`, démarrage `pnpm start`) avec une dépendance MariaDB et Playwright/Chromium pour le scraping — déployable sur n'importe quel hébergeur supportant Docker/Node.js (VPS, conteneur managé, etc.). Configurez les variables d'environnement documentées ci-dessus sur votre hébergeur avant le déploiement. La CI GitHub vérifie lint, type-check, tests unitaires/intégration, tests navigateur bout-en-bout (Playwright, voir [TESTING.md](./TESTING.md)) et build.

## Stack

- Next.js 16 / React 19 / TypeScript strict
- MariaDB + TypeORM
- Tailwind CSS + composants Radix/shadcn
- Vitest
- Playwright
- PWA + Web Push
- pnpm
