// Public read-only fixture board for tomorrow. No fabricated coverage or forecasts.
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_configuration'});
 const date=String(req.query.date||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z')))return res.status(400).json({error:'invalid_date'});
 const start=new Date(date+'T00:00:00Z');start.setUTCHours(start.getUTCHours()-14);
 const end=new Date(date+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+2);
 try{
  const params=new URLSearchParams({select:'id,league,home_team,away_team,starts_at,status',sport:'eq.football',starts_at:'gte.'+start.toISOString(),order:'starts_at.asc',limit:'1000'});
  params.append('starts_at','lt.'+end.toISOString());
  // PostgREST repeated filters are AND-ed.
  const r=await fetch(base+'/rest/v1/sportvyn_matches?'+params.toString(),{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('database_http_'+r.status);
  const rows=await r.json();
  const berlinDate=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
  const games=rows.filter(m=>berlinDate(m.starts_at)===date).map(m=>({id:m.id,league:m.league,match:m.home_team+' – '+m.away_team,starts_at:m.starts_at,status:m.status}));
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,date,source:'imported_fixtures_only',coverage:'Only connected feeds; other continents and unverified cups not included',count:games.length,games});
 }catch(e){return res.status(502).json({error:'fixtures_unavailable',detail:String(e.message||e)})}
};