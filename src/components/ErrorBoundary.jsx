import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-screen">
          <div className="error-card">
            <AlertTriangle size={44} aria-hidden="true" />
            <h1>Something went wrong</h1>
            <p>The workspace could not be displayed. Reload the page to try again.</p>
            <details>
              <summary>Technical details</summary>
              <pre>{this.state.error?.stack}</pre>
            </details>
            <button className="primary-button" onClick={() => window.location.reload()}>
              <RotateCcw size={16} /> Reload page
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
