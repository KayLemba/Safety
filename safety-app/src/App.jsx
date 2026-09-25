import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./workspace-pages/Home";
import AuthPage from "./workspace-pages/AuthPage";

function LoadingScreen() {
  return <main className="loading-screen" aria-live="polite" aria-busy="true">
    <div className="loading-orbit loading-orbit-one" />
    <div className="loading-orbit loading-orbit-two" />
    <div className="loading-beacon" aria-hidden="true"><span className="beacon-light" /><span className="beacon-ring" /></div>
    <div className="loading-copy">
      <span className="eyebrow">TACTIVO SAFETY OPERATIONS</span>
      <h1>Preparing your control center</h1>
      <p>Checking workspace access and safety controls</p>
      <div className="loading-scan" aria-hidden="true"><span /></div>
    </div>
  </main>;
}

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
  return <ErrorBoundary><Toaster position="top-right" richColors />{user === undefined ? <LoadingScreen /> : user ? <Home user={user} onLogout={logout} /> : <AuthPage onAuthenticated={setUser} />}</ErrorBoundary>;
}

export default App;
