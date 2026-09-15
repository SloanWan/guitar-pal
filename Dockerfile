# ---- deps: install the full dependency tree once, cached on the lockfile ----
FROM node:22-alpine AS deps
WORKDIR /app
# `npm ci` runs the `prepare` script, which is husky; there is no .git here.
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: next build with the public env inlined ----
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are baked into the client bundle at build time, so they
# arrive as build args (docker-compose.yml fills them from the server .env).
# Server-only secrets (ANTHROPIC_API_KEY) are runtime env and never appear here.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: the traced standalone output only ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# server.js serves public/ and .next/static/ itself once they sit next to it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
