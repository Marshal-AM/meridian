FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY services/kyb-gateway ./services/kyb-gateway
RUN npm install -g pnpm && pnpm install --filter @meridian/kyb-gateway...
WORKDIR /app/services/kyb-gateway
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/kyb-gateway/dist ./dist
COPY --from=builder /app/services/kyb-gateway/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV KYB_GATEWAY_PORT=8090
ENV KYB_DATA_DIR=/data
EXPOSE 8090
CMD ["node", "dist/index.js"]
