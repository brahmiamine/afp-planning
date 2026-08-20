# Relances automatiques du planning

Les relances automatiques des affectations en attente sont déclenchées par GitHub Actions via le workflow `.github/workflows/planning-reminders.yml`.

Le workflow s'exécute toutes les heures, à la minute 15, et appelle :

```text
POST /api/cron/planning-reminders
Authorization: Bearer <secret>
```

## 1. Variable Railway

Dans le service Railway de l'application, définir :

```text
CRON_SECRET=<une-valeur-aléatoire-longue-et-unique>
```

Utiliser une valeur aléatoire d'au moins 32 octets. Ne pas la committer dans le dépôt.

## 2. Secrets GitHub Actions

Dans GitHub : **Repository → Settings → Secrets and variables → Actions → New repository secret**.

Créer exactement ces deux secrets :

### `AFP_PLANNING_BASE_URL`

URL publique HTTPS de l'application déployée, sans chemin d'API.

Exemple :

```text
https://afp-planning-production.up.railway.app
```

Le workflow supprime automatiquement un éventuel `/` final avant d'ajouter `/api/cron/planning-reminders`.

### `AFP_PLANNING_CRON_SECRET`

Copie exacte de la valeur `CRON_SECRET` configurée dans Railway :

```text
AFP_PLANNING_CRON_SECRET == Railway CRON_SECRET
```

Il s'agit du même secret sous deux noms différents parce que Railway et GitHub Actions ont chacun leur propre coffre de secrets.

## 3. Vérification

Après configuration :

1. Ouvrir **Actions → Planning reminders**.
2. Utiliser **Run workflow** pour un test manuel.
3. Vérifier que le job `Trigger planning reminders` termine avec succès.
4. Vérifier dans l'application que les affectations réellement dues ont reçu leur relance et que le même palier n'est pas envoyé deux fois.

Le workflow échoue volontairement si `AFP_PLANNING_BASE_URL` ou `AFP_PLANNING_CRON_SECRET` manque.

## Sécurité

- Ne jamais mettre `CRON_SECRET` ou `AFP_PLANNING_CRON_SECRET` dans un fichier versionné, une issue ou un commentaire de PR.
- Utiliser uniquement l'URL HTTPS publique dans `AFP_PLANNING_BASE_URL`.
- Faire tourner le secret immédiatement s'il est exposé.
- Le endpoint cron doit être appelé avec l'en-tête `Authorization: Bearer ...`; le secret ne doit pas être placé dans l'URL.
- Le workflow GitHub ne journalise pas explicitement la valeur du secret.
