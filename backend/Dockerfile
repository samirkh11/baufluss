# Meisterwerk backend (NestJS + Prisma). Built once, runs anywhere Docker runs (Synology, cloud server ...).
FROM node:22-bookworm-slim

# Prisma needs OpenSSL; curl is used by the health check; tini reaps zombies and forwards signals.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# devDependencies stay installed on purpose: the Prisma CLI (migrations) lives there.
RUN npm ci --include=dev && npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY assets ./assets
RUN npx nest build

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/storage /app/uploads

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 CMD curl -fs http://localhost:3000/api/docs-json > /dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
