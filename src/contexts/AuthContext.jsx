import React, { createContext, useState, useEffect } from "react";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else localStorage.removeItem("user");
  }, [user]);

  // set auth from server response: tokens + user info
  const setAuthFromServer = (payload) => {
    // payload expected to include access, refresh, user_id, full_name, photo, role, maybe tutor
    const saved = {
      token: payload.access,
      refresh: payload.refresh,
      id: payload.user_id,
      fullName: payload.full_name,
      photo: payload.photo,
      role: payload.role,
      tutor: payload.tutor || null,
    };
    setUser(saved);
    // localStorage is synced by useEffect
    return saved;
  };

  const login = async ({ username, password, role = "teacher" } = {}) => {
    // keep backward compatibility: if called with no server, create a minimal mock
    if (!username && !password) return null;
    // leave actual server calls to Login page; this helper can still mock if needed
    const mock = { id: 0, username, fullName: username, role };
    setUser(mock);
    return mock;
  };

  const logout = () => {
    setUser(null);
    try {
      // clear relevant localStorage keys
      localStorage.removeItem("user");
      localStorage.removeItem("check_user");
    } catch (e) {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, setAuthFromServer }}>
      {children}
    </AuthContext.Provider>
  );
}
