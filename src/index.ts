import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";
import { RouterOSAPI } from "routeros-client";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { log, color } from "./logger.js";

dotenv.config();

const MIKROTIK_HOST = process.env.MIKROTIK_HOST || "192.168.88.1";
const MIKROTIK_USER = process.env.MIKROTIK_USER || "admin";
const MIKROTIK_PASSWORD = process.env.MIKROTIK_PASSWORD || "";
const MIKROTIK_PORT = parseInt(process.env.MIKROTIK_PORT || "2022", 10);
const PORT = parseInt(process.env.PORT || "2024", 10);

// Authentication & OAuth 2.0 Configuration
const OAUTH_CLIENT_ID = process.env.MCP_CLIENT_ID || "mcp-mikrotik-client";
const OAUTH_CLIENT_SECRET = process.env.MCP_CLIENT_SECRET || "mcp-secret-key-12345";
const OAUTH_AUTH_CODE = process.env.MCP_AUTH_CODE || "code_" + OAUTH_CLIENT_SECRET.slice(0, 16);
const OAUTH_ACCESS_TOKEN = process.env.MCP_TOKEN || "mcp_mikrotik_token_12345";

export const MCP_TOOLS_LIST = [
  {
    name: "mikrotik_get_identity",
    description: "Get the identity (system hostname/name) of the MikroTik router.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mikrotik_get_resources",
    description: "Get MikroTik hardware & software status: CPU load, free memory, total memory, free HDD, architecture, RouterOS version, and uptime.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mikrotik_get_interfaces",
    description: "List all network interfaces (Ethernet, Bridge, SFP, VLAN) with running status, MAC address, MTU, and RX/TX traffic stats.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mikrotik_get_ip_addresses",
    description: "List all IP addresses assigned on the router, subnet masks, networks, and assigned interfaces.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mikrotik_get_routes",
    description: "List the IP routing table, default gateways, routing distances (for Multi-WAN failover), and gateway check status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mikrotik_get_dhcp_leases",
    description: "List all active DHCP server leases, connected client hostnames, MAC addresses, assigned IP, and lease status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mikrotik_get_firewall",
    description: "Retrieve MikroTik firewall rules from a specific table (filter, nat, mangle, raw, or address-list).",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Firewall table to query: filter (default), nat, mangle, raw, address-list",
          enum: ["filter", "nat", "mangle", "raw", "address-list"]
        }
      }
    },
  },
  {
    name: "mikrotik_get_dns",
    description: "Get MikroTik DNS server settings, cache status, and static DNS entries (including DNS sinkhole/blocking rules).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mikrotik_ping",
    description: "Execute a ping from the MikroTik router to a destination host or IP to test network reachability and latency.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Target IP or hostname to ping (e.g. 8.8.8.8 or google.com)" },
        count: { type: "string", description: "Number of ping packets to send (default: 4)" }
      },
      required: ["address"]
    },
  },
  {
    name: "mikrotik_get_logs",
    description: "Get recent system log entries from the MikroTik router for auditing and diagnostics.",
    inputSchema: {
      type: "object",
      properties: {
        lines: { type: "number", description: "Optional limit of log lines to retrieve (default: 50)" }
      }
    },
  },
  {
    name: "mikrotik_run_command",
    description: "Run any arbitrary RouterOS API menu path and command (e.g. /ip/service/print, /system/clock/print, /ip/route/set).",
    inputSchema: {
      type: "object",
      properties: {
        menu: { type: "string", description: "The API menu to run (e.g. /ip/address/print or /ip/route/print)" },
        params: { type: "object", description: "Optional query parameters or arguments (e.g. { numbers: '*1', comment: 'test' })", additionalProperties: { type: "string" } }
      },
      required: ["menu"],
    },
  }
];

export class McpMikrotikServer {
  private api: RouterOSAPI;

  constructor() {
    this.api = this.createRouterApi();

    process.on("SIGINT", async () => {
      this.closeApi();
      process.exit(0);
    });

    process.on("uncaughtException", (err: any) => {
      log(`${color.red("[UNCAUGHT]")} Exception: ${err?.message || err}`, "error");
    });
    process.on("unhandledRejection", (reason) => {
      log(`${color.red("[UNHANDLED]")} Rejection: ${reason}`, "error");
    });
  }

  private createRouterApi(): RouterOSAPI {
    const api = new RouterOSAPI({
      host: MIKROTIK_HOST,
      user: MIKROTIK_USER,
      password: MIKROTIK_PASSWORD,
      port: MIKROTIK_PORT,
      timeout: 30,
      keepalive: true,
    });

    api.on("error", (error: any) => {
      log(`${color.yellow("[ROUTEROS]")} Socket event: ${error?.message || error}`, "warning");
    });

    return api;
  }

