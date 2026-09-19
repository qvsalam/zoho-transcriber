import { ZOHO_SCOPES, zohoRedirectUri } from "../../lib/zoho.js";

export default async function handler(req, res) {
  const clientId = process.env.ZOHO_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({
      ok: false,
      error: "ZOHO_CLIENT_ID is not configured in Vercel yet",
    });
  }

  const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || "accounts.zoho.com";
  const redirectUri = zohoRedirectUri(req);

  const params = new URLSearchParams({
    scope: ZOHO_SCOPES,
    client_id: clientId,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    redirect_uri: redirectUri,
  });

  return res.redirect(302, `https://${accountsDomain}/oauth/v2/auth?${params}`);
}
