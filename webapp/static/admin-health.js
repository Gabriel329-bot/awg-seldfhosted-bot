async function showAdminHealth() {
  enterScreenMode();
  setAdminMode(true);
  setSection("Dashboard", "Загрузка...");

  const data = await api("/api/admin/health");
  if (!data.ok) {
    setSection("Dashboard", "Ошибка: " + (data.error || "не удалось загрузить dashboard"));
    return;
  }

  let html = "";

  html += '<h3>Сводка</h3>';
  html += '<div class="info-grid">';
  html += '<div class="info-item"><span>Пользователи</span><b>' + escapeHtml(data.summary.users) + '</b></div>';
  html += '<div class="info-item"><span>Заявки</span><b>' + escapeHtml(data.summary.pending_requests) + '</b></div>';
  html += '<div class="info-item"><span>Ключи</span><b>' + escapeHtml(data.summary.keys_visible_to_admin) + '</b></div>';
  html += '<div class="info-item"><span>Load 1m</span><b>' + escapeHtml(data.load ? data.load["1m"].toFixed(2) : "n/a") + '</b></div>';
  html += '</div>';

  html += '<h3>Сервисы</h3>';
  html += (data.services || []).map(function (svc) {
    return ''
      + '<div class="key-card">'
      + '<b>' + escapeHtml(svc.name) + '</b>'
      + '<div>Статус: ' + (svc.active ? '<span class="badge active">Активен</span>' : '<span class="badge failed">' + escapeHtml(svc.status) + '</span>') + '</div>'
      + '</div>';
  }).join("");

  html += '<h3>Порты</h3>';
  html += '<div class="info-grid">';
  html += (data.ports || []).map(function (port) {
    return ''
      + '<div class="info-item">'
      + '<span>Порт ' + escapeHtml(port.port) + '</span>'
      + '<b>' + (port.listening ? "✅ Слушает" : "❌ Не слушает") + '</b>'
      + '</div>';
  }).join("");
  html += '</div>';

  html += '<h3>Протоколы</h3>';
  html += '<div class="info-grid">';
  html += (data.modules || []).map(function (module) {
    return ''
      + '<div class="info-item">'
      + '<span>' + protocolLabel(module.name) + '</span>'
      + '<b>' + (module.enabled ? "✅ Включён" : "❌ Выключен") + '</b>'
      + '</div>';
  }).join("");
  html += '</div>';

  html += '<h3>Диск</h3>';
  html += '<div class="info-grid">';
  html += '<div class="info-item"><span>Всего</span><b>' + escapeHtml(data.disk.total_h) + '</b></div>';
  html += '<div class="info-item"><span>Использовано</span><b>' + escapeHtml(data.disk.used_h) + '</b></div>';
  html += '<div class="info-item"><span>Свободно</span><b>' + escapeHtml(data.disk.free_h) + '</b></div>';
  html += '</div>';

  html += '<div class="actions-row">';
  html += '<button class="small-button" onclick="showAdminHealth()">Обновить</button>';
  html += '<button class="small-button secondary" onclick="showAdminPanel()">В админку</button>';
  html += '</div>';

  setSectionHtml("Dashboard", html);
}
