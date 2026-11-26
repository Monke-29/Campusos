// CampusOS as a stdio MCP server, for desktop MCP clients. (The web server also exposes the same tools at /mcp over HTTP.)
import "./env.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const { createMcpServer } = await import("./mcp-tools.js");
await createMcpServer().connect(new StdioServerTransport());
console.error("CampusOS MCP server running (stdio)");
