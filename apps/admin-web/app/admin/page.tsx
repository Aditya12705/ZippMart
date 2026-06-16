"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getAdminToken, setAdminSession } from "../../lib/adminAuth";

import { apiBase } from "../../lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (getAdminToken()) {
      router.replace("/admin/dashboard");
    }
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const resp = await fetch(`${apiBase}/v1/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.message ?? "Sign-in failed");
        setBusy(false);
        return;
      }
      const token = data.token as string;
      const role = String((data as { role?: string }).role ?? "staff");
      setAdminSession(token, role);
      router.push("/admin/dashboard");
    } catch {
      setError(`Cannot reach API at ${apiBase}. Run npm run dev from the project root.`);
    }
    setBusy(false);
  }

  return (
    <main className="loginPage">
      <div className="loginCard">
        <h1 className="loginTitle">SeamLine HQ</h1>
        <p className="loginHint">Sign in to the operations console</p>

        <form onSubmit={(e) => void onSubmit(e)} className="loginForm">
          <label className="loginLabel">
            Username
            <input
              className="loginInput"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  passwordRef.current?.focus();
                }
              }}
            />
          </label>
          <label className="loginLabel">
            Password
            <input
              ref={passwordRef}
              className="loginInput"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="loginError">{error}</p> : null}
          <button type="submit" className="loginSubmit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
