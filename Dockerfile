# build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
# No package-lock.json in repo yet — use install until a lockfile is committed.
RUN npm install

COPY . .
RUN npm run build
RUN npm run worker:build

# BullMQ worker: compiled JS + production node_modules (packages left external)
FROM node:20-alpine AS worker

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist/worker ./dist/worker
COPY --from=builder /app/assets ./assets

CMD ["node", "dist/worker/file-upload.worker.js"]

# production stage (Next.js app) — keep last so `docker build .` defaults to app
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Copy assets/fonts (required for Noto TTF PDF generation)
COPY --from=builder /app/assets ./assets

EXPOSE 3100

CMD ["node", "server.js"]
