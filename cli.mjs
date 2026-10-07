import https from 'https';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.MCP_SERVER_URL || `http://localhost:${process.env.PORT || 2024}`;
const TOKEN = process.env.MCP_TOKEN || 'mcp_mikrotik_token_12345';
const client = BASE_URL.startsWith('https') ? https : http;

export async function callMcpTool(toolName, toolArgs = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ name: toolName, arguments: toolArgs });
    const url = new URL(`${BASE_URL}/api/call`);
    const reqOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${TOKEN}`
      },
      timeout: 30000
    };

    const req = client.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ content: [{ type: 'text', text: body }] });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(payload);
    req.end();
  });
}

// CLI Execution
if (process.argv[1]?.endsWith('cli.mjs')) {
  const command = process.argv[2] || 'identity';

  (async () => {
    try {
      if (command.startsWith('mikrotik_')) {
        const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
        const res = await callMcpTool(command, args);
        console.log(res?.content?.[0]?.text || JSON.stringify(res, null, 2));
      } else if (command === 'identity') {
        const res = await callMcpTool('mikrotik_get_identity', {});
        console.log(res?.content?.[0]?.text || JSON.stringify(res, null, 2));
      } else if (command === 'resources') {
        const res = await callMcpTool('mikrotik_get_resources', {});
        console.log(res?.content?.[0]?.text || JSON.stringify(res, null, 2));
      } else if (command === 'interfaces') {
        const res = await callMcpTool('mikrotik_get_interfaces', {});
        console.log(res?.content?.[0]?.text || JSON.stringify(res, null, 2));
      } else if (command === 'routes') {
        const res = await callMcpTool('mikrotik_get_routes', {});
        console.log(res?.content?.[0]?.text || JSON.stringify(res, null, 2));
      } else if (command === 'leases') {
        const res = await callMcpTool('mikrotik_get_dhcp_leases', {});
        console.log(res?.content?.[0]?.text || JSON.stringify(res, null, 2));
      } else if (command === 'dns') {
        const res = await callMcpTool('mikrotik_get_dns', {});
        console.log(res?.content?.[0]?.text || JSON.stringify(res, null, 2));
      } else if (command === 'ping') {
        const target = process.argv[3] || '8.8.8.8';
        const res = await callMcpTool('mikrotik_ping', { address: target, count: '4' });
        console.log(res?.content?.[0]?.text || JSON.stringify(res, null, 2));
      } else {
        const menu = command.startsWith('/') ? command : `/${command}`;
        const params = process.argv[3] ? JSON.parse(process.argv[3]) : {};
        const res = await callMcpTool('mikrotik_run_command', { menu, params });
        console.log(res?.content?.[0]?.text || JSON.stringify(res, null, 2));
      }
      process.exit(0);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}
