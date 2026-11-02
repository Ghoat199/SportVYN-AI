# SPORTIQ AI replacement — migration checklist

Target: existing Vercel project currently connected to `Ghoat199/SportVYN-AI`.
Source: `Ghoat199/betvalue-ai` branch `feature/multisport-bridge`.
Development branch: `feature/sportiq-replacement`.

## Safety
- Preserve current `main`, production URL, Supabase data, and cron behavior until preview tests pass.
- Do not merge or redirect production before explicit review.
- The SPORTIQ name remains provisional pending trademark/domain checks.
- Never copy service-role keys or VIP/private records into client code.

## Technical migration
1. Inventory current SportVYN API handlers (11), front-end and Vercel Hobby function count (12 max).
2. Reuse or consolidate existing API handlers rather than blindly copying BetValue routes.
3. Integrate SPORTIQ historical performance read-only, including `sportiq_public_market_performance_v2()` in the correct Supabase environment.
4. Check `SUPABASE_URL` / `SUPABASE_ANON_KEY` and any cross-project server-only read credentials in Vercel Preview scope; never assume both repositories use the same database.
5. Migrate SPORTIQ UI, predictions and performance with explicit fallback when data is missing.
6. Validate preview endpoints, historical samples, market metrics and all existing imports/crons.
7. Only after preview verification, replace production front-end in an approved merge.

## Current state
- Migration branch created. No production change.
- User reports v2 SQL RPC returned rows in Supabase; target Vercel environment wiring has not yet been verified.
- Copying the entire BetValue API directory would risk exceeding Vercel Hobby limits and breaking existing SportVYN cron jobs.
