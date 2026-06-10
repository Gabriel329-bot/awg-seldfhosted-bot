# VPN Telegram WebApp Bot

Telegram-бот и Telegram WebApp-панель для управления self-hosted VPN на Linux/VDS.

Проект рассчитан на развёртывание на одном сервере без Docker, PostgreSQL и Redis.  
Основной интерфейс пользователя и администратора — Telegram WebApp, открываемый из Telegram-бота.

## Возможности

- Telegram WebApp-кабинет внутри Telegram.
- WebApp-only режим: обычный Telegram-бот используется как точка входа в кабинет.
- Регистрация пользователей и заявки на доступ.
- Админ-панель в WebApp.
- Создание, просмотр, отзыв и удаление собственных VPN-ключей пользователем.
- Управление ключами пользователей администратором.
- Xray VLESS Reality.
- AmneziaWG / AmneziaWG 2.0.
- QR-код для AWG-конфига.
- AWG latest handshake, online/offline status и rx/tx traffic.
- SOCKS5/Dante proxy.
- Telegram MTProto Proxy.
- SQLite-хранилище.
- Audit log.
- systemd deployment.
- nginx reverse proxy для Telegram WebApp.

## Архитектура

Типовая production-схема:

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

Рекомендуемая схема портов:


Порт	Назначение
443/tcp	Xray VLESS Reality
8443/tcp	Telegram WebApp через nginx
8088/tcp	Локальный aiohttp backend WebApp
9444/tcp	MTProto Proxy, если включён

Если Xray не занимает 443, WebApp можно разместить на обычном HTTPS 443.


Структура проекта

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

Требования


Ubuntu 22.04/24.04 или совместимый Linux.

Python 3.12.

nginx.

systemd.

Домен, направленный на сервер.

HTTPS-сертификат Let's Encrypt.

Установленный и настроенный Xray и/или AmneziaWG, если используются соответствующие протоколы.


Быстрая установка

1. Клонировать проект

sudo install -o root -g root -m 0755 -d /opt/vpn-service
sudo git clone https://github.com/Gabriel329-bot/awg-seldfhosted-bot.git /opt/vpn-service
cd /opt/vpn-service

2. Создать Python venv

sudo python3.12 -m venv .venv
sudo .venv/bin/pip install --upgrade pip
sudo .venv/bin/pip install -r requirements.txt -c constraints.txt

Если python3.12 отсутствует, установите Python 3.12 через системный пакетный менеджер или официальный PPA.


3. Создать .env

sudo cp .env.example .env
sudo nano .env

Минимально обязательные переменные:


BOT_TOKEN=<telegram_bot_token>
ADMIN_IDS=<telegram_user_id>

DB_PATH=/opt/vpn-service/data/vpn.db
LOG_DIR=/opt/vpn-service/logs
BOT_LOCK_PATH=/run/vpn-bot/vpn-bot.lock

WEBAPP_URL=https://your-domain.example:8443/
WEBAPP_HOST=127.0.0.1
WEBAPP_PORT=8088

4. Подготовить runtime-каталоги

sudo install -o root -g root -m 0700 -d /opt/vpn-service/data
sudo install -o root -g root -m 0700 -d /opt/vpn-service/logs
sudo chmod 600 /opt/vpn-service/.env

Настройка Xray

Для root+api режима:


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

Xray должен иметь VLESS inbound с tag из XRAY_INBOUND_TAG и локальный API inbound для XRAY_STATS_SERVER.


Проверьте Xray:


sudo xray run -test -config /usr/local/etc/xray/config.json
sudo systemctl restart xray
sudo systemctl status xray --no-pager

Настройка AmneziaWG

Основные переменные:


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

Для AWG WebApp показывает:



client config;

download .conf;

QR-код;

latest handshake;

online/offline status;

rx/tx traffic.


Для чтения handshake используется:


awg show awg0 dump

Проверьте AWG:


sudo awg show awg0
sudo awg-quick strip /etc/amnezia/amneziawg/awg0.conf >/dev/null

Настройка MTProto

Если включён MTProto, не занимайте порт 8443, если WebApp работает на 8443.


Рекомендуемый пример:


MTPROTO_ENABLED=true
MTPROTO_MODE=managed
MTPROTO_HOST=your-domain.example
MTPROTO_PORT=9444

Если MTProxy уже использует 8443, перенесите его на 9444, чтобы освободить 8443 для Telegram WebApp.


systemd

Установить сервис:


sudo cp deploy/vpn-bot.service /etc/systemd/system/vpn-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now vpn-bot

Проверить:


sudo systemctl status vpn-bot --no-pager
sudo journalctl -u vpn-bot -n 100 --no-pager

Перезапуск:


sudo systemctl restart vpn-bot

nginx для WebApp

Пример конфига:


deploy/nginx-webapp.example.conf

Установить:


sudo cp deploy/nginx-webapp.example.conf /etc/nginx/sites-available/vpn-webapp
sudo ln -sf /etc/nginx/sites-available/vpn-webapp /etc/nginx/sites-enabled/vpn-webapp
sudo nano /etc/nginx/sites-enabled/vpn-webapp

