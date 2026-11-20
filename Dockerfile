# Đảo Đèn Lồng v1.0.0 — Production Container
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173
COPY --from=builder /app/game.contract.json ./
COPY --from=builder /app/dist ./dist
EXPOSE 4173
CMD ["node", "dist/run.js"]
