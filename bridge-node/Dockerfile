# KEYONE WhatsApp Bridge — whatsapp-web.js transport, containerized.
# Runs the SAME engine that pairs successfully (real WhatsApp Web via Chromium).
# Runs anywhere Docker runs → a genuinely cross-platform, verifiable artifact.
FROM node:20-bookworm-slim

# The shared libraries the (puppeteer-matched) Chromium needs to render WhatsApp
# Web headless. We do NOT install the OS `chromium` package — a mismatched
# Chromium build makes wwebjs authenticate but never reach `ready` (pairing hangs).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation fonts-noto-color-emoji \
      libnss3 libnspr4 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgtk-3-0 \
      libasound2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libpango-1.0-0 libcairo2 libatspi2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Bake in the puppeteer-MATCHED Chromium (the exact build production pairs with);
# state lives in a mounted volume.
ENV PUPPETEER_CACHE_DIR=/opt/keyone-chromium \
    KEYONE_BRIDGE_HOME=/data \
    NODE_ENV=production

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
# Download the matched Chromium into the image (puppeteer's own pinned installer).
RUN node /app/node_modules/puppeteer/install.mjs
COPY keyone-wa-bridge.js ./

VOLUME /data
# `docker run … login` once to link, then default `start`.
ENTRYPOINT ["node", "keyone-wa-bridge.js"]
CMD ["start"]
