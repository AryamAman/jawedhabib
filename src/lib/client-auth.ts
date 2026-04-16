'use client';

const AUTH_STATE_EVENT = 'auth-state-change';

type AuthTokenKind = 'token' | 'adminToken';

const readToken = (key: AuthTokenKind) => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(key);
};

const emitAuthStateChange = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
};

const writeToken = (key: AuthTokenKind, value: string | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (value) {
    window.localStorage.setItem(key, value);
  } else {
    window.localStorage.removeItem(key);
  }

  emitAuthStateChange();
};

export const getStudentToken = () => readToken('token');

export const getAdminToken = () => readToken('adminToken');

export const setStudentToken = (token: string) => writeToken('token', token);

export const setAdminToken = (token: string) => writeToken('adminToken', token);

export const clearStudentToken = () => writeToken('token', null);

export const clearAdminToken = () => writeToken('adminToken', null);

export const clearAllTokens = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem('token');
  window.localStorage.removeItem('adminToken');
  emitAuthStateChange();
};

export const getAuthState = () => ({
  isLoggedIn: Boolean(getStudentToken()),
  isAdminLoggedIn: Boolean(getAdminToken()),
});

export const subscribeToAuthState = (callback: () => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === 'token' || event.key === 'adminToken') {
      callback();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(AUTH_STATE_EVENT, callback);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(AUTH_STATE_EVENT, callback);
  };
};
