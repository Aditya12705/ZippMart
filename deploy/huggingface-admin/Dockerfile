FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/admin-web/package.json ./apps/admin-web/

RUN npm ci

COPY apps/admin-web ./apps/admin-web

ENV NEXT_PUBLIC_API_BASE_URL=https://adi576-proflo.hf.space/checkout-api
RUN npm run build -w admin-web \
  && test -f apps/admin-web/.next/BUILD_ID \
  && test -d apps/admin-web/.next/standalone

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7860
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/admin-web/.next/standalone ./
COPY --from=build /app/apps/admin-web/.next/static ./apps/admin-web/.next/static

EXPOSE 7860
CMD ["node", "apps/admin-web/server.js"]
