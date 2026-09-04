# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=kokoro-nova-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS builder

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Keep the runtime layer independent from the development toolchain while
# retaining the exact lockfile-resolved dependency tree used during build.
RUN pnpm prune --prod

FROM base AS runner

ARG VERSION=dev
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Kokoro Nova" \
      org.opencontainers.image.description="Local-first AI video creation workspace" \
      org.opencontainers.image.source="https://github.com/LordFoxFairy/kokoro-nova" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

# ffmpeg is part of the product surface: the local provider can render video
# fixtures and the compositor can export a real MP4 inside the image.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_DIST_DIR=.next-prod \
    PORT=3200 \
    HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next-prod ./.next-prod
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/next.config.mjs ./next.config.mjs

# The file-backed store and generated media are intentionally persisted here.
RUN mkdir -p /app/.data && chown -R node:node /app/.data
VOLUME ["/app/.data"]

USER node
EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3200) + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node_modules/.bin/next", "start"]
