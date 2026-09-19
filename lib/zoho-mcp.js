function parseMcpResponse(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const events = trimmed.split(/\n\n+/);
  for (let i = events.length - 1; i >= 0; i--) {
    const lines = events[i].split(/\r?\n/);
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    try { return JSON.parse(data); } catch {}
  }
  return { raw: trimmed.slice(0, 12000) };
}

async function mcpPost(payload, sessionId) {
  const url = process.env.ZOHO_MCP_URL;
  if (!url) throw new Error("ZOHO_MCP_URL is not configured");

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    sessionId: response.headers.get("mcp-session-id") || sessionId || null,
    body: parseMcpResponse(text),
  };
}

export async function mcpSession() {
  const init = await mcpPost({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "zoho-transcriber", version: "0.2.0" },
    },
  });

  if (!init.ok) {
    throw new Error(`Zoho MCP initialize failed: ${init.status} ${JSON.stringify(init.body)}`);
  }

  const sessionId = init.sessionId;
  await mcpPost({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  }, sessionId);

  return sessionId;
}

export async function listZohoMcpTools() {
  const sessionId = await mcpSession();
  const result = await mcpPost({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  }, sessionId);

  if (!result.ok) {
    throw new Error(`Zoho MCP tools/list failed: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

export async function callZohoMcpTool(name, args) {
  const sessionId = await mcpSession();
  const result = await mcpPost({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name, arguments: args || {} },
  }, sessionId);

  if (!result.ok) {
    throw new Error(`Zoho MCP tool call failed: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}
