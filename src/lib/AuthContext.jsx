import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

function readSessionFromStorage() {
  try {
    const raw = localStorage.getItem('userSession');
    if (!raw) return { user: null, isAuthenticated: false };
    const user = JSON.parse(raw);
    return { user, isAuthenticated: true };
  } catch {
    localStorage.removeItem('userSession');
    return { user: null, isAuthenticated: false };
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const loadSession = useCallback(() => {
    const { user: u, isAuthenticated: auth } = readSessionFromStorage();
    setUser(u);
    setIsAuthenticated(auth);
    setIsLoadingAuth(false);
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const logout = (shouldRedirect = true) => {
    localStorage.removeItem('userSession');
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) {
      window.location.href = '/';
    }
  };

  const navigateToLogin = () => {
    window.location.href = '/';
  };

  const checkUserAuth = () => {
    loadSession();
  };

  const checkAppState = () => {
    loadSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError: null,
        authChecked,
        appPublicSettings: null,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
