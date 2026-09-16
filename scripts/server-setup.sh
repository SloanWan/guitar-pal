#!/usr/bin/env bash
#
# One-time bootstrap for the Tencent Cloud HK VPS (Ubuntu 22.04/24.04).
#
# Run as the non-root `ubuntu` user (it uses sudo where needed):
#   git clone https://github.com/SloanWan/guitar-pal.git ~/dev/guitar-pal
#   cd ~/dev/guitar-pal && bash scripts/server-setup.sh
#
# Prerequisites, before running:
#   - DNS A record for $DOMAIN pointing at this server (certbot validates it)
#   - Tencent Cloud security group allows inbound 22, 80, 443
#   - ~/dev/guitar-pal/.env written (see README → Deployment)
#
# Safe to re-run: every step checks whether it has already been applied.

set -euo pipefail

DOMAIN="${DOMAIN:-guitarpal.sloanwan.com}"
EMAIL="${EMAIL:-nysuswan@gmail.com}"   # Let's Encrypt expiry notices
APP_DIR="${APP_DIR:-$HOME/dev/guitar-pal}"
SWAP_SIZE="${SWAP_SIZE:-2G}"           # next build OOMs on a 2 GB box without it

log() { printf '\n==> %s\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then
	echo "Run this as the ubuntu user, not root." >&2
	exit 1
fi

# ---------------------------------------------------------------- 1. swap
log "Swap ($SWAP_SIZE)"
if ! sudo swapon --show | grep -q '^/swapfile'; then
	sudo fallocate -l "$SWAP_SIZE" /swapfile
	sudo chmod 600 /swapfile
	sudo mkswap /swapfile
	sudo swapon /swapfile
	grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
	echo "already active"
fi

# ---------------------------------------------------------------- 2. packages
log "Base packages"
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg git nginx certbot python3-certbot-nginx

# ---------------------------------------------------------------- 3. docker
log "Docker Engine + compose plugin"
if ! command -v docker >/dev/null; then
	sudo install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
	sudo chmod a+r /etc/apt/keyrings/docker.gpg
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
		| sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
	sudo apt-get update -qq
	sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
else
	echo "already installed: $(docker --version)"
fi
sudo systemctl enable --now docker
if ! id -nG "$USER" | grep -qw docker; then
	sudo usermod -aG docker "$USER"
	NEEDS_RELOGIN=1
fi

# ---------------------------------------------------------------- 4. nginx
# Written before certbot so the --nginx plugin has a server block to extend.
log "Nginx site for $DOMAIN"
sudo tee /etc/nginx/conf.d/guitar-pal-ratelimit.conf >/dev/null <<'NGINX'
# Per client IP, 10 MB of state (~160k addresses). Applied to page/API
# requests only; hashed static assets are exempt (a page load fetches dozens).
limit_req_zone $binary_remote_addr zone=guitar_pal:10m rate=10r/s;
NGINX

sudo tee /etc/nginx/sites-available/guitar-pal >/dev/null <<NGINX
server {
	listen 80;
	listen [::]:80;
	server_name $DOMAIN;

	client_max_body_size 1m;

	# Content-hashed assets: no rate limit. Next already sends them with
	# Cache-Control: public, max-age=31536000, immutable.
	location /_next/static/ {
		proxy_pass http://127.0.0.1:3000;
		proxy_set_header Host \$host;
	}

	location / {
		limit_req zone=guitar_pal burst=30 nodelay;

		proxy_pass http://127.0.0.1:3000;
		proxy_http_version 1.1;
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;

		# App Router streams Suspense boundaries; buffering would hold them back.
		proxy_buffering off;
		proxy_read_timeout 60s;
	}
}
NGINX
sudo ln -sf /etc/nginx/sites-available/guitar-pal /etc/nginx/sites-enabled/guitar-pal
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

# ---------------------------------------------------------------- 5. tls
# The nginx plugin answers the HTTP-01 challenge through the running server,
# adds the 443 block + HTTP→HTTPS redirect, and renews via certbot.timer
# (installed by the apt package) — no custom cron, and nothing has to stop
# nginx to free port 80.
log "TLS certificate"
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
	echo "already issued"
else
	sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
fi
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run

# ---------------------------------------------------------------- 6. done
log "Done"
cat <<MSG
Next:
  1. ${NEEDS_RELOGIN:+Log out and back in so the docker group applies, then }
     cd $APP_DIR && docker compose up --build -d
  2. Open https://$DOMAIN
  3. Add the deploy key + GitHub secrets from README → Deployment
MSG
