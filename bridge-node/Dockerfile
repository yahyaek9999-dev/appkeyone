# KEYONE WhatsApp Bridge — whatsapp-web.js transport, containerized.
# Runs the SAME engine that pairs successfully (real WhatsApp Web via Chromium).
# Runs anywhere Docker runs → a genuinely cross-platform, verifiable artifact.
FROM node:20-bookworm-slim

# Chromium + the fonts/libs whatsapp-web.js needs to render WhatsApp Web headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation fonts-noto-color-emoji \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgtk-3-0 \
      libasound2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
 && rm -rf /var/lib/apt/lists/*

# Use the OS Chromium (no puppeteer download); state lives in a mounted volume.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    KEYONE_CHROME=/usr/bin/chromium \
    KEYONE_BRIDGE_HOME=/data \
    NODE_ENV=production

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY keyone-wa-bridge.js ./

VOLUME /data
# `docker run … login` once to link, then default `start`.
ENTRYPOINT ["node", "keyone-wa-bridge.js"]
CMD ["start"]
