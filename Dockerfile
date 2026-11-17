# Frontend image for the AWS pipeline (.github/workflows/deploy-aws.yml).
# Builds the TanStack Start app for a plain Node server instead of Vercel.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN sed -i 's/preset: "vercel"/preset: "node-server"/' vite.config.ts \
 && node scripts/with-app-env.mjs vite build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
