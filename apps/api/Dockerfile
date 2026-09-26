FROM node:20-bookworm-slim AS base

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.25.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/stellar-client/package.json packages/stellar-client/package.json

RUN pnpm install --frozen-lockfile

FROM base AS build

COPY apps/api apps/api
COPY packages packages

RUN pnpm --filter api run prisma:generate
RUN pnpm --filter api run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.25.0 --activate

ENV NODE_ENV=production

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/package.json apps/api/package.json
COPY --from=build /workspace/apps/api/node_modules apps/api/node_modules
COPY --from=build /workspace/apps/api/prisma apps/api/prisma
COPY --from=build /workspace/apps/api/dist apps/api/dist

WORKDIR /workspace/apps/api

EXPOSE 4000

CMD ["node", "dist/index.js"]