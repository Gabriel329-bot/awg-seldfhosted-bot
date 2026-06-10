const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

function applyTelegramTheme() {
  const params = tg?.themeParams || {};
  const root = document.documentElement;
  if (params.bg_color) root.style.setProperty("--bg", params.bg_color);
  if (params.secondary_bg_color) root.style.setProperty("--card", params.secondary_bg_color);
  if (params.text_color) root.style.setProperty("--text", params.text_color);
  if (params.hint_color) root.style.setProperty("--muted", params.hint_color);
  if (params.button_color) root.style.setProperty("--primary", params.button_color);
  if (params.button_text_color) root.style.setProperty("--primary-text", params.button_text_color);
}

applyTelegramTheme();
tg?.onEvent?.("themeChanged", applyTelegramTheme);

const initData = tg?.initData || "";
const screenStack = [];

function pushScreen(callback) {
  screenStack.push(callback);
}

function goBack() {
  const callback = screenStack.pop();
  if (callback) {
    callback();
    return;
  }
  exitScreenMode();
}


function setAdminMode(enabled) {
  document.body.classList.toggle("admin-mode", Boolean(enabled));
}

function enterScreenMode() {
  document.body.classList.add("screen-mode");
}

function exitScreenMode() {
  document.body.classList.remove("screen-mode");
  setAdminMode(false);
  setSection("Главная", "");
}

function backToCabinet() {
  exitScreenMode();
}

let enabledModules = { awg: true, xray: true, xray_xhttp: false, socks5: false, mtproto: false };

function tgAlert(message, title = "Готово") {
  if (tg?.showPopup) {
    tg.showPopup({
      title,
      message,
      buttons: [{ type: "ok" }],
    });
    return;
  }
  alert(message);
}

function tgConfirm(message, title = "Подтверждение") {
  return new Promise((resolve) => {
    if (!tg?.showPopup) {
      resolve(confirm(message));
      return;
    }

    tg.showPopup(
      {
        title,
        message,
        buttons: [
          { id: "cancel", type: "cancel", text: "Отмена" },
          { id: "ok", type: "default", text: "Да" },
        ],
      },
      (buttonId) => resolve(buttonId === "ok"),
    );
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "X-Telegram-Init-Data": initData,
      ...(options.headers || {}),
    },
  });
  return response.json();
}

async function loadModules() {
  const data = await api("/api/modules");
  if (data.ok && data.modules) {
    enabledModules = data.modules;
  }
}

async function loadProfile() {
  const data = await api("/api/me");
  const userEl = document.getElementById("user");

  if (!data.ok) {
    userEl.textContent = "Откройте приложение из Telegram";
    return;
  }

  const user = data.user;
  userEl.textContent = `Привет, ${user.first_name || user.username || user.id}`;
}

async function loadProfileCard() {
  const data = await api("/api/profile");
  if (!data.ok) {
    setSection("Профиль", `Ошибка: ${data.error || "не удалось загрузить профиль"}`);
    return;
  }

  const user = data.telegram;
  const access = data.access;
  const modules = data.modules;
  const protocols = [
    modules.awg ? "AWG" : null,
    modules.xray ? "Xray/VLESS" : null,
    modules.xray_xhttp ? "VLESS HTTP" : null,
  ].filter(Boolean);

  setSectionHtml("Профиль", `
    <div class="profile-card">
      <div class="avatar">${escapeHtml((user.first_name || user.username || "U").slice(0, 1).toUpperCase())}</div>
      <div>
        <h3>${escapeHtml(user.first_name || user.username || `ID ${user.id}`)}</h3>
        <div class="muted">${user.username ? "@" + escapeHtml(user.username) : "Username не указан"}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <span>Статус</span>
        <b>${statusBadge(access.status)}</b>
      </div>
      <div class="info-item">
        <span>Роль</span>
        <b>${roleLabel(access.role)}</b>
      </div>
      <div class="info-item">
        <span>Ключей</span>
        <b>${data.keys.total}</b>
      </div>
      <div class="info-item">
        <span>Протоколы</span>
        <b>${protocols.length ? protocols.join(", ") : "Отключены"}</b>
      </div>
    </div>

    <button class="small-button" onclick="enterScreenMode(); loadKeys()">Мои ключи</button>
    <button class="small-button secondary" onclick="enterScreenMode(); showCreateMenu()">Создать ключ</button>
    ${adminButtonHtml(access.role)}
  `);
}

