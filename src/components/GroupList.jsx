import React, { useContext } from "react";
import { ChatContext } from "../contexts/ChatContext";
import { TranslationContext } from "../contexts/TranslationContext";

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
            {g.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
