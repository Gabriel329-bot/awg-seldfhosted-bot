async function showAdminUsers(page = 0, fromBack = false) {
  if (!fromBack) {
    pushScreen(() => showAdminPanel());
  }
  enterScreenMode();
  setAdminMode(true);
  setSection("Пользователи", "Загрузка...");

  const data = await api("/api/admin/users?page=" + page);
  if (!data.ok) {
    setSection("Пользователи", "Ошибка: " + (data.error || "не удалось загрузить пользователей"));
    return;
  }

  const users = data.users || [];
  let html = '<p class="muted">Всего: ' + escapeHtml(data.total || 0) + '</p>';

  if (!users.length) {
    html += "<p>Пользователей нет.</p>";
  } else {
    html += users.map(adminUserListItemHtml).join("");
  }

  html += '<div class="actions-row">';
  html += '<button class="small-button" onclick="showAdminUserSearch()">Поиск</button>';
  if (page > 0) {
    html += '<button class="small-button secondary" onclick="showAdminUsers(' + (page - 1) + ')">Назад</button>';
  }
  if ((page + 1) * 20 < (data.total || 0)) {
    html += '<button class="small-button secondary" onclick="showAdminUsers(' + (page + 1) + ')">Дальше</button>';
  }
  html += '<button class="small-button secondary" onclick="showAdminPanel()">В админку</button>';
  html += '</div>';

  setSectionHtml("Пользователи", html);
}

function adminUserListItemHtml(user) {
  return ''
    + '<div class="key-card">'
    + '<b>' + adminUserName(user) + '</b>'
    + '<div>ID: ' + escapeHtml(user.telegram_user_id) + '</div>'
    + '<div>Роль: ' + roleLabel(user.role) + '</div>'
    + '<div>Статус: ' + statusBadge(user.status) + '</div>'
    + '<div>Ключей: ' + escapeHtml(user.key_count) + '</div>'
    + (user.blocked_at ? '<div class="muted">Заблокирован: ' + escapeHtml(user.blocked_at) + '</div>' : '')
    + '<div class="actions-row">'
    + '<button class="small-button" onclick="showAdminUser(' + Number(user.telegram_user_id) + ')">Открыть</button>'
    + '</div>'
    + '</div>';
}

async function showAdminUser(userId, page = 0, fromBack = false) {
  if (!fromBack) {
    pushScreen(() => showAdminUsers(page, true));
  }
  enterScreenMode();
  setAdminMode(true);
  setSection("Пользователь", "Загрузка...");

  const data = await api("/api/admin/users/" + userId);
  if (!data.ok) {
    setSection("Пользователь", "Ошибка: " + (data.error || "не удалось загрузить пользователя"));
    return;
  }

  const user = data.user;
  const keys = data.keys || [];
  const isSuperadmin = isSuperadminRole(data.actor_role);

  let keysHtml = "";
  if (!keys.length) {
    keysHtml = '<p class="muted">Ключей нет или нет прав просмотра.</p>';
  } else {
    keysHtml = keys.map(function (key) {
      return ''
        + '<div class="traffic-box">'
        + '<b>' + escapeHtml(String(key.type || "").toUpperCase()) + ' #' + escapeHtml(key.id) + '</b><br>'
        + 'Статус: ' + statusBadge(key.status) + '<br>'
        + (key.note ? 'Заметка: ' + escapeHtml(key.note) + '<br>' : '')
        + '</div>';
    }).join("");
  }

  let actions = '<div class="actions-row">';
  if (user.status !== "approved" && isSuperadmin) {
    actions += '<button class="small-button" onclick="adminUserAction(' + Number(user.telegram_user_id) + ', &quot;approve&quot;)">Одобрить</button>';
  }
  if (!user.is_blocked) {
    actions += '<button class="small-button danger" onclick="adminUserAction(' + Number(user.telegram_user_id) + ', &quot;block&quot;)">Заблокировать</button>';
  }
  if (user.is_blocked) {
    actions += '<button class="small-button" onclick="adminUserAction(' + Number(user.telegram_user_id) + ', &quot;unblock&quot;)">Разблокировать</button>';
  }
  if (isSuperadmin) {
    actions += '<button class="small-button secondary" onclick="showRoleChange(' + Number(user.telegram_user_id) + ')">Сменить роль</button>';
  }
  if (isSuperadmin) {
    actions += '<button class="small-button" onclick="showAdminIssueKey(' + Number(user.telegram_user_id) + ')">Выдать ключ</button>';
  }
  actions += '<button class="small-button" onclick="showAdminUserKeys(' + Number(user.telegram_user_id) + ')">Ключи пользователя</button>';
  actions += '<button class="small-button" onclick="showAdminUserProxy(' + Number(user.telegram_user_id) + ')">Прокси пользователя</button>';
  actions += '<button class="small-button secondary" onclick="showAdminUsers(0, true)">К пользователям</button>';
  actions += '</div>';

  const html = ''
    + '<div class="profile-card">'
    + '<div class="avatar">' + escapeHtml(adminUserInitial(user)) + '</div>'
    + '<div><h3>' + adminUserName(user) + '</h3><div class="muted">ID ' + escapeHtml(user.telegram_user_id) + '</div></div>'
    + '</div>'
    + '<div class="info-grid">'
    + '<div class="info-item"><span>Роль</span><b>' + roleLabel(user.role) + '</b></div>'
    + '<div class="info-item"><span>Статус</span><b>' + statusBadge(user.status) + '</b></div>'
    + '<div class="info-item"><span>Ключей</span><b>' + escapeHtml(user.key_count) + '</b></div>'
    + '<div class="info-item"><span>Username</span><b>' + (user.username ? "@" + escapeHtml(user.username) : "нет") + '</b></div>'
    + '<div class="info-item"><span>Ваши права</span><b>' + roleLabel(data.actor_role) + '</b></div>'
    + '</div>'
    + (user.note ? '<div class="key-card"><b>Заметка</b><div>' + escapeHtml(user.note) + '</div></div>' : '')
    + '<div class="key-card"><b>Ключи</b><div class="muted">Откройте отдельный раздел ключей пользователя.</div></div>'
    + actions;

  setSectionHtml("Пользователь", html);
}