function isAdminRole(role) {
  const value = String(role || "").toLowerCase();
  return value.includes("superadmin") || value.includes("moderator");
}

function adminButtonHtml(role) {
  return isAdminRole(role)
    ? `<button class="small-button secondary" onclick="showAdminPanel()">Админка</button>`
    : "";
}

function accessStatusLabel(status) {
  if (status === "approved") return "Одобрен";
  if (status === "blocked") return "Заблокирован";
  return "Ожидает одобрения";
}

function roleLabel(role) {
  const value = String(role || "").toLowerCase();
  const labels = {
    superadmin: "Администратор",
    moderator: "Модератор",
    approved_user: "Пользователь",
    pending_user: "Ожидает одобрения",
    blocked_user: "Заблокирован",
  };
  return labels[value] || role || "Неизвестно";
}

async function loadKeys() {
  setSection("Мои ключи", "Загрузка ключей...");
  const data = await api("/api/keys");

  if (!data.ok) {
    setSection("Мои ключи", `Ошибка: ${data.error || "не удалось загрузить ключи"}`);
    return;
  }

  if (!data.keys.length) {
    setSectionHtml("Мои ключи", `
      <p>У вас пока нет VPN-ключей.</p>
      <button class="small-button" onclick="showCreateMenu()">Создать ключ</button>
    `);
    return;
  }

  const html = data.keys.map((key) => {
    const title = `${key.type.toUpperCase()} #${key.id}`;
    const note = key.note ? `<div class="muted">${escapeHtml(key.note)}</div>` : "";
    const expires = key.expires_at ? `<div>Истекает: ${escapeHtml(key.expires_at)}</div>` : "<div>Без срока</div>";
    const ip = key.client_ip ? `<div>IP: ${escapeHtml(key.client_ip)}</div>` : "";
    const shareButton = key.share_url && key.status === "active"
      ? `<button class="small-button" onclick="showShareLink(${key.id})">Показать ключ</button>`
      : "";
    const downloadButton = key.download_url && key.status === "active"
      ? `<button class="small-button secondary" onclick="downloadConfig(${key.id})">Скачать .conf</button>`
      : "";
    const revokeButton = key.status === "active"
      ? `<button class="small-button danger" onclick="revokeKey(${key.id})">Отозвать</button>`
      : "";
    const deleteButton = key.status !== "deleted"
      ? `<button class="small-button danger-outline" onclick="deleteKey(${key.id})">Удалить</button>`
      : "";

    return `
      <div class="key-card">
        <b>${title}</b>
        <div>Статус: ${statusBadge(key.status)}</div>
        <div>Транспорт: ${escapeHtml(key.transport || "tcp")}</div>
        ${expires}
        ${ip}
        ${note}
        <div class="traffic-box" id="traffic-${key.id}">
          Трафик: загружается...
        </div>
        <div class="actions-row">
          ${shareButton}
          ${downloadButton}
          <button class="small-button secondary" onclick="refreshTraffic(${key.id})">Обновить статистику</button>
          ${revokeButton}
          ${deleteButton}
        </div>
      </div>
    `;
  }).join("");

  setSectionHtml("Мои ключи", `
    <button class="small-button" onclick="showCreateMenu()">Создать ключ</button>
    ${html}
  `);

  data.keys.forEach((key) => {
    refreshTraffic(key.id);
  });
}

