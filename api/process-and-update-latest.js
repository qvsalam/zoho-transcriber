import { zohoRequest } from "../lib/zoho.js";
import { uploadToGemini, transcribeGeminiFile } from "../lib/gemini.js";
import { callZohoMcpTool } from "../lib/zoho-mcp.js";

function extractContent(xml) {
  const match = String(xml || "").match(/<ZContent><!\[CDATA\[([\s\S]*?)\]\]><\/ZContent>/);
  return match ? match[1] : null;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function hasTranscript(content) {
  return /Transcript<\/b>/i.test(content) ||
    /Transcript \(Zoho Transcriber\)/i.test(content);
}

function mcpHasError(body) {
  if (!body) return true;
  if (body.error) return true;
  if (body.result?.isError) return true;
  if (body.result?.structuredContent?.status === "failure") return true;
  const text = body.result?.content?.map((x) => x?.text || "").join(" ") || "";
  if (/not authorised|not authorized|cannot perform this operation/i.test(text)) return true;
  return false;
}

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
      limit: "20",
      offset: "0",
      sort_column: "-Notecard.CreatedTime",
    });

    const listResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards?${q.toString()}`
    );
    const listBody = await listResponse.json();
    if (!listResponse.ok) throw new Error("Could not list Zoho notecards");

    const candidates = (listBody.notecards || []).filter(
      (n) =>
        n.type === "note/mixed" &&
        n.embed_resources?.some((r) => String(r.format || "").startsWith("audio/"))
    );

    let card = null;
    let existingContent = null;

    for (const candidate of candidates) {
      const detailResponse = await zohoRequest(
        `/notebooks/${notebook.notebook_id}/notecards/${candidate.notecard_id}`
      );
      const xml = await detailResponse.text();
      if (!detailResponse.ok) continue;

      const content = extractContent(xml);
      if (!content) continue;
      if (hasTranscript(content)) continue;

      card = candidate;
      existingContent = content;
      break;
    }

    if (!card) {
      return res.status(200).json({
        ok: true,
        processed: false,
        reason: "No unprocessed audio card found",
      });
    }

    const resource = card.embed_resources.find(
      (r) => String(r.format || "").startsWith("audio/")
    );

    const audioResponse = await zohoRequest(
      `/notebooks/${notebook.notebook_id}/notecards/${card.notecard_id}/resources/${resource.resource_id}`
    );
    if (!audioResponse.ok) {
      throw new Error(
        `Zoho audio download failed: ${audioResponse.status} ${await audioResponse.text()}`
      );
    }

    const audio = await audioResponse.arrayBuffer();
    const mimeType =
      resource.format ||
      audioResponse.headers.get("content-type") ||
      "audio/mp4";

    const file = await uploadToGemini(audio, mimeType, "zoho-audio.m4a");
    const transcript = await transcribeGeminiFile(file);

    const transcriptHtml =
      "<div><br></div>" +
      "<div><b>Transcript</b></div>" +
      "<div>" + escapeHtml(transcript) + "</div>";

    const mcpResult = await callZohoMcpTool(
      "ZohoNotebook_appendHtmlToNotecard",
      {
        path_variables: {
          notecard_id: card.notecard_id,
        },
        body: {
          JSONString: {
            input: transcriptHtml,
            version_notes: { appName: "Zoho Transcriber" },
          },
        },
      }
    );

    if (mcpHasError(mcpResult)) {
      return res.status(502).json({
        ok: false,
        step: "append_transcript",
        notecard_id: card.notecard_id,
        transcript,
        mcpResult,
      });
    }

    return res.status(200).json({
      ok: true,
      processed: true,
      notecard_id: card.notecard_id,
      transcript,
      keptExistingContent: Boolean(existingContent),
      updatedVia: "ZohoNotebook_appendHtmlToNotecard",
      mcpResult,
    });
  } catch (error) {
    console.error("PROCESS_AND_UPDATE_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
