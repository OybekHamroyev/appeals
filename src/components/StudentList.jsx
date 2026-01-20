import React, { useContext, useMemo, useState } from "react";
import { ChatContext } from "../contexts/ChatContextValue";
import { TranslationContext } from "../contexts/TranslationContext";
import Badge from "@mui/material/Badge";
import { FaSearch } from "react-icons/fa";

export default function StudentList() {
  const { students, selectedGroup, selectedStudent, selectStudent, messages } =
    useContext(ChatContext);
  const list = selectedGroup ? students[selectedGroup] || [] : [];
  const { t } = useContext(TranslationContext);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter students based on search query
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(
      (s) =>
        s.fullName?.toLowerCase().includes(query) ||
        s.hemisId?.toLowerCase().includes(query)
    );
  }, [list, searchQuery]);

  // Get last message and timestamp for each student
  const getLastMessage = (studentId) => {
    const studentMessages = messages[String(studentId)] || [];
    if (studentMessages.length === 0) return null;
    const lastMsg = studentMessages[studentMessages.length - 1];
    return {
      content: lastMsg.content || lastMsg.text || "",
      timestamp: lastMsg.timestamp || lastMsg.date || null,
    };
  };

  // Format timestamp (e.g., "3h", "6h", "17 Aug")
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "now";
      if (diffMins < 60) return `${diffMins}m`;
      if (diffHours < 24) return `${diffHours}h`;
      if (diffDays < 7) return `${diffDays}d`;
      
      // Format as date
      const day = date.getDate();
      const month = date.toLocaleString("default", { month: "short" });
      return `${day} ${month}`;
    } catch {
      return "";
    }
  };

  return (
    <aside className="col students">
      {/* Search bar */}
      <div className="student-search">
        <FaSearch className="search-icon" />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Student list */}
      <ul className="student-list">
        {filteredList.length === 0 ? (
          <li className="no-results">
            {searchQuery ? "No students found" : "No students"}
          </li>
        ) : (
          filteredList.map((s) => {
            const lastMsg = getLastMessage(s.id);
            const preview = lastMsg?.content
              ? lastMsg.content.length > 30
                ? lastMsg.content.substring(0, 30) + "..."
                : lastMsg.content
              : "No messages yet";
            const timestamp = formatTimestamp(lastMsg?.timestamp);

            return (
              <li
                key={s.id}
                className={`student-item ${
                  String(s.id) === String(selectedStudent) ? "active" : ""
                }`}
                onClick={() => selectStudent(s.id)}
              >
                <div className="student-avatar">
                  <Badge
                    badgeContent={s.unreadCount || 0}
                    color="error"
                    overlap="circular"
                    showZero={false}
                  >
                    {s.photo ? (
                      <img
                        src={s.photo}
                        alt={s.fullName || "Student"}
                        className="avatar-img"
                      />
                    ) : (
                      <div className="avatar-initial">
                        {(s.fullName || "U")[0].toUpperCase()}
                      </div>
                    )}
                  </Badge>
                </div>
                <div className="student-info">
                  <div className="student-name">{s.fullName || "Student"}</div>
                  <div className="student-preview">{preview}</div>
                </div>
                {timestamp && (
                  <div className="student-time">{timestamp}</div>
                )}
              </li>
            );
          })
        )}
      </ul>
      {!selectedGroup && (
        <div className="hint">{t("chat.selectGroup")}</div>
      )}
    </aside>
  );
}
