# SportVYN AI – data-source checklist (2026/27)

Current OpenLigaDB feeds: bl1, bl2, dfb, pl, la1, ucl, uel2026, uecl2026.
Serie A and Ligue 1 are not listed in OpenLigaDB's 2026 season overview (checked 2026-10-28). Do not guess codes or mark these feeds active.

Before activating any new competition:
1. Verify season feed is nonempty, kickoff timestamps and team names are valid.
2. Verify finished matches carry the appropriate **after 90 minutes** score. Cup matches may include extra time and penalties; never interpret a final after extra time as a 90-minute result.
3. Ensure the training history is from the same league and season, with at least three relevant home/away matches per team.
4. Validate match ID uniqueness, scheduled/finished status, and team name consistency.
5. Check Vercel cron execution and Supabase imported row counts before enabling predictions.
6. Confirm provider license/attribution and update frequency.

Possible second provider for Serie A/Ligue 1: football-data.org; verify current free-plan competition coverage, token requirements, and limits before integration. No credentials should be committed to GitHub.

Production importer and daily model cron remain unchanged until the initial scheduled run is verified.

## Alternative sources for Serie A and Ligue 1 (research 2026-10-28)

- openfootball/football.json: public-domain JSON, lists Serie A and Ligue 1. Latest-season updates depend on upstream maintenance; validate 2026/27 coverage and actual last result date before use. https://github.com/openfootball/football.json
- TheSportsDB free v1: key 123, but eventsseason free limit is 15 events, inadequate for complete season history; do not use as sole historical feed. https://www.thesportsdb.com/docs/api
- open-matchday: third-party daily CSV dataset claims Serie A and Ligue 1; verify source, licensing, timestamp, reliability and 90-minute score semantics before use. https://github.com/oladeeayo/open-matchday

Do not consume BetValue AI's already saturated football-data.org free-tier quota. Do not activate unvalidated sources in the production cron.

## 2026-10-28 licensing correction (important)

Football-data.co.uk explicitly limits free CSV use to private/personal or academic purposes and says commercial or AI/model-training use is NOT permitted without a subscription/permission. This restriction cannot safely be bypassed by using a GitHub/DataHub mirror that declares a public-domain license. Do NOT integrate football-data.co.uk or mirrors derived from it into SportVYN AI's public/commercial model pipeline without appropriate rights. Source: https://www.football-data.co.uk/contact.php

The current OpenFootball 2026/27 Serie A and Ligue 1 diagnostic returned last completed result on 2026-09-20 for both competitions as of 2026-10-28; insufficient freshness for predictions. Keep them inactive. Seek independently licensed fresh scores/fixtures and verify commercial and model-training rights before importing.
