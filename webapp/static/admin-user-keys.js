async function showAdminUserKeys(userId) {
  enterScreenMode();
  setAdminMode(true);
  setSection("Ключи пользователя", "Загрузка...");

  const data = await api("/api/admin/users/" + userId + "/keys");
  if (!data.ok) {
    setSection("Ключи пользователя", "Ошибка: " + (data.error || "не удалось загрузить ключи"));
    return;
  }

  const keys = data.keys || [];
  let html = '<p class="muted">Пользователь ID: ' + escapeHtml(userId) + '</p>';

  if (!keys.length) {
    html += "<p>Ключей нет.</p>";
  } else {
    html += keys.map(adminUserKeyCardHtml).join("");
  }

  html += '<div class="actions-row">';
  html += '<button class="small-button secondary" onclick="showAdminUser(' + Number(userId) + ')">К пользователю</button>';
  html += '</div>';

  setSectionHtml("Ключи пользователя", html);
  keys.forEach(function (key) {
    refreshAdminKeyTraffic(Number(key.id));
  });
}

function adminUserKeyCardHtml(key) {
  const isAwg = key.type === "awg";
  const canShow = key.status === "active";
  let html = ''
    + '<div class="key-card">'
    + '<b>' + escapeHtml(String(key.type || "").toUpperCase()) + ' #' + escapeHtml(key.id) + '</b>'
    + '<div>Статус: ' + statusBadge(key.status) + '</div>'
    + '<div>Транспорт: ' + escapeHtml(key.transport || "tcp") + '</div>'
    + (key.client_ip ? '<div>IP: ' + escapeHtml(key.client_ip) + '</div>' : '')
    + (key.expires_at ? '<div>Истекает: ' + escapeHtml(key.expires_at) + '</div>' : '<div>Без срока</div>')
    + (key.note ? '<div class="muted">' + escapeHtml(key.note) + '</div>' : '')
    + '<div class="traffic-box" id="admin-traffic-' + Number(key.id) + '">Трафик: загружается...</div>'
    + '<div class="actions-row">';

  if (canShow) {
    html += '<button class="small-button" onclick="showAdminKeyShare(' + Number(key.id) + ')">Показать ключ</button>';
    if (isAwg) {
      html += '<button class="small-button secondary" onclick="downloadAdminKeyConfig(' + Number(key.id) + ')">Скачать .conf</button>';
    }
  }

  html += '<button class="small-button secondary" onclick="refreshAdminKeyTraffic(' + Number(key.id) + ')">Статистика</button>';

  if (key.status === "active") {
    html += '<button class="small-button danger" onclick="revokeAdminKey(' + Number(key.id) + ')">Отозвать</button>';
  }

  if (key.status !== "deleted") {
    html += '<button class="small-button danger-outline" onclick="deleteAdminKey(' + Number(key.id) + ')">Удалить</button>';
  }

  html += '</div></div>';
  return html;
}

async function showAdminKeyShare(keyId) {
  setSection("Ключ", "Загрузка...");

  const data = await api("/api/admin/keys/" + keyId + "/share");
  if (!data.ok) {
    setSection("Ключ", "Ошибка: " + (data.error || "не удалось получить ключ"));
    return;
  }

  window.currentVpnLink = data.share_link || "";
  setSectionHtml("Ключ #" + keyId, ''
    + '<div class="vpn-link">' + escapeHtml(window.currentVpnLink) + '</div>'
    + '<button class="small-button" onclick="copyVpnLink()">Скопировать</button>'
  );
}

