# SportVYN AI

Öffentliche Multisport-Website mit Supabase-Lesezugriff und vorbereitetem Bundesliga-Import.

## Bundesliga-Import (OpenLigaDB)

Serverless Function: `/api/import-football`

In **Vercel → SportVYN AI → Settings → Environment Variables** setzen:

- `SUPABASE_URL` = `https://tdnqtztnkdxtwpdtevbx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = geheimer Service-Role-Key des zugehörigen Supabase-Projekts (nur serverseitig)
- `CRON_SECRET` = selbst erzeugter, langer zufälliger geheimer Wert

**Niemals** Service-Role-Key oder CRON_SECRET in `index.html`, GitHub oder Chat veröffentlichen.

Nach dem Speichern der Variablen in Vercel ein neues Deployment auslösen.

Der Import-Endpunkt akzeptiert nur GET mit `Authorization: Bearer <CRON_SECRET>`. Ein normaler Browseraufruf ohne Token liefert absichtlich 401. Der Endpunkt holt die laufende Bundesliga-Saison von OpenLigaDB und schreibt bis zu ca. 306 Spiele per Upsert in `sportvyn_matches`. Für einen automatischen täglichen Aufruf kann ein Vercel-Cron-Eintrag in `vercel.json` verwendet werden, sobald die Secrets konfiguriert sind.

Der Import erstellt **keine** Wett-Tipps, und die öffentliche Website zeigt nur veröffentlichte Analysen. OpenLigaDB liefert keine Buchmacherquoten.

## Deployment

GitHub-Push auf `main` löst bei korrekt verbundener Vercel-Git-Integration ein neues Deployment aus.
