# --- Base deps stage ---
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- Build stage ---
FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src

RUN npm run build && npm prune --omit=dev

# --- Production runtime image ---
FROM node:24-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY tsconfig*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
CMD ["node", "dist/index.js"]
