import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, User } from "lucide-react";

export default function AuthPage({ onAuthenticated }) {
  const resetToken = new URLSearchParams(window.location.search).get("reset") || "";
  const inviteFromLink = new URLSearchParams(window.location.search).get("invite") || "";
  const [mode, setMode] = useState(resetToken ? "new-password" : inviteFromLink ? "signup" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "", inviteToken: inviteFromLink, resetToken });
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const endpoint = mode === "login" ? "/api/auth/login" : mode === "signup" ? "/api/auth/signup" : mode === "reset" ? "/api/auth/request-reset" : "/api/auth/reset-password";
    const body = mode === "reset" ? { email: form.email } : mode === "new-password" ? { token: form.resetToken, password: form.password } : mode === "signup" ? { name: form.name, email: form.email, password: form.password, inviteToken: form.inviteToken } : { email: form.email, password: form.password };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      if (mode === "reset") { toast.success(data.message); setMode("login"); }
      else if (mode === "new-password") { toast.success("Password updated"); setMode("login"); }
      else { toast.success(mode === "login" ? "Welcome back" : "Account created"); onAuthenticated(data.user); }
    } catch (error) { toast.error(error.message); } finally { setBusy(false); }
  };

  const heroLine = mode === "login" ? "Sign in to" : mode === "signup" ? "Join" : mode === "new-password" ? "Secure" : "Recover";
  const bodyTitle = mode === "login" ? { line1: "Welcome", line2: "back" } : mode === "signup" ? { line1: "Accept your", line2: "invitation" } : mode === "new-password" ? { line1: "Choose a new", line2: "password" } : { line1: "Reset your", line2: "password" };
  const note = mode === "reset"
    ? "Enter your account email. Your workspace admin or supervisor will be notified and can issue you a temporary password."
    : mode === "signup"
      ? "Accounts are created by your workspace admin or supervisor. Use the invitation token they gave you."
      : "Need help signing in? Your workspace admin or supervisor can reset your password.";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-hero">
          <div className="auth-hero-glow" />
          <div className="auth-brand-row"><img className="t-logo-image" src="/tactivo-t-mark.png" alt="Tactivo" /></div>
          <span className="eyebrow">{heroLine}</span>
          <h1 className="auth-hero-title">TACTIVO <span>Safety</span></h1>
          <svg className="auth-wave" viewBox="0 0 500 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,38 C120,70 220,4 340,26 C400,37 450,30 500,12 L500,60 L0,60 Z" />
          </svg>
        </div>

        <div className="auth-body">
          <h2>{bodyTitle.line1}<br /><span>{bodyTitle.line2}</span></h2>

          <form onSubmit={submit}>
            {mode === "signup" && <>
              <label className="auth-field"><User size={16} /><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Full name" required /></label>
              <label className="auth-field"><KeyRound size={16} /><input value={form.inviteToken} onChange={(event) => update("inviteToken", event.target.value)} placeholder="Invitation token" required /></label>
            </>}

            {mode !== "new-password" && (
              <label className="auth-field"><Mail size={16} /><input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="Email" required /></label>
            )}

            {mode !== "reset" && (
              <label className="auth-field">
                <Lock size={16} />
                <input type={showPassword ? "text" : "password"} minLength="8" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="Password" required />
                <button type="button" className="auth-field-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </label>
            )}

            <div className="auth-submit-row">
              <button className="auth-submit" disabled={busy} type="submit" aria-label={mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : mode === "new-password" ? "Update password" : "Request password reset"}>
                <ArrowRight size={20} />
              </button>
            </div>
          </form>

          <div className="auth-links">
            {mode !== "login" && <button onClick={() => setMode("login")}>Back to sign in</button>}
            {mode === "login" && <><button onClick={() => setMode("signup")}>Have an invitation?</button><button onClick={() => setMode("reset")}>Forgot password?</button></>}
          </div>
          <small className="auth-note"><ShieldCheck size={12} style={{ verticalAlign: "-2px", marginRight: "4px" }} />{note}</small>
        </div>
      </section>
    </main>
  );
}