async function showCreateMenu() {
  await loadModules();
  const buttons = [];
  if (enabledModules.awg) {
    buttons.push(`<button class="tile wide" onclick="showCreateAwg()">AmneziaWG 2.0</button>`);
  }
  if (enabledModules.xray) {
    buttons.push(`<button class="tile wide" onclick="showCreateXray()">VLESS / Xray</button>`);
  }

  if (!buttons.length) {
    buttons.push(`<p>Создание ключей сейчас недоступно: все протоколы отключены администратором.</p>`);
  }

  setSectionHtml("Создать ключ", `
    ${buttons.join("")}
    <button class="small-button secondary" onclick="loadKeys()">Назад</button>
  `);
}

function showCreateAwg() {
  setSectionHtml("Создать AWG ключ", `
    <label class="label">Название устройства</label>
    <input id="awg-note" class="input" maxlength="200" placeholder="Например: iPhone, Android, Laptop">

    <label class="label">MTU, необязательно</label>
    <input id="awg-mtu" class="input" inputmode="numeric" placeholder="1280">

    <button class="small-button" onclick="createAwgKey()">Создать</button>
    <button class="small-button secondary" onclick="showCreateMenu()">Назад</button>
    <p class="muted">После создания можно скопировать VPN ключ или скачать .conf файл.</p>
  `);
}

function showCreateXray() {
  setSectionHtml("Создать VLESS ключ", `
    <label class="label">Название устройства</label>
    <input id="xray-note" class="input" maxlength="200" placeholder="Например: iPhone, Android, Laptop">

    <label class="label">Fingerprint</label>
    <select id="xray-fingerprint" class="input">
      <option value="chrome">chrome</option>
      <option value="firefox">firefox</option>
      <option value="safari">safari</option>
      <option value="ios">ios</option>
      <option value="android">android</option>
      <option value="edge">edge</option>
      <option value="randomized">randomized</option>
    </select>

    <label class="label">Транспорт</label>
    <select id="xray-transport" class="input">
      <option value="tcp">VLESS TCP</option>
      ${enabledModules.xray_xhttp ? `<option value="http">VLESS HTTP</option>` : ""}
    </select>

    <button class="small-button" onclick="createXrayKey()">Создать</button>
    <button class="small-button secondary" onclick="showCreateMenu()">Назад</button>
    <p class="muted">После создания появится VLESS-ссылка для копирования.</p>
  `);
}

async function createAwgKey() {
  const note = document.getElementById("awg-note")?.value || "";
  const mtu = document.getElementById("awg-mtu")?.value || "";

  setSection("Создать AWG ключ", "Создаю ключ...");
  const data = await api("/api/keys/awg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note, mtu }),
  });

  if (!data.ok) {
    setSectionHtml("Создать AWG ключ", `
      <p>Ошибка: ${escapeHtml(data.error || "не удалось создать ключ")}</p>
      <button class="small-button secondary" onclick="showCreateAwg()">Попробовать снова</button>
    `);
    return;
  }

  showShareResult("AWG ключ создан", data.key.id, data.share_link, true);
}

async function createXrayKey() {
  const note = document.getElementById("xray-note")?.value || "";
  const fingerprint = document.getElementById("xray-fingerprint")?.value || "chrome";
  const transport = document.getElementById("xray-transport")?.value || "tcp";

  setSection("Создать VLESS ключ", "Создаю ключ...");
  const data = await api("/api/keys/xray", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note, fingerprint, transport }),
  });

  if (!data.ok) {
    setSectionHtml("Создать VLESS ключ", `
      <p>Ошибка: ${escapeHtml(data.error || "не удалось создать ключ")}</p>
      <button class="small-button secondary" onclick="showCreateXray()">Попробовать снова</button>
    `);
    return;
  }

  showShareResult("VLESS ключ создан", data.key.id, data.share_link, false);
}

