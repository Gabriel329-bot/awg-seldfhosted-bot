async function showAdminAudit(page = 0) {
  enterScreenMode();
  setAdminMode(true);
  setSection("Аудит", "Загрузка...");

  const data = await api("/api/admin/audit?page=" + page);
  if (!data.ok) {
    setSection("Аудит", "Ошибка: " + (data.error || "не удалось загрузить аудит"));
    return;
  }

  let html = '<p class="muted">Всего записей: ' + escapeHtml(data.total || 0) + '</p>';

  const items = data.items || [];
  if (!items.length) {
    html += "<p>Записей аудита нет.</p>";
  } else {
    html += items.map(auditItemHtml).join("");
  }

  html += '<div class="actions-row">';
  if (page > 0) {
    html += '<button class="small-button secondary" onclick="showAdminAudit(' + (page - 1) + ')">Назад</button>';
  }
  if ((page + 1) * 30 < (data.total || 0)) {
    html += '<button class="small-button secondary" onclick="showAdminAudit(' + (page + 1) + ')">Дальше</button>';
  }
  html += '<button class="small-button secondary" onclick="showAdminPanel()">В админку</button>';
  html += '</div>';

  setSectionHtml("Аудит", html);
}

function auditItemHtml(item) {
  const actor = item.actor_username
    ? "@" + escapeHtml(item.actor_username)
    : item.actor_user_id
      ? "ID " + escapeHtml(item.actor_user_id)
      : "Система";

  const details = item.details
    ? '<details class="audit-details"><summary>Детали</summary><pre class="config-box">' + escapeHtml(JSON.stringify(item.details, null, 2)) + '</pre></details>'
    : "";

  return ''
    + '<div class="key-card">'
    + '<b>' + auditActionLabel(item.action) + '</b>'
    + '<div>Кто: ' + actor + '</div>'
    + '<div>Объект: ' + escapeHtml(item.entity_type || "system") + (item.entity_id ? " #" + escapeHtml(item.entity_id) : "") + '</div>'
    + (item.created_at ? '<div class="muted">Время: ' + escapeHtml(item.created_at) + '</div>' : '')
    + details
    + '</div>';
}

function auditActionLabel(action) {
  const labels = {
    xray_key_created: "Создан Xray ключ",
    awg_key_created: "Создан AWG ключ",
    xray_key_revoked: "Отозван Xray ключ",
    awg_key_revoked: "Отозван AWG ключ",
    xray_key_deleted: "Удалён Xray ключ",
    awg_key_deleted: "Удалён AWG ключ",
    user_role_changed: "Изменена роль пользователя",
    user_blocked: "Пользователь заблокирован",
    user_unblocked: "Пользователь разблокирован",
    protocol_enabled: "Протокол включён",
    protocol_disabled: "Протокол выключен",
    socks5_proxy_created: "Создан SOCKS5",
    socks5_proxy_revoked: "Отозван SOCKS5",
    socks5_proxy_deleted: "Удалён SOCKS5",
    mtproto_proxy_created: "Создан MTProto",
    mtproto_proxy_revoked: "Отозван MTProto",
    mtproto_proxy_deleted: "Удалён MTProto",
    access_approved: "Заявка одобрена",
    access_rejected: "Заявка отклонена",
  };
  return labels[action] || action || "Действие";
}
