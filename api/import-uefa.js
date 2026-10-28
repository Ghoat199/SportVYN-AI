// Manual, authenticated UEFA fixture import. Not registered in vercel.json cron.
// Stores fixtures only; no scores are interpreted as 90-minute results.
// GET /api/import-uefa with Authorization: Bearer <SPORTVYN_CRON_SECRET or CRON_SECRET>
const competitions=require('../config/competitions');
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const secrets=[process.env.SPORTVYN_CRON_SECRET,process.env.CRON_SECRET].filter(Boolean);
 if(!secrets.length||!secrets.some(s=>req.headers.authorization==='Bearer '+s))return res.status(401).json({error:'unauthorized'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_supabase_configuration'});
 const now=new Date(),season=now.getUTCMonth()>=6?now.getUTCFullYear():now.getUTCFullYear()-1;
 const selected=competitions.filter(c=>c.country==='UEFA'&&c.provider==='openligadb'&&c.status==='feed_verified');
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};
 const endpoint=base+'/rest/v1/sportvyn_matches?on_conflict=provider,provider_match_id';
 const results=[];
 for(const league of selected){
  try{
   const source='https://api.openligadb.de/getmatchdata/'+encodeURIComponent(league.providerCode)+'/'+season;
   const response=await fetch(source,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('source_http_'+response.status);
   const matches=await response.json();
   if(!Array.isArray(matches)||matches.length===0)throw Error('empty_or_invalid_feed');
   const rows=matches.filter(m=>m.matchID&&m.team1?.teamName&&m.team2?.teamName&&m.matchDateTimeUTC&&!Number.isNaN(Date.parse(m.matchDateTimeUTC))).map(m=>({
    provider:'openligadb',provider_match_id:String(m.matchID),sport:'football',league:league.name,
    home_team:m.team1.teamName,away_team:m.team2.teamName,starts_at:new Date(m.matchDateTimeUTC).toISOString(),
    // Never mark these as finished without verified 90-minute scores.
    status:'scheduled',home_score:null,away_score:null
   }));
   if(!rows.length)throw Error('no_valid_fixtures');
   let imported=0;
   for(let i=0;i<rows.length;i+=50){
    const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(rows.slice(i,i+50)),signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error('database_http_'+r.status+': '+(await r.text()).slice(0,180));
    imported+=Math.min(50,rows.length-i);
   }
   results.push({competition:league.name,ok:true,imported});
  }catch(e){console.error('UEFA import '+league.id,e);results.push({competition:league.name,ok:false,error:String(e.message||e)});}
 }
 res.setHeader('Cache-Control','no-store');
 return res.status(results.every(x=>x.ok)?200:207).json({ok:results.every(x=>x.ok),season,mode:'manual_fixtures_only',results});
};
