# MCP MikroTik RouterOS

Model Context Protocol (MCP) Server for managing MikroTik RouterOS devices seamlessly with AI assistants (Google Antigravity, Gemini Spark, Claude Desktop, Cursor).

---

## Features

- **Router Identity & Diagnostics**:
  - `mikrotik_get_identity`: Router hostname and system identity.
  - `mikrotik_get_resources`: CPU load, RAM usage, HDD, RouterOS version, and uptime.
- **Interfaces & Networking**:
  - `mikrotik_get_interfaces`: Status of all Ethernet, Bridge, SFP, and VLAN interfaces with RX/TX statistics.
  - `mikrotik_get_ip_addresses`: All assigned IP addresses, subnets, and interfaces.
  - `mikrotik_get_routes`: Full routing table, default gateways, and failover distance status.
  - `mikrotik_get_dhcp_leases`: Connected DHCP clients, MAC addresses, and hostnames.
- **Firewall & Security**:
  - `mikrotik_get_firewall`: Inspect Filter, NAT, Mangle, Raw rules, and Address Lists.
  - `mikrotik_get_dns`: DNS server configurations, cache, and static sinkhole entries.
- **Operations & Management**:
  - `mikrotik_ping`: Test network reachability and packet loss directly from the router.
  - `mikrotik_get_logs`: Live system logs for auditing and troubleshooting.
  - `mikrotik_run_command`: Execute custom RouterOS API paths (e.g. `/ip/service/print`, `/system/clock/print`).

---

## Installation

```bash
cd C:\Project\mcp-mikrotik
yarn install
yarn build
```

---

## Configuration (`.env`)

Create a `.env` file based on `.env.example`:

```env
MIKROTIK_HOST=192.168.88.1
MIKROTIK_USER=admin
MIKROTIK_PASSWORD=your_password
MIKROTIK_PORT=2022
PORT=2024

TIMEZONE=Asia/Jakarta
MCP_TOKEN=your_secure_token
MCP_CLIENT_ID=mcp-mikrotik-client
MCP_CLIENT_SECRET=your_client_secret
```

---

## Running the Server

### 1. HTTP / SSE / Streamable HTTP Mode (for Gemini Spark & Remote AI)

```bash
yarn start
```

### 2. Stdio Mode (for Local Claude Desktop & Antigravity)

```bash
node build/index.js --stdio
```

---

## Client Integration

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "mcp-mikrotik": {
      "command": "node",
      "args": ["C:/Project/mcp-mikrotik/build/index.js", "--stdio"],
      "env": {
        "MIKROTIK_HOST": "192.168.10.1",
        "MIKROTIK_USER": "wtl",
        "MIKROTIK_PASSWORD": "your_password",
        "MIKROTIK_PORT": "2022"
      }
    }
  }
}
```

### Google Antigravity IDE (`mcp_config.json`)

```json
{
  "mcpServers": {
    "mcp-mikrotik": {
      "serverUrl": "http://127.0.0.1:2024/sse?token=YOUR_MCP_TOKEN"
    }
  }
}
```

### Google Gemini Spark (Mobile & Web)

1. **URL Server MCP**: `https://your-domain.com/mcp`
2. **Client ID**: Value of `MCP_CLIENT_ID` in `.env`
3. **Client Secret**: Value of `MCP_CLIENT_SECRET` in `.env`

---

## License

MIT License &copy; WahyuPR0
