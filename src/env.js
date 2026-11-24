// Loads .env from the project root (works even when an MCP client starts the server from another folder).
// Logs go to stderr only: an MCP stdio server must never print to stdout.
import { fileURLToPath } from "node:url";

try {
  const dotenv = (await import("dotenv")).default;
  dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
} catch {
  // dotenv not installed: fine, keyword classifier is used
}
