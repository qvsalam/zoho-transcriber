import { zohoRequest } from "../../lib/zoho.js";

function extractContent(xml) {
  const m = xml.match(/<ZContent><!\[CDATA\[([\s\S]*?)\]\]><\/ZContent>/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const notebooksResponse = await zohoRequest("/notebooks");
    const notebooksBody = await notebooksResponse.json();
    const notebook =
      (notebooksBody.notebooks || []).find((n) => n.is_default) ||
      (notebooksBody.notebooks || [])[0];

    const q = new URLSearchParams({
      limit:"10",
      offset:"0",
      sort_column:"-Notecard.CreatedTime",
    });
    const listResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards?${q.toString()}`
    );
    const listBody = await listResponse.json();
    const card = (listBody.notecards || []).find(
      (n) => n.type === "note/mixed" && n.embed_resources?.length
    );
    if (!card) return res.status(404).json({ok:false,error:"No mixed audio note found"});

    const detailResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}`
    );
    const xml = await detailResponse.text();
    const current = extractContent(xml);
    if (!current) throw new Error("Could not extract ZContent");

    const marker = '<div data-vercel-test="1">Vercel update test</div>';
    const html = current.includes('data-vercel-test="1"')
      ? current
      : current.replace(/<\/content>\s*$/, marker + "</content>");

    const form = new FormData();
    form.append("content", html);

    const updateResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}`,
      { method:"PUT", body:form }
    );

    const text = await updateResponse.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    return res.status(updateResponse.ok ? 200 : updateResponse.status).json({
      ok:updateResponse.ok,
      notecard_id:card.notecard_id,
      status:updateResponse.status,
      body,
    });
  } catch (error) {
    return res.status(500).json({ok:false,error:error.message});
  }
}
