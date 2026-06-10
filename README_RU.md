```markdown
# 🛡️ VPN Telegram WebApp Bot

![Python](https://img.shields.io/badge/python-3.12-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Linux-lightgrey.svg)

Telegram-бот и Telegram WebApp-панель для управления self-hosted VPN на Linux/VDS.

Проект рассчитан на развёртывание на одном сервере **без** Docker, PostgreSQL и Redis. Основной интерфейс пользователя и администратора — Telegram WebApp, открываемый напрямую из Telegram-бота.

---

## ✨ Возможности

* 📱 **Telegram WebApp-кабинет** прямо внутри Telegram.
* 🤖 **WebApp-only режим**: обычный Telegram-бот используется как удобная точка входа в кабинет.
* 🔐 **Регистрация** пользователей и заявки на доступ.
* 🛠️ **Админ-панель** в WebApp (управление ключами пользователей).
* 🔑 **Управление своими VPN-ключами**: создание, просмотр, отзыв и удаление самим пользователем.
* ⚡ **Поддержка Xray VLESS Reality**.
* 🌐 **Поддержка AmneziaWG / AmneziaWG 2.0**:
    * Генерация QR-кода для AWG-конфига.
    * Скачивание `.conf` файла.
    * Статистика: latest handshake, online/offline status, rx/tx traffic.
* 🧦 **SOCKS5/Dante proxy**.
* ✈️ **Telegram MTProto Proxy**.
* 🗄️ **SQLite-хранилище** (легковесно, не требует настройки).
* 📋 **Audit log**.
* ⚙️ **systemd deployment**.
* 🔄 **nginx reverse proxy** для Telegram WebApp.

---

## 🏗️ Архитектура

### Типовая production-схема

```text
Telegram
  |
  | WebApp HTTPS
  v
nginx :8443
  |
  | proxy_pass
  v
vpn-bot aiohttp WebApp :8088
  |
  v
services / SQLite / Xray / AmneziaWG / Proxy

```

### Рекомендуемая схема портов

| Порт | Назначение |
| --- | --- |
| **443/tcp** | Xray VLESS Reality |
| **8443/tcp** | Telegram WebApp через nginx |
| **8088/tcp** | Локальный aiohttp backend WebApp |
| **9444/tcp** | MTProto Proxy (если включён) |

> 💡 **Примечание:** Если Xray не занимает порт 443, WebApp можно разместить на стандартном HTTPS (443).

### 📂 Структура проекта

```text
main.py                    # Точка входа: Telegram bot + WebApp + background tasks
bot/                       # Telegram bot: /start и служебная логика
webapp/                    # aiohttp WebApp backend/API
webapp/auth.py             # Проверка Telegram WebApp initData
webapp/static/             # Frontend WebApp: HTML/CSS/JS
services/                  # Бизнес-логика
repositories/              # SQLite repositories
adapters/                  # Xray/AWG/systemctl/shell adapters
config/settings.py         # Загрузка и валидация переменных окружения
db/schema.sql              # SQLite schema
deploy/                    # systemd/nginx/helper examples
scripts/                   # Runtime helper scripts

