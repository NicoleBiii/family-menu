FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY scripts/migrate.mjs ./scripts/migrate.mjs
COPY db/migrations ./db/migrations
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
