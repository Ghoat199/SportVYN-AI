// Read-only published SportVYN predictions. Never uses service-role credentials.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return res.status(503).json({ error: 'public_feed_not_configured' });
  const headers = { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' };
  async function read(path) {
    const r = await fetch(base + '/rest/v1/' + path, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw Error('public_read_failed_' + r.status);
    const data = await r.json();
    if (!Array.isArray(data)) throw Error('unexpected_response');
    return data;
  }
  try {
    const tips = await read('sportvyn_tips?select=id,analysis_id,published_at&is_public=eq.true&order=published_at.desc&limit=100');
    const ids = [...new Set(tips.map(t => t.analysis_id).filter(v => /^[a-zA-Z0-9-]+$/.test(String(v))))];
    if (!ids.length) return res.status(200).json({ schema_version: '1.0', generated_at: new Date().toISOString(), predictions: [] });
    const analyses = await read('sportvyn_analyses?select=id,match_id,market,selection,model_probability,bookmaker_odds&id=in.(' + ids.join(',') + ')');
    const matchIds = [...new Set(analyses.map(a => a.match_id).filter(v => /^[a-zA-Z0-9-]+$/.test(String(v))))];
    if (!matchIds.length) return res.status(200).json({ schema_version: '1.0', generated_at: new Date().toISOString(), predictions: [] });
    const matches = await read('sportvyn_matches?select=id,provider_match_id,sport,league,home_team,away_team,starts_at&id=in.(' + matchIds.join(',') + ')');
    const matchById = new Map(matches.map(m => [String(m.id), m]));
    const analysisById = new Map(analyses.map(a => [String(a.id), a]));
    const predictions = tips.flatMap(t => {
      const a = analysisById.get(String(t.analysis_id));
      const m = a && matchById.get(String(a.match_id));
      const p = Number(a?.model_probability);
      if (!m || !['football','basketball','tennis','hockey'].includes(m.sport) ||
          !Number.isFinite(p) || p <= 0 || p >= 1 ||
          !m.starts_at || !Number.isFinite(Date.parse(m.starts_at)) ||
          !a.market || !a.selection || !t.published_at) return [];
      return [{
        source: 'sportvyn', source_analysis_id: String(a.id),
        sport: m.sport, league: m.league, provider_match_id: m.provider_match_id,
        home_team: m.home_team, away_team: m.away_team, starts_at: m.starts_at,
        market: a.market, selection: a.selection, model_probability: p,
        published_at: t.published_at
      }];
    });
    return res.status(200).json({ schema_version: '1.0', generated_at: new Date().toISOString(), predictions });
  } catch (e) {
    console.error('Published feed unavailable:', e.message);
    return res.status(502).json({ error: 'public_feed_unavailable' });
  }
};
