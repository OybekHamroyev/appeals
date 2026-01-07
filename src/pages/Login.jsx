import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import { TranslationContext } from "../contexts/TranslationContext";
import LanguageSelector from "../components/LanguageSelector";
import api from "../utils/api";
import "./auth.css";

export default function Login() {
  const { login, setAuthFromServer } = useContext(AuthContext);
  const { t } = useContext(TranslationContext);
  const [hemisId, setHemisId] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Step 1: check-user
  async function handleCheck(e) {
    e && e.preventDefault();
    setError("");
    if (!hemisId) return setError(t("login.enterHemis"));
    try {
      setChecking(true);
      const res = await api.post("/api/check-user/", { hemis_id: hemisId });
      const data = res.data;
      if (data && data.success) {
        // save partial info to localStorage for step2 render
        localStorage.setItem(
          "check_user",
          JSON.stringify({ hemis_id: hemisId, ...data })
        );
        setUserInfo(data);
        setStep(2);
      } else {
        setError(t("login.userNotFound"));
      }
    } catch (err) {
      console.error(err);
      setError(t("login.checkFailed"));
    } finally {
      setChecking(false);
    }
  }

  // Step 2: create-password (or login)
  async function handleCreate(e) {
    e && e.preventDefault();
    setError("");
    if (!password) return setError(t("login.enterPassword"));
    try {
      setCreating(true);
      const res = await api.post("/api/create-password/", {
        hemis_id: hemisId,
        password,
      });
      const data = res.data;
      if (data && data.success) {
        // set auth and user info
        setAuthFromServer(data);
        // also store a friendly user object
        localStorage.setItem(
          "user",
          JSON.stringify({
            token: data.access,
            refresh: data.refresh,
            id: data.user_id,
            fullName: data.full_name,
            photo: data.photo,
            role: data.role,
            tutor: data.tutor || null,
          })
        );
        navigate("/");
      } else {
        setError(t("login.authFailed"));
        try {
          alert(t("login.authFailed"));
        } catch {}
      }
    } catch (err) {
      console.error(err);
      setError(t("login.authFailed"));
      try {
        alert(t("login.authFailed"));
      } catch {}
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="auth-page">
      <form
        className="auth-card"
        onSubmit={step === 1 ? handleCheck : handleCreate}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <LanguageSelector />
        </div>

        {step === 1 && (
          <>
            <h2>{t("login.title")}</h2>
            <label>
              {t("login.hemisId")}
              <input
                value={hemisId}
                onChange={(e) => setHemisId(e.target.value)}
                required
              />
            </label>
            <button type="submit">
              {checking ? t("login.checking") : t("login.next")}
            </button>
            {error && <p className="error">{error}</p>}
          </>
        )}

        {step === 2 && userInfo && (
          <>
            <div style={{ textAlign: "center" }}>
              <img
                src={userInfo.photo}
                alt="avatar"
                style={{ width: 84, height: 84, borderRadius: 999 }}
              />
              <h3 style={{ marginTop: 12 }}>{userInfo.full_name}</h3>
            </div>
            <label>
              {t("login.password")}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit">
                {creating ? t("login.creating") : t("login.login")}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="muted small"
              >
                {t("login.back")}
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </form>
    </div>
  );
}
