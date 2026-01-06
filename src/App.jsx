import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, AuthContext } from "./contexts/AuthContext";
import { TranslationProvider } from "./contexts/TranslationContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import Login from "./pages/Login";
import Main from "./pages/Main";
import "./index.css";

function RequireAuth({ children }) {
  const ctx = React.useContext(AuthContext);
  if (!ctx?.user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <TranslationProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Main />
                </RequireAuth>
              }
            />
          </Routes>
        </TranslationProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
