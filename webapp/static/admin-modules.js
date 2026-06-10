async function showAdminModules() {
  enterScreenMode();
  setAdminMode(true);
  setSection("Протоколы", "Загрузка...");

  const data = await api("/api/admin/modules");
  if (!data.ok) {
    setSection("Протоколы", "Ошибка: " + (data.error || "не удалось загрузить протоколы"));
    return;
  }

  setSectionHtml("Протоколы", adminModulesHtml(data.modules || []));
}

function adminModulesHtml(modules) {
  let html = '<p class="muted">Включение/выключение синхронизируется с ботом, WebApp, созданием ключей и прокси.</p>';

  if (!modules.length) {
    html += "<p>Протоколы не найдены.</p>";
  } else {
    html += modules.map(adminModuleCardHtml).join("");
  }

  html += '<div class="actions-row">';
  html += '<button class="small-button secondary" onclick="showAdminPanel()">В админку</button>';
  html += '</div>';

  return html;
}

function adminModuleCardHtml(module) {
  const name = String(module.name || "");
  const enabled = Boolean(module.enabled);
  const stateLabel = enabled
    ? '<span class="badge active">Включён</span>'
    : '<span class="badge failed">Выключен</span>';
  const actionButton = enabled
    ? '<button class="small-button danger-outline" onclick="disableAdminModule(&quot;' + escapeHtml(name) + '&quot;)">Выключить</button>'
    : '<button class="small-button" onclick="enableAdminModule(&quot;' + escapeHtml(name) + '&quot;)">Включить</button>';

  return ''
    + '<div class="key-card">'
    + '<b>' + protocolLabel(name) + '</b>'
    + '<div>Состояние: ' + stateLabel + '</div>'
    + (module.disabled_at ? '<div class="muted">Выключен: ' + escapeHtml(module.disabled_at) + '</div>' : '')
    + '<div class="actions-row">' + actionButton + '</div>'
    + '</div>';
}

async function enableAdminModule(name) {
  if (!confirm("Включить протокол " + protocolLabel(name) + "?")) {
    return;
  }

  const data = await api("/api/admin/modules/" + name + "/enable", { method: "POST" });
  if (!data.ok) {
    tgAlert("Ошибка: " + (data.error || "не удалось включить протокол"), "Ошибка");
    return;
  }

  await loadModules();
  tgAlert("Протокол включён");
  showAdminModules();
}

async function disableAdminModule(name) {
  const message = "Выключить протокол " + protocolLabel(name) + "?\n\n"
    + "Внимание: текущие ключи/доступы этого протокола будут отозваны и удалены на backend, если сервис сможет это сделать.";

  if (!confirm(message)) {
    return;
  }

  const second = "Подтвердите ещё раз выключение " + protocolLabel(name) + ". Это действие может удалить доступы пользователей.";
  if (!confirm(second)) {
    return;
  }

  const data = await api("/api/admin/modules/" + name + "/disable", { method: "POST" });
  if (!data.ok) {
    tgAlert("Ошибка: " + (data.error || "не удалось выключить протокол"), "Ошибка");
    return;
  }

  await loadModules();
  tgAlert("Протокол выключен. Удалено записей: " + (data.deleted || 0));
  showAdminModules();
}

function protocolLabel(name) {
  const labels = {
    xray: "Xray / VLESS",
    awg: "AmneziaWG",
    socks5: "SOCKS5",
    mtproto: "MTProto",
  };
  return labels[name] || name || "Протокол";
}