function showRoleChange(userId) {
  setSectionHtml("Сменить роль", ''
    + '<p class="muted">Выберите новую роль пользователя.</p>'
    + '<div class="actions-row">'
    + '<button class="small-button secondary" onclick="setAdminUserRole(' + Number(userId) + ', &quot;pending_user&quot;)">Ожидает одобрения</button>'
    + '<button class="small-button" onclick="setAdminUserRole(' + Number(userId) + ', &quot;approved_user&quot;)">Пользователь</button>'
    + '<button class="small-button secondary" onclick="setAdminUserRole(' + Number(userId) + ', &quot;moderator&quot;)">Модератор</button>'
    + '<button class="small-button danger" onclick="setAdminUserRole(' + Number(userId) + ', &quot;blocked_user&quot;)">Заблокирован</button>'
    + '<button class="small-button secondary" onclick="showAdminUser(' + Number(userId) + ')">Назад</button>'
    + '</div>'
  );
}

async function setAdminUserRole(userId, role) {
  if (!confirm("Изменить роль пользователя?")) {
    return;
  }

  const data = await api("/api/admin/users/" + userId + "/role", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({role}),
  });

  if (!data.ok) {
    tgAlert("Ошибка: " + (data.error || "не удалось изменить роль"), "Ошибка");
    return;
  }

  tgAlert("Роль изменена");
  showAdminUser(userId);
}

async function adminUserAction(userId, action) {
  const labels = {
    approve: "одобрить пользователя",
    block: "заблокировать пользователя и отозвать доступы",
    unblock: "разблокировать пользователя",
    "toggle-moderator": "изменить роль модератора",
  };

  if (!confirm("Вы уверены, что хотите " + (labels[action] || action) + "?")) {
    return;
  }

  const data = await api("/api/admin/users/" + userId + "/" + action, { method: "POST" });
  if (!data.ok) {
    tgAlert("Ошибка: " + (data.error || "действие не выполнено"), "Ошибка");
    return;
  }

  tgAlert("Готово");
  showAdminUser(userId);
}

function adminUserName(user) {
  if (user.username) return "@" + escapeHtml(user.username);
  if (user.first_name) return escapeHtml(user.first_name);
  return "ID " + escapeHtml(user.telegram_user_id);
}

function adminUserInitial(user) {
  return String(user.first_name || user.username || "U").slice(0, 1).toUpperCase();
}


function isSuperadminRole(role) {
  const value = String(role || "").toLowerCase();
  return value.includes("superadmin");
}

function showAdminUserSearch() {
  enterScreenMode();
  setAdminMode(true);

  setSectionHtml("Поиск пользователей", ''
    + '<label class="label">Username или Telegram ID</label>'
    + '<input id="admin-user-search-input" class="input" placeholder="Например: username или 123456789">'
    + '<div class="actions-row">'
    + '<button class="small-button" onclick="runAdminUserSearch()">Найти</button>'
    + '<button class="small-button secondary" onclick="showAdminUsers()">Список пользователей</button>'
    + '</div>'
    + '<div id="admin-user-search-results"></div>'
  );

  const input = document.getElementById("admin-user-search-input");
  if (input) {
    input.focus();
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        runAdminUserSearch();
      }
    });
  }
}

async function runAdminUserSearch() {
  const input = document.getElementById("admin-user-search-input");
  const results = document.getElementById("admin-user-search-results");
  const query = (input?.value || "").trim();

  if (!results) return;
  if (query.length < 2) {
    results.innerHTML = '<p class="muted">Введите минимум 2 символа.</p>';
    return;
  }

  results.innerHTML = '<p class="muted">Ищу...</p>';

  const data = await api("/api/admin/users/search?q=" + encodeURIComponent(query));
  if (!data.ok) {
    results.innerHTML = '<p>Ошибка: ' + escapeHtml(data.error || "не удалось выполнить поиск") + '</p>';
    return;
  }

  const users = data.users || [];
  if (!users.length) {
    results.innerHTML = '<p>Ничего не найдено.</p>';
    return;
  }

  results.innerHTML = users.map(adminUserSearchItemHtml).join("");
}

function adminUserSearchItemHtml(user) {
  return ''
    + '<div class="key-card">'
    + '<b>' + adminUserName(user) + '</b>'
    + '<div>ID: ' + escapeHtml(user.telegram_user_id) + '</div>'
    + '<div>Роль: ' + roleLabel(user.role) + '</div>'
    + '<div>Статус: ' + statusBadge(user.status) + '</div>'
    + '<div>Ключей: ' + escapeHtml(user.key_count) + '</div>'
    + '<div class="actions-row">'
    + '<button class="small-button" onclick="showAdminUser(' + Number(user.telegram_user_id) + ')">Открыть карточку</button>'
    + '</div>'
    + '</div>';
}
