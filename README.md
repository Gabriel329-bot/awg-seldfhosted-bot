# 🛡️ VPN Telegram Bot

![Python](https://img.shields.io/badge/python-3.12-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Ubuntu_VDS-lightgrey.svg)

Telegram-бот для управления доступом к self-hosted VPN на Ubuntu VDS. Бот управляет пользователями, одобрением заявок на доступ, ключами Xray VLESS Reality и AmneziaWG, отзывом/удалением ключей, ведет журнал аудита и собирает базовую статистику трафика. 

Проект рассчитан на развёртывание на одном сервере **без** Docker, Redis, PostgreSQL или тяжелых ORM.

---

## ✨ Возможности

* 👥 **Регистрация пользователей** и процесс одобрения заявок на доступ через Telegram.
* 🛠️ **Админ-панель** для обработки заявок, управления пользователями, выпуска ключей, аудита, статистики и рассылки уведомлений.
* ⚡ **Xray VLESS Reality**: создание ключей, доставка конфигов, отзыв, удаление и сверка состояния при запуске.
* 🌐 **AmneziaWG**: создание ключей, доставка клиентских конфигов, отзыв, удаление, выделение IP и сверка состояния при запуске.
* 🧦 **Отдельный раздел «Прокси»** для автоматической выдачи доступов SOCKS5/Dante и Telegram MTProto Proxy.
* 🚀 **Опциональный модуль маршрутизации WARP для Telegram**: серверный туннель AmneziaWG (`tg-warp`) с автоматическим переключением на прямой доступ при сбоях (по умолчанию отключен).
* 🔒 **MTProto Proxy**: поддержка статического режима (совместимость) и управляемого режима (managed) с индивидуальными секретами для пользователей, безопасным применением настроек и откатом.
* 🛡️ **Проверка прав**: пользователи видят только свои конфиги и статистику. Деструктивные действия (удаление/отзыв) доступны **только администраторам**.
* 📋 **Журнал аудита** с рекурсивным маскированием чувствительных данных.
* 🗄️ **Хранилище SQLite** с автоматическими миграциями (`db/schema.sql`).
* 📝 **Ротация локальных логов** в директории `LOG_DIR`.
* ⚙️ **Развертывание через systemd** (`deploy/vpn-bot.service`).

**Целевая платформа:** Ubuntu VDS с уже установленным Xray и/или AmneziaWG.

---

## 🛠️ Стек технологий

* **Python 3.12** (3.12.x)
* **aiogram 3**
* **SQLite** (через aiosqlite)
* **python-dotenv**
* **systemd**
* **Xray VLESS Reality**
* **AmneziaWG** / утилиты, совместимые с WireGuard
* **Ubuntu / Linux VDS**

---

## 📂 Структура репозитория

```text
main.py                    # Точка входа бота
init_db.py                 # Скрипт инициализации и миграций схемы SQLite
requirements.txt           # Зависимости среды выполнения
constraints.txt            # Зафиксированные версии зависимостей (production)
.env.example               # Шаблон переменных окружения
db/schema.sql              # Схема базы данных
deploy/vpn-bot.service     # Шаблон systemd-юнита
deploy/run-mtproxy-managed # Обертка для управляемого MTProxy (устанавливается при деплое)
deploy/mtproxy-vpnbot-managed.conf # Drop-in файл MTProxy (устанавливается при деплое)
bot/                       # Telegram-обработчики, клавиатуры, FSM, форматирование
services/                  # Бизнес-логика и проверка прав
repositories/              # Слой доступа к SQLite
adapters/                  # Адаптеры для Xray, AWG, systemctl, бэкапов, shell
warp/                      # Модуль маршрутизации WARP (туннель, маршруты, мониторинг)
scripts/                   # sudo-хелперы vpnbot-warp-* config/settings.py         # Парсинг и валидация переменных окружения
tests/                     # Тесты (регрессия и безопасность)

```

---

## ⚠️ Предупреждение о безопасности

Этот проект обрабатывает операционные секреты VPN и Telegram. **Никогда не коммитьте и не публикуйте:**

* Файлы `.env`.
* Токены Telegram-ботов.
* Приватные ключи (Private keys) или Preshared keys.
* Реальные конфигурации Xray Reality (сервер/клиент).
* Реальные конфигурации AmneziaWG (сервер/клиент).
* Полные клиентские конфиги VPN.
* Базы данных SQLite или их дампы.
* IP-адреса серверов в сочетании с учетными данными.
* Учетные данные от SSH, панелей управления, хостинга и т.д.

> 💡 **Рекомендация для BotFather:** Отключите возможность добавления бота в группы. Бот предназначен для работы только в личных сообщениях. В групповых чатах могут быть случайно раскрыты данные пользователей, действия администраторов или конфиденциальные сообщения.

Используйте `.env.example` только как шаблон. Храните рабочую конфигурацию непосредственно на сервере, вне истории Git.

---

## ⚙️ Переменные окружения

Скопируйте `.env.example` в `.env` и замените плейсхолдеры на ваши значения. `BOT_TOKEN` и `ADMIN_IDS` обязательны для запуска. Заполните соответствующие переменные для Xray или AWG перед выпуском ключей этого типа.

```env
BOT_TOKEN=<telegram_bot_token>
ADMIN_IDS=<telegram_user_id>,<telegram_user_id>
DB_PATH=/opt/vpn-service/data/vpn.db
SQLITE_SYNCHRONOUS=FULL
LOG_DIR=/opt/vpn-service/logs
BOT_LOCK_PATH=/run/vpn-bot/vpn-bot.lock

# Режим Root+api (по умолчанию): PRIVILEGE_HELPERS_ENABLED=false или опустить. 
# Для non-root режима с хелперами: установить true и указать пути ниже.
PRIVILEGE_HELPERS_ENABLED=false
HELPER_STAGING_ROOT=/run/vpn-bot
SOCKS5_USER_HELPER_PATH=/usr/local/sbin/vpnbot-socks5-user
XRAY_APPLY_HELPER_PATH=/usr/local/sbin/vpnbot-xray-apply
AWG_APPLY_HELPER_PATH=/usr/local/sbin/vpnbot-awg-apply
MTPROTO_APPLY_HELPER_PATH=/usr/local/sbin/vpnbot-mtproxy-apply

XRAY_CONFIG_PATH=/usr/local/etc/xray/config.json
XRAY_SERVICE_NAME=xray
XRAY_APPLY_MODE=api
XRAY_INBOUND_TAG=vless-in
XRAY_PUBLIC_HOST=<vpn_public_host>
XRAY_PUBLIC_PORT=443
XRAY_REALITY_PUBLIC_KEY=<xray_reality_public_key>
XRAY_SNI=<xray_reality_sni>
XRAY_FLOW=xtls-rprx-vision
XRAY_FINGERPRINT=chrome
XRAY_NETWORK_TYPE=tcp
XRAY_SHORT_ID=<xray_short_id>
XRAY_MANAGE_SHORT_IDS=false
XRAY_ALLOW_RESTART_ON_ROLLBACK=false
XRAY_STATS_SERVER=127.0.0.1:10085

AWG_CONFIG_PATH=/etc/amnezia/amneziawg/awg0.conf
AWG_INTERFACE=awg0
AWG_NETWORK=10.0.0.0/24
AWG_SERVER_ADDRESS=10.0.0.1
AWG_ENDPOINT_HOST=<awg_endpoint_host>
AWG_ENDPOINT_PORT=<awg_endpoint_port>
AWG_SERVER_PUBLIC_KEY=<awg_server_public_key>
AWG_DNS=1.1.1.1
AWG_ALLOWED_IPS=0.0.0.0/0, ::/0
AWG_PERSISTENT_KEEPALIVE=25
AWG_USE_PRESHARED_KEY=true

SOCKS5_ENABLED=false
SOCKS5_HOST=
SOCKS5_PORT=31337
SOCKS5_LOGIN_PREFIX=vpn_socks_
SOCKS5_SYSTEM_USER_SHELL=/usr/sbin/nologin
SOCKS5_SERVICE_NAME=danted
SOCKS5_PUBLIC_NAME=SOCKS5 Proxy
SOCKS5_NOTE=SOCKS5 Dante proxy on VDS

MTPROTO_ENABLED=false
MTPROTO_MODE=static
MTPROTO_HOST=
MTPROTO_PORT=8443
MTPROTO_SECRET=
MTPROTO_PUBLIC_NAME=Telegram MTProto Proxy
MTPROTO_NOTE=MTProto proxy for Telegram

# Управляемый режим MTProto (индивидуальные секреты)
MTPROTO_SERVICE_NAME=mtproxy
MTPROTO_BINARY_PATH=/usr/local/bin/mtproto-proxy
MTPROTO_RUN_USER=mtproxy
MTPROTO_RUN_GROUP=mtproxy
MTPROTO_CONFIG_DIR=/etc/mtproxy
MTPROTO_PROXY_SECRET_PATH=/etc/mtproxy/proxy-secret
MTPROTO_PROXY_MULTI_CONF_PATH=/etc/mtproxy/proxy-multi.conf
MTPROTO_MANAGED_DIR=/etc/mtproxy/vpnbot
MTPROTO_MANAGED_SECRETS_PATH=/etc/mtproxy/vpnbot/managed-secrets.json
MTPROTO_MANAGED_ENV_PATH=/etc/mtproxy/vpnbot/mtproxy.env
MTPROTO_MANAGED_WRAPPER_PATH=/opt/vpn-service/scripts/run-mtproxy-managed
MTPROTO_BACKUP_DIR=/etc/mtproxy/vpnbot/backups
MTPROTO_INTERNAL_STATS_PORT=8888
MTPROTO_WORKERS=1
MTPROTO_APPLY_TIMEOUT_SECONDS=10
MTPROTO_ROLLBACK_ON_APPLY_FAILURE=true
MTPROTO_KEEP_LAST_BACKUPS=10
MTPROTO_STATS_URL=

AUDIT_RETENTION_DAYS=180
CONFIG_BACKUP_KEEP_LAST=20

```

### Полный справочник переменных окружения

> ⚠️ Переменные, связанные с безопасностью, отмечены 🔒. Никогда не коммитьте их.

#### Основные

| Переменная | Обязательно | По умолчанию | Описание | Пример |
| --- | --- | --- | --- | --- |
| `BOT_TOKEN` | Да | — | Токен Telegram API (от BotFather). 🔒 | `123456:ABC-DEF...` |
| `ADMIN_IDS` | Да | — | ID администраторов через запятую. | `123456,789012` |
| `DB_PATH` | Нет | `/opt/vpn-service/data/vpn.db` | Путь к файлу БД SQLite. | `/opt/vpn-service/data/vpn.db` |
| `SQLITE_SYNCHRONOUS` | Нет | `FULL` | Режим синхронизации SQLite (`FULL` безопаснее). | `FULL` |
| `LOG_DIR` | Нет | `/opt/vpn-service/logs` | Директория для логов. | `/opt/vpn-service/logs` |
| `BOT_LANGUAGE` | Нет | `ru` | Язык интерфейса бота (`ru`, `en`). | `ru` |

#### Xray VLESS Reality

| Переменная | Обязательно | По умолчанию | Описание | Пример |
| --- | --- | --- | --- | --- |
| `XRAY_CONFIG_PATH` | Нет | `/usr/local/etc/xray/config.json` | Путь к конфигу Xray. | `/usr/local/etc/xray/config.json` |
| `XRAY_APPLY_MODE` | Нет | `api` | Как применять изменения: `restart`, `reload`, `api`. Режим `api` требует root, но не обрывает соединения. | `api` |
| `XRAY_INBOUND_TAG` | Нет | *(первый inbound)* | Тег VLESS inbound в `config.json`. | `vless-in` |
| `XRAY_PUBLIC_HOST` | Да* | — | Публичный хост/IP для подключения. | `vpn.example.com` |
| `XRAY_REALITY_PUBLIC_KEY` | Да* | — | Публичный ключ Reality. | `ABC123...` |
| `XRAY_SNI` | Да* | — | SNI для Reality. | `www.microsoft.com` |
| `XRAY_SHORT_ID` | Да* | — | Hex short ID (≤16 символов). | `abcd1234` |
| `XRAY_STATS_SERVER` | Да* | — | Адрес gRPC сервера Xray (нужен для `api`). | `127.0.0.1:10085` |

*(Таблицы для AWG, SOCKS5, MTProto и других компонентов аналогичны структуре выше)*

> 📌 **Важное замечание по Production:**
> По умолчанию XRAY_APPLY_MODE=api (развертывание от root). Если требуется более строгая безопасность (запуск бота от отдельного пользователя), переключитесь на использование утилит повышения привилегий: `PRIVILEGE_HELPERS_ENABLED=true`, `XRAY_APPLY_MODE=restart`, запуск от `User=vpn-bot`.

---

## 🚀 Режим Xray API (Root + API)

⚠️ **ВНИМАНИЕ:** `XRAY_APPLY_MODE=api` требует прав **root** и несовместим с `PRIVILEGE_HELPERS_ENABLED=true`. Это единственный режим, который позволяет добавлять/удалять ключи **без перезапуска Xray** (без обрыва текущих сессий).

Для работы в режиме API вам необходимо подготовить `config.json` на сервере:
Добавьте тег к вашему VLESS inbound и настройте API Dokodemo-door:

```json
{
  "api": {
    "tag": "api",
    "services": ["HandlerService", "StatsService", "LoggerService"]
  },
  "inbounds": [
    {
      "tag": "vless-in",
      "port": 443,
      "protocol": "vless",
      "...": "..."
    },
    {
      "tag": "api-in",
      "listen": "127.0.0.1",
      "port": 10085,
      "protocol": "dokodemo-door",
      "settings": { "address": "127.0.0.1" }
    }
  ],
  "routing": {
    "rules": [
      { "inboundTag": ["api-in"], "outboundTag": "api", "type": "field" }
    ]
  }
}

```

Перезапустите Xray для применения настроек: `sudo systemctl restart xray`.

---

## 🔐 Управление доступом (Жизненный цикл)

* Одобренные пользователи могут создавать ключи Xray/AWG, смотреть свои конфиги/статистику и управлять доступом к Proxy.
* Отзыв/удаление ключей VPN и прокси — **только для администраторов**. Обычные пользователи не видят кнопок удаления.
* Блокировка пользователя администратором закрывает ему доступ к боту и отзывает все его активные VPN-ключи и Proxy-доступы.

---

## ⚠️ Режим ограниченной функциональности (DEGRADED)

Бот помечает конкретный бэкенд (Xray, AWG, SOCKS5, MTProto) как **DEGRADED**, если не может синхронизировать состояние базы SQLite с реальным конфигом сервера.

* Действия (создание/удаление) для проблемного бэкенда блокируются.
* Остальные бэкенды продолжают работать в штатном режиме.
* Статус можно посмотреть в админ-панели (раздел «Диагностика backend»). Для восстановления необходимо вручную исправить конфиги или накатить бекап, а затем перезапустить бота (`systemctl restart vpn-bot`).

---

## 🌐 Установка управляемого MTProto (Managed Mode)

В режиме `managed` бот создает уникальный секрет для каждого пользователя. Для инициализации выполните:

```bash
sudo install -m 700 -d /opt/vpn-service/scripts
sudo install -m 700 deploy/run-mtproxy-managed /opt/vpn-service/scripts/run-mtproxy-managed
sudo install -m 700 -d /etc/systemd/system/mtproxy.service.d
sudo install -m 600 deploy/mtproxy-vpnbot-managed.conf /etc/systemd/system/mtproxy.service.d/vpnbot-managed.conf
sudo install -m 700 -d /etc/mtproxy/vpnbot /etc/mtproxy/vpnbot/backups
sudo chown root:root /opt/vpn-service/scripts/run-mtproxy-managed /etc/mtproxy/vpnbot /etc/mtproxy/vpnbot/backups

# Создание заглушек с помощью Python
sudo /opt/vpn-service/.venv/bin/python - <<'PY'
import json, secrets
from pathlib import Path
managed = Path("/etc/mtproxy/vpnbot")
placeholder = secrets.token_hex(16)
(managed / "managed-secrets.json").write_text(json.dumps({
    "version": 1, "generation": 0, "managed_by": "vpn-bot",
    "secrets": [],
    "runtime_secrets": [{"secret": placeholder, "fingerprint": "empty-placeholder", "purpose": "empty-placeholder"}],
}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
(managed / "mtproxy.env").write_text(
    "MTPROTO_BINARY_PATH=/usr/local/bin/mtproto-proxy\n"
    "MTPROTO_RUN_USER=mtproxy\n"
    "MTPROTO_RUN_GROUP=mtproxy\n"
    "MTPROTO_PROXY_SECRET_PATH=/etc/mtproxy/proxy-secret\n"
    "MTPROTO_PROXY_MULTI_CONF_PATH=/etc/mtproxy/proxy-multi.conf\n"
    "MTPROTO_MANAGED_SECRETS_PATH=/etc/mtproxy/vpnbot/managed-secrets.json\n"
    "MTPROTO_PORT=8443\n"
    "MTPROTO_INTERNAL_STATS_PORT=8888\n"
    "MTPROTO_WORKERS=1\n",
    encoding="utf-8",
)
PY

sudo chmod 600 /etc/mtproxy/vpnbot/managed-secrets.json /etc/mtproxy/vpnbot/mtproxy.env
sudo chown root:root /etc/mtproxy/vpnbot/managed-secrets.json /etc/mtproxy/vpnbot/mtproxy.env
sudo systemctl daemon-reload
sudo systemctl restart mtproxy

```

---

## ✈️ Маршрутизация WARP для Telegram

Дополнительный модуль маршрутизирует выбранный трафик через туннель AmneziaWG (`tg-warp`). При недоступности туннеля (2 неудачных пинга) трафик автоматически пускается напрямую, при восстановлении (3 успешных пинга) туннель возвращается.

**Установка хелперов для работы модуля:**

```bash
install -o root -g root -m 0755 scripts/vpnbot-warp-install /usr/local/sbin/vpnbot-warp-install
install -o root -g root -m 0755 scripts/vpnbot-warp-iface   /usr/local/sbin/vpnbot-warp-iface
install -o root -g root -m 0755 scripts/vpnbot-warp-routes  /usr/local/sbin/vpnbot-warp-routes
install -o root -g root -m 0755 scripts/vpnbot-warp-status  /usr/local/sbin/vpnbot-warp-status
install -o root -g root -m 0440 deploy/sudoers.d/vpnbot.example /etc/sudoers.d/vpnbot
visudo -cf /etc/sudoers.d/vpnbot

```

---

## 🔄 Деплой и развертывание

### Чистая установка (по умолчанию Root+API)

```bash
sudo install -o root -g root -m 0755 -d /opt/vpn-service
sudo git clone [https://github.com/Egor051/vpnbot.git](https://github.com/Egor051/vpnbot.git) /opt/vpn-service
cd /opt/vpn-service

sudo python3 -m venv .venv
sudo /opt/vpn-service/.venv/bin/pip install --upgrade pip
sudo /opt/vpn-service/.venv/bin/pip install -r requirements.txt -c constraints.txt

sudo install -o root -g root -m 0700 -d /opt/vpn-service/data /opt/vpn-service/logs
sudo install -o root -g root -m 0600 .env.example .env
sudo nano .env

# Проверка и запуск
python deploy/check-nonroot-helper-mode.py
sudo cp deploy/vpn-bot.service /etc/systemd/system/vpn-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now vpn-bot

```

### Обновление

```bash
cd /opt/vpn-service
sudo git pull --ff-only
sudo /opt/vpn-service/.venv/bin/pip install -r requirements.txt -c constraints.txt
python deploy/check-nonroot-helper-mode.py
sudo systemctl restart vpn-bot

```

---

## 🩺 Диагностика и бэкапы

### Проверка работоспособности (Preflight / Postflight)

Утилита проверки (`check-nonroot-helper-mode.py`) проверяет корректность прав, конфигурации sudoers и доступность необходимых процессов.

```bash
cd /opt/vpn-service
python deploy/check-nonroot-helper-mode.py

```

### Резервное копирование (Backup)

Перед деплоем или изменениями базы данных обязательно делайте бэкап:

```bash
sudo install -m 700 -d /root/vpn-service-backups
sudo tar --xattrs --acls -czf /root/vpn-service-backups/vpn-service-$(date -u +%Y%m%dT%H%M%SZ).tar.gz \
  /opt/vpn-service/.env \
  /opt/vpn-service/data/vpn.db \
  /usr/local/etc/xray/config.json \
  /etc/amnezia/amneziawg/awg0.conf \
  /etc/mtproxy
sudo chmod 600 /root/vpn-service-backups/vpn-service-*.tar.gz

```

### Восстановление (Restore)

```bash
sudo systemctl stop vpn-bot
sudo tar -xzf /root/vpn-service-backups/<ваша_копия>.tar.gz -C /
sudo systemctl start vpn-bot

```

---

## 📜 База данных и Лицензия

SQLite автоматически применяет миграции при запуске бота (через `init_db.py`). Основные таблицы: `users`, `access_requests`, `vpn_keys`, `proxy_entries`, `proxy_accesses`, `audit_log` и т.д.

**Лицензия:** MIT License (см. файл [LICENSE](https://www.google.com/search?q=LICENSE)). Сторонние зависимости сохраняют свои лицензии (MIT / Apache-2.0 / BSD / MPL-2.0).

```

```
