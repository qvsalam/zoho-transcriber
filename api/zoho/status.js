import { zohoRequest } from "../../lib/zoho.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const response = await zohoRequest("/notebooks");
    const body = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, body });
    }
    return res.status(200).json({
      ok: true,
      notebooks: (body.notebooks || []).map((n) => ({
        notebook_id: n.notebook_id,
        name: n.name,
        is_default: n.is_default,
      })),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
