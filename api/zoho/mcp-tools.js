import { listZohoMcpTools } from "../../lib/zoho-mcp.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = await listZohoMcpTools();
    const tools = body?.result?.tools || body?.tools || [];
    return res.status(200).json({
      ok: true,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
