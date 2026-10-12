FROM node:25-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:25-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 DATA_DIR=/app/.data
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/.data && chown app:app /app/.data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