  private closeApi() {
    try {
      if (this.api && this.api.connected) {
        this.api.close();
      }
    } catch (e) {}
  }

  public async connectApi() {
    if (!this.api || !this.api.connected) {
      try {
        await this.api.connect();
        log(`${color.green("[ROUTEROS]")} Connected to MikroTik Router at ${MIKROTIK_HOST}:${MIKROTIK_PORT}`, "success");
      } catch (err: any) {
        log(`${color.yellow("[ROUTEROS]")} Re-establishing connection: ${err?.message || err}`, "warning");
        this.closeApi();
        this.api = this.createRouterApi();
        await this.api.connect();
        log(`${color.green("[ROUTEROS]")} Reconnected to MikroTik Router at ${MIKROTIK_HOST}:${MIKROTIK_PORT}`, "success");
      }
    }
  }

  private async executeMikrotik<T>(fn: () => Promise<T>): Promise<T> {
    try {
      await this.connectApi();
      return await fn();
    } catch (err: any) {
      log(`${color.yellow("[ROUTEROS]")} Query failed, reconnecting and retrying once: ${err?.message || err}`, "warning");
      this.closeApi();
      this.api = this.createRouterApi();
      await this.api.connect();
      return await fn();
    }
  }

  public async handleToolCall(name: string, args: any): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const startTime = Date.now();
    const argSummary = args && Object.keys(args).length > 0 ? ` with params: ${JSON.stringify(args)}` : "";
    log(`${color.blue("[TOOL]")} Executing ${color.cyan(name)}${argSummary}`, "info");

