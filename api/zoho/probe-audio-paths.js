import { zohoRequest } from "../../lib/zoho.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const nr = await zohoRequest("/notebooks");
    const nb = await nr.json();
    const notebook = (nb.notebooks || []).find((n) => n.is_default) || (nb.notebooks || [])[0];

    const q = new URLSearchParams({ limit:"10", offset:"0", sort_column:"-Notecard.CreatedTime" });
    const lr = await zohoRequest(`/notebooks/${notebook.notebook_id}/notecards?${q.toString()}`);
    const lb = await lr.json();
    const card = (lb.notecards || []).find((n) => n.type === "note/audio");
    if (!card) return res.status(404).json({ok:false,error:"No audio card"});

    const paths = [
      `/notecards/${card.notecard_id}/resources`,
      `/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}/resources`,
      `/notecards/${card.notecard_id}/resource`,
      `/notecards/${card.notecard_id}/audio`,
      `/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}/audio`,
      `/notecards/${card.notecard_id}/download`,
      `/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}/download`
    ];

    const results = [];
    for (const path of paths) {
      const response = await zohoRequest(path);
      const contentType = response.headers.get("content-type");
      const contentLength = response.headers.get("content-length");
      const buf = await response.arrayBuffer();
      const head = new TextDecoder().decode(buf.slice(0, 500));
      results.push({
        path,
        status: response.status,
        contentType,
        contentLength,
        bytes: buf.byteLength,
        head
      });
    }

    return res.status(200).json({
      ok:true,
      notebook_id:notebook.notebook_id,
      notecard_id:card.notecard_id,
      results
    });
  } catch (error) {
    return res.status(500).json({ok:false,error:error.message});
  }
}