function downloadAdminKeyConfig(keyId) {
  fetch("/api/admin/keys/" + keyId + "/download", {
    headers: { "X-Telegram-Init-Data": initData },
  })
    .then(async function (response) {
      if (!response.ok) {
        const data = await response.json().catch(function () { return {}; });
        throw new Error(data.error || "не удалось скачать файл");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "awg-" + keyId + ".conf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    })
    .catch(function (error) {
      tgAlert("Ошибка: " + error.message, "Ошибка");
    });
}

async function refreshAdminKeyTraffic(keyId) {
  const box = document.getElementById("admin-traffic-" + keyId);
  if (box) box.textContent = "Трафик: обновляю...";

  const data = await api("/api/admin/keys/" + keyId + "/traffic");
  if (!data.ok) {
    if (box) box.textContent = "Трафик: ошибка — " + (data.error || "не удалось обновить");
    return;
  }

  if (box) {
    box.innerHTML = '<b>Трафик</b><br>↓ Скачать: '
      + escapeHtml(data.downloaded)
      + '<br>↑ Отдать: '
      + escapeHtml(data.uploaded);
  }
}

async function revokeAdminKey(keyId) {
  if (!await tgConfirm("Отозвать ключ #" + keyId + "? Он перестанет работать.")) {
    return;
  }

  const data = await api("/api/admin/keys/" + keyId + "/revoke", { method: "POST" });
  if (!data.ok) {
    tgAlert("Ошибка: " + (data.error || "не удалось отозвать ключ"), "Ошибка");
    return;
  }

  tgAlert("Ключ отозван");
  goBack();
}

async function deleteAdminKey(keyId) {
  if (!await tgConfirm("Удалить ключ #" + keyId + "? Это действие нельзя отменить.")) {
    return;
  }

  const data = await api("/api/admin/keys/" + keyId + "/delete", { method: "POST" });
  if (!data.ok) {
    tgAlert("Ошибка: " + (data.error || "не удалось удалить ключ"), "Ошибка");
    return;
  }

  tgAlert("Ключ удалён");
  goBack();
}

function showAdminIssueKey(userId) {
  enterScreenMode();
  setAdminMode(true);

  setSectionHtml("Выдать ключ", ''
    + '<label class="label">Тип ключа</label>'
    + '<select id="admin-issue-type" class="input" onchange="renderAdminIssueOptions()">'
    + '<option value="awg">AmneziaWG</option>'
    + '<option value="xray">VLESS / Xray</option>'
    + '</select>'

    + '<label class="label">Название устройства</label>'
    + '<input id="admin-issue-note" class="input" maxlength="200" placeholder="Например: iPhone, Android, Laptop">'

    + '<div id="admin-issue-options"></div>'

    + '<button class="small-button" onclick="createAdminUserKey(' + Number(userId) + ')">Создать ключ</button>'
    + '<button class="small-button secondary" onclick="showAdminUser(' + Number(userId) + ')">Назад</button>'
  );

  renderAdminIssueOptions();
}

function renderAdminIssueOptions() {
  const type = document.getElementById("admin-issue-type")?.value || "awg";
  const box = document.getElementById("admin-issue-options");
  if (!box) return;

  if (type === "awg") {
    box.innerHTML = ''
      + '<label class="label">MTU, необязательно</label>'
      + '<input id="admin-issue-mtu" class="input" inputmode="numeric" placeholder="1280">';
    return;
  }

  box.innerHTML = ''
    + '<label class="label">Fingerprint</label>'
    + '<select id="admin-issue-fingerprint" class="input">'
    + '<option value="chrome">chrome</option>'
    + '<option value="firefox">firefox</option>'
    + '<option value="safari">safari</option>'
    + '<option value="ios">ios</option>'
    + '<option value="android">android</option>'
    + '<option value="edge">edge</option>'
    + '<option value="randomized">randomized</option>'
    + '</select>'

    + '<label class="label">Транспорт</label>'
    + '<select id="admin-issue-transport" class="input">'
    + '<option value="tcp">VLESS TCP</option>'
    + '<option value="http">VLESS HTTP, если включён</option>'
    + '</select>';
}

async function createAdminUserKey(userId) {
  const type = document.getElementById("admin-issue-type")?.value || "awg";
  const note = document.getElementById("admin-issue-note")?.value || "";
  const mtu = document.getElementById("admin-issue-mtu")?.value || "";
  const fingerprint = document.getElementById("admin-issue-fingerprint")?.value || "chrome";
  const transport = document.getElementById("admin-issue-transport")?.value || "tcp";

  setSection("Выдать ключ", "Создаю ключ...");

  const data = await api("/api/admin/users/" + userId + "/keys/issue", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({type, note, mtu, fingerprint, transport}),
  });

  if (!data.ok) {
    setSectionHtml("Выдать ключ", ''
      + '<p>Ошибка: ' + escapeHtml(data.error || "не удалось создать ключ") + '</p>'
      + '<button class="small-button secondary" onclick="showAdminIssueKey(' + Number(userId) + ')">Попробовать снова</button>'
      + '<button class="small-button secondary" onclick="showAdminUser(' + Number(userId) + ')">К пользователю</button>'
    );
    return;
  }

  window.currentVpnLink = data.share_link || "";
  const canDownload = data.key && data.key.type === "awg";

  setSectionHtml("Ключ создан", ''
    + '<p>Ключ #' + escapeHtml(data.key.id) + ' создан для пользователя ' + escapeHtml(userId) + '.</p>'
    + '<div class="vpn-link">' + escapeHtml(window.currentVpnLink || "Ключ не найден") + '</div>'
    + '<button class="small-button" onclick="copyVpnLink()">Скопировать ключ</button>'
    + (canDownload ? '<button class="small-button secondary" onclick="downloadAdminKeyConfig(' + Number(data.key.id) + ')">Скачать .conf</button>' : '')
    + '<button class="small-button secondary" onclick="showAdminUserKeys(' + Number(userId) + ')">К ключам пользователя</button>'
  );
}
