FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/ledger-client ./packages/ledger-client
COPY services/party-provisioner ./services/party-provisioner
RUN npm install -g pnpm && pnpm install --filter @meridian/party-provisioner...
WORKDIR /app/packages/shared-types && pnpm build
WORKDIR /app/packages/ledger-client && pnpm build
WORKDIR /app/services/party-provisioner && pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/party-provisioner/dist ./dist
COPY --from=builder /app/services/party-provisioner/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV PROVISIONER_PORT=8091
ENV PROVISIONER_DATA_DIR=/data
EXPOSE 8091
CMD ["node", "dist/index.js"]