Замените example.com на ваш домен.


Проверить и применить:


sudo nginx -t
sudo systemctl reload nginx

HTTPS certificate

Сертификат выпускается для домена, даже если WebApp открыт на 8443.


sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example

Проверить:


curl -I https://your-domain.example:8443/

Проверить сертификат:


echo | openssl s_client -connect your-domain.example:8443 -servername your-domain.example 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName

Firewall

Откройте нужные порты:


sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8443/tcp
sudo ufw allow 9444/tcp
sudo ufw enable
sudo ufw status verbose

9444/tcp нужен только если включён MTProto на этом порту.


BotFather / Telegram WebApp

В BotFather настройте WebApp/Menu Button URL:


https://your-domain.example:8443/

Важно:



обычная URL-ссылка не передаёт полноценный Telegram WebApp initData;

кабинет нужно открывать через WebApp-кнопку бота или Menu Button в профиле бота;

если URL изменился, перезапустите vpn-bot и отправьте /start заново.


Проверка запуска

Проверить порты:


sudo ss -tulnp | grep -E ':443|:8443|:9444|:8088'

Ожидаемо:


443   xray
8443  nginx
9444  mtproto-proxy
8088  python/vpn-bot on 127.0.0.1

Проверить WebApp:


curl -I https://your-domain.example:8443/
curl -I http://127.0.0.1:8088/

Проверить логи:


sudo journalctl -u vpn-bot -n 100 --no-pager
sudo journalctl -u nginx -n 100 --no-pager

Безопасность

Никогда не коммитьте:



.env;

Telegram bot token;

SQLite DB;

logs;

VPN private keys;

AWG private/preshared keys;

MTProto secrets;

SOCKS5 passwords;

production configs.


Проверка перед коммитом:


git ls-files | grep -E '(^\.env$|logs/|data/.*\.db|\.db-shm$|\.db-wal$|__pycache__|\.pyc$|\.bak|\.save|\.venv)'

Команда не должна ничего выводить.


WebApp authentication

WebApp API использует Telegram initData.


Правила:



backend проверяет подпись initData через BOT_TOKEN;

telegram_id берётся только из проверенного initData;

frontend не считается доверенным источником user id;

пользователь видит только свои ключи/прокси;

пользователь может отзывать и удалять только собственные ключи;

admin/superadmin выполняет действия через admin WebApp API.


Обновление

cd /opt/vpn-service
sudo git pull --ff-only
sudo .venv/bin/pip install -r requirements.txt -c constraints.txt
sudo systemctl restart vpn-bot
sudo systemctl status vpn-bot --no-pager

Если менялся nginx-конфиг:


sudo nginx -t
sudo systemctl reload nginx

Troubleshooting

bot_invalid

Обычно причины:



WebApp URL указан как обычная ссылка, а не WebApp/Menu Button;

используется неподдерживаемый порт;

кнопка создана старым сообщением до изменения URL;

URL в .env не совпадает с рабочим URL.


Проверьте:


grep -n "WEBAPP" /opt/vpn-service/.env
sudo systemctl restart vpn-bot

Отправьте /start заново и нажмите новую WebApp-кнопку.


Бесконечная загрузка профиля

Обычно WebApp открыт как обычная ссылка без Telegram initData.


Решение:



открыть через профиль бота/Menu Button;

открыть через кнопку web_app=WebAppInfo(...);

не использовать обычную URL-кнопку.


Проверка API:


curl -i https://your-domain.example:8443/api/me

Без Telegram initData ответ 401 — это нормально.


SSL показывает *.google.com

Значит запрос попадает не в nginx, а в Xray Reality на 443.


Проверка:


echo | openssl s_client -connect your-domain.example:443 -servername your-domain.example 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName

Если 443 занят Xray, используйте WebApp на 8443.


Порт занят

Проверить:


sudo ss -tulnp | grep -E ':443|:8443|:9444|:8088'

Если 8443 занят MTProto, перенесите MTProto на 9444.


QR-код AWG не открывается

Проверьте зависимости:


.venv/bin/python -c "import qrcode; print('qrcode ok')"

Проверьте логи:


sudo journalctl -u vpn-bot -n 100 --no-pager

Handshake AWG не показывается

Проверьте, что AWG доступен:


which awg
sudo awg show awg0 dump | head

Если интерфейс не awg0, измените:


AWG_INTERFACE=<your_interface>

и перезапустите:


sudo systemctl restart vpn-bot

nginx не запускается

sudo nginx -t
sudo journalctl -u nginx -n 100 --no-pager

vpn-bot не запускается

sudo systemctl status vpn-bot --no-pager
sudo journalctl -u vpn-bot -n 150 --no-pager

Локальная проверка кода

python -m compileall main.py bot webapp config services adapters repositories
python -m pytest

Лицензия

MIT License. См. LICENSE.
