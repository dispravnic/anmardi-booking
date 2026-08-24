# ── Stage 1: build Angular app ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Accept build-time API URL (used by environment.prod.ts fallback)
ARG API_BASE_URL=/api
ENV API_BASE_URL=${API_BASE_URL}

COPY package.json ./
RUN npm install --frozen-lockfile

COPY . .
RUN npm run build

# ── Stage 2: Nginx runtime ────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Install envsubst (comes with gettext)
RUN apk add --no-cache gettext

RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx template — uses $BACKEND_URL variable
COPY nginx.conf /etc/nginx/templates/app.conf.template

# Copy built Angular bundles
COPY --from=builder /app/dist/anmardi-booking-frontend/browser /usr/share/nginx/html

# Copy entrypoint that injects runtime env vars into index.html + nginx conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Permissions for nginx user
RUN chown -R nginx:nginx /usr/share/nginx/html \
 && chown -R nginx:nginx /var/cache/nginx       \
 && chown -R nginx:nginx /var/log/nginx          \
 && touch /var/run/nginx.pid                     \
 && chown nginx:nginx /var/run/nginx.pid         \
 && chown nginx:nginx /etc/nginx/conf.d

USER nginx

EXPOSE 80

# Default backend URL (overridden by env var at runtime)
ENV BACKEND_URL=http://backend:3000

CMD ["/docker-entrypoint.sh"]
