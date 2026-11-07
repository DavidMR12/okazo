# ---- construction ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
# Modèle de la recherche par image, embarqué dans l'image : le serveur n'a rien à télécharger
RUN MODEL_CACHE_DIR=/app/.models DATABASE_URL=postgres://x:x@x/x REDIS_URL=redis://x JWT_ACCESS_SECRET=build-only-0123456789abcdef0123456789 OTP_SECRET=build-only-0123456789abcdef0123456789 S3_ENDPOINT=http://x S3_BUCKET=x S3_ACCESS_KEY_ID=x S3_SECRET_ACCESS_KEY=x MEDIA_PUBLIC_BASE_URL=http://x NODE_ENV=development node dist/media/index-photos.js --model

# ---- exécution ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production MODEL_CACHE_DIR=/app/.models
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/.models ./.models
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
