# SportVYN V1.7 — historical import preparation

This is a **dry-run only** script. It does not write to Supabase or deploy another Vercel function.

Source: OpenLigaDB public API (Bundesliga bl1, 2. Bundesliga bl2, 3. Liga bl3).
Run locally: `node scripts/preview-history-import.mjs 2024 2025`

The preview lists finished games and potential duplicates using a stable source match ID. Before enabling writes, verify the database schema, existing provider IDs, team aliases, season coverage, and conflict handling. Never overwrite scheduled fixtures or scores without independent validation.
