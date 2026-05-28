(function() {
  var params = new URLSearchParams(window.location.search);
  var tenant = params.get('tenant') || 'demo';
  var token = sessionStorage.getItem('bwanali_token');
  var user = null;
  try { user = JSON.parse(sessionStorage.getItem('bwanali_user')); } catch(e) {}
  var schoolType = sessionStorage.getItem('school_type') || 'private';

  var profileLink = '';
  if (user && user.role) {
    var role = user.role;
    if (role === 'admin') profileLink = '<a href="/pages/dashboard.html?tenant='+tenant+'" class="nav-item" data-page="dashboard">📊 Dashboard</a>';
    else if (role === 'deputy') profileLink = '<a href="/pages/deputy.html?tenant='+tenant+'" class="nav-item" data-page="deputy">👔 My Profile</a>';
    else if (role === 'hod') profileLink = '<a href="/pages/hod.html?tenant='+tenant+'" class="nav-item" data-page="hod">👨‍🏫 My Profile</a>';
    else if (role === 'teacher') profileLink = '<a href="/pages/teacher.html?tenant='+tenant+'" class="nav-item" data-page="teacher">👩‍🏫 My Profile</a>';
    else if (role === 'accountant') profileLink = '<a href="/pages/accountant.html?tenant='+tenant+'" class="nav-item" data-page="accountant">💼 My Profile</a>';
    else if (role === 'guidance') profileLink = '<a href="/pages/guidance.html?tenant='+tenant+'" class="nav-item" data-page="guidance">🧭 My Profile</a>';
    else profileLink = '<a href="/pages/dashboard.html?tenant='+tenant+'" class="nav-item" data-page="dashboard">📊 Dashboard</a>';
  }

  var financeLinks = '';
  if (schoolType !== 'government-no-fees') {
    financeLinks = '<a href="/pages/accounts.html?tenant='+tenant+'" class="nav-item" data-page="accounts">💰 Accounts</a>';
  }

  var sidebarHTML = '<div class="sidebar-overlay" id="sidebarOverlay"></div>' +
    '<aside class="sidebar" id="sidebar">' +
      '<div class="sidebar-brand"><h2>BWANALI</h2></div>' +
      '<nav id="navMenu">' +
        profileLink +
        '<a href="/pages/enrollment.html?tenant='+tenant+'" class="nav-item" data-page="enrollment">📝 Enrollment</a>' +
        '<a href="/pages/students.html?tenant='+tenant+'" class="nav-item" data-page="students">👥 Students</a>' +
        '<a href="/pages/classes.html?tenant='+tenant+'" class="nav-item" data-page="classes">🏫 Classes</a>' +
        '<a href="/pages/staff.html?tenant='+tenant+'" class="nav-item" data-page="staff">👩‍🏫 Staff</a>' +
        '<a href="/pages/committees.html?tenant='+tenant+'" class="nav-item" data-page="committees">🤝 Committees</a>' +
        '<a href="/pages/monitoring.html?tenant='+tenant+'" class="nav-item" data-page="monitoring">🔍 Monitoring</a>' +
        '<a href="/pages/attendance.html?tenant='+tenant+'" class="nav-item" data-page="attendance">📅 Attendance</a>' +
        '<a href="/pages/assessments.html?tenant='+tenant+'" class="nav-item" data-page="assessments">📋 Assessments</a>' +
        '<a href="/pages/results.html?tenant='+tenant+'" class="nav-item" data-page="results">📈 Results</a>' +
        financeLinks +
        '<a href="/pages/library.html?tenant='+tenant+'" class="nav-item" data-page="library">📚 Library</a>' +
        '<a href="/pages/announcements.html?tenant='+tenant+'" class="nav-item" data-page="announcements">📢 Announcements</a>' +
        '<a href="/pages/timetable.html?tenant='+tenant+'" class="nav-item" data-page="timetable">🕒 Timetable</a>' +
      '</nav>' +
      '<div class="sidebar-footer"><a href="/login.html" class="nav-item" onclick="sessionStorage.clear()">🔒 Logout</a></div>' +
    '</aside>';

  var topbarHTML = '<header class="topbar">' +
      '<button class="hamburger" id="hamburgerBtn">☰</button>' +
      '<h1 id="schoolTitle">Loading...</h1>' +
      '<div class="user-info" style="display:flex; align-items:center; gap:8px;">' +
        '<span id="bellBadge" style="display:none; background:red; color:white; border-radius:50%; padding:2px 6px; font-size:12px; cursor:pointer;" onclick="window.location.href=\'/pages/announcements.html?tenant='+tenant+'\'"></span>' +
        '<span id="userInfo">Loading...</span>' +
      '</div>' +
    '</header>';

  var notifyHTML = '<div id="notifyBar" class="notify-bar"></div>' +
    '<div id="loadingOverlay" class="loading-overlay" style="display:none;"><div class="loading-spinner"></div></div>';

  document.body.innerHTML = '';
  document.body.classList.add('dashboard-bg');
  var wrapper = document.createElement('div');
  wrapper.className = 'dashboard';
  wrapper.innerHTML = sidebarHTML + '<main class="content">' + topbarHTML + notifyHTML + '<div id="page-content"></div></main>';
  document.body.appendChild(wrapper);

  var currentPage = document.body.getAttribute('data-page');
  if (currentPage) {
    var activeLink = document.querySelector('.nav-item[data-page="'+currentPage+'"]');
    if (activeLink) activeLink.classList.add('active');
  }

  // Notification bell updater
  function updateBell() {
    if (!token) return;
    fetch('/api/notifications/bell?tenant='+tenant, { headers: { 'Authorization': 'Bearer '+token } })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var badge = document.getElementById('bellBadge');
        if (!badge) return;
        badge.textContent = d.unread || '';
        badge.style.display = d.unread > 0 ? 'inline-block' : 'none';
      });
  }
  updateBell();
  setInterval(updateBell, 60000);

  // Helpers
  window.showNotification = function(message, type) {
    type = type || 'info';
    var bar = document.getElementById('notifyBar');
    if (!bar) return;
    bar.textContent = message;
    bar.className = 'notify-bar ' + type;
    bar.style.display = 'block';
    setTimeout(function() { bar.style.display = 'none'; }, 5000);
  };

  window.showLoading = function() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
  };
  window.hideLoading = function() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  // Auth fetch
  function authFetch(url, options) {
    options = options || {};
    var headers = options.headers || {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, Object.assign({}, options, { headers: headers }));
  }

  authFetch('/api/tenant?tenant=' + tenant)
    .then(function(res) { return res.json(); })
    .then(function(data) { document.getElementById('schoolTitle').textContent = data.name || 'Bwanali SMS'; })
    .catch(function() { document.getElementById('schoolTitle').textContent = 'Bwanali SMS'; });

  if (token) {
    authFetch('/api/auth/me')
      .then(function(res) { return res.json(); })
      .then(function(userData) { document.getElementById('userInfo').textContent = userData.fullName || userData.email || 'User'; })
      .catch(function() { document.getElementById('userInfo').textContent = 'User'; });
  } else {
    document.getElementById('userInfo').textContent = 'Not logged in';
  }

  // Global fetch override (auth + loading + error)
  var originalFetch = window.fetch;
  window.fetch = function(url, options) {
    options = options || {};
    var t = sessionStorage.getItem('bwanali_token');
    if (t && url.startsWith('/api/')) {
      options.headers = options.headers || {};
      if (!options.headers.Authorization) options.headers['Authorization'] = 'Bearer ' + t;
    }
    if (!options._hideLoading && url.startsWith('/api/')) {
      window.showLoading && window.showLoading();
    }
    return originalFetch(url, options)
      .then(function(response) {
        window.hideLoading && window.hideLoading();
        if (!response.ok) {
          response.clone().json().then(function(err) {
            window.showNotification && window.showNotification(err.error || err.message || 'An error occurred', 'error');
          }).catch(function() {});
        }
        return response;
      })
      .catch(function(err) {
        window.hideLoading && window.hideLoading();
        window.showNotification && window.showNotification('Network error – please check your connection.', 'error');
        throw err;
      });
  };

  // Hamburger
  var hamburger = document.getElementById('hamburgerBtn');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebarOverlay');
  if (hamburger && sidebar) {
    hamburger.addEventListener('click', function() { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); });
    overlay.addEventListener('click', function() { sidebar.classList.remove('open'); overlay.classList.remove('active'); });
  }
})();
