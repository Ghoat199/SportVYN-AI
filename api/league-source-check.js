// Public, read-only discovery of candidate league feeds; never imports or exposes secrets.
const candidates=[
 {league:'Serie A',codes:['it1','seriea','sa']},
 {league:'Ligue 1',codes:['fr1','ligue1','fl1']}
];
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const now=new Date(),season=now.getUTCMonth()>=6?now.getUTCFullYear():now.getUTCFullYear()-1;
 const tasks=candidates.flatMap(group=>group.codes.map(code=>({league:group.league,code})));
 const results=await Promise.all(tasks.map(async ({league,code})=>{
  try{
   const r=await fetch('https://api.openligadb.de/getmatchdata/'+encodeURIComponent(code)+'/'+season,{headers:{accept:'application/json'},signal:AbortSignal.timeout(6500)});
   if(!r.ok)return {league,code,available:false,http:r.status};
   const raw=await r.json();
   const valid=Array.isArray(raw)?raw.filter(m=>m.matchID&&m.team1?.teamName&&m.team2?.teamName&&m.matchDateTimeUTC&&Number.isFinite(Date.parse(m.matchDateTimeUTC))):[];
   const upcoming=valid.filter(m=>Date.parse(m.matchDateTimeUTC)>Date.now());
   return {league,code,available:valid.length>0,season_matches:valid.length,upcoming:upcoming.length,example:valid[0]?valid[0].team1.teamName+' – '+valid[0].team2.teamName:null};
  }catch(e){return {league,code,available:false,error:'source_unavailable'}}
 }));
 res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=1800');
 return res.status(200).json({ok:true,season,mode:'read_only',warning:'Availability alone does not validate league identity or 90-minute score semantics. No import enabled.',results});
};