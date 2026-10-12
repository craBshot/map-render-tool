FROM node:22-alpine AS build
# git: vite.config.ts reads the commit hash for the Sidebar's build info (.git is part of the context for this).
RUN apk add --no-cache git
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS final
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# The area-db worker has zero npm dependencies (see worker/README-less rationale
# in CLAUDE.md/the plan history) — it runs its plain TypeScript directly via
# Node's native type-stripping, no npm ci, no build step, no ts-node/tsx.
FROM node:22-alpine AS worker
WORKDIR /app
COPY package.json ./
COPY src/map ./src/map
COPY src/state/areaCandidateTypeSettings.ts ./src/state/areaCandidateTypeSettings.ts
COPY worker ./worker
EXPOSE 8081
CMD ["node", "--experimental-strip-types", "worker/index.ts"]
