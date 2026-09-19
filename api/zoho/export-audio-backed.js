import { zohoRequest } from "../../lib/zoho.js";
import { callZohoMcpTool } from "../../lib/zoho-mcp.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const nr = await zohoRequest("/notebooks");
    const nb = await nr.json();
    const notebook = (nb.notebooks || []).find((n) => n.is_default) || (nb.notebooks || [])[0];

    const q = new URLSearchParams({ limit:"20", offset:"0", sort_column:"-Notecard.CreatedTime" });
    const lr = await zohoRequest(`/notebooks/${notebook.notebook_id}/notecards?${q.toString()}`);
    const lb = await lr.json();

    const card = (lb.notecards || []).find((n) =>
      Array.isArray(n.embed_resources) && n.embed_resources.length > 0
    );
    if (!card) return res.status(404).json({ ok:false, error:"No card with resources found" });

    const result = await callZohoMcpTool("ZohoNotebook_downloadNotecardAsMarkdown", {
      path_variables: {
        notebook_id: notebook.notebook_id,
        notecard_id: card.notecard_id
      },
      query_params: { format:"zip" }
    });

    return res.status(200).json({ ok:true, card, mcpResult:result });
  } catch (error) {
    return res.status(500).json({ ok:false, error:error.message });
  }
}