    try {
      const result = await this.dispatchToolCall(name, args);
      const elapsed = Date.now() - startTime;
      log(`${color.green("[TOOL]")} Completed ${color.cyan(name)} (${elapsed}ms)`, "success");
      return result;
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      log(`${color.red("[TOOL]")} Error in ${color.cyan(name)} (${elapsed}ms): ${error.message}`, "error");
      return { content: [{ type: "text", text: `Error executing tool ${name}: ${error.message}` }], isError: true };
    }
  }

  private async dispatchToolCall(name: string, args: any): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    if (name === "mikrotik_get_identity") {
      const response = await this.executeMikrotik(async () => await this.api.write("/system/identity/print"));
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
    if (name === "mikrotik_get_resources") {
      const response = await this.executeMikrotik(async () => await this.api.write("/system/resource/print"));
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
    if (name === "mikrotik_get_interfaces") {
      const response = await this.executeMikrotik(async () => await this.api.write("/interface/print"));
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
    if (name === "mikrotik_get_ip_addresses") {
      const response = await this.executeMikrotik(async () => await this.api.write("/ip/address/print"));
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
    if (name === "mikrotik_get_routes") {
      const response = await this.executeMikrotik(async () => await this.api.write("/ip/route/print"));
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
    if (name === "mikrotik_get_dhcp_leases") {
      const response = await this.executeMikrotik(async () => await this.api.write("/ip/dhcp-server/lease/print"));
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
    if (name === "mikrotik_get_firewall") {
      const { table } = args || {};
      const validTable = ["filter", "nat", "mangle", "raw", "address-list"].includes(table) ? table : "filter";
      const response = await this.executeMikrotik(async () => await this.api.write(`/ip/firewall/${validTable}/print`));
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
    if (name === "mikrotik_get_dns") {
      const settings = await this.executeMikrotik(async () => await this.api.write("/ip/dns/print"));
      const statics = await this.executeMikrotik(async () => await this.api.write("/ip/dns/static/print"));
      return { content: [{ type: "text", text: JSON.stringify({ settings, statics }, null, 2) }] };
    }
    if (name === "mikrotik_ping") {
      const { address, count } = args || {};
      const pingCount = String(count || "4");
      const response = await this.executeMikrotik(async () => {
        return await (this.api as any).write("/ping", [`=address=${address}`, `=count=${pingCount}`]);
      });
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
    if (name === "mikrotik_get_logs") {
      const { lines } = args || {};
      const response = await this.executeMikrotik(async () => await this.api.write("/log/print"));
      const result = (lines && Number(lines) > 0) ? response.slice(-Number(lines)) : response.slice(-50);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    if (name === "mikrotik_run_command") {
      const { menu, params } = args || {};
      const response = await this.executeMikrotik(async () => {
        if (params) {
          if (Array.isArray(params)) {
            return await (this.api as any).write(menu, params);
          }
          if (typeof params === "object" && Object.keys(params).length > 0) {
            const paramList = Object.entries(params).map(([k, v]) => `=${k}=${v}`);
            return await (this.api as any).write(menu, paramList);
          }
        }
        return await this.api.write(menu);
      });
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  public createMcpServer(): Server {
    const server = new Server(
      {
        name: "mcp-mikrotik",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    this.setupToolHandlers(server);
    server.onerror = (error) => log(`${color.red("[MCP]")} Error: ${error?.message || error}`, "error");
    return server;
  }

  private setupToolHandlers(server: Server) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: "mikrotik_diagnostics",
          description: "Perform a comprehensive health and status audit on MikroTik router (CPU, interfaces, failover, firewall).",
        },
        {
          name: "mikrotik_topology",
          description: "Map out network topology: IP assignments, active interfaces, routing table, and DHCP leases.",
        },
      ],
    }));

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (request.params.name === "mikrotik_diagnostics") {
        return {
          description: "Prompt to inspect MikroTik router health",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "Please perform a complete diagnostic on the MikroTik router (system resources, CPU load, WAN & interface states, IP routes & failover, firewall status) and summarize findings.",
              },
            },
          ],
        };
      }
      if (request.params.name === "mikrotik_topology") {
        return {
          description: "Prompt to map network topology",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "Please map out the network topology by retrieving all assigned IP addresses (/ip/address), active interfaces (/interface), routing table (/ip/route), and active DHCP client leases (/ip/dhcp-server/lease).",
              },
            },
          ],
        };
      }
      throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${request.params.name}`);
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: MCP_TOOLS_LIST,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.handleToolCall(request.params.name, request.params.arguments);
    });
  }

  async runStdio() {
    const server = this.createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log(`${color.green("[GATEWAY]")} Running in Stdio mode (MikroTik target: ${MIKROTIK_HOST}:${MIKROTIK_PORT})`, "info");
  }

  async run() {
    const app = express();
    app.use(cors());

    const sessions = new Map<string, { transport: SSEServerTransport; server: Server }>();

    // Authentication middleware
    const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const authHeader = req.headers.authorization;
      const tokenQuery = (req.query.token as string | undefined) || (req.query.key as string | undefined);
      
      const bearerToken = authHeader?.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null;

      if (bearerToken && (bearerToken === OAUTH_ACCESS_TOKEN || bearerToken === OAUTH_CLIENT_SECRET)) {
        return next();
      }

      if (tokenQuery && (tokenQuery === OAUTH_ACCESS_TOKEN || tokenQuery === OAUTH_CLIENT_SECRET)) {
        return next();
      }
      
      log(`${color.yellow("[SECURITY]")} Unauthorized access attempt from ${req.ip} to ${req.method} ${req.url}`, "warning");
      return res.status(401).json({ error: "Unauthorized", message: "Authentication Required" });
    };

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        version: "1.0.0",
        uptime_seconds: process.uptime(),
        mikrotik: {
          host: MIKROTIK_HOST,
          port: MIKROTIK_PORT,
          connected: !!(this.api && this.api.connected)
        }
      });
    });

    // Direct API call endpoint
    app.post("/api/call", express.json(), requireAuth, async (req, res) => {
      const { name, tool, arguments: args } = req.body || {};
      const targetTool = name || tool;
      if (!targetTool) {
        return res.status(400).json({ error: "Missing parameter: name or tool" });
      }
      try {
        const result = await this.handleToolCall(targetTool, args || {});
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message, isError: true });
      }
    });

    // List tools endpoint
    app.get("/api/tools", requireAuth, (req, res) => {
      res.json({ tools: MCP_TOOLS_LIST });
    });

    // OAUTH 2.0 Discovery & Endpoints for Gemini Spark & Cloud Clients
    const protectedResourceResponse = (req: express.Request, res: express.Response) => {
      const baseUrl = `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;
      res.json({
        resource: `${baseUrl}${req.path.replace("/.well-known/oauth-protected-resource", "")}`,
        authorization_servers: [ baseUrl ]
      });
    };
    app.get("/.well-known/oauth-protected-resource/sse", protectedResourceResponse);
    app.get("/.well-known/oauth-protected-resource", protectedResourceResponse);

    const authServerMetadata = (req: express.Request, res: express.Response) => {
      const baseUrl = `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;
      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
        grant_types_supported: ["authorization_code", "client_credentials"],
        response_types_supported: ["code"],
        scopes_supported: ["mcp", "read", "write"]
      });
    };
    app.get("/.well-known/oauth-authorization-server", authServerMetadata);
    app.get("/.well-known/openid-configuration", authServerMetadata);

    app.get("/authorize", (req, res) => {
      const redirectUri = req.query.redirect_uri as string;
      const state = req.query.state as string;
      if (redirectUri) {
        const url = new URL(redirectUri);
        url.searchParams.set("code", OAUTH_AUTH_CODE);
        if (state) url.searchParams.set("state", state);
        return res.redirect(url.toString());
      }
      res.json({ code: OAUTH_AUTH_CODE, state });
    });

    app.post("/token", express.urlencoded({ extended: true }), express.json(), (req, res) => {
      res.json({
        access_token: OAUTH_ACCESS_TOKEN,
        token_type: "Bearer",
        expires_in: 31536000,
        refresh_token: "refresh-token-mcp-mikrotik"
      });
    });

    // Streamable HTTP Transport
    const handleStreamableHttp = async (req: express.Request, res: express.Response) => {
      const clientVersion = req.headers["mcp-protocol-version"];
      if (typeof clientVersion === "string" && !SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion)) {
        req.headers["mcp-protocol-version"] = LATEST_PROTOCOL_VERSION;
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          if (req.rawHeaders[i].toLowerCase() === "mcp-protocol-version") {
            req.rawHeaders[i + 1] = LATEST_PROTOCOL_VERSION;
          }
        }
      }

      const server = this.createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err: any) {
        log(`${color.red("[STREAMABLE HTTP]")} Error: ${err?.message || err}`, "error");
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    };

    app.post("/mcp", express.json(), requireAuth, handleStreamableHttp);

    // SSE Transport
    app.get("/sse", requireAuth, async (req, res) => {
      const authHeader = req.headers.authorization;
      const headerToken = (authHeader && authHeader.toLowerCase().startsWith("bearer ")) ? authHeader.slice(7).trim() : undefined;
      const token = (req.query.token as string | undefined) || (req.query.key as string | undefined) || headerToken || OAUTH_ACCESS_TOKEN;

      const server = this.createMcpServer();
      const dummyEndpoint = "/message";
      const transport = new SSEServerTransport(dummyEndpoint, res);
      
      const actualEndpoint = `/message?sessionId=${transport.sessionId}&token=${encodeURIComponent(token)}`;
      (transport as any)._endpoint = actualEndpoint;

      await server.connect(transport);
      sessions.set(transport.sessionId, { transport, server });
      log(`${color.green("[SSE]")} Client connected securely! Session: ${transport.sessionId}`, "success");

      res.on("close", async () => {
        log(`${color.blue("[SSE]")} Connection closed for session: ${transport.sessionId}`, "info");
        sessions.delete(transport.sessionId);
        try {
          await server.close();
        } catch (e) {}
      });
    });

    app.post("/message", express.json(), requireAuth, async (req, res) => {
      const sessionId = (req.query.sessionId as string | undefined) || (req.headers["x-session-id"] as string | undefined);
      let session = sessionId ? sessions.get(sessionId) : undefined;
      if (!session && sessions.size > 0) {
        session = Array.from(sessions.values()).pop();
      }

      if (session) {
        try {
          await session.transport.handlePostMessage(req, res, req.body);
        } catch (err: any) {
          if (!res.headersSent) {
            res.status(500).send(err?.message || "Internal server error");
          }
        }
      } else {
        res.status(500).send("No active SSE connection");
      }
    });

    app.listen(PORT, (err?: Error) => {
      if (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EADDRINUSE") {
          log(`${color.red("[FATAL]")} Port ${PORT} is already in use by another process.`, "error");
        } else {
          log(`${color.red("[FATAL]")} Failed to listen on port ${PORT}: ${err.message}`, "error");
        }
        process.exit(1);
      }
      log(`${color.green("[GATEWAY]")} MCP MikroTik Server v1.0.0 running on port ${PORT}`, "success");
      log(`${color.green("[MIKROTIK]")} Router API target: ${MIKROTIK_HOST}:${MIKROTIK_PORT}`, "info");
      log(`${color.green("[SECURITY]")} MCP Auth Token active: ${OAUTH_ACCESS_TOKEN.slice(0, 12)}...`, "info");
    });
  }
}

const server = new McpMikrotikServer();
if (process.argv.includes("--stdio")) {
  server.runStdio().catch(console.error);
} else {
  server.run().catch(console.error);
}
