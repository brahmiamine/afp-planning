# Audit 05 — Notifications, Chat et Temps Réel

**Projet :** AFP Planning  
**Date :** 2026-09-10  
**Méthode :** revue statique ; tests unitaires recoupés ; **non vérifié dynamiquement** (Socket.IO live, push device)

---

## Score : **81 / 100**

| Dimension | Note |
|-----------|------|
| Notifications métier | 85 |
| Destinataires | 82 |
| Chat / messages | 80 |
| Socket.IO | 78 |
| Sécurité multi-tenant | 83 |
| Unread | 72 |
| Web Push / PWA | 80 |
| Résilience / tests | 75 |

**Findings :** P0 **0** · P1 **2** · P2 **6** · P3 **4**

---

## Architecture

| Fichier | Domaine | Responsabilité |
|---------|---------|----------------|
| `app/lib/notifications/service.ts` | Notifications | enqueue in-app + outbox |
| `app/lib/notifications/outbox.ts` | Delivery | push/email/WhatsApp retry |
| `app/lib/notifications/preferences.ts` | Prefs | canaux, urgence, eventTypes |
| `app/lib/notifications/destinations.ts` | Deep-links | href par type |
| `app/lib/chat/socket-server.ts` | Socket.IO | auth, rooms, events |
| `app/lib/chat/service.ts` | Chat DB | messages chiffrés, read state |
| `app/lib/chat/policy.ts` | Autorisation | `canAccessChatRoom` |
| `app/lib/chat/notifications.ts` | Chat→notif | DM, event, mention |
| `app/lib/push/service.ts` | Web Push | VAPID, triggerPushForUser |
| `public/sw.js` | PWA | push + notificationclick |
| `app/api/notifications/route.ts` | HTTP | list + mark read |
| `app/hooks/useUnreadNotificationsCount.ts` | UI badge | poll + event |

---

## Matrice événements → destinataires

Source canonique : `docs/notifications-matrix.md` (22 types, test `matrix.test.ts`).

| Catégorie | Types clés | In-app | Push | Route cible |
|-----------|------------|:------:|:----:|-------------|
| Publication | `planning-published-*` (5) | ✅ | ✅* | espace événement |
| Affectations | `assignment-*` (6) | ✅ | ✅* | espace événement |
| Dispo | `availability-*` (3) | ✅ | ✅* | inbox |
| Chat | `chat-dm`, `chat-event-message`, `chat-mention`, `chat-channel-message` | ✅ | ✅* | `/club/chat?roomId=` |
| Swaps | `assignment-swap-*` (3) | ✅ | ✅* | espace événement |

\*Selon préférences utilisateur et urgence (`preferences.ts`).

**Ordre garanti :** écriture DB notification **dans** transaction métier ; delivery outbox **après** commit (`deliverEnqueuedNotifications`).

---

## Publication et notifications

| Question | Réponse prouvée |
|----------|-----------------|
| Affectation en draft notifie ? | Non — sauf `assignment-created` si hors publication (`assignment-contacts.ts`) |
| Publication notifie ? | Oui — diff par user (`computePerUserPublicationChanges`) |
| Republication sans changement | Diff vide → peu de notifications |
| Doublon multi-match | Idempotency key outbox par `(userId, type, eventKey, …)` |

---

## Chat

### Types de conversations

| Type | `ChatRoomKind` | Création | Visibilité |
|------|----------------|----------|------------|
| Direct | `direct` | `POST /api/chat/direct` | participants only |
| Événement | `event` | auto / `POST /api/chat/events` | **tout le club** si event visible |
| Canal | `channel` | admin `POST /api/chat/channels` | participants |

### Source de vérité messages
- **DB** `chat_messages` (contenu chiffré) — source primaire.
- Socket = transport ; reconnexion → `chat:resume` refetch.

### Cas limites

| Cas | Comportement |
|-----|--------------|
| Participant désaffecté | Accès salon **event** conservé (club-wide) — **Décision produit** |
| User retiré club | session invalidée ; accès perdu |
| Match archivé | `isCurrentEventVisible` peut bloquer |
| Autre tenant | `canAccessChatRoom` → false |

---

## Socket.IO

