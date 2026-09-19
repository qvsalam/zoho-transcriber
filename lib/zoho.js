const ACCOUNTS_DOMAIN = process.env.ZOHO_ACCOUNTS_DOMAIN || "accounts.zoho.com";
const BASE_API_URI = process.env.ZOHO_BASE_API_URI || "zoho.com";

export const ZOHO_SCOPES = [
  "Notebook.notebook.ALL",
  "ZohoPC.files.ALL",
  "Zohosearch.securesearch.READ",
  "ZohoContacts.userphoto.READ",
  "WorkDrive.files.ALL",
  "WorkDrive.team.ALL",
  "WorkDrive.files.sharing.ALL",
].join(",");

export function zohoRedirectUri(req) {
  return process.env.ZOHO_REDIRECT_URI ||
    `https://${req.headers.host}/api/zoho/callback`;
}

export async function getZohoAccessToken() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Zoho OAuth environment variables");
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch(`https://${ACCOUNTS_DOMAIN}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`Zoho token refresh failed: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

export async function zohoRequest(path, init = {}) {
  const accessToken = await getZohoAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Zoho-oauthtoken ${accessToken}`);

  return fetch(`https://notebook.${BASE_API_URI}/api/v1${path}`, {
    ...init,
    headers,
  });
}
