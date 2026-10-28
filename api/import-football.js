// Vercel Serverless Function: import Bundesliga matches from OpenLigaDB.
// Required Vercel secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
// Never expose the service-role key in client-side code.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'method_not_allowed'});
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== 'Bearer ' + secret)
    return res.status(401).json({error:'unauthorized'});
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return res.status(503).json({error:'missing_supabase_configuration'});
  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const season = now.getUTCMonth() >= 6 ? year : year - 1;
    const source = 'https://api.openligadb.de/getmatchdata/bl1/' + season;
    const sourceResp = await fetch(source, {headers:{accept:'application/json'}, signal:AbortSignal.timeout(15000)});
    if (!sourceResp.ok) throw new Error('OpenLigaDB HTTP ' + sourceResp.status);
    const matches = await sourceResp.json();
    if (!Array.isArray(matches)) throw new Error('Invalid match feed');
    const rows = matches.filter(m=>m.matchID && m.team1?.teamName && m.team2?.teamName && m.matchDateTimeUTC)
      .map(m=>{
        const final = Boolean(m.matchIsFinished);
        const scores = Array.isArray(m.matchResults) ? m.matchResults : [];
        const end = scores.find(x=>x.resultTypeID===2) || scores.find(x=>x.resultName==='Endergebnis') || scores[scores.length-1];
        return {
          provider:'openligadb',
          provider_match_id:String(m.matchID),
          sport:'football',
          league:'Bundesliga',
          home_team:m.team1.teamName,
          away_team:m.team2.teamName,
          starts_at:new Date(m.matchDateTimeUTC).toISOString(),
          status:final?'finished':'scheduled',
          home_score:final && end && Number.isInteger(end.pointsTeam1)?end.pointsTeam1:null,
          away_score:final && end && Number.isInteger(end.pointsTeam2)?end.pointsTeam2:null
        };
      });
    const endpoint=base+'/rest/v1/sportvyn_matches?on_conflict=provider,provider_match_id';
    const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};
    let count=0;
    for(let i=0;i<rows.length;i+=50){
      const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(rows.slice(i,i+50)),signal:AbortSignal.timeout(15000)});
      if(!r.ok) throw new Error('Supabase HTTP '+r.status+': '+(await r.text()).slice(0,300));
      count+=Math.min(50,rows.length-i);
    }
    return res.status(200).json({ok:true,provider:'openligadb',league:'bl1',season,imported:count});
  } catch(e) {
    console.error('SportVYN import failed:',e);
    return res.status(502).json({error:'import_failed',detail:String(e.message||e)});
  }
};
