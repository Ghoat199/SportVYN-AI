// SportVYN V1.3: historical, chronological out-of-sample diagnostic.
// Each prediction uses only matches played before the target match.
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_configuration'});
 try{
  const q=new URLSearchParams({select:'id,league,home_team,away_team,starts_at,status,home_score,away_score',sport:'eq.football',status:'eq.finished',order:'starts_at.asc',limit:'3000'});
  const r=await fetch(base+'/rest/v1/sportvyn_matches?'+q,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('database_http_'+r.status);
  const rows=(await r.json()).filter(m=>m.league&&m.home_team&&m.away_team&&Number.isFinite(Date.parse(m.starts_at))&&Number.isInteger(m.home_score)&&Number.isInteger(m.away_score));
  const byLeague=new Map();for(const m of rows){if(!byLeague.has(m.league))byLeague.set(m.league,[]);byLeague.get(m.league).push(m)}
  const pois=(k,l)=>{let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p};
  const summaries=[];
  for(const [league,matches] of byLeague){
   let n=0,correct=0,brier=0,homePred=0,homeActual=0,homeProb=0;
   const buckets=Array.from({length:5},(_,i)=>({range:(i*20)+'-'+((i+1)*20)+'%',count:0,predicted:0,actual:0}));
   for(let idx=0;idx<matches.length;idx++){
    const target=matches[idx],prior=matches.slice(0,idx).filter(x=>Date.parse(x.starts_at)<Date.parse(target.starts_at));
    if(prior.length<20)continue;
    function rate(team,isHome){
     const recent=prior.filter(x=>x.home_team===team||x.away_team===team).slice(-10).reverse();
     const venue=recent.filter(x=>(isHome?x.home_team:x.away_team)===team);
     // Venue sample independently drawn from latest 8 venue matches, not only last 10 overall.
     const venue8=prior.filter(x=>(isHome?x.home_team:x.away_team)===team).slice(-8).reverse();
     const avg=arr=>{let sc=0,co=0,w=0;arr.forEach((x,i)=>{const weight=Math.pow(.92,i),home=x.home_team===team;sc+=weight*(home?x.home_score:x.away_score);co+=weight*(home?x.away_score:x.home_score);w+=weight});return {sc:sc/w,co:co/w}};
     return {n:recent.length,v:venue8.length,overall:recent.length?avg(recent):null,venue:venue8.length?avg(venue8):null};
    }
    const h=rate(target.home_team,true),a=rate(target.away_team,false);
    if(h.n<5||a.n<5||h.v<3||a.v<3)continue;
    const lh=prior.slice(-200).reduce((s,x)=>s+x.home_score,0)/Math.min(prior.length,200);
    const la=prior.slice(-200).reduce((s,x)=>s+x.away_score,0)/Math.min(prior.length,200);
    const blend=(v,o)=>.55*v+.45*o;
    const hl=Math.max(.2,Math.min(4.5,(blend(h.venue.sc,h.overall.sc)+blend(a.venue.co,a.overall.co)+lh)/3));
    const al=Math.max(.2,Math.min(4.5,(blend(a.venue.sc,a.overall.sc)+blend(h.venue.co,h.overall.co)+la)/3));
    let probs=[0,0,0],total=0;
    for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const p=pois(i,hl)*pois(j,al);total+=p;probs[i>j?0:i===j?1:2]+=p}
    probs=probs.map(p=>p/total);
    const actual=target.home_score>target.away_score?0:target.home_score===target.away_score?1:2;
    const winner=probs.indexOf(Math.max(...probs));
    n++;correct+=Number(winner===actual);homePred+=Number(winner===0);homeActual+=Number(actual===0);homeProb+=probs[0];
    brier+=probs.reduce((sum,p,i)=>sum+(p-Number(i===actual))**2,0);
    const bucket=buckets[Math.min(4,Math.floor(probs[0]*5))];bucket.count++;bucket.predicted+=probs[0];bucket.actual+=Number(actual===0);
   }
   if(n)summaries.push({league,sample:n,accuracy:+(correct/n).toFixed(4),brier_score:+(brier/n).toFixed(4),predicted_home_favorite_share:+(homePred/n).toFixed(4),actual_home_win_share:+(homeActual/n).toFixed(4),mean_predicted_home_win_probability:+(homeProb/n).toFixed(4),home_calibration:buckets.filter(b=>b.count).map(b=>({range:b.range,count:b.count,mean_predicted:+(b.predicted/b.count).toFixed(4),actual_home_win_rate:+(b.actual/b.count).toFixed(4)}))});
  }
  res.setHeader('Cache-Control','public, s-maxage=3600');
  return res.status(200).json({ok:true,model:'poisson_form_blend_v1_2',method:'walk_forward_no_future_results',note:'Diagnostic only; sample size and historical data coverage can bias results. Not a validated betting edge.',total_finished_rows:rows.length,leagues:summaries});
 }catch(e){return res.status(502).json({error:'backtest_failed',detail:String(e.message||e)})}
};