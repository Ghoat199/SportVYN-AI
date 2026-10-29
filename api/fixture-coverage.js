// Public fixture coverage summary, read-only. No keys or secrets in response.
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_configuration'});
 try{
  const now=new Date(),until=new Date(now.getTime()+7*86400000);
  const q=new URLSearchParams({select:'league,starts_at,status',sport:'eq.football',order:'starts_at.asc',limit:'3000'});
  q.append('starts_at','gte.'+now.toISOString());q.append('starts_at','lt.'+until.toISOString());
  const r=await fetch(base+'/rest/v1/sportvyn_matches?'+q,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('database_http_'+r.status);
  const rows=await r.json(),counts={};
  for(const m of rows){if(m.status!=='scheduled')continue;counts[m.league]=(counts[m.league]||0)+1}
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,period:'next_7_days',total:Object.values(counts).reduce((a,b)=>a+b,0),by_league:Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([league,games])=>({league,games})),note:'Counts only already imported upcoming fixtures. Does not indicate whether an unlisted league has no games or failed import.'});
 }catch(e){return res.status(502).json({error:'coverage_unavailable'})}
};