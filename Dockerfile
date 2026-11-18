FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS builder
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@10.14.0
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm build

FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=builder --chown=node:node /workspace/apps/web/.next/standalone/ ./
COPY --from=builder --chown=node:node /workspace/packages/server-data/dist/environment.js ./runtime-environment.mjs
COPY --from=builder --chown=node:node /workspace/tools/container-entry.mjs ./container-entry.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "container-entry.mjs"]
