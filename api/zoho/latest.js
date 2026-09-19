import { zohoRequest } from "../../lib/zoho.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const notebooksResponse = await zohoRequest("/notebooks");
    const notebooksBody = await notebooksResponse.json();
    if (!notebooksResponse.ok) {
      return res.status(notebooksResponse.status).json({ ok: false, body: notebooksBody });
    }

    const notebook =
      (notebooksBody.notebooks || []).find((item) => item.is_default) ||
      (notebooksBody.notebooks || [])[0];

    if (!notebook?.notebook_id) {
      return res.status(404).json({ ok: false, error: "No notebook found" });
    }

    const q = new URLSearchParams({
      limit: "10",
      offset: "0",
      sort_column: "-Notecard.CreatedTime",
    });
    const response = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards?${q.toString()}`
    );
    const body = await response.json();

    return res.status(response.ok ? 200 : response.status).json({
      ok: response.ok,
      notebook_id: notebook.notebook_id,
      notecards: (body.notecards || []).map((n) => ({
        notecard_id: n.notecard_id,
        name: n.name,
        type: n.type,
        created_time: n.created_time,
        modified_time: n.modified_time,
        embed_resources: n.embed_resources,
      })),
      rawStatus: response.status,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
