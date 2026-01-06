import React, { useContext } from "react";
import Header from "../components/Header";
import GroupList from "../components/GroupList";
import StudentList from "../components/StudentList";
import ChatWindow from "../components/ChatWindow";
import { ChatProvider } from "../contexts/ChatContext";
import { AuthContext } from "../contexts/AuthContext";
import "./main.css";

export default function Main() {
  const { user } = useContext(AuthContext);
  return (
    <ChatProvider>
      <div className="app-shell">
        <Header />
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
