// Read-only OpenLigaDB feed health check for UEFA competitions.
// No database writes and no changes to scheduled imports.
// GET /api/check-uefa
const competitions = require('../config/competitions');
module.exports = async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  const year=new Date().getUTCFullYear();
  const season=new Date().getUTCMonth()>=6?year:year-1;
  const selected=competitions.filter(c=>c.country==='UEFA'&&c.provider==='openligadb');
  const checks=await Promise.all(selected.map(async c=>{
    const url='https://api.openligadb.de/getmatchdata/'+encodeURIComponent(c.providerCode)+'/'+season;
    try{
      const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)return {competition:c.name,code:c.providerCode,available:false,http_status:response.status};
      const matches=await response.json();
      if(!Array.isArray(matches))return {competition:c.name,code:c.providerCode,available:false,error:'invalid_feed'};
      const valid=matches.filter(m=>m.matchID&&m.team1?.teamName&&m.team2?.teamName&&m.matchDateTimeUTC);
      const completed=valid.filter(m=>m.matchIsFinished);
      const dated=valid.map(m=>m.matchDateTimeUTC).sort();
      const completedDates=completed.map(m=>m.matchDateTimeUTC).sort();
      const upcoming=valid.filter(m=>!m.matchIsFinished&&Date.parse(m.matchDateTimeUTC)>Date.now());
      return {competition:c.name,code:c.providerCode,available:true,total_matches:matches.length,valid_matches:valid.length,completed_matches:completed.length,upcoming_matches:upcoming.length,first_match:dated[0]||null,last_match:dated.at(-1)||null,last_completed_match:completedDates.at(-1)||null,warning:'Knockout results may include extra time/penalties; 90-minute score not validated'};
    }catch(e){return {competition:c.name,code:c.providerCode,available:false,error:String(e.message||e)};}
  }));
  res.setHeader('Cache-Control','public, s-maxage=900');
  return res.status(200).json({ok:true,season,source:'OpenLigaDB',diagnostic_only:true,checks});
};
