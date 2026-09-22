FROM node:20-bookworm-slim AS build

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web-verificador/package.json apps/web-verificador/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/stellar-client/package.json packages/stellar-client/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web-verificador apps/web-verificador
COPY packages packages

RUN pnpm --filter web-verificador run build

FROM nginx:1.27-alpine AS runtime

COPY infra/docker/nginx/static-site.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web-verificador/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]