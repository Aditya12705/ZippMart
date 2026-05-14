FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api/package.json ./services/api/
COPY apps/customer-web/package.json ./apps/customer-web/
COPY apps/admin-web/package.json ./apps/admin-web/
COPY apps/cashier-web/package.json ./apps/cashier-web/

RUN npm ci

COPY packages/shared ./packages/shared
COPY services/api ./services/api
COPY apps/customer-web ./apps/customer-web
COPY apps/admin-web ./apps/admin-web
COPY apps/cashier-web ./apps/cashier-web

RUN npm run build -w @checkout/shared && npm run build -w api

ENV API_PROXY_TARGET=http://127.0.0.1:4000
ENV NEXT_PUBLIC_API_BASE_URL=/checkout-api

RUN npm run build -w customer-web
RUN npm run build -w admin-web
ENV NEXT_BASE_PATH=/cashier
RUN npm run build -w cashier-web

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN apk add --no-cache wget nginx

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/services/api/dist ./services/api/dist
COPY --from=build /app/services/api/package.json ./services/api/
COPY --from=build /app/apps/customer-web/.next ./apps/customer-web/.next
COPY --from=build /app/apps/customer-web/package.json ./apps/customer-web/
COPY --from=build /app/apps/admin-web/.next ./apps/admin-web/.next
COPY --from=build /app/apps/admin-web/package.json ./apps/admin-web/
COPY --from=build /app/apps/cashier-web/.next ./apps/cashier-web/.next
COPY --from=build /app/apps/cashier-web/package.json ./apps/cashier-web/
COPY deploy/huggingface/nginx.conf /etc/nginx/nginx.conf
COPY deploy/huggingface/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 7860
CMD ["/start.sh"]
