import React, { useContext } from "react";
import Header from "../components/Header";
import GroupList from "../components/GroupList";
import StudentList from "../components/StudentList";
import ChatWindow from "../components/ChatWindow";
import { ChatProvider } from "../contexts/ChatContext";
import { AuthContext } from "../contexts/AuthContext";
import "./main.css";
import Select from "react-select";
import { ChatContext } from "../contexts/ChatContext";

export default function Main() {
  const { user } = useContext(AuthContext);
  return (
    <ChatProvider>
      <div className="app-shell">
        <Header />
        {/* mobile student search: shown only at small widths (<=680) */}
        {user?.role === "tutor" && <MobileStudentSearch />}
        {user?.role === "tutor" && <GroupList />}
        <div
          className={`layout ${user?.role === "tutor" ? "two-col" : ""} ${
            user?.role === "student" ? "student-mode" : ""
          }`}
        >
          {user?.role === "tutor" ? (
            <>
              <StudentList />
              <ChatWindow />
            </>
          ) : (
            <>
              <ChatWindow />
            </>
          )}
        </div>
      </div>
    </ChatProvider>
  );
}

function MobileStudentSearch() {
  const { students, selectedGroup, selectStudent } =
    React.useContext(ChatContext);
  const list = selectedGroup ? students[selectedGroup] || [] : [];
  const options = React.useMemo(
    () => list.map((s) => ({ value: s.id, label: s.fullName })),
    [list]
  );
  return (
    <div className="mobile-student-search">
      <Select
        options={options}
        isSearchable
        placeholder="Talabani qidiring"
        onChange={(v) => v && selectStudent(v.value)}
      />
    </div>
  );
}
