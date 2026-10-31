FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/client/package.json apps/client/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile --network-concurrency 8

FROM dependencies AS build
COPY . .
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
RUN bun run build && bun run typecheck

FROM dependencies AS production-dependencies
RUN rm -rf node_modules apps/web/node_modules apps/client/node_modules packages/shared/node_modules && bun install --production --frozen-lockfile --ignore-scripts --network-concurrency 8

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS runtime
WORKDIR /app
ARG ETS2_REVISION=development
LABEL org.opencontainers.image.source="https://github.com/kylescudder/cabmate" \
      org.opencontainers.image.revision="${ETS2_REVISION}"
ENV NODE_ENV=production PORT=3000 ETS2_REVISION=${ETS2_REVISION}
COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=bun:bun /app/apps/web/drizzle ./apps/web/drizzle
COPY --chown=bun:bun apps/web/server ./apps/web/server
COPY --chown=bun:bun apps/web/package.json ./apps/web/package.json
COPY --chown=bun:bun packages/shared ./packages/shared
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=10s --start-period=20s --retries=3 CMD ["bun", "apps/web/server/healthcheck.ts"]
CMD ["bun", "apps/web/server/index.ts"]
