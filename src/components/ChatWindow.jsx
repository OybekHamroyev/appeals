// Clean ChatWindow component
import React, { useContext, useState, useRef } from "react";
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

  const convId =
    selectedStudent || (user?.role === "student" ? String(user.id) : null);
  if (!convId)
    return <main className="col chat empty">{t("chat.selectStudent")}</main>;

  const msgs = messages[convId] || [];

  const isImage = (url) => /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
  const isVideo = (url) => /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim() && files.length === 0) return;
    const content = text.trim();
    const senderRole =
      user?.role === "tutor" || user?.role === "teacher" ? "tutor" : "student";

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

    try {
      await sendMessage(recipient, content, files);
      setText("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = null;
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

  return (
    <main className={`col chat ${isStudentView ? "student-centered" : ""}`}>
      <div
        className="chat-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="avatar">
            {student ? (
              student.photo ? (
                <img
                  src={student.photo}
                  alt="avatar"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    objectFit: "cover",
                  }}
                />
              ) : (
                (student.fullName || "")[0] || "?"
              )
            ) : (
              "S"
            )}
          </div>
          <div className="title">
            {student ? student.fullName : t("chat.studentLabel")}
          </div>
        </div>
        {tutor && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={tutor.photo}
              alt="tutor"
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                objectFit: "cover",
              }}
            />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700 }}>
                {tutor.full_name || tutor.fullName || tutor.id}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="messages">
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
                      if (isImage(url))
                        return (
                          <div key={i} className="attachment">
                            <img
                              src={url}
                              alt={`file-${i}`}
                              className="thumb"
                            />
                          </div>
                        );
                      if (isVideo(url))
                        return (
                          <div key={i} className="attachment">
                            <video src={url} className="thumb" />
                          </div>
                        );
                      const name = String(url).split("/").pop();
                      return (
                        <div key={i} className="attachment">
                          <div className="doc">
                            📄 <span className="doc-name">{name}</span>
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