function showShareResult(title, keyId, shareLink, canDownload) {
  window.currentVpnLink = shareLink || "";
  setSectionHtml(title, `
    <p>Ключ #${keyId} создан.</p>
    <div class="vpn-link">${escapeHtml(shareLink || "Ключ не найден")}</div>
    <button class="small-button" onclick="copyVpnLink()">Скопировать ключ</button>
    ${canDownload ? `<button class="small-button secondary" onclick="downloadConfig(${keyId})">Скачать .conf</button>` : ""}
    <button class="small-button secondary" onclick="loadKeys()">К моим ключам</button>
  `);
}

async function showShareLink(keyId) {
  setSection("Ключ", "Загрузка...");
  const data = await api(`/api/keys/${keyId}/share`);

  if (!data.ok) {
    setSectionHtml("Ключ", `
      <p>Ошибка: ${escapeHtml(data.error || "не удалось получить ключ")}</p>
      <button class="small-button secondary" onclick="loadKeys()">Назад</button>
    `);
    return;
  }

  window.currentVpnLink = data.share_link || "";
  const canDownload = data.type === "awg";
  setSectionHtml(`Ключ #${keyId}`, `
    <div class="vpn-link">${escapeHtml(window.currentVpnLink)}</div>
    <button class="small-button" onclick="copyVpnLink()">Скопировать ключ</button>
    ${canDownload ? `<button class="small-button secondary" onclick="downloadConfig(${keyId})">Скачать .conf</button>` : ""}
    <button class="small-button secondary" onclick="loadKeys()">Назад</button>
  `);
}

async function copyVpnLink() {
  try {
    await navigator.clipboard.writeText(window.currentVpnLink || "");
    tg?.showPopup?.({ title: "Готово", message: "Ключ скопирован", buttons: [{ type: "ok" }] });
  } catch {
    alert("Не удалось скопировать автоматически. Выделите ключ вручную.");
  }
}

async function refreshTraffic(keyId) {
  const box = document.getElementById(`traffic-${keyId}`);
  if (box) {
    box.textContent = "Трафик: обновляю...";
  }

  const data = await api(`/api/keys/${keyId}/traffic`);
  if (!data.ok) {
    if (box) {
      box.textContent = `Трафик: ошибка — ${data.error || "не удалось обновить"}`;
    } else {
      alert(`Ошибка: ${data.error || "не удалось обновить статистику"}`);
    }
    return;
  }

  if (box) {
    box.innerHTML = `
      <b>Трафик</b><br>
      ↓ Скачать: ${escapeHtml(data.downloaded)}<br>
      ↑ Отдать: ${escapeHtml(data.uploaded)}
    `;
  }
}

async function revokeKey(keyId) {
  if (!await tgConfirm(`Отозвать ключ #${keyId}? Он перестанет работать.`)) {
    return;
  }

  const data = await api(`/api/keys/${keyId}/revoke`, { method: "POST" });
  if (!data.ok) {
    tgAlert(`Ошибка: ${data.error || "не удалось отозвать ключ"}`, "Ошибка");
    return;
  }

  tgAlert("Ключ отозван");
  loadKeys();
}

async function deleteKey(keyId) {
  if (!await tgConfirm(`Удалить ключ #${keyId}? Это действие нельзя отменить.`)) {
    return;
  }

  const data = await api(`/api/keys/${keyId}/delete`, { method: "POST" });
  if (!data.ok) {
    tgAlert(`Ошибка: ${data.error || "не удалось удалить ключ"}`, "Ошибка");
    return;
  }

  tgAlert("Ключ удалён");
  loadKeys();
}

