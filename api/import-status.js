// Public, read-only database health check. Does not execute imports or reveal secrets.
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 res.setHeader('Cache-Control','no-store');
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({ok:false,error:'database_not_configured'});
 try{
  const now=new Date(),until=new Date(now.getTime()+7*86400000);
  const params=new URLSearchParams({select:'league,starts_at',sport:'eq.football',status:'eq.scheduled',order:'starts_at.asc',limit:'1000'});
  params.append('starts_at','gte.'+now.toISOString());
  params.append('starts_at','lt.'+until.toISOString());
  const response=await fetch(base+'/rest/v1/sportvyn_matches?'+params,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('database_http_'+response.status);
  const rows=await response.json();
  const leagues={};for(const row of rows){const name=String(row.league||'Unknown');leagues[name]=(leagues[name]||0)+1}
  return res.status(200).json({ok:true,checked_at:now.toISOString(),window_days:7,upcoming_fixture_count:rows.length,by_league:leagues,earliest_kickoff:rows[0]?.starts_at||null,note:'Database snapshot only. Does not prove the cron ran or independently verify fixtures.'});
 }catch(e){return res.status(502).json({ok:false,error:'database_check_failed'})}
};