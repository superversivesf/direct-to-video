# Stage 1: Build client and compile server
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY shared ./shared
COPY client ./client
COPY server ./server
RUN npm ci
RUN npm run build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared
COPY server ./server
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
RUN npm ci --omit=dev
RUN groupadd -r appgroup && useradd -r -g appgroup -d /app -s /sbin/nologin appuser
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data
USER appuser
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/dist/index.js"]