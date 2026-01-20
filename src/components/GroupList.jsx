import React, { useContext } from "react";
import { ChatContext } from "../contexts/ChatContextValue";
import { TranslationContext } from "../contexts/TranslationContext";
import Badge from "@mui/material/Badge";

export default function GroupList() {
  const { groups, selectedGroup, selectGroup } = useContext(ChatContext);
  const { t } = useContext(TranslationContext);
  return (
    <div className="group-tabs">
      <ul className="tabs">
        {groups.map((g) => (
          <li
            key={g.id}
            className={`tab ${g.id === selectedGroup ? "active" : ""}`}
            onClick={() => selectGroup(g.id)}
          >
            <Badge
              badgeContent={g.unreadTotal || 0}
              color="error"
              showZero={false}
            >
              {g.name}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
