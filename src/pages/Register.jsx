import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./auth.css";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    // Mock register; in real app call API
    console.log("register", { username, fullName });
    navigate("/login");
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Ro'yxatdan o'tish</h2>
        <label>
          To'liq ism
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </label>
        <label>
          Login
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label>
          Parol
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit">Ro'yxatdan o'tish</button>
        <p className="muted">
          Mavjud hisob bormi? <Link to="/login">Kirish</Link>
        </p>
      </form>
    </div>
  );
}
