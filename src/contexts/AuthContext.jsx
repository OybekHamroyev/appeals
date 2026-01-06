import React, { createContext, useState, useEffect } from "react";
import api from "../utils/api";

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

  const logout = async () => {
    // attempt server-side logout (blacklist refresh token or invalidate session)
    try {
      if (user && user.refresh) {
        await api.post("/api/logout/", { refresh: user.refresh });
      } else {
        // best-effort call if server doesn't require body
        await api.post("/api/logout/");
      }
    } catch (e) {
      // don't block local logout on server failures
      // console.warn allowed for diagnostics
      console.warn("logout request failed", e?.response || e?.message || e);
    }

    // clear client state and local storage
    setUser(null);
    try {
      localStorage.removeItem("user");
      localStorage.removeItem("check_user");
      localStorage.removeItem("chat.selectedGroup");
      localStorage.removeItem("chat.selectedStudent");
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
