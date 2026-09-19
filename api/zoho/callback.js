import { zohoRedirectUri } from "../../lib/zoho.js";

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const code = req.query?.code;
  const error = req.query?.error;
  if (error) return res.status(400).send(`Zoho authorization error: ${esc(error)}`);
  if (!code) return res.status(400).send("Missing authorization code");

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send("Missing ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET");
  }

  const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || "accounts.zoho.com";
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: zohoRedirectUri(req),
    code,
  });

  const response = await fetch(`https://${accountsDomain}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const body = await response.json();

  if (!response.ok || !body.access_token) {
    return res.status(500).send(
      `<h1>Zoho token exchange failed</h1><pre>${esc(JSON.stringify(body, null, 2))}</pre>`
    );
  }

  if (!body.refresh_token) {
    return res.status(200).send(
      "<h1>Authorized, but Zoho did not return a refresh token.</h1>" +
      "<p>Revoke this app in Zoho and authorize again, or add prompt=consent/offline access.</p>"
    );
  }

  return res.status(200).send(`<!doctype html>
  <meta name="robots" content="noindex">
  <title>Zoho connected</title>
  <style>body{font-family:system-ui;max-width:760px;margin:60px auto;padding:0 18px;line-height:1.5}code,textarea{width:100%;box-sizing:border-box}textarea{height:130px}</style>
  <h1>Zoho authorization succeeded</h1>
  <p>Copy the refresh token below into Vercel as <code>ZOHO_REFRESH_TOKEN</code>. Do not send it in chat.</p>
  <textarea readonly onclick="this.select()">${esc(body.refresh_token)}</textarea>
  <p>After saving it in Vercel, redeploy the project.</p>`);
}
