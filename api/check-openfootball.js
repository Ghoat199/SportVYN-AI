// Read-only diagnostic for potential OpenFootball Serie A / Ligue 1 feeds.
// No database writes, no production cron changes, no secrets needed.
// GET /api/check-openfootball
module.exports = async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  const season='2026-27';
  const sources=[{league:'Serie A',code:'it.1'},{league:'Ligue 1',code:'fr.1'}];
  const checks=await Promise.all(sources.map(async source=>{
    const url='https://raw.githubusercontent.com/openfootball/football.json/master/'+season+'/'+source.code+'.json';
    try{
      const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)return {league:source.league,season,available:false,http_status:response.status};
      const data=await response.json();
      if(!Array.isArray(data.matches))return {league:source.league,season,available:false,error:'invalid_format'};
      const matches=data.matches;
      const valid=matches.filter(m=>m.date&&m.team1&&m.team2);
      const completed=valid.filter(m=>Array.isArray(m.score?.ft)&&m.score.ft.length===2&&m.score.ft.every(Number.isInteger));
      const dates=valid.map(m=>m.date).sort();
      const lastResult=completed.map(m=>m.date).sort().at(-1)||null;
      return {league:source.league,season,available:true,total_matches:matches.length,valid_matches:valid.length,completed_matches:completed.length,first_match:dates[0]||null,last_match:dates.at(-1)||null,last_result:lastResult,has_upcoming:valid.some(m=>Date.parse(m.date+'T23:59:59Z')>Date.now())};
    }catch(err){return {league:source.league,season,available:false,error:String(err.message||err)};}
  }));
  res.setHeader('Cache-Control','public, s-maxage=1800');
  return res.status(200).json({ok:true,source:'openfootball/football.json',note:'Diagnostic only. Match date and result coverage must be verified before importing or predicting.',checks});
};
