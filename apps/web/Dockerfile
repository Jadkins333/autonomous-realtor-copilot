FROM node:20-alpine

WORKDIR /workspace

RUN corepack enable
RUN corepack prepare pnpm@9.12.2 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web

WORKDIR /workspace/apps/web
ENV NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=/api/proxy
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start", "--hostname", "0.0.0.0", "--port", "3000"]
