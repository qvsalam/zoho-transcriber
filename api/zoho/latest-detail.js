import { zohoRequest } from "../../lib/zoho.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const notebooksResponse = await zohoRequest("/notebooks");
    const notebooksBody = await notebooksResponse.json();
    const notebook =
      (notebooksBody.notebooks || []).find((item) => item.is_default) ||
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

    const detailResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}`
    );
    const text = await detailResponse.text();
    let detail;
    try { detail = JSON.parse(text); } catch { detail = text; }

    return res.status(detailResponse.ok ? 200 : detailResponse.status).json({
      ok: detailResponse.ok,
      notebook_id: notebook.notebook_id,
      card,
      detail,
    });
  } catch (error) {
    return res.status(500).json({ ok:false, error:error.message });
  }
}
