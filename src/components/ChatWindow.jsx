// Clean ChatWindow component
import React, { useContext, useState, useRef, useEffect } from "react";
import { ChatContext } from "../contexts/ChatContextValue";
import { AuthContext } from "../contexts/AuthContext";
import { TranslationContext } from "../contexts/TranslationContext";
import {
  FaPaperclip,
  FaPaperPlane,
  FaEllipsisV,
  FaEdit,
  FaTrash,
} from "react-icons/fa";
import Badge from "@mui/material/Badge";

export default function ChatWindow() {
  const {
    students,
    messages,
    selectedGroup,
    selectedStudent,
    sendMessage,
    editMessage,
    deleteMessage,
    removeLocalMessage,
    markMessagesAsRead,
    markConversationAsRead,
    sendingIds,
    studentUnreadCount,
  } = useContext(ChatContext);
  const { user } = useContext(AuthContext);
  const { t } = useContext(TranslationContext);

  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const fileRef = useRef();

  const messagesRef = useRef(null);
  const prevIdsRef = useRef(new Set());
  const [enteringIds, setEnteringIds] = useState([]);
  const [enteredIds, setEnteredIds] = useState([]);
  const messageRefsMap = useRef(new Map());
  const readMessageIdsRef = useRef(new Set());
  const markReadTimeoutRef = useRef(null);

  const convId =
    selectedStudent || (user?.role === "student" ? String(user.id) : null);
  const hasConv = !!convId;
  const msgs = hasConv ? messages[convId] || [] : [];
  const [editingId, setEditingId] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const textInputRef = useRef(null);

  function scrollToBottom(smooth = false) {
    const el = messagesRef.current;
    if (!el) return;
    try {
      if (smooth && el.scrollTo)
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      else el.scrollTop = el.scrollHeight;
    } catch (e) {}
  }

  // auto-scroll to bottom when messages change
  useEffect(() => {
    // detect newly added message ids for animation
    const ids = (msgs || []).map((m) => String(m.id));
    const prev = prevIdsRef.current || new Set();
    const added = ids.filter((id) => !prev.has(id));
    if (added.length) {
      // mark as entering
      setEnteringIds((s) => [...s, ...added]);
      // after paint, mark as entered to trigger transition to final state
      requestAnimationFrame(() => {
        setEnteredIds((s) => [...s, ...added]);
        // cleanup after animation duration
        setTimeout(() => {
          setEnteringIds((s) => s.filter((x) => !added.includes(x)));
          setEnteredIds((s) => s.filter((x) => !added.includes(x)));
        }, 420);
      });
    }
    // update prev ids
    prevIdsRef.current = new Set(ids);

    // wait for DOM paint then scroll smoothly
    const el = messagesRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      try {
        if (el.scrollTo)
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        else el.scrollTop = el.scrollHeight;
      } catch (e) {
        // ignore
      }
    });
  }, [msgs.length]);

  // Intersection Observer to mark messages as read when scrolled into view
  useEffect(() => {
    if (!hasConv || !user || !messagesRef.current) return;

    // Reset read tracking when conversation changes
    const prevConvId = messageRefsMap.current.get("prevConvId");
    if (prevConvId !== convId) {
      readMessageIdsRef.current.clear();
      messageRefsMap.current.clear();
      messageRefsMap.current.set("prevConvId", convId);
    }

    // Create Intersection Observer
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleMessageIds = [];
        
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const messageId = entry.target.getAttribute("data-message-id");
            const messageData = entry.target.getAttribute("data-message-data");
            
            if (messageId && messageData) {
              try {
                const msgData = JSON.parse(messageData);
                const senderId = msgData.sender?.id || msgData.sender || null;
                const isFromCurrentUser = String(senderId) === String(user?.id);
                const isRealMessage = !msgData.optimistic && !String(messageId).startsWith("temp_");
                
                // Only mark messages from other person as read
                if (!isFromCurrentUser && isRealMessage && !readMessageIdsRef.current.has(String(messageId))) {
                  readMessageIdsRef.current.add(String(messageId));
                  visibleMessageIds.push(messageId);
                }
              } catch (e) {
                console.error("Error parsing message data", e);
              }
            }
          }
        });

        // Debounce: mark messages as read after 500ms of being visible
        if (visibleMessageIds.length > 0) {
          if (markReadTimeoutRef.current) {
            clearTimeout(markReadTimeoutRef.current);
          }
          markReadTimeoutRef.current = setTimeout(() => {
            markMessagesAsRead(visibleMessageIds);
            markReadTimeoutRef.current = null;
          }, 500);
        }
      },
      {
        root: messagesRef.current,
        rootMargin: "0px",
        threshold: 0.5, // Message is considered visible when 50% is in view
      }
    );

    // Function to observe all message elements
    const observeMessages = () => {
      const messageElements = messagesRef.current?.querySelectorAll('[data-message-id]');
      messageElements?.forEach((el) => {
        // Check if already observed
        if (!messageRefsMap.current.has(el.getAttribute("data-message-id"))) {
          observer.observe(el);
          messageRefsMap.current.set(el.getAttribute("data-message-id"), el);
        }
      });
    };

    // Observe messages after DOM update
    const timeoutId = setTimeout(observeMessages, 100);

    // Also observe on scroll events to catch dynamically loaded messages (throttled)
    let scrollTimeout = null;
    const scrollHandler = () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        observeMessages();
        scrollTimeout = null;
      }, 200); // throttle scroll handler
    };
    messagesRef.current.addEventListener("scroll", scrollHandler, { passive: true });

    return () => {
      clearTimeout(timeoutId);
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
        markReadTimeoutRef.current = null;
      }
      if (messagesRef.current) {
        messagesRef.current.removeEventListener("scroll", scrollHandler);
      }
      observer.disconnect();
    };
  }, [hasConv, convId, msgs.length, user?.id, markMessagesAsRead]);

  // Mark all visible messages as read when conversation opens and user is at bottom
  useEffect(() => {
    if (!hasConv || !user || !messagesRef.current) return;
    
    // Only mark once when conversation first opens, not on every message update
    let markedForConv = false;
    const markKey = `marked_${convId}`;
    const lastMarked = messageRefsMap.current.get(markKey);
    
    // Check if user is scrolled to bottom (within 200px)
    const container = messagesRef.current;
    const checkAndMark = () => {
      if (markedForConv || lastMarked) return; // already marked for this conversation
      const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const isNearBottom = scrollBottom < 200;
      
      if (isNearBottom && msgs.length > 0) {
        markedForConv = true;
        messageRefsMap.current.set(markKey, true);
        // Mark all messages as read if user is at bottom (only once per conversation)
        setTimeout(() => {
          markConversationAsRead();
        }, 1500);
      }
    };
    
    // Reset marked state when conversation changes
    if (lastMarked && messageRefsMap.current.get("prevConvId") !== convId) {
      messageRefsMap.current.delete(markKey);
      markedForConv = false;
    }
    
    // Check after a short delay to allow messages to render
    const timeoutId = setTimeout(checkAndMark, 800);
    
    return () => {
      clearTimeout(timeoutId);
      // Note: we keep the markKey in the map to prevent re-marking
    };
  }, [hasConv, convId, user?.id, markConversationAsRead]);

  const isImage = (url) => /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
  const isVideo = (url) => /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);

  async function submit(e) {
    e.preventDefault();

    const senderRole =
      user?.role === "tutor" || user?.role === "teacher" ? "tutor" : "student";

    const content = (text || "").trim();

    let recipient = null;
    if (user?.role === "tutor") recipient = selectedStudent || null;
    else if (user?.role === "student") {
      try {
        const su = JSON.parse(localStorage.getItem("user"));
        recipient = su?.tutor?.user_id || su?.tutor?.id || null;
      } catch (err) {
        recipient = null;
      }
    }

    const attachments = files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
      url: URL.createObjectURL(f),
    }));

    if (!recipient) {
      console.warn("no recipient for sendMessage", { user, selectedStudent });
      return;
    }

    console.debug("ChatWindow: sending/editing", {
      recipient,
      content,
      files,
      editingId,
    });
    try {
      if (editingId) {
        // call edit flow
        const result = await editMessage(editingId, content);
        console.debug("ChatWindow: edit result", result);
        // clear editing state
        setEditingId(null);
        setText("");
        // refresh handled by editMessage reconciliation
        scrollToBottom(true);
        return;
      }
      // call sendMessage (optimistic UI inside)
      const result = await sendMessage(recipient, content, files);
      console.debug("ChatWindow: send result", result);
      setText("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = null;
      // ensure scroll shows latest message
      scrollToBottom(true);
    } catch (err) {
      console.error("Failed to send or edit message", err);
      // keep optimistic UI (already added)
      setText("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = null;
      setEditingId(null);
    }
  }

  const student =
    user?.role === "tutor"
      ? Array.isArray(students && students[selectedGroup])
        ? (students[selectedGroup] || []).find(
            (s) => String(s.id) === String(selectedStudent)
          )
        : null
      : null;
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  })();
  const tutor =
    user?.role === "student" ? storedUser?.tutor || storedUser : null;
  const isStudentView = user?.role === "student";

  // header participants: ensure tutor on left and student on right
  const headerTutor =
    user?.role === "tutor"
      ? {
          id: user.id,
          full_name: user?.fullName || user?.full_name,
          photo: user?.photo,
        }
      : tutor
      ? {
          id: tutor.id || tutor.user_id,
          full_name: tutor.full_name || tutor.fullName,
          photo: tutor.photo,
        }
      : null;

  const headerStudent =
    user?.role === "tutor"
      ? student
        ? { id: student.id, full_name: student.fullName, photo: student.photo }
        : null
      : {
          id: user.id,
          full_name: user?.fullName || user?.full_name,
          photo: user?.photo,
        };

  return (
    <main
      className={`col chat ${isStudentView ? "student-centered" : ""}`}
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      {/* Chat header - show conversation partner name */}
      {hasConv && (
        <div className="chat-header">
          {isStudentView && headerTutor && (
            <div className="chat-header-avatar">
              <Badge
                badgeContent={studentUnreadCount || 0}
                color="error"
                overlap="circular"
                showZero={false}
              >
                {headerTutor.photo ? (
                  <img
                    src={headerTutor.photo}
                    alt={headerTutor.full_name || "Tutor"}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    className="avatar-initial"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 18,
                    }}
                  >
                    {(headerTutor.full_name || "T")[0].toUpperCase()}
                  </div>
                )}
              </Badge>
            </div>
          )}
          <div className="chat-header-name">
            {user?.role === "tutor"
              ? headerStudent
                ? headerStudent.full_name || headerStudent.fullName
                : t("chat.studentLabel")
              : headerTutor
              ? headerTutor.full_name || headerTutor.fullName
              : t("chat.tutorLabel")}
          </div>
        </div>
      )}

      <div
        className="messages"
        ref={messagesRef}
        style={{ flex: 1, overflowY: "auto" }}
        onClick={() => setMenuFor(null)}
      >
        {msgs.map((m) => {
          const isServerMsg = !!m.sender;
          const mid = String(m.id);
          const isEntering = enteringIds.includes(mid);
          const isEntered = enteredIds.includes(mid);
          const senderObj = isServerMsg
            ? m.sender
            : m.from === "tutor"
            ? { id: user?.id, full_name: user?.fullName, photo: user?.photo }
            : {
                id: student?.id,
                full_name: student?.fullName,
                photo: student?.photo,
              };
          const isFromTutor = isServerMsg
            ? String(senderObj?.id) === String(user?.id)
            : m.from === "tutor";
          const avatarSrc = senderObj?.photo || null;
          const avatarLetter = (senderObj?.full_name ||
            senderObj?.fullName ||
            "U")[0];

          const msgText = isServerMsg ? m.content : m.text;
          const msgTime = new Date(
            m.timestamp || m.date || Date.now()
          ).toLocaleString();
          const filesArr = m.files || m.attachments || [];

          return (
            <div
              key={m.id}
              data-message-id={m.id}
              data-message-data={JSON.stringify({
                id: m.id,
                sender: m.sender,
                optimistic: m.optimistic,
              })}
              className={`message ${isFromTutor ? "me" : "them"} ${
                isEntering ? "enter" : ""
              } ${isEntered ? "enter-active" : ""}`}
            >
              {!isFromTutor && (
                <div className="msg-avatar">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt="av"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div className="avatar-initial">{avatarLetter}</div>
                  )}
                </div>
              )}

              <div className="bubble">
                {/* vertical ellipsis menu for user's messages */}
                {String(senderObj?.id) === String(user?.id) && (
                  <div className="msg-ellipsis-wrap">
                    <FaEllipsisV
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setMenuFor(menuFor === m.id ? null : m.id);
                      }}
                      title="Options"
                    />

                    {menuFor === m.id && (
                      <div
                        className="msg-menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* disable edit/delete for optimistic local messages (no server id yet) */}
                        <div
                          className={`msg-menu-item ${
                            m.optimistic ? "disabled" : ""
                          }`}
                          onClick={() => {
                            if (m.optimistic) return;
                            setEditingId(m.id);
                            setText(m.content || m.text || "");
                            setMenuFor(null);
                            setTimeout(() => textInputRef.current?.focus(), 50);
                          }}
                        >
                          <FaEdit style={{ marginRight: 8 }} />
                        </div>
                        <div
                          className={`msg-menu-item ${
                            m.optimistic ? "disabled" : ""
                          }`}
                          onClick={async () => {
                            try {
                              if (m.optimistic) {
                                // remove local optimistic message without calling server
                                removeLocalMessage(m.id);
                              } else {
                                await deleteMessage(m.id);
                              }
                            } catch (e) {
                              console.error(e);
                            }
                            setMenuFor(null);
                          }}
                        >
                          <FaTrash style={{ marginRight: 8 }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="text">{msgText}</div>

                {filesArr && filesArr.length > 0 && (
                  <div className="attachments">
                    {filesArr.map((f, i) => {
                      const url = f.file || f.url || f;
                      if (!url) return null;
                      const name = String(url).split("/").pop();
                      // render preview for images/videos but wrap in anchor for download/open
                      if (isImage(url))
                        return (
                          <div key={i} className="attachment">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <img
                                src={url}
                                alt={`file-${i}`}
                                className="thumb"
                              />
                            </a>
                            <div className="attachment-link">
                              <a
                                href={url}
                                download
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {name}
                              </a>
                            </div>
                          </div>
                        );
                      if (isVideo(url))
                        return (
                          <div key={i} className="attachment">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <video src={url} className="thumb" controls />
                            </a>
                            <div className="attachment-link">
                              <a
                                href={url}
                                download
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {name}
                              </a>
                            </div>
                          </div>
                        );
                      return (
                        <div key={i} className="attachment">
                          <div className="doc">
                            📄{" "}
                            <span className="doc-name">
                              <a
                                href={url}
                                download
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {name}
                              </a>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* timestamp placed bottom-right inside the bubble */}
                <div className="msg-ts">{msgTime}</div>
                {/* show small loader for optimistic sending messages */}
                {m.sending && (
                  <div className="msg-loading" title="Sending...">
                    ●
                  </div>
                )}
              </div>

              {isFromTutor && (
                <div className="msg-avatar">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt="av"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div className="avatar-initial">{avatarLetter}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form className="composer" onSubmit={submit} style={{ flexShrink: 0 }}>
        <label className="file-attach" title="Attach files">
          <Badge badgeContent={files.length} color="success">
            <FaPaperclip />
          </Badge>
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => setFiles(Array.from(e.target.files))}
          />
        </label>
        <input
          ref={textInputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Xabar yozing..."
        />
        <button
          type="submit"
          className="send-button"
          disabled={(sendingIds || []).length > 0}
        >
          <FaPaperPlane /> <span className="btn-text">Yuborish</span>
        </button>
      </form>
    </main>
  );
}
