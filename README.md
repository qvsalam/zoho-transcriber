# Zoho Transcriber

Automation service for:

Zoho Notebook audio card → instant webhook → Gemini transcription → transcript back to the same Zoho note.

## Current stage

The first deployment contains a webhook logger at `/api/webhook`.
It is used to inspect Zoho Notebook's instant notification payload before enabling audio download and note updates.

No API keys, OAuth tokens, client secrets, or personal notebook IDs belong in this repository.

Deployment is managed by Vercel from the main branch.

Environment variables configured for production deployment.

Zoho refresh token configured in Vercel production.

One-minute cron fallback test enabled.
