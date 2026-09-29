FROM node:24.17.0-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig*.json ./
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24.17.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir 'yt-dlp[default]==2026.8.19' \
    && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/yt-dlp/bin:${PATH}"
USER node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
CMD ["node", "apps/bot/dist/index.js"]
