// Clean ChatWindow component
import React, { useContext, useState, useRef, useEffect } from "react";
import { ChatContext } from "../contexts/ChatContext";
import { AuthContext } from "../contexts/AuthContext";
import { TranslationContext } from "../contexts/TranslationContext";
import { FaPaperclip, FaPaperPlane } from "react-icons/fa";
import Badge from "@mui/material/Badge";
import api from "../utils/api";

export default function ChatWindow() {
  const { students, messages, selectedGroup, selectedStudent, sendMessage } =
    useContext(ChatContext);
  const { user } = useContext(AuthContext);
  const { t } = useContext(TranslationContext);

  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const fileRef = useRef();

  const messagesRef = useRef(null);

  const convId =
    selectedStudent || (user?.role === "student" ? String(user.id) : null);
  if (!convId)
    return <main className="col chat empty">{t("chat.selectStudent")}</main>;

  const msgs = messages[convId] || [];

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
    // wait for DOM paint
    const el = messagesRef.current;
    if (!el) return;
    // use requestAnimationFrame to ensure layout updated
    requestAnimationFrame(() => {
      try {
        el.scrollTop = el.scrollHeight;
      } catch (e) {
        // ignore
      }
    });
  }, [msgs.length]);

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

    console.debug("ChatWindow: sending", { recipient, content, files });
    try {
      // call sendMessage (optimistic UI inside)
      const result = await sendMessage(recipient, content, files);
      console.debug("ChatWindow: send result", result);
      setText("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = null;
      // ensure scroll shows latest message
      scrollToBottom(true);
    } catch (err) {
      console.error("Failed to send message", err);
      // keep optimistic UI (already added)
      setText("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = null;
    }
  }

  const student =
    user?.role === "tutor"
      ? (students[selectedGroup] || []).find(
          (s) => String(s.id) === String(selectedStudent)
        )
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
    <main className={`col chat ${isStudentView ? "student-centered" : ""}`}>
      {isStudentView && (
        <div
          className="chat-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* left: tutor */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="avatar">
              {headerTutor ? (
                headerTutor.photo ? (
                  <img
                    src={headerTutor.photo}
                    alt="tutor"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div className="avatar-initial">
                    {(headerTutor.full_name || "T")[0]}
                  </div>
                )
              ) : (
                <div className="avatar-initial">T</div>
              )}
            </div>
            <div className="title">
              {headerTutor
                ? headerTutor.full_name || headerTutor.fullName
                : t("chat.tutorLabel")}
            </div>
          </div>

          {/* right: student */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right", marginRight: 8 }}>
              <div style={{ fontWeight: 700 }}>
                {headerStudent
                  ? headerStudent.full_name || headerStudent.fullName
                  : t("chat.studentLabel")}
              </div>
            </div>
            <div className="avatar">
              {headerStudent ? (
                headerStudent.photo ? (
                  <img
                    src={headerStudent.photo}
                    alt="student"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div className="avatar-initial">
                    {
                      (headerStudent.full_name ||
                        headerStudent.fullName ||
                        "S")[0]
                    }
                  </div>
                )
              ) : (
                <div className="avatar-initial">S</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="messages" ref={messagesRef}>
        {msgs.map((m) => {
          const isServerMsg = !!m.sender;
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
              className={`message ${isFromTutor ? "me" : "them"}`}
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
                <div className="meta">
                  {senderObj?.full_name ||
                    senderObj?.fullName ||
                    (isFromTutor ? user?.fullName : student?.fullName) ||
                    t("chat.studentLabel")}{" "}
                  • {msgTime}
                </div>
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

      <form className="composer" onSubmit={submit}>
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
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("chat.placeholder")}
        />
        <button type="submit">
          <FaPaperPlane /> {t("chat.send")}
        </button>
      </form>
    </main>
  );
}
