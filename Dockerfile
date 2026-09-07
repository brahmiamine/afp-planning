# syntax=docker/dockerfile:1

# Image de base commune (Debian bookworm slim, Node 20 comme la CI)
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

# Dépendances (postinstall : playwright install chromium --with-deps)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Build Next.js
FROM deps AS build
COPY . .
RUN pnpm run build

# Image finale : le serveur custom (server.ts, Socket.IO) tourne via tsx
# sur les sources TypeScript — on conserve donc l'arborescence complète.
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY --from=build /app ./
# Navigateur Chromium installé par le postinstall (cache root du stage deps)
COPY --from=deps /root/.cache/ms-playwright /root/.cache/ms-playwright
# Bibliothèques système requises par Chromium
RUN npx playwright install-deps chromium

EXPOSE 3000

# Ordre de déploiement documenté : build → migrate → start
CMD ["sh", "-c", "pnpm run db:migrate && pnpm run start"]