function downloadConfig(keyId) {
  fetch(`/api/keys/${keyId}/download`, {
    headers: { "X-Telegram-Init-Data": initData },
  })
    .then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "не удалось скачать файл");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `awg-${keyId}.conf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    })
    .catch((error) => {
      tgAlert(`Ошибка: ${error.message}`, "Ошибка");
    });
}

async function showAdminPanel() {
  enterScreenMode();
  setAdminMode(true);
  setSection("Админка", "Загрузка...");
  const data = await api("/api/admin/summary");

  if (!data.ok) {
    setSection("Админка", `Ошибка: ${data.error || "нет доступа"}`);
    return;
  }

  const modules = data.modules
    ? data.modules.map((module) => `
      <div class="info-item">
        <span>${escapeHtml(module.name)}</span>
        <b>${module.enabled ? "✅ Включён" : "❌ Отключён"}</b>
      </div>
    `).join("")
    : "";

  setSectionHtml("Админка", `
    <div class="info-grid">
      <div class="info-item"><span>Роль</span><b>${roleLabel(data.role)}</b></div>
      <div class="info-item"><span>Заявки</span><b>${data.pending_requests}</b></div>
      <div class="info-item"><span>Пользователи</span><b>${data.users_count}</b></div>
      <div class="info-item"><span>Права</span><b>${data.is_superadmin ? "Superadmin" : "Moderator"}</b></div>
    </div>

    ${modules ? `<h3>Протоколы</h3><div class="info-grid">${modules}</div>` : ""}

    <div class="actions-row">
      <button class="small-button" onclick="showAdminHealth()">Dashboard</button>
      <button class="small-button" onclick="showAdminAudit()">Аудит</button>
      <button class="small-button" onclick="showAdminRequests()">Заявки на доступ</button>
      <button class="small-button" onclick="showAdminUsers()">Пользователи</button>
      <button class="small-button secondary" onclick="showAdminUserSearch()">Поиск пользователей</button>
      <button class="small-button" onclick="showAdminModules()">Протоколы</button>
      <button class="small-button secondary" onclick="showAdminPanel()">Обновить</button>
      <button class="small-button secondary" onclick="backToCabinet()">← В кабинет</button>
    </div>
  `);
}

async function showAdminRequests(page = 0, fromBack = false) {
  if (!fromBack) {
    pushScreen(() => showAdminPanel());
  }
  enterScreenMode();
  setAdminMode(true);
  setSection("Заявки", "Загрузка...");
  const data = await api(`/api/admin/requests?page=${page}`);

  if (!data.ok) {
    setSection("Заявки", `Ошибка: ${data.error || "не удалось загрузить заявки"}`);
    return;
  }

  const requests = data.requests || [];
  const list = requests.length
    ? requests.map((item) => `
      <div class="key-card">
        <b>Заявка #${item.id}</b>
        <div>ID: ${escapeHtml(item.telegram_user_id)}</div>
        <div>Username: ${item.username ? "@" + escapeHtml(item.username) : "не указан"}</div>
        <div>Статус: ${statusBadge(item.status)}</div>
        ${item.requested_at ? `<div class="muted">Создана: ${escapeHtml(item.requested_at)}</div>` : ""}
        <div class="actions-row">
          <button class="small-button" onclick="decideAccessRequest(${item.id}, 'approve')">Одобрить</button>
          <button class="small-button danger-outline" onclick="decideAccessRequest(${item.id}, 'reject')">Отклонить</button>
        </div>
      </div>
    `).join("")
    : "<p>Ожидающих заявок нет.</p>";

  setSectionHtml("Заявки", `
    <p class="muted">Всего ожидает: ${data.total}</p>
    ${list}
    <div class="actions-row">
      ${page > 0 ? `<button class="small-button secondary" onclick="showAdminRequests(${page - 1}, true)">Назад</button>` : ""}
      ${(page + 1) * 20 < data.total ? `<button class="small-button secondary" onclick="showAdminRequests(${page + 1}, true)">Дальше</button>` : ""}
      <button class="small-button secondary" onclick="showAdminPanel()">В админку</button>
      <button class="small-button secondary" onclick="backToCabinet()">← В кабинет</button>
    </div>
  `);
}

async function decideAccessRequest(requestId, action) {
  const label = action === "approve" ? "одобрить" : "отклонить";
  if (!confirm(`Вы уверены, что хотите ${label} заявку #${requestId}?`)) {
    return;
  }

  const data = await api(`/api/admin/requests/${requestId}/${action}`, { method: "POST" });
  if (!data.ok) {
    alert(`Ошибка: ${data.error || "не удалось обработать заявку"}`);
    return;
  }

  alert(data.changed ? "Готово" : "Заявка уже обработана");
  showAdminRequests();
}

