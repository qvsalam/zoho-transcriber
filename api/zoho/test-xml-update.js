import { zohoRequest } from "../../lib/zoho.js";

function extractContent(xml) {
  const m = xml.match(/<ZContent><!\[CDATA\[([\s\S]*?)\]\]><\/ZContent>/);
  return m ? m[1] : null;
}

function escapeXml(s = "") {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"
  }[ch]));
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
    const content = extractContent(xml);
    if (!content) throw new Error("Could not extract ZContent");

    const newContent = content.replace(
      /<\/content>\s*$/,
      '<div data-vercel-test="1">Vercel update test</div></content>'
    );

    const zNote = `<?xml version="1.0" encoding="UTF-8"?>
<ZNote>
  <ZMeta>
    <ZTitle>${escapeXml(card.name || "Untitled")}</ZTitle>
    <ZLocation><ZLongitude>0.0</ZLongitude><ZLatitude>0.0</ZLatitude><ZCity>Unknown</ZCity></ZLocation>
    <ZNoteColor>${escapeXml(card.color || "#FFFFFF")}</ZNoteColor>
    <ZNoteType typeVersion="1">note/mixed</ZNoteType>
  </ZMeta>
  <ZContent><![CDATA[${newContent}]]></ZContent>
</ZNote>`;

    const updateResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}`,
      {
        method:"PUT",
        headers:{
          "Content-Type":"application/xml",
          "Accept":"application/json",
        },
        body:zNote,
      }
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