```

---

## 📋 Требования

* **ОС:** Ubuntu 22.04/24.04 или совместимый Linux.
* **Python:** 3.12
* **Веб-сервер:** nginx
* **Управление службами:** systemd
* **Сеть:** Домен, направленный на сервер.
* **SSL:** HTTPS-сертификат Let's Encrypt.
* **VPN:** Установленный и настроенный Xray и/или AmneziaWG (если используются соответствующие протоколы).

---

## 🚀 Быстрая установка

### 1. Клонировать проект

```bash
sudo install -o root -g root -m 0755 -d /opt/vpn-service
sudo git clone [https://github.com/Gabriel329-bot/awg-seldfhosted-bot.git](https://github.com/Gabriel329-bot/awg-seldfhosted-bot.git) /opt/vpn-service
cd /opt/vpn-service

```

### 2. Создать Python venv

```bash
sudo python3.12 -m venv .venv
sudo .venv/bin/pip install --upgrade pip
sudo .venv/bin/pip install -r requirements.txt -c constraints.txt

```

> Если `python3.12` отсутствует, установите его через системный пакетный менеджер или официальный PPA.

### 3. Создать `.env`

```bash
sudo cp .env.example .env
sudo nano .env

```

**Минимально обязательные переменные:**

```env
BOT_TOKEN=<telegram_bot_token>
ADMIN_IDS=<telegram_user_id>

DB_PATH=/opt/vpn-service/data/vpn.db
LOG_DIR=/opt/vpn-service/logs
BOT_LOCK_PATH=/run/vpn-bot/vpn-bot.lock

WEBAPP_URL=[https://your-domain.example:8443/](https://your-domain.example:8443/)
WEBAPP_HOST=127.0.0.1
WEBAPP_PORT=8088

```

### 4. Подготовить runtime-каталоги

```bash
sudo install -o root -g root -m 0700 -d /opt/vpn-service/data
sudo install -o root -g root -m 0700 -d /opt/vpn-service/logs
sudo chmod 600 /opt/vpn-service/.env

```

---

## ⚙️ Настройка сервисов

### Настройка Xray

Для режима `root+api` в `.env` добавьте:

```env
PRIVILEGE_HELPERS_ENABLED=false
XRAY_APPLY_MODE=api
XRAY_CONFIG_PATH=/usr/local/etc/xray/config.json
XRAY_SERVICE_NAME=xray
XRAY_INBOUND_TAG=vless-in
XRAY_PUBLIC_HOST=your-domain.example
XRAY_PUBLIC_PORT=443
XRAY_REALITY_PUBLIC_KEY=<xray_reality_public_key>
XRAY_SNI=<xray_reality_sni>
XRAY_SHORT_ID=<xray_short_id>
XRAY_STATS_SERVER=127.0.0.1:10085

```

> ⚠️ Xray должен иметь VLESS inbound с tag из `XRAY_INBOUND_TAG` и локальный API inbound для `XRAY_STATS_SERVER`.

Проверьте конфигурацию Xray:

```bash
sudo xray run -test -config /usr/local/etc/xray/config.json
sudo systemctl restart xray
sudo systemctl status xray --no-pager

```

### Настройка AmneziaWG

Основные переменные в `.env`:

```env
AWG_CONFIG_PATH=/etc/amnezia/amneziawg/awg0.conf
AWG_INTERFACE=awg0
AWG_NETWORK=10.0.0.0/24
AWG_SERVER_ADDRESS=10.0.0.1
AWG_ENDPOINT_HOST=your-domain.example
AWG_ENDPOINT_PORT=<awg_udp_port>
AWG_SERVER_PUBLIC_KEY=<awg_server_public_key>
AWG_DNS=1.1.1.1
AWG_ALLOWED_IPS=0.0.0.0/0, ::/0
AWG_PERSISTENT_KEEPALIVE=25
AWG_USE_PRESHARED_KEY=true

```

Для чтения handshake бот использует: `awg show awg0 dump`. Проверьте работу AWG:

```bash
sudo awg show awg0
sudo awg-quick strip /etc/amnezia/amneziawg/awg0.conf >/dev/null

```

### Настройка MTProto

Если включён MTProto, **не занимайте порт 8443**, если WebApp работает на нём же. Рекомендуемый пример:

```env
MTPROTO_ENABLED=true
MTPROTO_MODE=managed
MTPROTO_HOST=your-domain.example
MTPROTO_PORT=9444

```

---

## 🌍 Деплоймент

### systemd

Установка и запуск сервиса:

```bash
sudo cp deploy/vpn-bot.service /etc/systemd/system/vpn-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now vpn-bot

```

Проверка статуса и логов:

```bash
sudo systemctl status vpn-bot --no-pager
sudo journalctl -u vpn-bot -n 100 --no-pager

```

### nginx для WebApp

Установка конфига (замените `example.com` на ваш домен в файле):

```bash
sudo cp deploy/nginx-webapp.example.conf /etc/nginx/sites-available/vpn-webapp
sudo ln -sf /etc/nginx/sites-available/vpn-webapp /etc/nginx/sites-enabled/vpn-webapp
sudo nano /etc/nginx/sites-enabled/vpn-webapp

```

Проверка и применение:

```bash
sudo nginx -t
sudo systemctl reload nginx

```

### HTTPS сертификат

Выпускается для вашего домена (даже если WebApp работает на порту 8443):

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example

```

Проверка доступности:

```bash
curl -I [https://your-domain.example:8443/](https://your-domain.example:8443/)

```

### Firewall (UFW)

Откройте необходимые порты (9444 нужен только для MTProto):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8443/tcp
sudo ufw allow 9444/tcp
sudo ufw enable
sudo ufw status verbose

```

---

## 🤖 Настройка в BotFather

В `@BotFather` настройте WebApp или Menu Button URL на адрес:
`https://your-domain.example:8443/`

> ⚠️ **Важно:**
> * Обычная URL-ссылка не передаёт полноценный Telegram WebApp `initData`.
> * Кабинет нужно открывать строго через WebApp-кнопку бота или Menu Button в профиле.
> * При изменении URL перезапустите службу `vpn-bot` и отправьте `/start` заново.
> 
> 

---

## 🔒 Безопасность и Аутентификация

### WebApp Authentication

API WebApp использует Telegram `initData`.

* Backend проверяет подпись `initData` через `BOT_TOKEN`.
* `telegram_id` берётся **только** из проверенного `initData` (frontend не считается доверенным источником).
* Пользователь видит/отзывает/удаляет **только свои** ключи и прокси.
* Admin/Superadmin выполняет действия через специальное admin WebApp API.

### Чего НЕ должно быть в коммитах

Никогда не коммитьте следующие данные:
`.env`, Telegram bot token, SQLite DB, logs, VPN private keys, AWG private/preshared keys, MTProto secrets, SOCKS5 passwords, production configs.

Проверка перед коммитом (команда не должна ничего выводить):

```bash
git ls-files | grep -E '(^\.env$|logs/|data/.*\.db|\.db-shm$|\.db-wal$|__pycache__|\.pyc$|\.bak|\.save|\.venv)'

```

---

## 🔄 Обновление

```bash
cd /opt/vpn-service
sudo git pull --ff-only
sudo .venv/bin/pip install -r requirements.txt -c constraints.txt
sudo systemctl restart vpn-bot
sudo systemctl status vpn-bot --no-pager

```

Если менялся конфиг nginx, не забудьте: `sudo nginx -t && sudo systemctl reload nginx`.

---

## 🛠️ Troubleshooting

Решение:

1. Проверьте .env: grep -n "WEBAPP" /opt/vpn-service/.env
2. Перезапустите бота: sudo systemctl restart vpn-bot
3. Отправьте /start заново.
4. Открывайте кабинет только через кнопку web_app=WebAppInfo(...) или Menu Button.

---

## 📄 Лицензия

MIT License. См. файл [LICENSE](https://www.google.com/search?q=LICENSE).

```

```
