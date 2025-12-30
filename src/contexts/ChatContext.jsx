import React, { createContext, useState, useEffect, useContext } from "react";
import { AuthContext } from "./AuthContext";
import api from "../utils/api";
import socket from "../utils/socket";

export const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState({});
  const [messages, setMessages] = useState({});
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(() => {
    try {
      return localStorage.getItem("chat.selectedStudent") || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    async function fetchGroups() {
      try {
        const res = await api.get("/api/list-groups/");
        const data = res.data || [];
        // map groups
        const mappedGroups = data.map((g) => ({
          id: String(g.group_id),
          name: g.group_name,
        }));
        const mappedStudents = {};
        data.forEach((g) => {
          mappedStudents[String(g.group_id)] = (g.students || []).map((s) => ({
            id: s.user_id,
            fullName: s.user__full_name,
            photo: s.user__photo,
            hemisId: s.user__hemis_id,
          }));
        });
        if (!cancelled) {
          setGroups(mappedGroups);
          setStudents(mappedStudents);
          try {
            const stored = localStorage.getItem("chat.selectedGroup");
            if (stored && mappedGroups.find((g) => g.id === stored)) {
              setSelectedGroup(stored);
            } else {
              setSelectedGroup(mappedGroups.length ? mappedGroups[0].id : null);
            }
          } catch {
            setSelectedGroup(mappedGroups.length ? mappedGroups[0].id : null);
          }
        }
      } catch (err) {
        console.error("Failed to load groups", err);
      }
    }

    if (user && user.role === "tutor") {
      fetchGroups();
    } else {
      // clear groups for non-tutor
      setGroups([]);
      setStudents({});
      setSelectedGroup(null);
      setSelectedStudent(null);
    }

    return () => {
      cancelled = true;
    };
  }, [user]);

  // connect websocket when user logs in; cleanup on logout
  useEffect(() => {
    if (!user) {
      try {
        socket.close();
      } catch {}
      return;
    }
    // open socket; backend expects path like /ws/chat/<recipient>/ where recipient is a user id
    const BACKEND_WS_HOST = "172.20.120.103:8000";
    // determine recipient for the socket path
    let socketRecipient = null;
    if (user?.role === "tutor") socketRecipient = selectedStudent;
    else if (user?.role === "student") {
      try {
        const su = JSON.parse(localStorage.getItem("user"));
        socketRecipient = su?.tutor?.user_id || su?.tutor?.id || null;
      } catch {}
    }

    if (!socketRecipient) {
      console.debug("[ChatContext] no socket recipient, skipping connect");
      return;
    }

    console.debug("[ChatContext] connecting socket", { socketRecipient });
    const ws = socket.connect({
      host: BACKEND_WS_HOST,
      recipient: socketRecipient,
    });

    const offOpen = socket.on("open", () => console.debug("[socket] open"));
    const offClose = socket.on("close", () => console.debug("[socket] close"));
    const offErr = socket.on("error", (e) => console.warn("[socket] error", e));

    // handle incoming messages
    const offMsg = socket.on("message", (payload) => {
      console.debug("[socket] message", payload);
      try {
        if (!payload) return;
        const type = payload.type || payload.event || null;
        const data = payload.data || payload;
        if (type === "message" || data?.type === "message") {
          const msg = data?.data || data;
          // determine conversation key — backend should send dialog_id, or sender/recipient
          const senderId =
            msg.sender || msg.from || msg.user_id || msg.user || null;
          const recipientId = msg.recipient || msg.to || msg.target || null;
          const convKey = String(
            msg.dialog_id || senderId || recipientId || ""
          );
          if (!convKey) return;
          setMessages((prev) => {
            const list = prev[convKey] ? [...prev[convKey]] : [];
            const normalized = {
              id: msg.id || Date.now(),
              sender: msg.sender || msg.from || null,
              content: msg.content || msg.text || "",
              timestamp: msg.timestamp || msg.date || new Date().toISOString(),
              files: msg.files || msg.attachments || [],
            };
            return { ...prev, [convKey]: [...list, normalized] };
          });
          // also append to recipient key so both sides show message in their conversation
          if (recipientId) {
            const rKey = String(recipientId);
            setMessages((prev) => {
              const list = prev[rKey] ? [...prev[rKey]] : [];
              const normalized = {
                id: msg.id || Date.now(),
                sender: msg.sender || msg.from || null,
                content: msg.content || msg.text || "",
                timestamp:
                  msg.timestamp || msg.date || new Date().toISOString(),
                files: msg.files || msg.attachments || [],
              };
              return { ...prev, [rKey]: [...list, normalized] };
            });
          }
        }
      } catch (e) {
        console.error("ws message handling failed", e, payload);
      }
    });

    return () => {
      try {
        offMsg();
      } catch {}
      try {
        offOpen();
      } catch {}
      try {
        offClose();
      } catch {}
      try {
        offErr();
      } catch {}
      try {
        socket.close();
      } catch {}
    };
  }, [user, selectedStudent]);

  function selectGroup(groupId) {
    setSelectedGroup(groupId);
    try {
      localStorage.setItem("chat.selectedGroup", String(groupId));
    } catch {}
    setSelectedStudent(null);
  }

  function selectStudent(studentId) {
    setSelectedStudent(studentId);
    try {
      localStorage.setItem("chat.selectedStudent", String(studentId));
    } catch {}
  }

  // fetch dialog messages for the selected conversation
  useEffect(() => {
    let cancelled = false;
    async function fetchDialog() {
      try {
        // determine dialog id to request from API
        let dialogId = null;
        if (user?.role === "tutor") {
          if (!selectedStudent) return;
          dialogId = selectedStudent;
        } else if (user?.role === "student") {
          // tutor id is stored on local user object
          let su = null;
          try {
            su = JSON.parse(localStorage.getItem("user"));
          } catch {}
          dialogId = su?.tutor?.user_id || su?.tutor?.id || null;
          if (!dialogId) return;
        } else {
          return;
        }

        const res = await api.get(`/api/dialog/${dialogId}/`);
        const data = res.data || [];
        if (cancelled) return;
        // store fetched messages under a conv key that ChatWindow uses
        const key =
          user?.role === "tutor" ? String(selectedStudent) : String(user?.id);
        setMessages((prev) => ({ ...(prev || {}), [key]: data }));
      } catch (err) {
        console.error("Failed to load dialog", err);
      }
    }

    fetchDialog();

    return () => {
      cancelled = true;
    };
  }, [user, selectedStudent]);

  // attachments: array of { name, size, type, url }
  function sendMessage(studentId, from, text, attachments = []) {
    setMessages((prev) => {
      const list = prev[studentId] ? [...prev[studentId]] : [];
      const msg = {
        id: Date.now(),
        from,
        text,
        date: new Date().toISOString(),
        attachments: attachments || [],
      };
      return { ...prev, [studentId]: [...list, msg] };
    });
  }

  return (
    <ChatContext.Provider
      value={{
        groups,
        students,
        messages,
        selectedGroup,
        selectedStudent,
        selectGroup,
        selectStudent,
        sendMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
