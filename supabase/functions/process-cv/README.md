# `process-cv` Edge Function

Parses uploaded CVs (PDF/DOCX) and fills `public.candidates` using an LLM.

## LLM routing (pick one)

### Preferred: Vercel AI Gateway (no xAI API key)

Uses [AI Gateway](https://vercel.com/docs/ai-gateway/getting-started) OpenAI-compatible chat completions. Billing uses your team's **AI Gateway credits**.

Set Supabase secrets:

```bash
npx supabase secrets set AI_GATEWAY_API_KEY=your_key_from_vercel_dashboard
```

Optional — override the gateway model id (must match [AI Gateway models](https://vercel.com/ai-gateway/models)):

```bash
npx supabase secrets set AI_GATEWAY_MODEL=xai/grok-4-fast-reasoning
```

If `AI_GATEWAY_MODEL` is **not** set, the function uses the built-in default `xai/grok-4-fast-reasoning` (see `DEFAULT_AI_GATEWAY_MODEL` in `index.ts`). Change that constant or set the secret to switch models without redeploying.

### Fallback: direct xAI API

If `AI_GATEWAY_API_KEY` is **not** set, the function uses xAI directly:

```bash
npx supabase secrets set XAI_API_KEY=your_xai_key
npx supabase secrets set XAI_MODEL=grok-2-1212   # optional
```

When using **only** the gateway, you can remove `XAI_API_KEY` from Supabase secrets to avoid accidental direct billing.

## Deploy

```bash
npx supabase functions deploy process-cv --no-verify-jwt --project-ref <ref>
```

`--no-verify-jwt` is required because the project uses new-format API keys (asymmetric RS256 JWTs). The built-in gateway `verify_jwt` check uses the old symmetric HMAC secret and rejects valid user tokens. The function does its own JWT validation inside `requireAdmin()` via `supabase.auth.getUser()`.

## Verification checklist

1. Upload a CV via **Admin → Add Candidate** and confirm `candidates.parsing_status` becomes `completed`.
2. In Supabase **Edge Functions → Logs**, confirm requests succeed (no 4xx/5xx from `ai-gateway.vercel.sh` when using Gateway).
3. In Vercel **AI Gateway** dashboard, confirm credit usage when using Gateway mode.

## Troubleshooting

- **`401 Invalid JWT` from Edge (no function logs):** The project uses new asymmetric JWT signing keys (`sb_publishable_*`). The gateway's built-in `verify_jwt` uses the old HMAC secret and rejects every token before your handler runs. Fix: deploy with `--no-verify-jwt` (see Deploy section). The function's own `requireAdmin()` handles auth securely.
- **`502` from `/api/admin/candidates/.../process` with empty Edge logs:** Often the request never reaches your Deno code — e.g. JWT verification at the gateway returned 401. The Next route logs `[process-cv invoke]` in dev and returns the upstream body in JSON `error`.
- **401 from `/api/.../process` (Next):** The browser client sends `Authorization: Bearer` from `getSession().access_token`. If you still see 401, sign out/in and confirm the modal's fetches include that header.