async function showProxy() {
  setSection("Прокси", "Загрузка...");
  const data = await api("/api/proxy");

  if (!data.ok) {
    setSection("Прокси", `Ошибка: ${data.error || "не удалось загрузить прокси"}`);
    return;
  }

  const buttons = [];
  const activeTypes = new Set(data.accesses.map((item) => item.type));

  if (data.modules.socks5 && !activeTypes.has("socks5")) {
    buttons.push(`<button class="small-button" onclick="createSocks5Proxy()">Получить SOCKS5</button>`);
  }
  if (data.modules.mtproto && !activeTypes.has("mtproto")) {
    buttons.push(`<button class="small-button" onclick="createMtprotoProxy()">Получить MTProto</button>`);
  }

  const accessesHtml = data.accesses.length
    ? data.accesses.map(proxyAccessHtml).join("")
    : `<p>У вас пока нет прокси-доступов.</p>`;

  const modulesText = [
    data.modules.socks5 ? "SOCKS5 доступен" : "SOCKS5 отключён",
    data.modules.mtproto ? "MTProto доступен" : "MTProto отключён",
  ].join(" · ");

  setSectionHtml("Прокси", `
    <p class="muted">${modulesText}</p>
    <div class="actions-row">${buttons.join("")}</div>
    ${accessesHtml}
    <button class="small-button secondary" onclick="loadProxyStats()">Статистика прокси</button>
  `);
}

