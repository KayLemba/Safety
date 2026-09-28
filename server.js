require("dotenv").config();
const next = require("next");
const { app: api, initDatabase } = require("./server/index.js");

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();
const port = Number(process.env.PORT || 3000);

nextApp.prepare().then(async () => {
  try {
    await initDatabase();
  } catch (error) {
    // Keep the web shell available during local setup or a database restart.
    // Authenticated API calls will return their normal database error response.
    console.error("PostgreSQL is unavailable; starting the web shell anyway:", error.message);
  }
  api.all("*", (req, res) => handle(req, res));
  api.listen(port, "0.0.0.0", () => console.log(`Tactivo Safety Next.js listening on http://localhost:${port}`));
}).catch((error) => {
  console.error("Unable to start Tactivo Safety:", error);
  process.exit(1);
});
