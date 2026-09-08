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
    // Disable mock adapter on non-loopback origins.
    // Production identity remains unavailable until a real provider is integrated.
    if (!isLoopbackOrigin()) {
      return null;
    }
    const stored = getRawStored();
    if (!stored || !stored.id) {
      return null;
    }
    return {
      ...stored,
      isMock: true,
      productionAuthorized: false,
      isLocalTestProfile: true
    };
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
    // A mock profile cannot establish production authorization.
    if (!user || user.isMock) return false;
    return false;
  }

  // Development profile preset loader.
  // Profile email is supplied through local configuration / session storage;
  // synthetic identities are used in tests.
  function getDevelopmentProfile() {
    return {
      id: 'zg',
      name: 'Zakariyya G'
    };
  }

  return {
    getCurrentUser,
    setMockUser,
    clearMockUser,
    subscribe,
    isLoopbackOrigin,
    getLedgerPersonId,
    setLedgerPersonMapping,
    isProductionAuthorized,
    getDevelopmentProfile,
    SESSION_KEY
  };
});
