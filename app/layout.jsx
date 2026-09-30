import "../src/index.css";

export const metadata = {
  title: "Tactivo Safety Operations",
  description: "Professional safety operations workspace for incidents, inspections, actions, and team accountability.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