### Connexion
- Cookie `session_token` → `getSessionUser` (`socket-server.ts:277-288`)
- Origin allowlist ; rate limit handshake

### Rooms

| Room | Join | Emit autorisé |
|------|------|---------------|
| `chat:club:{clubId}:user:{userId}` | auto connect | server push |
| `chat:club:{clubId}` | auto connect | `chat:room-touched` only |
| `chat:room:{roomId}` | après `chat:resume` validé | messages si participant/event policy |

### Scénario critique cross-tenant
**User Club A → room Club B :** bloqué par `authorizeRoomForUser` / `assertRoomAccess`.  
**Gap test :** pas de test explicite socket `chat:send` foreign roomId (RT-001 / SEC-006).

---

## Unread

| Domaine | Source vérité | API |
|---------|---------------|-----|
| Notifications | `notifications.readAt IS NULL` | `GET /api/notifications` `{ unread }` |
| Chat room | `sequence > lastReadSequence` | `listRooms().unreadCount` |

**Limites :**
- NOTIF-001 : unread compté sur `take: 100` seulement
- Pas de badge chat global dans `MobileTabBar` — seulement par room dans `ChatView`

---

## Web Push

| Étape | Fichier |
|-------|---------|
| Permission | `pwa-provider.tsx` |
| Subscribe | `POST /api/push/subscribe` → `push_subscriptions` |
| Envoi | `triggerPushForUser` |
| SW click | `notificationclick` → `data.url` |
| Expiration 410 | endpoint supprimé auto |

**Risques :**
- RT-002 : logout ne purge pas subscriptions (push possible compte suivant même browser)
- Clé privée VAPID : serveur only ✅

---

## Résilience

| Panne | Comportement |
|-------|--------------|
| Socket down | HTTP messages API disponible |
| Push down | in-app + email selon prefs |
| SW absent | app fonctionne sans push |
| DB temporaire | erreurs 500 ; pas de queue client offline messages |

---

## Findings

### P1

**NOTIF-001** — Compteur unread tronqué à 100 dernières  
Preuve : `notifications/route.ts` — `take: 100`. Impact : badge sous-estimé.

**RT-001** — Pas de test Socket cross-club explicite  
Preuve : HTTP testé (`service.test.ts:207`) ; socket foreign room non. Impact : régression possible.

### P2

| ID | Observation |
|----|-------------|
| CHAT-001 | Salon event ouvert à tout le club — désaffecté garde accès |
| RT-002 | Push subscriptions survivent au logout |
| NOTIF-002 | Notifications scrape sync non branchées |
| RT-003 | Rate limits socket in-memory (multi-instance) |
| CHAT-002 | Pas de badge unread chat dans navigation mobile |
| NOTIF-003 | Mention + message event : dédup OK (`notifications.test.ts`) mais complexité |

### P3

- RT-004 : Typing indicators sans persistence
- NOTIF-004 : WhatsApp channel optionnel peu testé E2E
- CHAT-003 : Pagination messages fixe
- RT-005 : Legacy wake-up push sans payload

---

## Tests recensés

| Zone | Fichiers |
|------|----------|
| Matrix types | `matrix.test.ts` |
| Outbox idempotency | `outbox.integration.test.ts` |
| Chat service | `service.test.ts`, `policy.test.ts` |
| Socket integration | `socket-server.integration.test.ts` |
| Push | `push/service.test.ts`, `sw.test.ts` |
| E2E chat | `e2e/chat-direct-message.spec.ts` |

---

## Décisions produit

1. Accès chat événement : club entier vs affectés ?
2. Purger push au logout ?
3. Badge chat global mobile ?

---

## Plan de remédiation

1. Test socket cross-tenant explicite
2. Fix unread count (COUNT query ou pagination)
3. Purge push subscriptions logout
4. Brancher notifications scrape
5. Documenter politique salon event

---

## 10 problèmes majeurs

1. Unread notifications limité 100
2. Test socket cross-club manquant
3. Chat event post-désaffectation
4. Push post-logout
5. Pas badge chat nav
6. Notifications scrape absentes
7. Rate limit socket mono-instance
8. Wake-up push legacy
9. Complexité mention/event dedup
10. Pas E2E push réel
