import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import AuthPage from "./pages/AuthPage";

function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => setUser(data.user || null))
      .catch(() => setUser(null));
  }, []);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null); toast.success("Signed out");
  };
  return <ErrorBoundary><Toaster position="top-right" richColors />{user === undefined ? <main className="auth-shell"><section className="auth-card"><div className="auth-body" style={{ padding: "34px" }}><span className="eyebrow">TACTIVO SAFETY OPERATIONS</span><h1 style={{ fontSize: "22px", margin: "10px 0 0" }}>Connecting to local PostgreSQL…</h1></div></section></main> : user ? <Home user={user} onLogout={logout} /> : <AuthPage onAuthenticated={setUser} />}</ErrorBoundary>;
}

export default App;
