export default function handler(req, res) {
  console.log("CRON_PING", new Date().toISOString());
  return res.status(200).json({ ok: true });
}
