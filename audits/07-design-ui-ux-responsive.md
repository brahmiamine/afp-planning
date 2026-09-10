# Audit 07 — Design, UI/UX et Responsive

**Projet :** AFP Planning  
**Date :** 2026-09-10  
**Méthode :** revue statique composants + CSS ; **Audit statique uniquement — écrans non vérifiés visuellement** (application non démarrée, screenshots Playwright non produits)

---

## Score : **72 / 100**

| Dimension | Poids | Note |
|-----------|------:|-----:|
| Cohérence visuelle | 20 | 75 |
| Responsive | 20 | 68 |
| UX mobile | 20 | 70 |
| Design System | 15 | 78 |
| Accessibilité | 15 | 68 |
| Dark mode / PWA | 10 | 72 |

**Findings :** P0 **0** · P1 **3** · P2 **9** · P3 **7**

---

## Design System existant

### Tokens — `app/globals.css`

- Tailwind v4 `@theme inline` mappe `--background`, `--primary`, `--primary-soft`, `--secondary-soft`, `--destructive`, `--muted`, radius scale.
- Palettes light/dark OKLCH dans `:root` / `.dark`.
- `--primary-soft` / `--secondary-soft` : `color-mix` recalculés via `applyThemeVariables()`.
- **Mobile/PWA :** min-height touch 44px sous 1023px ; safe-area standalone.

### Composants UI (`app/components/ui/**` — 34 fichiers)

**Primitives :** `button`, `input`, `label`, `checkbox`, `switch`, `dialog`, `alert-dialog`, `popover`, `dropdown-menu`, `tabs`, `accordion`, `card`, `badge`, `alert`, `command`, `sonner`.

**Composites métier :** `add-event-dialog`, `export-*-modal`, `club-combobox`, `stade-combobox`, `officiel-combobox`, `contact-list-editor`, `team-logo`.

### Layout (`app/components/layout/**`)

| Composant | Rôle |
|-----------|------|
| `DashboardShell.tsx` | Sidebar desktop 256px + drawer mobile + main `max-w-7xl` |
| `MobileTabBar.tsx` | 4 tabs admin / 5 personal, fixed bottom, safe-area |
| `page-primitives.tsx` | `PageContainer`, `PageHeader`, `SectionCard`, `DataList`, `StatusPill`, `StatCard` |
| `AuthShell.tsx` | Pages login/inscription |
| `Header.tsx` | Header alternatif (legacy scraper actions) |

### Providers

- `theme-provider.tsx` — next-themes
- `app-theme-sync.tsx` — injection couleurs club
- `pwa-provider.tsx` — SW + push
- `auth-provider.tsx` — session client

---

## Inventaire interfaces (45 pages)

| Espace | Pages | Layout | Cohérence |
|--------|------:|--------|-----------|
| Public/auth | 8 | `AuthShell` / landing | ✅ homogène |
| `/club/**` | 24 | `DashboardShell` | ✅ majorité `page-primitives` |
| `/mon-planning/**` | 12 | `DashboardShell` | ✅ |
| `/plateforme` | 1 | custom | ⚠️ style distinct (intentionnel) |

---

## Primitives partagées — duplications

| Route / fichier | Réimplémentation locale | Composant recommandé |
|-----------------|-------------------------|----------------------|
| Certaines pages planning legacy | header custom inline | `PageHeader` |
| `StatusPill` usages ad hoc | classes `emerald-*`/`amber-*` inline | `StatusPill` (`page-primitives.tsx`) |
| KPI dashboard club | parfois cards custom | `StatCard` |
| Landing | CSS module séparé | N/A (marketing) |

**Fichiers avec couleurs Tailwind palette hors tokens :** ~8 fichiers planning/events (badges statut).

---

## Responsive (analyse statique)

**Non testé aux viewports 320–1440px** — analyse code uniquement.

### Patterns positifs

- `DashboardShell` : drawer mobile `w-72`, overlay `bg-black/40`
- `MobileTabBar` : spacer `4.5rem + safe-area` anti-recouvrement
- `globals.css` : touch targets 44px mobile
- Grids planning : souvent `grid-cols-1 md:grid-cols-*`

### Risques overflow identifiés (code)

| ID | Fichier / zone | Cause probable | Viewport |
|----|----------------|----------------|----------|
| UI-001 | `contact-list-editor.tsx` | listes horizontales longues | 320–375 |
| UI-002 | Export modals | `max-w-lg` OK mais tables CSV preview | 320 |
| UI-003 | `MatchShareImage` / share preview | largeurs fixes canvas | mobile |
| UI-004 | Planning tables desktop | tables non `DataList` empilé | <768 |
| UI-005 | Chat composer + MobileTabBar | clavier virtuel non testé | 390 |

---

## DashboardShell et navigation

### Desktop
- Sidebar fixe `w-64`, nav sections avec titres
- Active : `bg-primary-soft` + barre gauche primary
- Logo : `object-contain`, fallback initiales

### Mobile
- Top bar : menu hamburger, brand centré
- Drawer : fermeture overlay + bouton — focus trap Radix ✅
- **Tab bar :** masquée login/inscription/partage

### Différences admin / dirigeant
- Admin : 4 tabs (Événements, Préparation, Chat, Notifs)
- Personal : 5 tabs (+ Profil, Disponib.)
- Badge unread : **notifications only**, pas chat (UI-006)

---

## Listes et tableaux

