FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/cashier-web/package.json ./apps/cashier-web/

RUN npm ci

COPY apps/cashier-web ./apps/cashier-web

ENV NEXT_PUBLIC_API_BASE_URL=https://adi576-zippmart.hf.space/checkout-api
RUN npm run build -w cashier-web \
  && test -f apps/cashier-web/.next/BUILD_ID \
  && test -d apps/cashier-web/.next/standalone

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7860
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache wget

COPY --from=build /app/apps/cashier-web/.next/standalone ./
COPY --from=build /app/apps/cashier-web/.next/static ./apps/cashier-web/.next/static
COPY deploy/huggingface-cashier/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 7860
CMD ["/start.sh"]
