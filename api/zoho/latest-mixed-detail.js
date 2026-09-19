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
    const card = (lb.notecards || []).find((n) => n.type === "note/mixed");
    if (!card) return res.status(404).json({ok:false,error:"No mixed card"});

    const dr = await zohoRequest(`/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}`);
    const detail = await dr.text();

    return res.status(dr.ok ? 200 : dr.status).json({ok:dr.ok,card,detail});
  } catch (error) {
    return res.status(500).json({ok:false,error:error.message});
  }
}
