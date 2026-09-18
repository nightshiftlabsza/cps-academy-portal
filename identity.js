'use strict';

/**
 * CPS Academy Portal - Local Mock Identity Adapter
 *
 * Implements a lightweight mock identity layer for local testing on loopback origins.
 * This adapter is strictly disabled on production/non-loopback origins.
 * Mock profiles are stored in session storage, isolated from workspace backups.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Identity = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SESSION_KEY = 'cps-mock-identity';

  // Explicit mappings from application-user ID to ledger canonical-person ID.
  // Never assume application user ID equals ledger person ID.
  const LEDGER_PERSON_MAPPINGS = {
    'zg': 'person-5b2737d41e4ac7b28700df42'
  };

  const subscribers = new Set();
  let memoryStore = null; // Node / fallback memory store

  function isLoopbackOrigin() {
    if (typeof window === 'undefined' || !window.location) {
      return true; // Node.js test environment defaults to loopback
    }
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  }

  function getRawStored() {
    if (typeof sessionStorage !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    return memoryStore;
  }

  function setRawStored(profile) {
    if (typeof sessionStorage !== 'undefined') {
      try {
        if (profile) {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      } catch {}
    }
    memoryStore = profile;
  }

  function notify(user) {
    subscribers.forEach(fn => {
      try {
        fn(user);
      } catch (err) {
        console.error('Identity subscriber error:', err);
      }
    });
  }

  function getCurrentUser() {
    // 1. Check local mock storage (loopback testing only, active in-session test profile takes precedence)
    if (isLoopbackOrigin()) {
      const stored = getRawStored();
      if (stored && stored.id) {
        return {
          ...stored,
          isMock: true,
          productionAuthorized: false,
          isLocalTestProfile: true
        };
      }
    }

    // 2. Check persistent authentication (shared with Scheduler)
    if (typeof localStorage !== 'undefined') {
      try {
        if (localStorage.getItem('isAuthenticated') === 'true') {
          const email = localStorage.getItem('userEmail') || '';
          const name = localStorage.getItem('userName') || (email ? email.split('@')[0] : 'Member');
          const role = localStorage.getItem('userRole') || 'member';
          const id = localStorage.getItem('userId') || `mem-${email.replace(/[^a-z0-9]+/g, '-')}`;
          const onboarded = localStorage.getItem('userOnboarded') === 'true';
          const onboardedAt = localStorage.getItem('userOnboardedAt') || '';
          return {
            id,
            name,
            email,
            role,
            onboarded,
            onboardedAt,
            isMock: false,
            isAuthenticated: true,
            productionAuthorized: true
          };
        }
      } catch {}
    }

    return null;
  }

  async function login(email, password) {
    let res;
    try {
      res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
    } catch (e) {
      throw new Error('Could not connect to server. Please check your network or restart npm start.');
    }
    if (!res.ok) {
      if (res.status === 405 || res.status === 404) {
        throw new Error('Server running outdated code. Please stop and restart npm start in your terminal.');
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Login failed');
    }
    const data = await res.json();
    if (data && data.success && data.user) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userEmail', data.user.email);
        localStorage.setItem('userName', data.user.name);
        localStorage.setItem('userRole', data.user.role);
        localStorage.setItem('userId', data.user.id);
        localStorage.setItem('userOnboarded', String(Boolean(data.user.onboarded)));
        if (data.user.onboardedAt) localStorage.setItem('userOnboardedAt', data.user.onboardedAt);
        if (data.token) localStorage.setItem('cps_token', data.token);
        try {
          const KEY = 'cps-hub-workspace-v2';
          const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
          if (saved) {
            saved.isAdmin = data.user.role === 'admin';
            saved.role = data.user.role === 'admin' ? 'Super admin' : 'Member';
            localStorage.setItem(KEY, JSON.stringify(saved));
          }
        } catch {}
      }
      const user = getCurrentUser();
      notify(user);
      return user;
    }
    throw new Error('Unexpected login response');
  }

  function setOnboarded(status = true, timestamp = '') {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('userOnboarded', String(Boolean(status)));
      if (timestamp) localStorage.setItem('userOnboardedAt', timestamp);
    }
    const user = getCurrentUser();
    notify(user);
    return user;
  }

  function logout() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userId');
      localStorage.removeItem('userOnboarded');
      localStorage.removeItem('userOnboardedAt');
      localStorage.removeItem('cps_token');
      try {
        const KEY = 'cps-hub-workspace-v2';
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved) {
          saved.isAdmin = false;
          saved.role = 'VMR Leadership';
          localStorage.setItem(KEY, JSON.stringify(saved));
        }
      } catch {}
    }
    // Call server to expire HttpOnly cookie
    try {
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' })
      }).catch(() => {});
    } catch {}

    clearMockUser();
    notify(null);
  }

  function setMockUser(profile) {
    if (!isLoopbackOrigin()) {
      throw new Error('Local mock identity adapter is disabled on non-loopback origins.');
    }
    if (!profile || typeof profile !== 'object' || !profile.id) {
      throw new Error('Valid profile object with id is required.');
    }
    const cleanProfile = {
      id: String(profile.id).trim(),
      name: String(profile.name || profile.id).trim(),
      ...(profile.email ? { email: String(profile.email).trim() } : {})
    };
    setRawStored(cleanProfile);
    const user = getCurrentUser();
    notify(user);
    return user;
  }

  function clearMockUser() {
    setRawStored(null);
    notify(null);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  function getLedgerPersonId(userOrId) {
    if (!userOrId) return null;
    const id = typeof userOrId === 'string' ? userOrId : userOrId.id;
    return LEDGER_PERSON_MAPPINGS[id] || null;
  }

  function setLedgerPersonMapping(userId, canonicalPersonId) {
    if (userId && canonicalPersonId) {
      LEDGER_PERSON_MAPPINGS[userId] = canonicalPersonId;
    }
  }

  function isProductionAuthorized(user) {
    if (!user || user.isMock) return false;
    return Boolean(user.isAuthenticated);
  }

  // Development profile preset loader.
  function getDevelopmentProfile() {
    return {
      id: 'zg',
      name: 'Zakariyya G'
    };
  }

  return {
    getCurrentUser,
    login,
    logout,
    setMockUser,
    clearMockUser,
    subscribe,
    isLoopbackOrigin,
    getLedgerPersonId,
    setLedgerPersonMapping,
    setOnboarded,
    isProductionAuthorized,
    getDevelopmentProfile,
    SESSION_KEY
  };
});
