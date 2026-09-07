# Liste d’attente du planning

L’API `/api/planning/waitlist` est actuellement un **outil interne d’administration**. Aucun parcours frontend public n’en dépend encore.

## Opérations

- `GET` : liste les candidats d’un événement et d’un rôle.
- `POST` (ajout) : ajoute un candidat à la liste d’attente.
- `POST` avec `action: "promote"` : prépare l’affectation du candidat dans le brouillon.
- `DELETE` : retire un candidat de la liste d’attente.

## Sémantique de la promotion

Une promotion ne doit jamais annoncer une affectation que l’utilisateur ne peut pas encore voir.

La promotion :

1. écrit l’affectation et retire l’entrée de liste d’attente dans une même transaction ;
2. n’envoie aucune notification immédiatement ;
3. marque l’événement `modified` lorsqu’il avait déjà été publié ;
4. laisse la publication globale rendre l’affectation visible et déclencher les notifications correspondantes.

Si l’écriture de l’affectation échoue, l’entrée de liste d’attente est conservée.
