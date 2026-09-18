'use strict';

const { createSessionToken } = require('../api/_lib/auth-session.cjs');

function getTestAuthData(role = 'admin') {
  if (role === 'mock') {
    const user = {
      email: 'zak@cpsolvers.com',
      name: 'Zak',
      role: 'admin',
      id: 'admin-zak',
      isMock: true,
      isAuthenticated: true
    };
    const token = createSessionToken(user);
    return { user, token };
  }
  const user = {
    email: role === 'admin' ? 'zak@cpsolvers.com' : 'member@cpsolvers.com',
    name: role === 'admin' ? 'Zak' : 'Member',
    role: role,
    id: role === 'admin' ? 'admin-zak' : 'mem-test',
    isAuthenticated: true
  };
  const token = createSessionToken(user);
  return { user, token };
}

async function injectAuth(contextOrPage, role = 'admin') {
  const { user, token } = getTestAuthData(role);

  if (contextOrPage.addCookies) {
    await contextOrPage.addCookies([{
      name: 'cps_session',
      value: encodeURIComponent(token),
      domain: '127.0.0.1',
      path: '/'
    }]);
  }

  if (contextOrPage.addInitScript) {
    await contextOrPage.addInitScript(({ user, token }) => {
      try {
        if (user.isMock) {
          sessionStorage.setItem('cps-mock-identity', JSON.stringify({
            id: user.id,
            name: user.name,
            role: user.role,
            email: user.email
          }));
        } else {
          localStorage.setItem('isAuthenticated', 'true');
          localStorage.setItem('userEmail', user.email);
          localStorage.setItem('userName', user.name);
          localStorage.setItem('userRole', user.role);
          localStorage.setItem('userId', user.id);
          localStorage.setItem('userOnboarded', 'true');
          localStorage.setItem('cps_token', token);
        }
        const KEY = 'cps-hub-workspace-v2';
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
        saved.isAdmin = user.role === 'admin';
        saved.role = user.role === 'admin' ? 'Super admin' : 'Member';
        localStorage.setItem(KEY, JSON.stringify(saved));
      } catch (e) {}
    }, { user, token });
  }

  return { user, token };
}

async function injectAuthCDP(cdp, role = 'admin') {
  const { user, token } = getTestAuthData(role);
  const script = user.isMock ? `
    try {
      sessionStorage.setItem('cps-mock-identity', JSON.stringify({
        id: ${JSON.stringify(user.id)},
        name: ${JSON.stringify(user.name)},
        role: ${JSON.stringify(user.role)},
        email: ${JSON.stringify(user.email)}
      }));
      const KEY = 'cps-hub-workspace-v2';
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      saved.isAdmin = ${user.role === 'admin'};
      saved.role = ${JSON.stringify(user.role === 'admin' ? 'Super admin' : 'Member')};
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch (e) {}
  ` : `
    try {
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userEmail', ${JSON.stringify(user.email)});
      localStorage.setItem('userName', ${JSON.stringify(user.name)});
      localStorage.setItem('userRole', ${JSON.stringify(user.role)});
      localStorage.setItem('userId', ${JSON.stringify(user.id)});
      localStorage.setItem('userOnboarded', 'true');
      localStorage.setItem('cps_token', ${JSON.stringify(token)});
      const KEY = 'cps-hub-workspace-v2';
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      saved.isAdmin = ${user.role === 'admin'};
      saved.role = ${JSON.stringify(user.role === 'admin' ? 'Super admin' : 'Member')};
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch (e) {}
  `;
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: script });
  return { user, token };
}

module.exports = {
  getTestAuthData,
  injectAuth,
  injectAuthCDP
};
