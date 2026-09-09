import { Toaster } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <Home />
    </ErrorBoundary>
  );
}

export default App;
