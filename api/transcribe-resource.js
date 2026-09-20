import { zohoRequest } from "../lib/zoho.js";
import { uploadToGemini, transcribeGeminiFile } from "../lib/gemini.js";

function cleanId(value) {
  const v = String(value || "");
  return /^[A-Za-z0-9]+$/.test(v) ? v : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const notebookId = cleanId(req.query.notebook_id);
    const notecardId = cleanId(req.query.notecard_id);
    const resourceId = cleanId(req.query.resource_id);

    if (!notebookId || !notecardId || !resourceId) {
      return res.status(400).json({
        ok: false,
        error: "notebook_id, notecard_id and resource_id are required",
      });
    }

    const audioResponse = await zohoRequest(
      `/notebooks/${notebookId}/notecards/${notecardId}/resources/${resourceId}`
    );

    if (!audioResponse.ok) {
      return res.status(audioResponse.status).json({
        ok: false,
        error: `Zoho audio download failed: ${audioResponse.status}`,
      });
    }

    const audio = await audioResponse.arrayBuffer();
    const mimeType =
      audioResponse.headers.get("content-type") || "audio/m4a";

    const file = await uploadToGemini(audio, mimeType, "zoho-audio.m4a");
    const transcript = await transcribeGeminiFile(file);

    return res.status(200).json({
      ok: true,
      transcript,
      notebook_id: notebookId,
      notecard_id: notecardId,
      resource_id: resourceId,
    });
  } catch (error) {
    console.error("TRANSCRIBE_RESOURCE_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
