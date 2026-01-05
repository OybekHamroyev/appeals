import React, { createContext, useState, useEffect, useContext } from "react";
import { AuthContext } from "./AuthContext";
import api from "../utils/api";

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

  // WebSocket integrations removed - chat uses HTTP REST endpoints only

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
