FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api/package.json ./services/api/
RUN npm ci
COPY packages/shared ./packages/shared
COPY services/api ./services/api
RUN npm run build --workspace=api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/services/api/dist ./services/api/dist
COPY --from=build /app/services/api/package.json ./services/api/
WORKDIR /app/services/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
