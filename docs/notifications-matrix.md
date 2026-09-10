# Matrice des notifications (issue #321)

Chaque événement métier important crée une notification persistée (in-app selon les
préférences) puis des intentions outbox push/email/WhatsApp. Aucun envoi réseau
n’a lieu dans une transaction métier. Un club ou un utilisateur inactif ne reçoit
rien. Les retries partagent une clé d’idempotence.

| Type | Déclencheur | Destinataire(s) | Urgence | Deep-link | Test |
|---|---|---|---|---|---|
| `planning-published-added` | Publication globale : nouvelle affectation | Personne affectée | normal | Espace événement | `matrix.test.ts` |
| `planning-published-removed` | Publication / archivage : affectation retirée | Personne retirée | normal / critical selon le cas | Espace événement | `matrix.test.ts` |
| `planning-published-rescheduled` | Publication : horaire modifié | Personnes concernées | critical | Espace événement | `matrix.test.ts` |
| `planning-published-cancelled` | Publication : événement annulé | Personnes concernées | critical | Espace événement | `matrix.test.ts` |
| `planning-published-reconfirmation-required` | Publication : reconfirmation | Personne affectée | normal | Espace événement | `matrix.test.ts` |
| `assignment-created` | Affectation hors publication | Personne affectée | normal | Espace événement | `matrix.test.ts` |
| `assignment-removed` | Retrait d’affectation | Personne retirée | normal | Espace événement | `matrix.test.ts` |
| `assignment-response` | Acceptation / refus d’une désignation | Admins | normal | Espace événement | `matrix.test.ts` |
| `assignment-replacement-required` | Refus nécessitant un remplaçant | Admins | important | Espace événement | `matrix.test.ts` |
| `assignment-reminder-manual` | Rappel manuel | Personne affectée | normal | Espace événement | `matrix.test.ts` |
| `assignment-swap-requested` | Demande d’échange | Cible | normal | Espace événement | `matrix.test.ts` |
| `assignment-swap-cancelled` | Annulation d’échange | Cible | normal | Espace événement | `matrix.test.ts` |
| `assignment-swap-admin-review` | Échange à valider | Admins | normal | Espace événement | `matrix.test.ts` |
| `availability-updated` | Indisponibilités personnelles | Admins du club | normal | Inbox notifications | `matrix.test.ts` |
| `availability-request` | Campagne de disponibilité | Destinataires de la campagne | normal | Inbox | `matrix.test.ts` |
| `availability-response` | Réponse à une campagne | Admins | normal | Inbox | `matrix.test.ts` |
| `planning-preferences-updated` | Préférences planning | Admins | normal | Inbox | `matrix.test.ts` |
| `post-event-report` | Compte-rendu post-événement | Admins | normal | Espace événement | `matrix.test.ts` |
| `chat-dm` | Message privé | Autres participants, jamais l’auteur | normal | `/club/chat?roomId=` ou `/mon-planning/chat?roomId=` | `notifications.test.ts` |
| `chat-event-message` | Message de salon d’événement | Membres actifs du club sauf l’auteur ; une personne mentionnée n’a que `chat-mention` | normal | Salon | `notifications.test.ts` |
| `chat-channel-message` | Message de canal | Autres participants | normal | Salon | `notifications.test.ts` |
| `chat-mention` | `@mention` validée par id + droits | Utilisateur mentionné (club + accès salon) | important | Salon | `notifications.test.ts` |

## Deep-links

- Planning avec `eventType` ∈ officiel/amical/entrainement/plateau + `eventId` → espace événement (`/club/evenements/...` ou `/mon-planning/evenements/...`).
- Chat : `eventType=chat` + `eventId=roomId` → conversation.
- Sinon : `/club/notifications` ou `/mon-planning/notifications`.
- Le fallback push n’est plus `/notifications` (route inexistante).
