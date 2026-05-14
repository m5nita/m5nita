FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
WORKDIR /app
# Only the web slice of the workspace — skip apps/api/ so the API's heavy
# native deps (satori, @resvg/resvg-js) don't get pulled into the web build.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false --filter @m5nita/web...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
ARG VITE_API_URL
ARG SOURCE_COMMIT=unknown
ENV VITE_COMMIT_HASH=${SOURCE_COMMIT}
# Cap memory so vite/esbuild won't compete with sibling builds on the host.
ENV NODE_OPTIONS=--max-old-space-size=1024
RUN cd apps/web && npx vite build

FROM nginx:alpine AS runner
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# OG_BACKEND is the internal URL of the API used to serve social-crawler previews.
# Set it at runtime (e.g., http://api:3001) so crawlers hitting /invite/:code or
# /pools/:id get pool-specific OG tags. Leave empty to disable dynamic previews.
ENV OG_BACKEND=""
EXPOSE 80
