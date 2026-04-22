FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false

FROM base AS runner
# curl is used by the Coolify healthcheck inside the container
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
COPY tsconfig.json ./
ARG SOURCE_COMMIT=unknown
ENV SENTRY_RELEASE=${SOURCE_COMMIT}
ENV NODE_ENV=production
EXPOSE 3001
CMD ["./apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
