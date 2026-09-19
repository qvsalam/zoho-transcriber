const API_BASE = "https://generativelanguage.googleapis.com";

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

export async function uploadToGemini(bytes, mimeType = "audio/mp4", displayName = "zoho-audio.m4a") {
  const key = apiKey();

  const start = await fetch(`${API_BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });

  if (!start.ok) {
    throw new Error(`Gemini upload start failed: ${start.status} ${await start.text()}`);
  }

  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini did not return an upload URL");

  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Type": mimeType,
    },
    body: bytes,
  });

  const uploadBody = await uploaded.json();
  if (!uploaded.ok || !uploadBody?.file?.uri) {
    throw new Error(`Gemini file upload failed: ${uploaded.status} ${JSON.stringify(uploadBody)}`);
  }
  return uploadBody.file;
}

export async function transcribeGeminiFile(file) {
  const key = apiKey();
  const response = await fetch(
    `${API_BASE}/v1beta/models/gemini-3.5-transcribe:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            {
              text: "Transcribe this audio accurately. Preserve the spoken language exactly as spoken, including Arabic and Iraqi dialect. Return only the transcript text, with no commentary or markdown."
            },
            {
              file_data: {
                mime_type: file.mimeType || "audio/mp4",
                file_uri: file.uri,
              },
            },
          ],
        }],
      }),
    }
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini transcription failed: ${response.status} ${JSON.stringify(body)}`);
  }

  const text = body?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || part.audioTranscription?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) throw new Error(`Gemini returned no transcript: ${JSON.stringify(body)}`);
  return text;
}
