# Multisport bridge v1 — shared contract (development only)

## Architecture
SportVYN AI remains the sports-data and prediction producer. BetValue AI remains the odds comparison, simulated picks and evaluation consumer. Do not share database service-role credentials between websites or browsers.

## Proposed read-only payload
```json
{
  "schema_version": "1.0",
  "generated_at": "2026-11-01T07:00:00Z",
  "predictions": [
    {
      "source": "sportvyn",
      "source_analysis_id": "example-id",
      "sport": "football",
      "league": "Bundesliga",
      "provider_match_id": "example-match",
      "home_team": "Home",
      "away_team": "Away",
      "starts_at": "2026-11-01T14:30:00Z",
      "market": "1x2",
      "selection": "home",
      "model_probability": 0.55,
      "model_version": "example",
      "calculated_at": "2026-10-31T12:00:00Z",
      "published_at": "2026-10-31T12:05:00Z"
    }
  ]
}
```
The example is schema documentation, NOT a real match or recommendation.

## Validation rules
- Only published predictions; enforce Supabase row-level security or a dedicated safe public view.
- No user IDs, admin records, secrets, private VIP data or unpublished predictions.
- Reject absent/invalid sport, event ID, kickoff time, market, selection, timestamps or probabilities outside (0,1).
- Support football, basketball, tennis, hockey initially; expand only when data/model coverage is verified.
- Stable idempotency key = source + source_analysis_id; do not overwrite settled tips.
- Preserve calculated_at and original odds timestamp to prevent look-ahead bias.
- If feed is unavailable, show an explicit unavailable state; never fabricate odds or tips.
- Separate model probabilities from bookmaker odds and from verified results.
- Use backend-to-backend fetching with timeouts, bounded result counts and cache; never embed privileged keys in HTML.
- Do not enable production import until schema, public read policy and deploy environment have been reviewed.

## Next engineering steps
1. Inspect actual Supabase columns, RLS and existing Vercel API handlers in both repositories.
2. Implement SportVYN read-only endpoint with response validation and tests.
3. Implement BetValue ingestion preview (dry run) with source ID deduplication.
4. Verify football end-to-end in preview, then extend other sports.
5. Review before merging to main.
