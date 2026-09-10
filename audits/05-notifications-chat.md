# Audit 05 — Notifications, Chat, Socket.IO, Web Push (DEEP)

**Projet :** AFP Planning  
**Date :** 2026-09-10  
**Branche analysée :** code workspace courant  
**Méthode :** revue statique exhaustive + recoupement tests unitaires / intégration / E2E  
**Non vérifié dynamiquement :** push device réel, permission navigateur live, multi-pod load balancer  
**Contrainte :** aucune clé privée VAPID dans ce rapport

**Score global : 88 / 100**

| Dimension | /pondération | Note |
|-----------|-------------|------|
| Exactitude destinataires | 20 | 17 |
| Sécurité multi-tenant chat/socket | 25 | 23 |
| Fiabilité messages / unread | 15 | 13 |
| Web Push | 15 | 13 |
| Résilience / reconnexion | 10 | 9 |
| Observabilité | 5 | 3 |
| Tests | 10 | 10 |

**Findings :** P0 **0** · P1 **2** · P2 **5** · P3 **4**

---

## 1. FILE MAP

| Fichier | Domaine | Responsabilité | Entrées | Sorties |
|---------|---------|----------------|---------|---------|
| `app/lib/notifications/service.ts` | Notif core | enqueue in-app + outbox ; deliver post-commit | `NotificationInput`, user/contact | rows `notifications` + outbox ; push/email/WA |
| `app/lib/notifications/outbox.ts` | Delivery queue | idempotence, retry, status | channel payload + key | `planning_notification_outbox` |
| `app/lib/notifications/preferences.ts` | Prefs | canaux / urgence / eventTypes | planning record | selected channels |
| `app/lib/notifications/destinations.ts` | Deep-links | href admin vs personnel | type/eventType/eventId | URL |
| `app/lib/notifications/email.ts` / `whatsapp.ts` | Canaux | envoi différé | outbox item | réseau |
| `docs/notifications-matrix.md` | Doc | matrice issue #321 | — | types documentés |
| `app/api/notifications/route.ts` | HTTP inbox | list + mark read | session | JSON `{notifications, unread}` |
| `app/hooks/useUnreadNotificationsCount.ts` | UI badge | poll + event `notifications-updated` | GET `/api/notifications` | count |
| `app/hooks/useUnreadChatCount.ts` | UI badge chat | sum `rooms[].unreadCount` | GET `/api/chat/rooms` | count |
| `app/components/notifications/*` | UI | inbox + settings | API | mark read |
| `app/lib/chat/service.ts` | Chat DB SoT | rooms, messages chiffrés, read states, unread SQL | SessionUser + commands | DTOs |
| `app/lib/chat/policy.ts` | AuthZ rooms | direct/channel participants ; event = affectés (#345) | user+room+ids | boolean |
| `app/lib/chat/notifications.ts` | Chat→notif | DM / event / channel / mention | post-commit message | enqueue+deliver |
| `app/lib/chat/protocol.ts` | Wire validation | roomId, clientMessageId, length, mentions | unknown | `ChatMessageCommand` |
| `app/lib/chat/socket-server.ts` | Socket.IO | auth cookie, rooms, emit/receive, rate limits | handshake + events | realtime |
| `app/lib/chat/socket-rate-limit.ts` | RL #352 | sliding window MariaDB + GET_LOCK | bucketKey | accept/deny |
| `app/lib/chat/socket-security.ts` | Handshake IP | x-real-ip if TRUST_PROXY | headers | address |
| `app/lib/chat/attachments.ts` | PJ | upload quota, serving | multipart | `/api/chat/attachments/:id` |
| `app/api/chat/**` | HTTP chat | rooms, direct, events, channels, messages GET/PATCH, upload | session | JSON |
| `app/components/chat/ChatConversation.tsx` | UI thread | optimistic, resume, typing, mentions | socket+HTTP | UI |
| `app/components/chat/ChatView.tsx` | UI liste | refetch on `chat:message` / `room-touched` | socket | rooms list |
| `app/lib/push/vapid.ts` | VAPID | config env (private server-only) | env | public+private in-memory |
| `app/lib/push/store.ts` | PushSubscription | save/list/remove/purge user | endpoint+keys | `push_subscriptions` |
| `app/lib/push/service.ts` | Send | web-push ; purge 404/410 | userId+payload | réseau |
| `app/lib/push/endpoint.ts` | Allowlist | FCM/Mozilla/Apple HTTPS | URL | boolean |
| `app/api/push/{config,subscribe,unsubscribe}/route.ts` | HTTP push | public key ; bind ; unbind | session | JSON |
| `app/components/providers/pwa-provider.tsx` | PWA | SW register, permission, subscribe sync | user | subscription |
| `public/sw.js` | Service worker | `push` + `notificationclick` | push event | OS notif + navigate |
| `app/api/auth/logout/route.ts` | Logout #344 | purge **all** push for user | cookie | revoke+delete |
| `app/lib/planning/global-publication.ts` | Publish notifs | enqueue in TX ; deliver after commit | publication | outbox |
| `app/lib/planning/published-planning.ts` | Diff | `computePerUserPublicationChanges` | snapshots | kinds added/removed/… |
| `app/lib/planning/assignment-propagation.ts` | Draft vs published | **no notify** on draft assign ; mark `modified` | before/after | flag |
| `app/lib/planning/assignment-contacts.ts` | `notifyAssignmentChanges` | **defined but no production caller** | contacts | would notify |
| `app/lib/planning/event-access.ts` | Assigned IDs #345 | `assignedUserIdsForPlanningEvent` | snapshot | userIds |
| `app/lib/scraper/match-sync-notifications.ts` | Scrape | `official_match_*` → admins | sync diffs | notifyAdmins |
| `app/lib/db/migrations/schema-migrations.ts:384-394` | Schema #352 | `chat_rate_limit_events` | migrate | table |
| `app/lib/db/migrations/typeorm-entity-tables.ts:167-247` | Schema | notifications, chat_*, read_states | migrate | tables |

**Tables clés :** `notifications`, `planning_notification_outbox`, `push_subscriptions`, `chat_rooms`, `chat_participants`, `chat_messages`, `chat_read_states`, `chat_attachments`, `chat_rate_limit_events`.

---

## 2. NOTIFICATION MATRIX (types réels)

Ordre canonique (publication / swaps transactionnels) :

1. **Action métier validée**  
2. **Commit DB** des intentions (`enqueue*` dans la même TX quand applicable)  
3. **Livraison réseau** via `deliverEnqueuedNotifications` **après** commit (`service.ts:229-242`, `global-publication.ts:428-432`)  
4. Échec delivery → outbox retry ; **ne rollback pas** la commande (`service.ts:244-250`)

Échec métier avant commit ⇒ **pas** d’intention persistée (même TX).  
`createNotificationForUser` (chemin non-TX) avale les erreurs pour ne pas casser la commande (`service.ts:252-262`) — risque théorique d’opération OK sans notif (pas de fausse notif).

| Type | Déclencheur (preuve) | Destinataire | In-app | Push* | Route cible |
|------|----------------------|--------------|:------:|:-----:|-------------|
| `planning-published-added` | `global-publication.ts:387-399` + diff `published-planning.ts:495-507` | contact affecté | ✅ | ✅ | espace événement |
| `planning-published-removed` | idem kind `removed` | contact retiré | ✅ | ✅ | espace événement |
| `planning-published-rescheduled` | date/time/venue change `published-planning.ts:530-558` | contacts encore présents | ✅ | ✅ critical | espace événement |
| `planning-published-cancelled` | cancel `published-planning.ts:512-525` | contacts | ✅ | ✅ critical | espace événement |
| `planning-published-reconfirmation-required` | resets `global-publication.ts:402-418` | contact remis pending | ✅ | ✅ | espace événement |
| `assignment-created` / `assignment-removed` | **seulement** `assignment-contacts.ts:106-123` — **aucun appelant prod** | contact | N/A live | N/A | doc matrix |
| `assignment-response` / `assignment-replacement-required` | `api/me/assignments/respond/route.ts:130` | admins | ✅ | ✅ | événement |
| `assignment-reminder-manual` | `reminders.ts:137-138` | contact | ✅ | ✅ | événement |
| `assignment-swap-requested` | `api/me/assignment-swaps/route.ts:197` | cible | ✅ | ✅ | événement |
| `assignment-swap-cancelled` | idem `:244` | cible | ✅ | ✅ | événement |
| `assignment-swap-admin-review` | idem `:310` | admins | ✅ | ✅ | événement |
| `assignment-swap-target-accepted` / `-declined` | idem `:302` | requester | ✅ | ✅ | événement |
| `assignment-swap-{approved\|rejected|…}` | `api/planning/assignment-swaps/route.ts:200-205` | requester+target | ✅ | ✅ | événement |
| `availability-updated` | `api/me/availability/route.ts:42` | admins | ✅ | ✅ | inbox |
| `availability-request` | `api/availability-requests/route.ts:103` | ciblés campagne | ✅ | ✅ | inbox |
| `availability-response` | `…/respond/route.ts:85` | admins | ✅ | ✅ | inbox |
| `availability-reviewed` | `api/club/indisponibilites/review/route.ts:94` | owner indispo | ✅ | ✅ | inbox (**hors matrix doc**) |
| `planning-preferences-updated` | `api/me/planning-preferences/route.ts:79` | admins | ✅ | ✅ | inbox |
| `post-event-report` | `api/…/reports/route.ts:86` | admins | ✅ | ✅ | événement |
| `official_match_updated` / `official_match_cancelled` | `match-sync-notifications.ts:15-30` via scraper | admins | ✅ | ✅ | événement (**hors matrix doc**) |
| `chat-dm` | `chat/notifications.ts:27-30,148-163` | participants ≠ auteur | ✅ | ✅ | `/…/chat?roomId=` |
| `chat-event-message` | idem type event | affectés (#345) ≠ auteur ; mentions exclues | ✅ | ✅ | salon |
| `chat-channel-message` | idem channel | participants ≠ auteur | ✅ | ✅ | salon (doc matrix OK ; **absent** `matrix.test.ts`) |
| `chat-mention` | `notifications.ts:131-145` | mention validée | ✅ | ✅ important | salon |

\*Push conditionné par prefs (`preferences.ts:49-62`) : urgence ≥ seuil + eventType allowlist.

**Invitation compte** : pas de type notif planning dédié dans cette surface (invitations = auth/onboarding, hors chat).  
**Postpone** = `planning-published-rescheduled` (date/time/location).  
**Indispo** = `availability-updated` (déclaration) + `availability-reviewed` (décision admin).

---

## 3. PUBLICATION NOTIFS

| Question | Verdict | Preuve |
|----------|---------|--------|
| Affectation **draft** notifie ? | **Non** | `assignment-propagation.ts:8-23` : préparation sans notif / sans Mon Planning |
| Propagation published change immédiate ? | Marque `modified` seulement ; **pas** `notifyAssignmentChanges` | `assignment-propagation.ts:27-48` |
| Publication notifie ? | **Oui**, diff par contact | `global-publication.ts:364-418` |
| Multi-match doublons ? | Clé idempotence `publish:{beforePublishedAt}:…:contact:kind` | `global-publication.ts:357-398` ; outbox `ON DUPLICATE KEY` `outbox.ts:36-41` |
| Republication sans changement (#348) ? | **Aucune** notif si `diff.changed === 0` | `global-publication.ts:377-381` ; test `global-publication.test.ts:408-424` |
| `assignment-created` live ? | **Dead path** : fonction exportée, **zéro** appel prod | grep `notifyAssignmentChanges(` → test only |

**Décision produit :** les types `assignment-created`/`assignment-removed` restent documentés mais non branchés ; le chemin réel post-publication est `planning-published-*` à la prochaine publication globale.

---

## 4. CHAT — conversations

### Types (`ChatRoomType` `policy.ts:4`)

| Kind | Création | Visibilité / participants | Lifetime |
|------|----------|---------------------------|----------|
| `direct` | `POST` → `getOrCreateDirectRoom` `service.ts:310-347` | 2 participants même club (`usersInClub`) ; roomKey hash club+ids | persistant |
| `event` | `getOrCreateEventRoom` `service.ts:389-438` | **Affectés snapshot publié + admins** (#345) `policy.ts:22-36` | tant que publié visible ; sinon accès refusé `service.ts:193-204` |
| `channel` | admin `createChannel` `service.ts:455+` | participants explicites ; manage admin only | `archiveChannel` → `archivedAt` bloque `service.ts:198` |

### Cas limites

| Cas | Comportement | Preuve |
|-----|--------------|--------|
| Désaffecté | **Perd** l’accès event (plus club-wide) | `policy.ts:33-35` ; `policy.test.ts:25-33` |
| User retiré club | FK CASCADE participants ; session club mismatch | `referential-integrity.ts:64-65` ; socket revalidate `socket-server.ts:266-284` |
| Match non publié / sorti | `isCurrentEventVisible` / snapshot null → refus | `service.ts:193-204,235-238` |
| Autre tenant | `user.clubId !== room.clubId` → false | `policy.ts:32` |
| Event rooms #345 | Aligné Mon Planning | `policy.ts:22-24` ; `event-access.ts:16-42` |

---

## 5. MESSAGES — source de vérité

| Aspect | Verdict | Preuve |
|--------|---------|--------|
| SoT | **DB** `chat_messages` (contenu chiffré) | `service.ts:730-748` ; unique `(roomId,senderUserId,clientMessageId)` schema `typeorm-entity-tables.ts:238` |
| Socket | Transport + ack ; **pas** SoT | write path only `chat:send` ; HTTP messages = **GET only** `rooms/[id]/messages/route.ts:14-34` |
| Ordre | `sequence` monotoque sous lock room | `service.ts:727-729` ; merge client `ChatConversation.tsx:110-114` |
| Pagination | `beforeSequence` / `afterSequence`, limit ≤200 | `service.ts:535-579` |
| Optimistic UI | pending map + retry | `ChatConversation.tsx:458-532,819-825,1263-1299` |
| Double-clic / retry | nouveau UUID par envoi ; même `clientMessageId` → `duplicate:true` sans re-notify | `service.ts:658-691,751-775` ; `notifications.ts:102` |
| Reconnect | `connect` → `chat:resume` after last sequence + flush pending | `ChatConversation.tsx:590-610` |

---

## 6. SOCKET.IO

### Connexion / auth

- Path `/socket.io` ; credentials cookie session (`socket-server.ts:217-252`)
- Origin allowlist `isAllowedOrigin` (`:92-125`)
- Handshake rate limit partagé DB (`:223-238` + `socket-rate-limit.ts:68-85`)
- `getSessionUser(token)` — **jamais** de userId client de confiance
- Revalidation session 15s ; club switch leave rooms (`:266-288`)
- Max 8 connexions / user **par pod** mémoire locale (`:206-211`) — seul compteur non partagé (#352 comment `:167-168`)

### Rooms

| Room | Join | Qui reçoit | Contrôle |
|------|------|------------|----------|
| `chat:club:{clubId}:user:{userId}` | auto connect | emits DM/channel ciblés | session clubId/userId serveur |
| `chat:club:{clubId}` | auto | `chat:room-touched` only | session |
| `chat:room:{roomId}` | après `chat:resume` **avec** `listMessages` authZ | event messages/read/typing | `authorizeRoomForUser` ; leave si refus (`:303-315`) |

### Events client→server

| Event | Action | AuthZ | Rate limit |
|-------|--------|-------|------------|
| `chat:resume` | join room + history | `listMessages`→`roomForUser` | actions 60/10s |
| `chat:send` | `appendMessage` + notify | `authorizeRoomForUser` ; sender = session | actions 60 + messages 20/10s |
| `chat:read` | `markRoomRead` | room access ; **own** userId | actions 60 |
| `chat:typing` | ephemeral relay | `assertRoomAccess` | typing 1/2s |
| `chat:delete` | admin moderation | `requireAdmin` + room access | actions 60 |

### Events server→client

`chat:message`, `chat:read`, `chat:room-touched`, `chat:typing` (`socket-server.ts:55-66`).

### Cross-tenant Club A → Club B (#346)

**Impossible** pour `chat:send` : `authorizeRoomForUser` + `canAccessChatRoom` club mismatch.  
**Test :** `socket-server.integration.test.ts:447-478` — ack `ok:false`, 0 messages persistés.

Client `userId`/`clubId`/`eventId`/`conversationId` : **non utilisés** pour auth ; roomId validé serveur ; sender forcé `user.id` (`service.ts:733`).

### Rate limit #352 (DB-shared)

`acceptsSharedSlidingLimit` → `chat_rate_limit_events` + `GET_LOCK` (`socket-rate-limit.ts:32-65`).  
Migration `schema-migrations.ts:384-394`.

---

## 7. RECONNECT / MULTI-DEVICE

| Scénario | Comportement | Preuve |
|----------|--------------|--------|
| Perte réseau | pending UI ; auto-retry on `connect` | `ChatConversation.tsx:603-610,1471` |
| Rejoin | `chat:resume` join + catch-up sequences | `socket-server.ts:290-320` |
| Messages manqués | HTTP initial + resume socket ; DB SoT | `ChatConversation.tsx:573-606` |
| Unread resync | liste refetch `chat:message`/`read`/`room-touched` + `notifyChatUnreadChanged` | `ChatView.tsx:156-178` ; `useUnreadChatCount.ts:21-56` |
| Multi-onglets | N sockets ; connection cap 8/pod | `socket-server.ts:206-211` |
| Read device A → B | `chat:read` broadcast + DB `chat_read_states` | `socket-server.ts:360-378` ; `markRoomRead` `service.ts:892-905` |

---

## 8. UNREAD

| Domaine | SoT | Preuve |
|---------|-----|--------|
| Notifications badge | **SQL `COUNT`** `readAt IS NULL` filtré `userId` session | `notifications/route.ts:22-26` |
| Notifications liste | `take: 100` DESC — **inbox tronquée**, pas le badge | `route.ts:17-21` |
| Chat room | **SQL COUNT** `sequence > COALESCE(lastReadSequence,0)` excl. self | `service.ts:257-270` |
| Chat badge global | somme applicative des `unreadCount` rooms accessibles | `useUnreadChatCount.ts:34-36` ; nav `MobileTabBar.tsx:55,64` |

**Mark-one / mark-all :** `PATCH` avec `id` + `userId: auth.user.id` ou `all` scoped user (`route.ts:71-90`). User A **ne peut pas** mark User B (404 si id étranger).  
Chat mark : `markRoomRead` after `roomForUser` — ownership via accès salon + `user.id` (`service.ts:892-905`).  
Races mark-all : update SQL atomique ; chat read ne régresse jamais (`lastReadSequence` only increases `:902-903`).

---

## 9. MENTIONS

| Étape | Preuve |
|-------|--------|
| Parse client | `@Nom` → ids `mentionedIdsFromContent` `ChatConversation.tsx:192-198` |
| Wire | `mentionedUserIds` array ids max 50 `protocol.ts:62-71,100` — **jamais un nom libre** (`:25-26`) |
| Validate serveur | active + même club + `canAccessChatRoom` `notifications.ts:43-67` |
| Double notif | mentionnés exclus des recipients généraux `generalRecipients` filtre `mentionedIds` `:74-88` ; test `notifications.test.ts:103-124` |
| Retry | `duplicate` early return `:102` |

---

## 10. WEB PUSH

```
Permission (pwa-provider) → PushManager.subscribe (VAPID public)
  → POST /api/push/subscribe (session user)
  → push_subscriptions (endpoint_hash UNIQUE, ON DUPLICATE KEY UPDATE user_id)
  → outbox → triggerPushForUser → web-push
  → sw.js push → showNotification
  → notificationclick → navigate data.url
```

| Étape | Preuve |
|-------|--------|
| Permission | `pwa-provider.tsx:183-204` ; refus toast `:188-190` |
| Config public only | `api/push/config/route.ts:4-9` — **pas** de private key |
| VAPID private | `process.env.VAPID_PRIVATE_KEY` only `vapid.ts:17-23` |
| Store | `store.ts:23-52` ; endpoint allowlist `endpoint.ts:1-17` |
| 404/410 | delete endpoint `service.ts:94-96` |
| SW click | `public/sw.js:78-99` ; fallback URL `/club/notifications` `:1,80` |
| Logout purge #344 | `logout/route.ts:11` → `removeAllPushSubscriptionsForUser` `store.ts:73-78` ; test `logout/route.test.ts:58-71` |
| Account switch même browser | logout purge puis resync user B (`pwa-provider.ts:148-151`) ; `ON DUPLICATE KEY UPDATE user_id` réassigne endpoint (`store.ts:36-37`) |
| Background / closed / standalone | SW push indépendant onglet ; offre push si standalone `pwa-provider.tsx:158-160` |
| Legacy wake-up | sans p256dh/auth → POST endpoint sans payload `service.ts:44-51` ; SW fallback fetch latest `sw.js:50-72` |

**Produit :** logout purge **toutes** les subscriptions du user (tous devices) — peut couper le push des autres appareils.

---

## 11. RÉSILIENCE

| Panne | Comportement | Dépendance produit ? |
|-------|--------------|----------------------|
| Socket down | HTTP GET history + pending local ; envoi bloqué jusqu’à reconnect | Non — lecture OK |
| Push down | in-app + email/WA selon prefs ; outbox retry | Non |
| SW absent | app + inbox HTTP fonctionnent | Non |
| DB down | 500 ; pas d’offline queue messages durable client | Oui pour write (attendu) |
| Outbox fail | commande métier déjà commit | Non (issue #208/#276) |

---

## 12. SÉCURITY

| Contrôle | Statut | Preuve |
|----------|--------|--------|
| Ownership notifs | session userId only | `notifications/route.ts:18,76,87` |
| Ownership chat | club + participants / assigned | `policy.ts` + `authorizeRoomForUser` |
| XSS messages | React text nodes + linkify (pas `dangerouslySetInnerHTML`) | `ChatConversation.tsx:154-181,1215` |
| URLs | http(s)/www only ; `noopener noreferrer` | `:122-124,164-169` — **pas** de filtre `javascript:` explicite (regex bornée http/https) |
| Payload length | content ≤4000 ; buffer socket 32KiB | `protocol.ts:34,78` ; `socket-server.ts:220` |
| Rate limits | handshake/actions/messages/typing shared | `socket-rate-limit.ts` |
| Cross-tenant room | blocked + tested | `#346` test |
| Forward attribution | serveur dérive nom ; client id only | `protocol.ts:18-23` ; `service.ts:607-611` |

---

## 13. 16 SCÉNARIOS OBLIGATOIRES

| # | Scénario | Verdict | Preuve |
|---|----------|---------|--------|
| 1 | Private message normal | **Géré** | `notifyChatMessage` DM + socket emit participants `notifications.ts:86-101` ; `socket-server.ts:343-346` |
| 2 | Recipient offline puis reconnect | **Géré** | message en DB ; resume `ChatConversation.tsx:603-606` ; notif/push outbox |
| 3 | Double-clic send | **Géré** | UUID/`clientMessageId` unique + `duplicate` skip notify `service.ts:658-691` ; `notifications.ts:102` |
| 4 | Socket reconnect | **Géré** | resume + pending flush `:590-610` |
| 5 | Two devices | **Géré** (cap 8/pod) | multi-socket rooms ; read broadcast ; **limitation** connectionCounts local pod |
| 6 | Other club conversation | **Géré** | `#346` integration test `socket-server.integration.test.ts:447-478` |
| 7 | Deassigned user | **Géré** | event access assigned-only `#345` `policy.ts:33-35` |
| 8 | Message + mention | **Géré** | dédup mention vs général `notifications.test.ts:103-124` |
| 9 | Planning publish | **Géré** | TX enqueue + post-commit deliver `global-publication.ts:336-432` |
| 10 | Republish no change | **Géré** | `#348` `global-publication.ts:377-381` ; test `:408+` |
| 11 | Assignment change | **Géré** (via republish) | draft silent `assignment-propagation.ts:8-23` ; published → `modified` puis `planning-published-*` |
| 12 | Cancel / report (postpone) | **Géré** | cancel/reschedule kinds `published-planning.ts:512-558` |
| 13 | Mark-all-read | **Géré** | `route.ts:71-78` scoped userId |
| 14 | Push background/closed | **Géré** (code) / **non vérifié device** | `sw.js:11-13,78-99` |
| 15 | Subscription 410 | **Géré** | `push/service.ts:94-96` |
| 16 | Logout then other account | **Géré** | purge `#344` + resubscribe ; endpoint rebind `store.ts:36-37` |
| 17* | Wrong tenant | **Géré** | club checks policy + socket test |

\*Le brief demande 16 ; le 17 « wrong tenant » est couvert par #6/#16 et tests cross-club.

---

## 14. TESTS & OBSERVABILITÉ

### Tests recensés

| Zone | Fichiers |
|------|----------|
| Matrix deep-links | `app/lib/notifications/matrix.test.ts` |
| Outbox idempotence | `outbox.test.ts`, `outbox.integration.test.ts` |
| Notif service | `service.test.ts`, `preferences.test.ts`, `destinations.test.ts` |
| Publication / #348 | `global-publication.test.ts`, `published-planning.test.ts` |
| Chat service/policy | `service.test.ts`, `policy.test.ts`, `notifications.test.ts` |
| Socket #346/#352 | `socket-server.integration.test.ts`, `socket-rate-limit.test.ts`, `socket-security.test.ts` |
| Push / SW / logout #344 | `push/*.test.ts`, `public/sw.test.ts`, `logout/route.test.ts` |
| UI chat | `ChatConversation.*.test.*`, `ChatView` merge tests |
| E2E | `e2e/chat-direct-message.spec.ts` |
| Scrape notifs | `match-sync-notifications.integration.test.ts` |

### Observabilité — « pourquoi pas de notif ? »

| Signal | Contenu | PII ? |
|--------|---------|-------|
| `console.error` enqueue/in-app fail | user **id** numérique + error | faible (id interne) |
| outbox `last_error` | message technique slice 4000 | `outbox.ts:75-86` — peut contenir détails provider |
| outbox status/attempts/idempotency_key | debug delivery | keys sans corps message idéal |
| Push fail log | `Web push delivery failed` | `service.ts:98` — objet error brut |
| Chat notif fail | `[chat] Échec de notification…` | `socket-server.ts:351-353` |

**Lacunes :** pas de correlation id métier exposé aux admins ; pas d’UI « statut livraison » ; logs userId sans clubId systématique ; difficile de tracer prefs/urgency reject sans lire `planning_records` prefs.  
**Verdict :** debug ops **partiel** via outbox SQL ; **insuffisant** self-serve sans PII leakage risk sur `last_error`.

---

## 15. FINDINGS

### P1

**NOTIF-001** — Matrice doc/tests incomplète vs types réels  
- **Observation :** `availability-reviewed`, `assignment-swap-target-*`, `assignment-swap-{status}`, `official_match_*`, `chat-channel-message` (test matrix manquant) hors `docs/notifications-matrix.md` / `matrix.test.ts`.  
- **Impact :** destinations/prefs/urgence non couvertes uniformément ; risque deep-link fallback inbox.  
- **Correction :** étendre matrix + tests deep-link.

**NOTIF-002** — Types `assignment-created`/`assignment-removed` documentés mais **non branchés** en prod  
- **Preuve :** `notifyAssignmentChanges` jamais appelé hors tests.  
- **Impact :** confusion ops ; attentes « notif immédiate post-publish edit » fausses jusqu’à republication.  
- **Statut :** confirmé / **décision produit**.

### P2

**RT-001** — Logout purge **toutes** les push subscriptions du compte (multi-device)  
- **Preuve :** `removeAllPushSubscriptionsForUser` `logout/route.ts:11`.  
- **Impact :** logout téléphone A coupe push tablette B jusqu’à resubscribe.  
- **Décision produit** vs purge endpoint courant only.

**NOTIF-003** — Liste inbox tronquée à 100 (badge COUNT OK)  
- **Preuve :** `route.ts:17-21` vs `:22-26`.  
- **Impact :** vieilles notifs invisibles UI ; badge peut rester >0 sans ligne visible.

**RT-002** — Cap connexions socket 8 **par pod** non partagé  
- **Preuve :** `socket-server.ts:167-168,206-211`.  
- **Impact :** multi-instance → jusqu’à 8×N onglets.

**CHAT-001** — Envoi messages **uniquement** via socket (pas d’API HTTP POST)  
- **Preuve :** `messages/route.ts` GET+PATCH only.  
- **Impact :** clients sans WS ne peuvent pas écrire (lecture OK). Hardening acceptable si documenté.

**NOTIF-004** — Observabilité livraison limitée (cf. §14)

### P3

**RT-003** — Legacy wake-up push sans payload (`sw.js:50-72`)  
**CHAT-002** — Mentions client par `@Nom` exact (homonymes) ; serveur valide id  
**RT-004** — Typing non persisté (by design #267)  
**CHAT-003** — Pas E2E push device réel

### Findings obsolètes (audit précédent)

| Ancien | Statut actuel |
|--------|---------------|
| RT-002 push survit logout | **Corrigé** #344 |
| RT-003 rate limit in-memory only | **Corrigé** #352 DB-shared |
| CHAT-001 event club-wide | **Corrigé** #345 assigned-only |
| RT-001 pas de test cross-club socket | **Corrigé** #346 test |
| CHAT-002 pas badge chat mobile | **Corrigé** `MobileTabBar.tsx:55,64` |
| NOTIF-002 scrape non branché | **Corrigé** `run-scraper.ts:133` |
| Unread badge tronqué 100 | **Faux** — COUNT séparé |

---

## Décisions produit nécessaires

1. Faut-il notifier immédiatement un changement d’affectation sur événement **déjà publié**, ou uniquement à la **republication globale** (état actuel) ?  
2. Conserver / supprimer / brancher `assignment-created` & `assignment-removed` ?  
3. Logout : purger **toutes** les subscriptions device, ou seulement l’endpoint du navigateur courant ?  
4. Salon event annulé : lecture historique autorisée côté planning (`event-access.ts:82-85`) vs chat refuse si non visible (`service.ts:202-204`) — aligner ?

---

## Plan de remédiation

1. **P1** Compléter `docs/notifications-matrix.md` + `matrix.test.ts` (tous types réels).  
2. **P1** Trancher + documenter chemin `assignment-*` vs `planning-published-*`.  
3. **P2** Option logout : `removePushSubscription(endpoint)` vs `removeAll…`.  
4. **P2** Pagination inbox ou « load more » au-delà de 100.  
5. **P2** Corrélation outbox : log `idempotency_key` + status sans body message.  
6. **P3** E2E push smoke (permission mock) ; retirer wake-up legacy quand base resubscribe.

---

## Score détaillé (rappel)

**88/100** — Socle solide (TX enqueue, DB SoT messages, #344/#345/#346/#348/#352 présents et testés). Points retirés : matrice incomplète, dead types assignment, logout multi-device, observabilité, inbox 100.
