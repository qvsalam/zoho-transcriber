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

function hasAudioMarker(content) {
  return /<zaudiomarker\b/i.test(content);
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

function exportedZipText(body) {
  return (
    body?.result?.structuredContent?.data?.result ||
    body?.result?.content?.map((x) => x?.text || "").join("\n") ||
    ""
  );
}

function resourceFromZipText(text) {
  const match = String(text).match(
    /assets\/audio\/([A-Za-z0-9]+)\.(m4a|mp3|wav|aac|ogg|webm|mp4)/i
  );
  if (!match) return null;
  const ext = match[2].toLowerCase();
  const mimeByExt = {
    m4a: "audio/m4a",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    aac: "audio/aac",
    ogg: "audio/ogg",
    webm: "audio/webm",
    mp4: "audio/mp4",
  };
  return {
    resource_id: match[1],
    format: mimeByExt[ext] || "audio/m4a",
  };
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
      (n) => n.type === "note/mixed"
    );

    let card = null;
    let existingContent = null;

    for (const candidate of candidates) {
      const detailResponse = await zohoRequest(
        `/notebooks/${notebook.notebook_id}/notecards/${candidate.notecard_id}`
      );
      const xml = await detailResponse.text();
      if (!detailResponse.ok) continue;

      const noteContent = extractContent(xml);
      if (!noteContent) continue;
      if (!hasAudioMarker(noteContent)) continue;
      if (hasTranscript(noteContent)) continue;

      card = candidate;
      existingContent = noteContent;
      break;
    }

    if (!card) {
      return res.status(200).json({
        ok: true,
        processed: false,
        reason: "No unprocessed mixed note with audio found",
      });
    }

    let resource = card.embed_resources?.find(
      (r) => String(r.format || "").startsWith("audio/")
    );

    if (!resource) {
      const exported = await callZohoMcpTool(
        "ZohoNotebook_downloadNotecardAsMarkdown",
        {
          path_variables: {
            notebook_id: notebook.notebook_id,
            notecard_id: card.notecard_id,
          },
          query_params: { format: "zip" },
        }
      );

      if (mcpHasError(exported)) {
        return res.status(502).json({
          ok: false,
          step: "export_note",
          notecard_id: card.notecard_id,
          mcpResult: exported,
        });
      }

      resource = resourceFromZipText(exportedZipText(exported));
    }

    if (!resource?.resource_id) {
      return res.status(202).json({
        ok: true,
        processed: false,
        waitingForAudioResource: true,
        notecard_id: card.notecard_id,
        reason: "Audio resource is not available from Zoho yet",
      });
    }

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
      audioResourceId: resource.resource_id,
      keptExistingContent: Boolean(existingContent),
      updatedVia: "ZohoNotebook_appendHtmlToNotecard",
    });
  } catch (error) {
    console.error("PROCESS_AND_UPDATE_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
