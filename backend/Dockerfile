# Smart Invoicing backend — production image (Render).
# LibreOffice (Writer only, no GUI) makes exact PDFs of every invoice template.
# Carlito/Liberation are metric-compatible with Calibri/Arial, so Word layouts keep their spacing.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer-nogui fonts-crosextra-carlito fonts-liberation fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production \
    PDF_ENGINE=auto \
    STORAGE_DRIVER=supabase \
    HOME=/tmp
EXPOSE 4000
CMD ["node", "src/index.js"]
