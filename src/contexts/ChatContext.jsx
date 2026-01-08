import React, { createContext, useState, useEffect, useContext } from "react";
import { AuthContext } from "./AuthContext";
import api from "../utils/api";
import socket, { createConnection } from "../utils/socket";

export const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState({});
  const [messages, setMessages] = useState({});
  const [sendingIds, setSendingIds] = useState([]);
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

  // WebSocket integration: connect to backend Channels to receive broadcasted messages
  useEffect(() => {
    if (!user) {
      return;
    }

    // determine which recipient id to use in the websocket path
    let socketRecipient = null;
    if (user?.role === "tutor") socketRecipient = selectedStudent;
    else if (user?.role === "student")
      socketRecipient = user?.tutor?.user_id || user?.tutor?.id || null;

    if (!socketRecipient) {
      // nothing to connect to
      return;
    }

    const apiBase = api.defaults?.baseURL;
    const host = apiBase.replace(/^https?:\/\//, "").replace(/\/$/, "");

    console.debug("[ChatContext] connecting socket", { host, socketRecipient });
    const chatPath = `/ws/chat/${socketRecipient}/`;
    const conn = createConnection({ host, path: chatPath });

    const offOpen = conn.on("open", () => console.debug("[socket] open"));
    const offClose = conn.on("close", () => console.debug("[socket] close"));
    const offErr = conn.on("error", (e) => console.warn("[socket] error", e));

    const offMsg = conn.on("message", (payload) => {
      try {
        const msg = payload || {};

        // handle explicit edit/delete events from server
        const eventType = (msg.type || msg.action || "").toString();
        // backend uses 'message_deleted' and 'message_edited' inside the 'message' payload
        if (
          eventType.toLowerCase().includes("deleted") ||
          eventType === "delete" ||
          eventType === "removed"
        ) {
          const messageId =
            msg.message_id ||
            msg.id ||
            (msg.message && msg.message.message_id) ||
            (msg.message && msg.message.id) ||
            null;
          if (!messageId) return;
          // remove from all conversations where present
          setMessages((prev) => {
            if (!prev) return prev;
            const copy = {};
            Object.keys(prev).forEach((k) => {
              copy[k] = (prev[k] || []).filter(
                (m) => String(m.id) !== String(messageId)
              );
            });
            return copy;
          });
          return;
        }

        if (
          eventType.toLowerCase().includes("edit") ||
          eventType === "edit" ||
          eventType === "updated"
        ) {
          const serverMsg = msg.message || msg.payload || msg;
          const messageObj =
            serverMsg && serverMsg.message ? serverMsg.message : serverMsg;
          const messageId =
            (messageObj && (messageObj.id || messageObj.message_id)) || null;
          if (!messageId) return;
          // reconcile edit across all convs
          setMessages((prev) => {
            if (!prev) return prev;
            const copy = {};
            Object.keys(prev).forEach((k) => {
              copy[k] = (prev[k] || []).map((m) =>
                String(m.id) === String(messageId)
                  ? { ...m, ...(messageObj || {}) }
                  : m
              );
            });
            return copy;
          });
          return;
        }

        // otherwise treat as a new message broadcast
        const msgId = msg.id || null;
        const normalized = {
          id: msgId || Date.now(),
          sender: msg.sender || null,
          content: msg.content || msg.text || "",
          timestamp: msg.timestamp || msg.date || new Date().toISOString(),
          files: msg.files || msg.attachments || [],
        };

        // compute conversation key where this message should be stored
        if (user?.role === "student") {
          const key = String(user.id);
          setMessages((prev) => {
            const list = prev[key] ? [...prev[key]] : [];
            // if server message id already present, do nothing
            if (msgId && list.find((m) => String(m.id) === String(msgId)))
              return prev;
            // if there's an optimistic temp that matches content, replace it
            const tempIdx = list.findIndex(
              (m) =>
                m.optimistic && String(m.content) === String(normalized.content)
            );
            if (tempIdx > -1) {
              const copyList = [...list];
              copyList.splice(tempIdx, 1, normalized);
              return { ...prev, [key]: copyList };
            }
            return { ...prev, [key]: [...list, normalized] };
          });
        } else {
          const senderId = msg.sender?.id || msg.sender || null;
          const recipientId = msg.recipient || msg.to || null;
          const otherId = senderId === user.id ? recipientId : senderId;
          if (!otherId) return;
          const key = String(otherId);
          setMessages((prev) => {
            const list = prev[key] ? [...prev[key]] : [];
            if (msgId && list.find((m) => String(m.id) === String(msgId)))
              return prev;
            const tempIdx = list.findIndex(
              (m) =>
                m.optimistic && String(m.content) === String(normalized.content)
            );
            if (tempIdx > -1) {
              const copyList = [...list];
              copyList.splice(tempIdx, 1, normalized);
              return { ...prev, [key]: copyList };
            }
            return { ...prev, [key]: [...list, normalized] };
          });
        }
      } catch (e) {
        console.error("[ChatContext] ws message handler error", e, payload);
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
        conn.close();
      } catch {}
    };
  }, [user, selectedStudent]);

  function selectGroup(groupId) {
    // when switching groups, clear the selected student and any messages for the old conversation
    setSelectedGroup(groupId);
    try {
      localStorage.setItem("chat.selectedGroup", String(groupId));
    } catch {}
    // clear selected student and reset messages for the chat pane
    setSelectedStudent(null);
    setMessages((prev) => {
      // remove keys for students of previous group to avoid stale display
      if (!prev) return {};
      const copy = { ...prev };
      // if groupId exists and has students, keep messages only for this group's students; otherwise clear all
      try {
        const keepIds = (students[groupId] || []).map((s) => String(s.id));
        Object.keys(copy).forEach((k) => {
          if (!keepIds.includes(String(k))) delete copy[k];
        });
      } catch (e) {
        // fallback: clear all messages
        return {};
      }
      return copy;
    });
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

  // sendMessage: send to server (FormData) with optimistic UI
  async function sendMessage(recipientId, content, files = []) {
    if (!recipientId) throw new Error("recipient required");

    const fromId = user?.id || user?.user_id;
    const isTutor = user?.role === "tutor";
    const convKey = isTutor ? String(recipientId) : String(fromId);

    // optimistic temp message
    const tempId = `temp_${Date.now()}`;
    const tempMsg = {
      id: tempId,
      sender: { id: fromId, full_name: user?.fullName || user?.full_name },
      content: content || "",
      timestamp: new Date().toISOString(),
      files: (files || []).map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
      })),
      optimistic: true,
      sending: true,
      client_id: tempId,
    };
    setMessages((prev) => {
      const list = prev[convKey] ? [...prev[convKey]] : [];
      return { ...prev, [convKey]: [...list, tempMsg] };
    });
    setSendingIds((s) => [...s, tempId]);

    // send to server
    const fd = new FormData();
    fd.append("recipient", String(recipientId));
    fd.append("content", content || "");
    // include our client correlation id so server can echo it back when broadcasting
    fd.append("client_id", tempId);
    (files || []).forEach((f) => fd.append("files", f));

    try {
      const res = await api.post("/api/send-message/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const serverMsg = res.data || {};

      // reconcile: replace temp message with server message or append if not present
      setMessages((prev) => {
        const list = prev[convKey] ? [...prev[convKey]] : [];
        // try to match by echoed client_id first
        const byClientIdx = serverMsg.client_id
          ? list.findIndex(
              (m) =>
                m.client_id &&
                String(m.client_id) === String(serverMsg.client_id)
            )
          : -1;
        if (byClientIdx > -1) {
          const copy = [...list];
          copy.splice(byClientIdx, 1, serverMsg);
          return { ...prev, [convKey]: copy };
        }
        // fallback: match temp id or optimistic content
        const idx = list.findIndex(
          (m) =>
            (String(m.id).indexOf("temp_") === 0 &&
              m.optimistic &&
              String(m.content) === String(serverMsg.content)) ||
            (m.client_id &&
              serverMsg.client_id &&
              String(m.client_id) === String(serverMsg.client_id))
        );
        if (idx > -1) {
          const copy = [...list];
          copy.splice(idx, 1, serverMsg);
          return { ...prev, [convKey]: copy };
        }
        // if server message not present, append
        if (!list.find((m) => String(m.id) === String(serverMsg.id))) {
          return { ...prev, [convKey]: [...list, serverMsg] };
        }
        return prev;
      });
      setSendingIds((s) => s.filter((id) => id !== tempId));

      return serverMsg;
    } catch (err) {
      console.error("sendMessage failed", err);
      // leave optimistic message (could mark as failed)
      // mark sending failed: remove sending flag
      setMessages((prev) => {
        const list = prev[convKey] ? [...prev[convKey]] : [];
        const idx = list.findIndex((m) => String(m.id) === String(tempId));
        if (idx > -1) {
          const copy = [...list];
          copy[idx] = { ...copy[idx], sending: false, failed: true };
          return { ...prev, [convKey]: copy };
        }
        return prev;
      });
      setSendingIds((s) => s.filter((id) => id !== tempId));
      throw err;
    }
  }

  // editMessage: update message content on server and reconcile locally
  async function editMessage(messageId, newContent) {
    if (!messageId) throw new Error("messageId required");
    try {
      // use PATCH to update content
      const res = await api.patch(`/api/messages/edit/${messageId}/`, {
        content: newContent || "",
      });
      const serverMsg = res.data;
      // reconcile locally: replace message with same id
      setMessages((prev) => {
        if (!prev) return prev;
        const copy = {};
        Object.keys(prev).forEach((k) => {
          copy[k] = (prev[k] || []).map((m) =>
            String(m.id) === String(serverMsg.id) ? serverMsg : m
          );
        });
        return copy;
      });
      return serverMsg;
    } catch (err) {
      console.error("editMessage failed", err);
      throw err;
    }
  }

  // deleteMessage: remove message on server and locally
  async function deleteMessage(messageId) {
    if (!messageId) throw new Error("messageId required");
    try {
      await api.delete(`/api/messages/delete/${messageId}/`);
      // remove from local messages
      setMessages((prev) => {
        if (!prev) return prev;
        const copy = {};
        Object.keys(prev).forEach((k) => {
          copy[k] = (prev[k] || []).filter(
            (m) => String(m.id) !== String(messageId)
          );
        });
        return copy;
      });
      return true;
    } catch (err) {
      console.error("deleteMessage failed", err);
      throw err;
    }
  }

  // removeLocalMessage: remove a locally-created optimistic/temp message without calling server
  function removeLocalMessage(messageId) {
    if (!messageId) return;
    setMessages((prev) => {
      if (!prev) return prev;
      const copy = {};
      Object.keys(prev).forEach((k) => {
        copy[k] = (prev[k] || []).filter(
          (m) => String(m.id) !== String(messageId)
        );
      });
      return copy;
    });
    // also clear from sendingIds if present
    setSendingIds((s) => s.filter((id) => String(id) !== String(messageId)));
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
        editMessage,
        deleteMessage,
        removeLocalMessage,
        sendingIds,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
