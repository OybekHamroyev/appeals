import React, {
  createContext,
  useEffect,
  useState,
  useContext,
  useRef,
} from "react";
import socket, { createConnection } from "../utils/socket";
import api from "../utils/api";
import { AuthContext } from "./AuthContext";

export const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("notifications")) || [];
    } catch {
      return [];
    }
  });

  const connectedRef = useRef(false);
  const connRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("notifications", JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    // connect to notify websocket when user is present
    if (!user) {
      // nothing to do when no user; connections are cleaned up by previous effect
      return;
    }

    const apiBase = api.defaults?.baseURL || window.location.origin;
    const host = String(apiBase)
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    // connect to notify ws; use explicit notify path so we don't interfere with chat sockets
    const notifyPath = "/ws/notify/";
    // avoid creating duplicate connection
    if (
      connRef.current &&
      connRef.current.isConnected &&
      connRef.current.isConnected()
    ) {
      console.debug("[notify] already connected");
    }
    const conn = createConnection({ host, path: notifyPath });
    connRef.current = conn;
    // mark that we created/connected
    connectedRef.current = true;

    const offMessage = conn.on("message", (payload) => {
      console.debug("[notify] ws payload", payload);
      // backend likely sends { type: "notify", data: {...} } or raw payload
      const note = payload?.data || payload;
      if (!note) return;
      // normalize notification
      const n = {
        id:
          note.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user: note.user || (note.user_id ? { id: note.user_id } : null),
        payload: note.payload || note,
        is_read: note.is_read || false,
        created_at: note.created_at || new Date().toISOString(),
      };
      setNotifications((s) => [n, ...s]);
    });

    const offClose = conn.on("close", () => {
      connectedRef.current = false;
      console.debug("[notify] socket closed");
    });
    const offOpen = conn.on("open", () => {
      connectedRef.current = true;
      console.debug("[notify] socket open");
    });

    return () => {
      try {
        offMessage();
        offClose();
        offOpen();
      } catch {}
      // close the connection this provider created
      try {
        conn.close();
        connectedRef.current = false;
      } catch {}
    };
  }, [user]);

  const markAsRead = async (id) => {
    setNotifications((s) =>
      s.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await api.post(`/api/notifications/${id}/mark-read/`);
    } catch (e) {
      // ignore server errors for now
    }
  };

  const clearAll = async () => {
    setNotifications([]);
    try {
      await api.post(`/api/notifications/clear/`);
    } catch (e) {}
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function getUnreadFor(studentId) {
    if (!studentId) return 0;
    const sid = String(studentId);
    return notifications.reduce((acc, n) => {
      const tgt =
        n.payload?.student_id || n.payload?.user_id || n.user?.id || null;
      if (!tgt) return acc;
      if (String(tgt) === sid && !n.is_read) return acc + 1;
      return acc;
    }, 0);
  }

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        setNotifications,
        markAsRead,
        clearAll,
        unreadCount,
        getUnreadFor,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export default NotificationContext;
