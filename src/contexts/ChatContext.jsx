import React, { useState, useEffect, useContext, useRef } from "react";
import { AuthContext } from "./AuthContext";
import api from "../utils/api";
import { createConnection } from "../utils/socket";
import { ChatContext } from "./ChatContextValue";

export function ChatProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState({});
  const [messages, setMessages] = useState({});
  const [sendingIds, setSendingIds] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(() => {
    try {
      return localStorage.getItem("chat.selectedGroup") || null;
    } catch {
      return null;
    }
  });
  const [selectedStudent, setSelectedStudent] = useState(() => {
    try {
      return localStorage.getItem("chat.selectedStudent") || null;
    } catch {
      return null;
    }
  });
  const markReadRefreshTimerRef = useRef(null);
  const wsConnectionRef = useRef(null);
  const activeRoomRef = useRef({ roomName: null, recipientId: null });
  const prevSelectedGroupRef = useRef(null);

  // Fetch groups and students (tutor only)
  useEffect(() => {
    let cancelled = false;
    async function fetchGroups() {
      try {
        const res = await api.get("/api/list-groups/");
        const data = res.data || [];
        const mappedGroups = data.map((g) => ({
          id: String(g.group_id),
          name: g.group_name,
          unreadTotal: Number(g.group_unread_total || 0),
        }));
        const mappedStudents = {};
        data.forEach((g) => {
          mappedStudents[String(g.group_id)] = (g.students || []).map((s) => ({
            id: s.user_id,
            fullName: s.user__full_name,
            photo: s.user__photo,
            hemisId: s.user__hemis_id,
            unreadCount: Number(s.unread_count || 0),
          }));
        });
        if (!cancelled) {
          setGroups(mappedGroups);
          setStudents(mappedStudents);
          
          // Restore selected group from localStorage or select first
          try {
            const stored = localStorage.getItem("chat.selectedGroup");
            if (stored && mappedGroups.find((g) => g.id === stored)) {
              setSelectedGroup(stored);
              prevSelectedGroupRef.current = stored;
            } else {
              const firstGroupId = mappedGroups.length ? mappedGroups[0].id : null;
              setSelectedGroup(firstGroupId);
              prevSelectedGroupRef.current = firstGroupId;
              if (firstGroupId) {
                localStorage.setItem("chat.selectedGroup", String(firstGroupId));
              }
            }
          } catch {
            const firstGroupId = mappedGroups.length ? mappedGroups[0].id : null;
            setSelectedGroup(firstGroupId);
            prevSelectedGroupRef.current = firstGroupId;
          }
          
          // If selected student exists in current group, restore it
          try {
            const storedStudent = localStorage.getItem("chat.selectedStudent");
            if (storedStudent && selectedGroup) {
              const groupStudents = mappedStudents[selectedGroup] || [];
              if (groupStudents.find((s) => String(s.id) === storedStudent)) {
                setSelectedStudent(storedStudent);
              } else {
                setSelectedStudent(null);
                localStorage.removeItem("chat.selectedStudent");
              }
            }
          } catch {}
        }
      } catch (err) {
        console.error("Failed to load groups", err);
      }
    }

    if (user && user.role === "tutor") {
      fetchGroups();
    } else {
      setGroups([]);
      setStudents({});
      setSelectedGroup(null);
      setSelectedStudent(null);
      prevSelectedGroupRef.current = null;
    }

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Clear messages when group changes
  useEffect(() => {
    if (prevSelectedGroupRef.current !== null && prevSelectedGroupRef.current !== selectedGroup) {
      // Group changed - clear all messages and selected student
      setMessages({});
      setSelectedStudent(null);
      try {
        localStorage.removeItem("chat.selectedStudent");
      } catch {}
      prevSelectedGroupRef.current = selectedGroup;
    } else if (prevSelectedGroupRef.current === null) {
      prevSelectedGroupRef.current = selectedGroup;
    }
  }, [selectedGroup]);

  function selectGroup(groupId) {
    setSelectedGroup(groupId);
    try {
      localStorage.setItem("chat.selectedGroup", String(groupId));
    } catch {}
    // Clear selected student and ALL messages when switching groups
    setSelectedStudent(null);
    setMessages({});
    try {
      localStorage.removeItem("chat.selectedStudent");
    } catch {}
  }

  function selectStudent(studentId) {
    setSelectedStudent(studentId);
    try {
      localStorage.setItem("chat.selectedStudent", String(studentId));
    } catch {}
  }

  // WebSocket connection for real-time messages
  useEffect(() => {
    if (!user) {
      return;
    }

    // Helper: resolve tutor id from user or localStorage
    const resolveTutorId = () => {
      if (user?.tutor) {
        return user.tutor.user_id || user.tutor.id || null;
      }
      try {
        const su = JSON.parse(localStorage.getItem("user"));
        return su?.tutor?.user_id || su?.tutor?.id || null;
      } catch {
        return null;
      }
    };

    // Determine room_name: recipient id
    // - Tutor rejimida: tanlangan student id
    // - Student rejimida: tutor id
    let roomName = null;
    if (user?.role === "tutor") {
      roomName = selectedStudent ? String(selectedStudent) : null;
    } else if (user?.role === "student") {
      const tutorId = resolveTutorId();
      roomName = tutorId ? String(tutorId) : null;
    }

    if (!roomName) {
      // Close existing connection if no room
      if (wsConnectionRef.current) {
        try {
          wsConnectionRef.current.close();
        } catch {}
        wsConnectionRef.current = null;
      }
      activeRoomRef.current = { roomName: null, recipientId: null };
      return;
    }

    // derive WS host from axios baseURL; fall back to window.location
    const apiBase = api?.defaults?.baseURL || (typeof window !== "undefined" ? window.location.origin : "");
    const host = (apiBase || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

    console.debug("[ChatContext] connecting WebSocket", { host, roomName });
    const chatPath = `/ws/chat/${roomName}/`;
    const conn = createConnection({ host, path: chatPath });
    wsConnectionRef.current = conn;
    activeRoomRef.current = { roomName, recipientId: roomName };

    const offOpen = conn.on("open", () => console.debug("[socket] open"));
    const offClose = conn.on("close", () => console.debug("[socket] close"));
    const offErr = conn.on("error", (e) => console.warn("[socket] error", e));

    const offMsg = conn.on("message", (payload) => {
      try {
        const msg = payload || {};
        const eventType = (msg.type || msg.action || "").toString().toLowerCase();

        // Handle new message events
        if (!eventType || eventType === "message" || eventType === "chat_message") {
          const msgId = msg.id || null;
          const senderId = msg?.sender?.id || msg?.sender_id || msg?.sender || null;
          const senderName =
            (msg?.sender && (msg.sender.full_name || msg.sender.fullName)) ||
            msg?.sender_name ||
            null;
          const normalized = {
            id: msgId || Date.now(),
            sender: senderId ? { id: senderId, full_name: senderName } : msg.sender || null,
            recipient: msg.recipient || msg.to || msg.recipient_id || null,
            content: msg.content || msg.text || "",
            timestamp: msg.timestamp || msg.date || new Date().toISOString(),
            files: msg.files || msg.attachments || [],
            is_read: msg.is_read || false,
          };

          // Determine conversation key
          if (user?.role === "student") {
            const key = String(user.id);
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
          } else {
            // Tutor view: determine which student this message is from
            const senderId = msg.sender?.id || msg.sender || null;
            const recipientId = msg.recipient || msg.to || msg.recipient_id || null;
            const otherId =
              senderId === user.id
                ? recipientId || activeRoomRef.current?.recipientId || null
                : senderId || recipientId;
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
          return;
        }

        // Handle message edited events
        if (eventType.includes("edit") || eventType === "edit" || eventType === "updated") {
          const serverMsg = msg.message || msg.payload || msg;
          const messageObj =
            serverMsg && serverMsg.message ? serverMsg.message : serverMsg;
          const messageId =
            (messageObj && (messageObj.id || messageObj.message_id)) || null;
          if (!messageId) return;
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

        // Handle message deleted events
        if (
          eventType.includes("deleted") ||
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

        // Handle messages_read events
        if (
          eventType === "messages_read" ||
          eventType === "message_read" ||
          eventType === "mark_read"
        ) {
          const chatId = msg.chat_id || msg.chatId || null;
          const groupId = msg.group_id || msg.groupId || null;
          const studentId = msg.student_id || msg.studentId || null;

          // Update local message is_read flags
          if (chatId || studentId) {
            const targetId = studentId || chatId;
            setMessages((prev) => {
              if (!prev) return prev;
              const copy = { ...prev };
              const key = user?.role === "tutor" ? String(targetId) : String(user?.id);
              if (copy[key]) {
                copy[key] = copy[key].map((m) => ({ ...m, is_read: true }));
              }
              return copy;
            });
          }

          // Update unread counts for tutor
          if (user?.role === "tutor") {
            if (studentId) {
              setStudents((prevStudents) => {
                const copy = { ...prevStudents };
                Object.keys(copy).forEach((gId) => {
                  copy[gId] = (copy[gId] || []).map((s) =>
                    String(s.id) === String(studentId)
                      ? { ...s, unreadCount: 0 }
                      : s
                  );
                });
                
                setGroups((prevGroups) => {
                  return prevGroups.map((g) => {
                    const groupStudents = copy[g.id] || [];
                    const total = groupStudents.reduce(
                      (acc, s) => acc + Number(s.unreadCount || 0),
                      0
                    );
                    return { ...g, unreadTotal: total };
                  });
                });
                
                return copy;
              });
            }
          }
          return;
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
        wsConnectionRef.current = null;
      } catch {}
      activeRoomRef.current = { roomName: null, recipientId: null };
    };
  }, [user, selectedStudent]);

  // Fetch dialog messages for the selected conversation
  useEffect(() => {
    let cancelled = false;
    async function fetchDialog() {
      try {
        let dialogId = null;
        if (user?.role === "tutor") {
          if (!selectedStudent) return;
          dialogId = selectedStudent;
        } else if (user?.role === "student") {
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
    const canUseWs =
      wsConnectionRef.current &&
      typeof wsConnectionRef.current.send === "function" &&
      typeof wsConnectionRef.current.isConnected === "function" &&
      wsConnectionRef.current.isConnected() &&
      activeRoomRef.current?.recipientId &&
      String(activeRoomRef.current.recipientId) === String(recipientId) &&
      (!files || files.length === 0);

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

    try {
      // Prefer WebSocket for real-time text messages; fall back to HTTP when files are attached
      if (canUseWs) {
        const sent = wsConnectionRef.current.send({
          content: content || "",
        });
        if (!sent) throw new Error("WebSocket send failed");

        // remove sending flag after short delay; actual reconciliation happens when server echoes back
        setTimeout(() => {
          setMessages((prev) => {
            const list = prev[convKey] ? [...prev[convKey]] : [];
            const idx = list.findIndex((m) => String(m.id) === String(tempId));
            if (idx > -1) {
              const copy = [...list];
              copy[idx] = { ...copy[idx], sending: false };
              return { ...prev, [convKey]: copy };
            }
            return prev;
          });
          setSendingIds((s) => s.filter((id) => id !== tempId));
        }, 1200);

        return { id: tempId, via: "websocket" };
      }

      const fd = new FormData();
      fd.append("recipient", String(recipientId));
      fd.append("content", content || "");
      fd.append("client_id", tempId);
      (files || []).forEach((f) => fd.append("files", f));

      const res = await api.post("/api/send-message/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const serverMsg = res.data || {};

      setMessages((prev) => {
        const list = prev[convKey] ? [...prev[convKey]] : [];
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
        if (!list.find((m) => String(m.id) === String(serverMsg.id))) {
          return { ...prev, [convKey]: [...list, serverMsg] };
        }
        return prev;
      });
      setSendingIds((s) => s.filter((id) => id !== tempId));

      return serverMsg;
    } catch (err) {
      console.error("sendMessage failed", err);
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
      const res = await api.patch(`/api/messages/detail/${messageId}/`, {
        content: newContent || "",
      });
      const serverMsg = res.data;
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
      await api.delete(`/api/messages/detail/${messageId}/`);
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
    setSendingIds((s) => s.filter((id) => String(id) !== String(messageId)));
  }

  // markMessagesAsRead: mark specific messages as read on server
  async function markMessagesAsRead(messageIds = []) {
    if (!messageIds || messageIds.length === 0) return;
    if (!user) return;
    try {
      const markReadRequests = messageIds.map(async (mid) => {
        try {
          return await api.patch(`/api/dialog/mark-read/${mid}/`);
        } catch (err) {
          if (err?.response?.status === 404) {
            return await api.patch(`/api/dialog/mark-read/${mid}`);
          }
          throw err;
        }
      });

      await Promise.all(markReadRequests);

      // Update local message is_read flags immediately (optimistic update)
      const convId =
        selectedStudent || (user?.role === "student" ? String(user?.id) : null);
      if (convId) {
        setMessages((prev) => {
          if (!prev || !prev[convId]) return prev;
          const copy = { ...prev };
          copy[convId] = (prev[convId] || []).map((m) =>
            messageIds.includes(m.id) ? { ...m, is_read: true } : m
          );
          return copy;
        });
      }

      // Refresh unread counts via list-groups (debounced)
      if (user?.role === "tutor") {
        if (markReadRefreshTimerRef.current) {
          clearTimeout(markReadRefreshTimerRef.current);
        }
        markReadRefreshTimerRef.current = setTimeout(async () => {
          try {
            const res = await api.get("/api/list-groups/");
            const data = res.data || [];
            const mappedGroups = data.map((g) => ({
              id: String(g.group_id),
              name: g.group_name,
              unreadTotal: Number(g.group_unread_total || 0),
            }));
            const mappedStudents = {};
            data.forEach((g) => {
              mappedStudents[String(g.group_id)] = (g.students || []).map((s) => ({
                id: s.user_id,
                fullName: s.user__full_name,
                photo: s.user__photo,
                hemisId: s.user__hemis_id,
                unreadCount: Number(s.unread_count || 0),
              }));
            });
            setGroups(mappedGroups);
            setStudents(mappedStudents);
          } catch (err) {
            console.error("Failed to refresh unread counts", err);
          }
          markReadRefreshTimerRef.current = null;
        }, 1000);
      }
    } catch (err) {
      console.error("markMessagesAsRead failed", err);
    }
  }

  // markConversationAsRead: mark all unread messages in current conversation as read
  async function markConversationAsRead() {
    if (!user) return;
    const convId =
      selectedStudent || (user?.role === "student" ? String(user?.id) : null);
    if (!convId) return;

    const convMessages = messages[convId] || [];
    const unreadMessageIds = convMessages
      .filter((m) => {
        const senderId = m.sender?.id || m.sender || null;
        const isFromCurrentUser = String(senderId) === String(user?.id);
        const isRealMessage = !m.optimistic && !String(m.id).startsWith("temp_");
        return !isFromCurrentUser && isRealMessage && !m.is_read;
      })
      .map((m) => m.id);

    if (unreadMessageIds.length > 0) {
      await markMessagesAsRead(unreadMessageIds);
    }
  }

  // Calculate unread count for student (messages where recipient is student and is_read is false)
  const getStudentUnreadCount = () => {
    if (user?.role !== "student") return 0;
    const convId = String(user?.id);
    const convMessages = messages[convId] || [];
    return convMessages.filter((m) => {
      const recipientId = m.recipient || null;
      return (
        String(recipientId) === String(user?.id) &&
        !m.is_read &&
        !m.optimistic &&
        !String(m.id).startsWith("temp_")
      );
    }).length;
  };

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
        markMessagesAsRead,
        markConversationAsRead,
        sendingIds,
        studentUnreadCount: getStudentUnreadCount(),
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
