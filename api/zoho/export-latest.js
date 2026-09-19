import { zohoRequest } from "../../lib/zoho.js";
import { callZohoMcpTool } from "../../lib/zoho-mcp.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const notebooksResponse = await zohoRequest("/notebooks");
    const notebooksBody = await notebooksResponse.json();
    const notebook =
      (notebooksBody.notebooks || []).find((n) => n.is_default) ||
      (notebooksBody.notebooks || [])[0];

    const q = new URLSearchParams({
      limit: "10",
      offset: "0",
      sort_column: "-Notecard.CreatedTime",
    });
    const listResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards?${q.toString()}`
    );
    const listBody = await listResponse.json();
    const card = (listBody.notecards || []).find((n) => n.type === "note/audio");
    if (!card) return res.status(404).json({ ok:false, error:"No audio card found" });

    const result = await callZohoMcpTool(
      "ZohoNotebook_downloadNotecardAsMarkdown",
      {
        path_variables: {
          notebook_id: notebook.notebook_id,
          notecard_id: card.notecard_id
        },
        query_params: { format: "zip" }
      }
    );

    return res.status(200).json({
      ok: true,
      notebook_id: notebook.notebook_id,
      notecard_id: card.notecard_id,
      mcpResult: result
    });
  } catch (error) {
    return res.status(500).json({ ok:false, error:error.message });
  }
}
