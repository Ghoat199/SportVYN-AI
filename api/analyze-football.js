// SportVYN AI: transparent, deterministic Bundesliga baseline model.
// GET /api/analyze-football (public preview, read-only; no tips are published).
module.exports = async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_supabase_configuration'});
 try{
  const response=await fetch(base+'/rest/v1/sportvyn_matches?select=id,league,home_team,away_team,starts_at,status,home_score,away_score&sport=eq.football&league=eq.Bundesliga&order=starts_at.asc&limit=400',{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('database_http_'+response.status);
  const all=await response.json(),now=Date.now();
  const upcoming=all.filter(m=>m.status==='scheduled'&&Date.parse(m.starts_at)>now).slice(0,15);
  const history=all.filter(m=>m.status==='finished'&&Number.isInteger(m.home_score)&&Number.isInteger(m.away_score));
  function rate(team,home,cutoff){
   const games=history.filter(m=>Date.parse(m.starts_at)<cutoff&&(home?m.home_team===team:m.away_team===team)).slice(-8);
   const scored=games.reduce((s,m)=>s+(home?m.home_score:m.away_score),0);
   const conceded=games.reduce((s,m)=>s+(home?m.away_score:m.home_score),0);
   return {n:games.length,scored,conceded};
  }
  const predictions=upcoming.map(m=>{
   const cutoff=Date.parse(m.starts_at),h=rate(m.home_team,true,cutoff),a=rate(m.away_team,false,cutoff);
   if(h.n<3||a.n<3)return {match_id:m.id,match:m.home_team+' – '+m.away_team,starts_at:m.starts_at,status:'insufficient_data',home_games:h.n,away_games:a.n};
   const homeLambda=Math.max(.2,Math.min(4.5,(h.scored/h.n+a.conceded/a.n)/2));
   const awayLambda=Math.max(.2,Math.min(4.5,(a.scored/a.n+h.conceded/h.n)/2));
   function pois(k,l){let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p}
   let home=0,draw=0,away=0,total=0;
   for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const p=pois(i,homeLambda)*pois(j,awayLambda);total+=p;if(i>j)home+=p;else if(i===j)draw+=p;else away+=p}
   return {match_id:m.id,match:m.home_team+' – '+m.away_team,starts_at:m.starts_at,status:'model_ready',home_games:h.n,away_games:a.n,expected_goals:{home:+homeLambda.toFixed(2),away:+awayLambda.toFixed(2)},probabilities:{home:+(home/total).toFixed(4),draw:+(draw/total).toFixed(4),away:+(away/total).toFixed(4)}};
  });
  return res.status(200).json({ok:true,model:'poisson_baseline_v1',disclaimer:'Experimental model, not calibrated; no odds or value assessment; no bets placed or tips published.',completed_matches:history.length,upcoming_analyzed:predictions.length,predictions});
 }catch(e){return res.status(502).json({error:'analysis_failed',detail:String(e.message||e)})}
};
