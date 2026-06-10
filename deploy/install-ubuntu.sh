#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vpn-service}"
PYTHON_BIN="${PYTHON_BIN:-python3.12}"
SERVICE_NAME="${SERVICE_NAME:-vpn-bot}"
WEBAPP_NGINX_SITE="${WEBAPP_NGINX_SITE:-vpn-webapp}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/install-ubuntu.sh"
  exit 1
fi

echo "[1/8] Installing OS packages..."
apt-get update
apt-get install -y \
  git \
  curl \
  ca-certificates \
  nginx \
  certbot \
  python3-certbot-nginx \
  sqlite3 \
  python3-venv \
  python3-pip

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "WARNING: $PYTHON_BIN not found."
  echo "Install Python 3.12 first, then rerun:"
  echo "  sudo apt install -y python3.12 python3.12-venv"
  echo "or use PYTHON_BIN=python3 if your system Python is supported."
  exit 1
fi

echo "[2/8] Checking app directory..."
if [[ ! -d "$APP_DIR" ]]; then
  echo "App directory does not exist: $APP_DIR"
  echo "Clone the repo first, for example:"
  echo "  sudo git clone https://github.com/Gabriel329-bot/awg-seldfhosted-bot.git $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

echo "[3/8] Creating runtime directories..."
install -o root -g root -m 0700 -d "$APP_DIR/data" "$APP_DIR/logs"

echo "[4/8] Creating Python virtualenv..."
if [[ ! -d "$APP_DIR/.venv" ]]; then
  "$PYTHON_BIN" -m venv "$APP_DIR/.venv"
fi

"$APP_DIR/.venv/bin/pip" install --upgrade pip
"$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements.txt" -c "$APP_DIR/constraints.txt"

echo "[5/8] Preparing .env..."
if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "Created $APP_DIR/.env from .env.example"
  echo "IMPORTANT: edit it before starting production:"
  echo "  sudo nano $APP_DIR/.env"
else
  chmod 600 "$APP_DIR/.env"
  echo ".env already exists, keeping it."
fi

echo "[6/8] Installing systemd service..."
cp "$APP_DIR/deploy/vpn-bot.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo "[7/8] Installing nginx WebApp example config..."
if [[ -f "$APP_DIR/deploy/nginx-webapp.example.conf" ]]; then
  cp "$APP_DIR/deploy/nginx-webapp.example.conf" "/etc/nginx/sites-available/${WEBAPP_NGINX_SITE}"
  ln -sf "/etc/nginx/sites-available/${WEBAPP_NGINX_SITE}" "/etc/nginx/sites-enabled/${WEBAPP_NGINX_SITE}"
  nginx -t
  systemctl reload nginx || systemctl restart nginx
  echo "Installed nginx example config: /etc/nginx/sites-enabled/${WEBAPP_NGINX_SITE}"
  echo "IMPORTANT: edit domain/cert paths before production:"
  echo "  sudo nano /etc/nginx/sites-enabled/${WEBAPP_NGINX_SITE}"
else
  echo "nginx example config not found, skipping."
fi

echo "[8/8] Running syntax check..."
"$APP_DIR/.venv/bin/python" -m compileall main.py bot webapp config services adapters repositories

cat <<DONE

Install completed.

Next steps:

1. Edit environment:
   sudo nano $APP_DIR/.env

2. Set at least:
   BOT_TOKEN=...
   ADMIN_IDS=...
   WEBAPP_URL=https://your-domain.example:8443/
   WEBAPP_HOST=127.0.0.1
   WEBAPP_PORT=8088

3. Edit nginx site:
   sudo nano /etc/nginx/sites-enabled/${WEBAPP_NGINX_SITE}

4. Issue HTTPS certificate:
   sudo certbot --nginx -d your-domain.example

5. Start bot:
   sudo systemctl restart ${SERVICE_NAME}
   sudo systemctl status ${SERVICE_NAME} --no-pager

6. Check logs:
   sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager

7. Check ports:
   sudo ss -tulnp | grep -E ':443|:8443|:9444|:8088'

DONE
