window.App = window.App || {};

App.Toast = {
  el: null,
  timer: null,

  show(msg, duration = 2000) {
    if (!App.Toast.el) {
      App.Toast.el = document.createElement('div');
      App.Toast.el.className = 'toast';
      document.body.appendChild(App.Toast.el);
    }
    App.Toast.el.textContent = msg;
    App.Toast.el.classList.add('show');
    clearTimeout(App.Toast.timer);
    App.Toast.timer = setTimeout(() => {
      App.Toast.el.classList.remove('show');
    }, duration);
  }
};

App.Router = {
  routes: {},
  currentRoute: null,
  unsubscribers: [],

  register(path, handler) {
    App.Router.routes[path] = handler;
  },

  async init() {
    window.addEventListener('hashchange', () => App.Router.handleRoute());

    // Save setup mode and invite code early (before any redirects strip query params)
    const initHash = location.hash || '';
    if (initHash.includes('setup=1')) {
      App._setupMode = true;
    }
    const urlInvite = App.Couple.getInviteCodeFromURL();
    if (urlInvite) {
      App._pendingInvite = urlInvite;
    }

    // Wait for auth state
    const user = await App.Auth.init();

    // Check for invite code
    const inviteCode = urlInvite || App._pendingInvite;

    if (inviteCode && user) {
      App._pendingInvite = null;
      await App.Couple.loadCouple();
      if (!App.Couple.isLinked()) {
        const success = await App.Couple.acceptInvite(inviteCode);
        if (success) {
          App.Toast.show('커플 연결 완료!');
          location.hash = '#/feed';
          return;
        }
      }
    }

    if (!user) {
      location.hash = '#/login';
    } else {
      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 8000)
        );
        await Promise.race([App.Couple.loadCouple(), timeout]);
      } catch (e) {
        console.error('Couple load timeout:', e);
      }

      // Access control: must be in a couple, have pending couple, or setup mode
      if (!App.Couple.isLinked() && !App.Couple.currentCouple && !App._setupMode) {
        // Not in any couple and no setup permission → unauthorized
        App.Toast.show('접근 권한이 없습니다');
        await App.Auth.signOut();
        return;
      }

      if (!App.Couple.isLinked()) {
        location.hash = '#/couple-link';
      } else if (!location.hash || location.hash === '#/' || location.hash === '#/login' || location.hash === '#/couple-link') {
        location.hash = '#/feed';
      }
    }

    App.Router.handleRoute();
  },

  async handleRoute() {
    // Cleanup previous listeners
    App.Router.unsubscribers.forEach(fn => fn());
    App.Router.unsubscribers = [];

    const hash = location.hash || '#/login';
    const [path, query] = hash.split('?');

    // Parse route params
    let routeKey = path;
    let params = {};

    // Match /detail/:id pattern
    const detailMatch = path.match(/^#\/detail\/(.+)$/);
    if (detailMatch) {
      routeKey = '#/detail';
      params.id = detailMatch[1];
    }

    // Parse query params
    if (query) {
      query.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        params[k] = decodeURIComponent(v);
      });
    }

    // Auth guard
    const publicRoutes = ['#/login'];
    if (!publicRoutes.includes(routeKey) && !App.Auth.currentUser) {
      location.hash = '#/login';
      return;
    }

    // Couple guard
    const coupleRequiredRoutes = ['#/feed', '#/write', '#/detail', '#/my'];
    if (coupleRequiredRoutes.includes(routeKey) && !App.Couple.isLinked()) {
      location.hash = '#/couple-link';
      return;
    }

    const handler = App.Router.routes[routeKey];
    if (handler) {
      App.Router.currentRoute = routeKey;
      App.Router.updateNav(routeKey);
      await handler(params);
    } else {
      location.hash = '#/feed';
    }
  },

  updateNav(route) {
    const nav = document.getElementById('bottom-nav');
    const showNav = ['#/feed', '#/write', '#/my'].includes(route);
    nav.classList.toggle('hidden', !showNav);

    nav.querySelectorAll('.nav-item').forEach(item => {
      const r = item.dataset.route;
      item.classList.toggle('active', route === `#/${r}`);
      item.onclick = () => { location.hash = `#/${r}`; };
    });
  },

  addUnsubscriber(fn) {
    App.Router.unsubscribers.push(fn);
  }
};

App.escapeHtml = function(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};