function proxyAccessHtml(access) {
  if (access.type === "socks5") {
    const url = access.url || `socks5://${access.login}:${access.password}@${access.host}:${access.port}`;
    return `
      <div class="key-card">
        <b>SOCKS5 #${access.id}</b>
        <div>Статус: ${statusBadge(access.status)}</div>
        <div>Хост: ${escapeHtml(access.host)}:${escapeHtml(access.port)}</div>
        <div>Логин: ${escapeHtml(access.login || "")}</div>
        <div class="vpn-link">${escapeHtml(url)}</div>
        <div class="actions-row">
          <button class="small-button" onclick="copyText('${escapeJs(url)}', 'SOCKS5 скопирован')">Скопировать SOCKS5</button>
          <button class="small-button danger" onclick="revokeProxy(${access.id})">Отозвать</button>
          <button class="small-button danger-outline" onclick="deleteProxy(${access.id})">Удалить</button>
        </div>
      </div>
    `;
  }

  if (access.type === "mtproto") {
    const link = access.link_dd || access.link || "";
    return `
      <div class="key-card">
        <b>MTProto #${access.id}</b>
        <div>Статус: ${statusBadge(access.status)}</div>
        <div>Хост: ${escapeHtml(access.host)}:${escapeHtml(access.port)}</div>
        <div>Режим: ${escapeHtml(access.mode || "")}</div>
        <div class="vpn-link">${escapeHtml(link)}</div>
        <div class="actions-row">
          <button class="small-button" onclick="copyText('${escapeJs(link)}', 'MTProto ссылка скопирована')">Скопировать ссылку</button>
          <button class="small-button secondary" onclick="openExternal('${escapeJs(link)}')">Открыть в Telegram</button>
          <button class="small-button danger" onclick="revokeProxy(${access.id})">Отозвать</button>
          <button class="small-button danger-outline" onclick="deleteProxy(${access.id})">Удалить</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="key-card">
      <b>Прокси #${access.id}</b>
      <div>Тип: ${escapeHtml(access.type)}</div>
      <div>Статус: ${escapeHtml(access.status)}</div>
    </div>
  `;
}

async function revokeProxy(accessId) {
  if (!await tgConfirm(`Отозвать прокси #${accessId}? Доступ перестанет работать.`)) {
    return;
  }

  const data = await api(`/api/proxy/${accessId}/revoke`, { method: "POST" });
  if (!data.ok) {
    tgAlert(`Ошибка: ${data.error || "не удалось отозвать прокси"}`, "Ошибка");
    return;
  }

  tgAlert("Прокси отозван");
  showProxy();
}

async function deleteProxy(accessId) {
  if (!await tgConfirm(`Удалить прокси #${accessId}? Это действие нельзя отменить.`)) {
    return;
  }

  const data = await api(`/api/proxy/${accessId}/delete`, { method: "POST" });
  if (!data.ok) {
    tgAlert(`Ошибка: ${data.error || "не удалось удалить прокси"}`, "Ошибка");
    return;
  }

  tgAlert("Прокси удалён");
  showProxy();
}

async function createSocks5Proxy() {
  if (!await tgConfirm("Создать SOCKS5 доступ?")) {
    return;
  }
  setSection("Прокси", "Создаю SOCKS5...");
  const data = await api("/api/proxy/socks5", { method: "POST" });
  if (!data.ok) {
    setSection("Прокси", `Ошибка: ${data.error || "не удалось создать SOCKS5"}`);
    return;
  }
  showProxy();
}

async function createMtprotoProxy() {
  if (!await tgConfirm("Создать MTProto доступ?")) {
    return;
  }
  setSection("Прокси", "Создаю MTProto...");
  const data = await api("/api/proxy/mtproto", { method: "POST" });
  if (!data.ok) {
    setSection("Прокси", `Ошибка: ${data.error || "не удалось создать MTProto"}`);
    return;
  }
  showProxy();
}

async function loadProxyStats() {
  setSection("Статистика прокси", "Загрузка...");
  const data = await api("/api/proxy/stats");
  if (!data.ok) {
    setSection("Статистика прокси", `Ошибка: ${data.error || "не удалось загрузить статистику"}`);
    return;
  }

  const stats = data.stats;
  const counts = stats.counts || {};
  const accesses = stats.accesses || [];

  const summary = `
    <div class="info-grid">
      <div class="info-item"><span>Всего</span><b>${stats.total || 0}</b></div>
      <div class="info-item"><span>Активные</span><b>${counts.active || 0}</b></div>
      <div class="info-item"><span>Отозванные</span><b>${counts.revoked || 0}</b></div>
      <div class="info-item"><span>Ошибки</span><b>${(counts.apply_failed || 0) + (counts.revoke_failed || 0) + (counts.delete_failed || 0)}</b></div>
    </div>
  `;

  const list = accesses.length
    ? accesses.map((item) => `
      <div class="key-card">
        <b>${proxyTypeLabel(item.type)} #${item.id}</b>
        <div>Статус: ${statusBadge(item.status)}</div>
        <div>Сервер: ${escapeHtml(item.host || "")}:${escapeHtml(item.port || "")}</div>
        ${item.login ? `<div>Логин: ${escapeHtml(item.login)}</div>` : ""}
        ${item.mtproto_mode ? `<div>Режим: ${escapeHtml(item.mtproto_mode)}</div>` : ""}
        ${item.created_at ? `<div class="muted">Создан: ${escapeHtml(item.created_at)}</div>` : ""}
        ${item.revoked_at ? `<div class="muted">Отозван: ${escapeHtml(item.revoked_at)}</div>` : ""}
      </div>
    `).join("")
    : "<p>История прокси пуста.</p>";

  setSectionHtml("Статистика прокси", `
    ${summary}
    ${list}
    <button class="small-button secondary" onclick="showProxy()">Назад к прокси</button>
  `);
}

async function copyText(value, message) {
  try {
    await navigator.clipboard.writeText(value || "");
    tg?.showPopup?.({ title: "Готово", message, buttons: [{ type: "ok" }] });
  } catch {
    alert("Не удалось скопировать автоматически. Выделите текст вручную.");
  }
}

function escapeJs(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "");
}

