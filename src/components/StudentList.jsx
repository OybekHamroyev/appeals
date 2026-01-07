import React, { useContext, useMemo } from "react";
import { ChatContext } from "../contexts/ChatContext";
import { TranslationContext } from "../contexts/TranslationContext";
import Select from "react-select";
import Badge from "@mui/material/Badge";
import { NotificationContext } from "../contexts/NotificationContext";

export default function StudentList() {
  const { students, selectedGroup, selectedStudent, selectStudent } =
    useContext(ChatContext);
  const list = selectedGroup ? students[selectedGroup] || [] : [];
  const { t } = useContext(TranslationContext);

  const options = useMemo(
    () => list.map((s) => ({ value: s.id, label: s.fullName })),
    [list]
  );

  const { getUnreadFor } = useContext(NotificationContext);

  return (
    <aside className="col students">
      <div style={{ marginBottom: 8 }}>
        <Select
          options={options}
          isSearchable
          placeholder={t("chat.selectStudent")}
          onChange={(v) => v && selectStudent(v.value)}
        />
      </div>
      <ul>
        {list.map((s) => (
          <li
            key={s.id}
            className={String(s.id) === String(selectedStudent) ? "active" : ""}
            onClick={() => selectStudent(s.id)}
          >
            <div className="avatar">
              <Badge
                badgeContent={getUnreadFor(s.id) || 0}
                color="error"
                overlap="circular"
              >
                {s.photo ? (
                  <img
                    src={s.photo}
                    alt="avatar"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      objectFit: "cover",
                    }}
                  />
                ) : s.fullName ? (
                  s.fullName[0]
                ) : (
                  "U"
                )}
              </Badge>
            </div>
            <div className="meta">{s.fullName}</div>
          </li>
        ))}
      </ul>
      {!selectedGroup && <div className="hint">{t("chat.selectGroup")}</div>}
    </aside>
  );
}
