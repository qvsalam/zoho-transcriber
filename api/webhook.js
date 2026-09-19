export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "zoho-transcriber-webhook" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const payload = typeof req.body === "string"
    ? (() => {
        try { return JSON.parse(req.body); } catch { return { raw: req.body }; }
      })()
    : (req.body ?? {});

  console.log("ZOHO_WEBHOOK_EVENT", JSON.stringify({
    at: new Date().toISOString(),
    headers: {
      "content-type": req.headers["content-type"],
      "user-agent": req.headers["user-agent"],
    },
    payload,
  }));

  return res.status(200).json({ ok: true });
}