function showInstructions() {
  setSectionHtml("Инструкции", `
    <div class="instruction-card">
      <h3>AmneziaWG</h3>
      <ol>
        <li>Установите AmneziaVPN.</li>
        <li>В разделе <b>Мои ключи</b> скопируйте <code>vpn://...</code> или скачайте <code>.conf</code>.</li>
        <li>Импортируйте ключ в приложении AmneziaVPN.</li>
      </ol>
      <button class="small-button" onclick="openExternal('https://amnezia.org/ru/downloads')">Скачать AmneziaVPN</button>
      <button class="small-button secondary" onclick="openExternal('https://docs.amnezia.org/ru/documentation')">Документация</button>
    </div>

    <div class="instruction-card">
      <h3>VLESS / Xray</h3>
      <ol>
        <li>Скопируйте VLESS-ссылку из раздела <b>Мои ключи</b>.</li>
        <li>Импортируйте ссылку в совместимое приложение: v2rayNG, Streisand, Hiddify, Nekoray или аналог.</li>
        <li>Если подключение не работает — попробуйте другой fingerprint или транспорт TCP.</li>
      </ol>
    </div>
  `);
}

function openExternal(url) {
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}

function screenHeader() {
  return `<button class="small-button secondary back-button" onclick="goBack()">← Назад</button>`;
}

function setSection(title, body) {
  document.getElementById("section-title").textContent = title;
  document.getElementById("section-body").textContent = body;
}

function setSectionHtml(title, html) {
  document.getElementById("section-title").textContent = title;
  const prefix = document.body.classList.contains("screen-mode") ? screenHeader() : "";
  document.getElementById("section-body").innerHTML = prefix + html;
}

function proxyTypeLabel(type) {
  if (type === "socks5") return "SOCKS5";
  if (type === "mtproto") return "MTProto";
  return type || "Прокси";
}

function statusBadge(status) {
  const label = statusLabel(status);
  const group = statusGroup(status);
  return `<span class="badge ${group}">${escapeHtml(label)}</span>`;
}

function statusGroup(status) {
  if (status === "active" || status === "approved") return "active";
  if (status === "revoked" || status === "inactive") return "revoked";
  if (status === "deleted" || String(status || "").includes("failed") || status === "blocked") return "failed";
  if (String(status || "").startsWith("pending")) return "pending";
  return "pending";
}

function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  const labels = {
    active: "Активен",
    approved: "Одобрен",
    pending: "Ожидает одобрения",
    blocked: "Заблокирован",
    revoked: "Отозван",
    inactive: "Неактивен",
    deleted: "Удалён",
    pending_apply: "Создаётся",
    apply_failed: "Ошибка создания",
    pending_revoke: "Отзывается",
    revoke_failed: "Ошибка отзыва",
    pending_delete: "Удаляется",
    delete_failed: "Ошибка удаления",
  };
  return labels[value] || status || "Неизвестно";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const texts = {
  proxy: ["Прокси", "Здесь будут SOCKS5 и MTProto доступы."],
};

document.querySelectorAll(".tile").forEach((button) => {
  button.addEventListener("click", () => {
    enterScreenMode();
    setAdminMode(false);
    if (button.dataset.section === "profile") {
      loadProfileCard();
      return;
    }
    if (button.dataset.section === "keys") {
      loadKeys();
      return;
    }
    if (button.dataset.section === "create") {
      showCreateMenu();
      return;
    }
    if (button.dataset.section === "help") {
      showInstructions();
      return;
    }

    if (button.dataset.section === "proxy") {
      showProxy();
      return;
    }

    const [title, body] = texts[button.dataset.section];
    setSection(title, body);
  });
});

loadModules();
loadProfile();
exitScreenMode();
