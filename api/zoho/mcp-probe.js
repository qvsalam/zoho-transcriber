import { getZohoAccessToken } from "../../lib/zoho.js";

const MCP_URL = "https://notebook.zoho.com/api/mcp/v1";

function authHeaders(token, sessionId) {
  const headers = {
    "Authorization": "Bearer " + token,
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  return headers;
}

async function jsonRpc(token, payload, sessionId) {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: authHeaders(token, sessionId),
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    sessionId: response.headers.get("mcp-session-id"),
    text,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const token = await getZohoAccessToken();

    const init = await jsonRpc(token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "zoho-transcriber", version: "0.1.0" },
      },
    });

    if (!init.ok) {
      return res.status(init.status).json({
        ok: false,
        step: "initialize",
        status: init.status,
        body: init.text.slice(0, 2000),
      });
    }

    const sessionId = init.sessionId;

    await jsonRpc(token, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }, sessionId);

    const tools = await jsonRpc(token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }, sessionId);

    return res.status(tools.ok ? 200 : tools.status).json({
      ok: tools.ok,
      initStatus: init.status,
      sessionIdPresent: Boolean(sessionId),
      toolsStatus: tools.status,
      body: tools.text.slice(0, 12000),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