| Liste | Pattern mobile | Évaluation |
|-------|------------------|------------|
| Événements club | cards responsive | ✅ |
| Planning contrôle | mix cards/table | ⚠️ UI-004 |
| Utilisateurs | DataList | ✅ |
| Archives | DataList testé | ✅ |
| Notifications | liste empilée | ✅ |
| Indisponibilités | liste + review | ✅ |

---

## Planning (UI)

- `EventCard`, `EventWorkspaceView` — drag-drop dnd-kit
- Badges rôles manquants : `liveRoleStatus` lié feature flags publication
- Lisibilité équipes : `TeamMatchup`, logos `team-logo.tsx`
- **Mobile :** cartes empilées sur dashboard ; workspace event dense — **non vérifié visuellement**

---

## Chat (UI)

- `ChatView` + `ChatConversation`
- Composer fixe bas ; scroll messages
- Typing, reply, forward — composants testés unitairement
- **Risques mobile :** clavier, long URLs, tab bar — **non vérifié**

---

## Formulaires

- Inputs Radix + labels
- Comboboxes : cmdk — touch OK desktop ; mobile keyboard type non audité live
- Color pickers config : defaults `#1f2937` hardcodés (`PersonnalisationTab.tsx`) — UI-007
- Date/time : inputs natifs

---

## Dialogs / Drawers

- Radix Dialog : `max-h-[90vh]`, scroll interne sur export modals
- `alert-dialog` suppressions
- **Non testé** 320px viewport overflow

---

## Dark mode

- `ThemeToggle` dans shell footer + mobile top bar
- Tokens dark définis globals.css
- Exceptions hardcodées :
  - `landing.module.css` — light only marketing
  - `MatchShareImage` — dark gradient fixe
  - `StatusPill` emerald/amber — lisibles dark mais hors tokens

---

## Accessibilité (statique)

| Critère | Statut |
|---------|--------|
| Focus visible | Radix defaults + tailwind ring |
| Labels formulaires | majorité `Label` associé |
| Icon-only buttons | ⚠️ certains sans `aria-label` (UI-008) |
| Heading hierarchy | ⚠️ variable selon pages |
| Contraste primary club | dépend couleurs club — **non mesuré** |
| Touch 44px | globals.css rule ✅ |

---

## PWA

- Standalone : safe-area padding globals + MobileTabBar
- SW enregistré `pwa-provider.tsx`
- Fixed headers/footers : shell + tab bar
- Orientation : non contraint

---

## Findings

### P1

**UI-001** — Tables planning possible scroll horizontal mobile  
Route : `/club/planning/controle`. Impact : UX mobile dégradée.

**UI-002** — Badge unread chat absent navigation mobile  
Fichier : `MobileTabBar.tsx` — seulement notifications. Impact : messages manqués.

**UI-003** — Contraste couleurs club arbitraires non validé  
Fichier : `applyThemeVariables`. Impact : accessibilité variable — **à vérifier dynamiquement**.

### P2 (sélection)

- UI-004 : Couleurs statut hors tokens (`emerald`, `amber`)
- UI-005 : Landing non dark-compatible
- UI-006 : Drawer z-index vs toasts Sonner — rare conflit
- UI-007 : Export share image couleurs fixes
- UI-008 : Boutons icon-only sans aria-label (Header scraper)
- UI-009 : Plateforme UI style disjoint du club shell
- UI-010 : Longues listes configuration sans virtualisation
- UI-011 : `truncate` sur noms équipes — info perdue mobile
- UI-012 : Event workspace dense — scroll interne multiple

### P3

- Cosmétique alignement padding entre pages similaires
- Logo ratio variable selon upload club
- Font Geist — OK cohérent

---

## Sections audit viewport

### Audit Mobile (320–430px) — statique
- Touch targets rule présente ✅
- Tab bar spacer ✅
- Risques : tables, chat keyboard, modals — **non vérifié**

### Audit Tablette (768–1024px) — statique
- Breakpoint `lg:` bascule sidebar ✅
- Planning grids 2-col possibles — non vérifié

### Audit Desktop (1280+) — statique
- `max-w-7xl` main ✅
- Sidebar 256px ✅

### Incohérences Design System
- Status colors palette vs tokens
- Landing vs app tokens
- Plateforme vs club branding

---

## Causes racines

1. Croissance organique — certaines pages pré-datent `page-primitives`
2. Exports canvas/share — contraintes non-theme
3. Absence tests visuels Playwright responsive en CI

---

## Plan de remédiation

1. Playwright visual regression viewports clés (320, 390, 768, 1280)
2. Migrer badges statut vers tokens sémantiques
3. Badge unread chat MobileTabBar
4. Audit contraste automatisé (axe) sur 3 couleurs club sample
5. Remplacer tables planning mobile par DataList/cards

---

## Preuves / assets

**Aucun screenshot produit** — environnement audit sans app running.  
Dossiers prévus : `/audits/assets/design/{desktop,tablet,mobile}/` — vides.

---

## 10 problèmes UI/UX majeurs

1. Tables planning non mobile-first
2. Pas badge chat mobile nav
3. Contraste club dynamique non validé
4. Couleurs statut hors Design System
5. Chat mobile + clavier non testé
6. Share image couleurs hardcodées
7. Landing dark mode absent
8. aria-label manquants icon buttons
8. Event workspace dense mobile
9. Plateforme UI disjointe
10. Pas tests visuels CI

### Problèmes mobile spécifiques (top 5)

1. Scroll horizontal tables planning
2. Tab bar masque contenu sans spacer sur pages custom
3. Modals export — non vérifiés 320px
4. Truncate noms match
5. Clavier chat non testé
