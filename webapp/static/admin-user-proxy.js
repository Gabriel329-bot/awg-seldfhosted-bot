async function showAdminUserProxy(userId) {
  enterScreenMode();
  setAdminMode(true);
  setSection("Прокси пользователя", "Загрузка...");

  const data = await api("/api/admin/users/" + userId + "/proxy");
  if (!data.ok) {
    setSection("Прокси пользователя", "Ошибка: " + (data.error || "не удалось загрузить прокси"));
    return;
  }

  const user = data.user;
  const accesses = data.accesses || [];
  const modules = data.modules || {};
  const activeTypes = new Set(accesses.filter((item) => item.status === "active").map((item) => item.type));

  let html = '<p class="muted">Пользователь: ' + adminUserName(user) + ' · ID ' + escapeHtml(user.telegram_user_id) + '</p>';

  html += '<div class="actions-row">';
  if (modules.socks5 && !activeTypes.has("socks5")) {
    html += '<button class="small-button" onclick="issueAdminUserProxy(' + Number(userId) + ', &quot;socks5&quot;)">Выдать SOCKS5</button>';
  }
  if (modules.mtproto && !activeTypes.has("mtproto")) {
    html += '<button class="small-button" onclick="issueAdminUserProxy(' + Number(userId) + ', &quot;mtproto&quot;)">Выдать MTProto</button>';
  }
  html += '</div>';

  if (!accesses.length) {
    html += "<p>Прокси-доступов нет.</p>";
  } else {
    html += accesses.map(adminUserProxyCardHtml).join("");
  }

  html += '<div class="actions-row">';
  html += '<button class="small-button secondary" onclick="showAdminUser(' + Number(userId) + ')">К пользователю</button>';
  html += '</div>';

  setSectionHtml("Прокси пользователя", html);
}

function adminUserProxyCardHtml(access) {
  const isActive = access.status === "active";
  const title = access.type === "socks5" ? "SOCKS5" : access.type === "mtproto" ? "MTProto" : "Прокси";
  const value = proxyAccessValue(access);

  let html = ''
    + '<div class="key-card">'
    + '<b>' + title + ' #' + escapeHtml(access.id) + '</b>'
    + '<div>Статус: ' + statusBadge(access.status) + '</div>'
    + '<div>Сервер: ' + escapeHtml(access.host || "") + ':' + escapeHtml(access.port || "") + '</div>'
    + (access.login ? '<div>Логин: ' + escapeHtml(access.login) + '</div>' : '')
    + (access.mode ? '<div>Режим: ' + escapeHtml(access.mode) + '</div>' : '')
    + (value ? '<div class="vpn-link">' + escapeHtml(value) + '</div>' : '')
    + '<div class="actions-row">';

  if (value) {
    html += '<button class="small-button" onclick="copyText(&quot;' + escapeAttr(value) + '&quot;, &quot;Прокси скопирован&quot;)">Скопировать</button>';
  }
  if (access.type === "mtproto" && value) {
    html += '<button class="small-button secondary" onclick="openExternal(&quot;' + escapeAttr(value) + '&quot;)">Открыть</button>';
  }
  if (isActive) {
    html += '<button class="small-button danger" onclick="revokeAdminProxy(' + Number(access.id) + ')">Отозвать</button>';
  }
  if (access.status !== "deleted") {
    html += '<button class="small-button danger-outline" onclick="deleteAdminProxy(' + Number(access.id) + ')">Удалить</button>';
  }

  html += '</div></div>';
  return html;
}

function proxyAccessValue(access) {
  if (access.type === "socks5") {
    return access.url || ("socks5://" + access.login + ":" + access.password + "@" + access.host + ":" + access.port);
  }
  if (access.type === "mtproto") {
    return access.link_dd || access.link || "";
  }
  return "";
}

async function issueAdminUserProxy(userId, type) {
  const label = type === "socks5" ? "SOCKS5" : "MTProto";
  if (!await tgConfirm("Выдать " + label + " пользователю?")) {
    return;
  }

  const endpoint = type === "socks5" ? "socks5" : "mtproto";
  const data = await api("/api/admin/users/" + userId + "/proxy/" + endpoint, { method: "POST" });
  if (!data.ok) {
    tgAlert("Ошибка: " + (data.error || "не удалось выдать прокси"), "Ошибка");
    return;
  }

  tgAlert(label + " выдан");
  showAdminUserProxy(userId);
}

async function revokeAdminProxy(accessId) {
  if (!await tgConfirm("Отозвать прокси #" + accessId + "?")) {
    return;
  }

  const data = await api("/api/admin/proxy/" + accessId + "/revoke", { method: "POST" });
  if (!data.ok) {
    tgAlert("Ошибка: " + (data.error || "не удалось отозвать прокси"), "Ошибка");
    return;
  }

  tgAlert("Прокси отозван");
  goBack();
}

async function deleteAdminProxy(accessId) {
  if (!await tgConfirm("Удалить прокси #" + accessId + "?")) {
    return;
  }

  const data = await api("/api/admin/proxy/" + accessId + "/delete", { method: "POST" });
  if (!data.ok) {
    tgAlert("Ошибка: " + (data.error || "не удалось удалить прокси"), "Ошибка");
    return;
  }

  tgAlert("Прокси удалён");
  goBack();
}

function escapeAttr(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
