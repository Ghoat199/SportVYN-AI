# Preview deployment verification

This change triggers a preview build on Vercel if the repository's Vercel Git integration is configured for branch previews.

Check `/api/published-predictions` on the resulting preview URL. This endpoint requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Preview environment variables. A preview build does not enable BetValue integration or modify production.
