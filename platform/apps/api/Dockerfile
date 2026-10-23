# تصویر تولید API — بیلد چندمرحله‌ای در بستر monorepo (نیازمند @farm/domain)
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
RUN npm ci --no-audit --no-fund
COPY packages/domain packages/domain
RUN npm run build -w @farm/domain
COPY apps/api apps/api
RUN npm run build -w @farm/api

FROM node:22-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /repo/packages/domain/dist ./packages/domain/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
