// Read-only provider discovery for additional competitions. Does not import or publish forecasts.
const candidates=[
 {league:'Serie A',codes:['it1','seriea','sa']},
 {league:'Ligue 1',codes:['fr1','ligue1','fl1']},
 {league:'DFB-Pokal',codes:['dfb']},
 {league:'Frauen-Bundesliga',codes:['ffb1']},
 {league:'Champions League',codes:['ucl']},
 {league:'Europa League',codes:['uel2026']},
 {league:'Conference League',codes:['uecl2026']}
];
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const secrets=[process.env.SPORTVYN_CRON_SECRET,process.env.CRON_SECRET].filter(Boolean);
 if(!secrets.length||!secrets.some(s=>req.headers.authorization==='Bearer '+s))return res.status(401).json({error:'unauthorized'});
 const now=new Date(),season=now.getUTCMonth()>=6?now.getUTCFullYear():now.getUTCFullYear()-1;
 const results=[];
 for(const league of candidates){
  const codes=[];
  for(const code of league.codes){
   try{
    const r=await fetch('https://api.openligadb.de/getmatchdata/'+encodeURIComponent(code)+'/'+season,{headers:{accept:'application/json'},signal:AbortSignal.timeout(7000)});
    if(!r.ok){codes.push({code,ok:false,http:r.status});continue}
    const data=await r.json();
    const valid=Array.isArray(data)?data.filter(m=>m.matchID&&m.team1?.teamName&&m.team2?.teamName&&m.matchDateTimeUTC):[];
    const upcoming=valid.filter(m=>Date.parse(m.matchDateTimeUTC)>Date.now());
    codes.push({code,ok:valid.length>0,season_matches:valid.length,upcoming:upcoming.length,first_upcoming:upcoming.length?upcoming[0].matchDateTimeUTC:null,example:valid[0]?valid[0].team1.teamName+' - '+valid[0].team2.teamName:null});
   }catch(e){codes.push({code,ok:false,error:String(e.message||e).slice(0,100)})}
  }
  results.push({league:league.league,codes});
 }
 res.setHeader('Cache-Control','no-store');
 return res.status(200).json({ok:true,season,mode:'read_only_source_probe',warning:'A nonempty feed is not proof of correct league identity or verified 90-minute results. Validate before enabling imports.',results});
};