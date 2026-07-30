# Node 22 because that is what the project is developed and tested against;
# Alpine keeps the image small enough that a rebuild is not an event.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependencies. Split from the build so a source change does not re-resolve
# the whole tree.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Build. `prisma generate` has to come first: the app imports from
# `generated/prisma`, so without it `nest build` fails on missing types.
# ---------------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm exec nest build

# ---------------------------------------------------------------------------
# Runtime. Production dependencies only.
#
# The Prisma CLI still lands here despite `--prod`: it is an optional peer of
# `@prisma/client`, and the peer resolution is baked into the lockfile entry.
# That is worth knowing, not worth fighting — but the app never invokes it.
# Migrations are a separate, ordered step; see the `migrate` service in
# docker-compose.prod.yml.
#
# ~570 MB unpacked, most of it Prisma's query engines. Small enough for a
# self-hosted group of nine, and not worth contorting the build over.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated

# The image ships a `node` user; running as root would be gratuitous.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# `enableShutdownHooks()` in main.ts already handles SIGTERM, so a plain stop
# closes the database pool rather than severing it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/src/main"]
