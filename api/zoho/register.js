import { zohoRequest } from "../../lib/zoho.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const notebooksResponse = await zohoRequest("/notebooks");
    const notebooksBody = await notebooksResponse.json();
    if (!notebooksResponse.ok) {
      return res.status(notebooksResponse.status).json({
        ok: false,
        step: "list_notebooks",
        body: notebooksBody,
      });
    }

    const notebook =
      (notebooksBody.notebooks || []).find((item) => item.is_default) ||
      (notebooksBody.notebooks || [])[0];

    if (!notebook?.notebook_id) {
      return res.status(404).json({ ok: false, error: "No notebook found" });
    }

    const webhookUrl = `https://${req.headers.host}/api/webhook`;
    const action = req.query?.action === "CREATE" ? "CREATE" : "UPDATE";
    const registration = {
      resource_type: "NOTEBOOK",
      filter_type: "ID",
      filter_value: notebook.notebook_id,
      action,
      url: webhookUrl,
    };

    const query = new URLSearchParams({
      JSONString: JSON.stringify(registration),
    });

    let response = await zohoRequest(
      `/notification/filtered/register?${query.toString()}`,
      { method: "GET" }
    );

    let text = await response.text();

    if (!response.ok && [400, 404, 405].includes(response.status)) {
      response = await zohoRequest(
        `/notification/filtered/register?${query.toString()}`,
        { method: "POST" }
      );
      text = await response.text();
    }

    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    return res.status(response.ok ? 200 : response.status).json({
      ok: response.ok,
      notebook: {
        notebook_id: notebook.notebook_id,
        name: notebook.name,
      },
      webhookUrl,
      registration,
      zohoStatus: response.status,
      body,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
