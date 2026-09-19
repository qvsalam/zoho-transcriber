import { zohoRequest } from "../lib/zoho.js";
import { uploadToGemini, transcribeGeminiFile } from "../lib/gemini.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const notebooksResponse = await zohoRequest("/notebooks");
    const notebooksBody = await notebooksResponse.json();
    if (!notebooksResponse.ok) throw new Error("Could not list Zoho notebooks");

    const notebook =
      (notebooksBody.notebooks || []).find((n) => n.is_default) ||
      (notebooksBody.notebooks || [])[0];
    if (!notebook?.notebook_id) throw new Error("No Zoho notebook found");

    const q = new URLSearchParams({
      limit: "10",
      offset: "0",
      sort_column: "-Notecard.CreatedTime",
    });

    const listResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards?${q.toString()}`
    );
    const listBody = await listResponse.json();
    if (!listResponse.ok) throw new Error("Could not list Zoho notecards");

    const card = (listBody.notecards || []).find(
      (n) => n.type === "note/audio" && n.embed_resources?.length
    );
    if (!card) return res.status(404).json({ ok:false, error:"No audio card found" });

    const resource = card.embed_resources[0];
    const audioResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}/resources/${resource.resource_id}`
    );
    if (!audioResponse.ok) {
      throw new Error(`Zoho audio download failed: ${audioResponse.status} ${await audioResponse.text()}`);
    }

    const audio = await audioResponse.arrayBuffer();
    const mimeType =
      resource.format ||
      audioResponse.headers.get("content-type") ||
      "audio/mp4";

    const file = await uploadToGemini(audio, mimeType, "zoho-audio.m4a");
    const transcript = await transcribeGeminiFile(file);

    return res.status(200).json({
      ok:true,
      notebook_id:notebook.notebook_id,
      notecard_id:card.notecard_id,
      resource_id:resource.resource_id,
      transcript,
    });
  } catch (error) {
    console.error("PROCESS_LATEST_ERROR", error);
    return res.status(500).json({ ok:false, error:error.message });
  }
}
