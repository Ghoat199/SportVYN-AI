async function backtestHandler(req,res){
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
   let n=0,correct=0,brier=0,baselineCorrect=0,baselineBrier=0,homePred=0,homeActual=0,homeProb=0;
   let holdoutN=0,holdoutCorrect=0,holdoutBrier=0,holdoutBaselineBrier=0;
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
    const baselineCounts=[0,0,0];for(const x of prior){baselineCounts[x.home_score>x.away_score?0:x.home_score===x.away_score?1:2]++}const baseline=baselineCounts.map(x=>x/prior.length);const baselineWinner=baseline.indexOf(Math.max(...baseline));baselineCorrect+=Number(baselineWinner===actual);baselineBrier+=baseline.reduce((sum,p,i)=>sum+(p-Number(i===actual))**2,0);
    n++;correct+=Number(winner===actual);homePred+=Number(winner===0);homeActual+=Number(actual===0);homeProb+=probs[0];
    brier+=probs.reduce((sum,p,i)=>sum+(p-Number(i===actual))**2,0);
    // Strictly chronological final 30% holdout; no model selection is performed here.
    if(idx>=Math.floor(matches.length*.7)){
     holdoutN++;holdoutCorrect+=Number(winner===actual);
     holdoutBrier+=probs.reduce((sum,p,i)=>sum+(p-Number(i===actual))**2,0);
     holdoutBaselineBrier+=baseline.reduce((sum,p,i)=>sum+(p-Number(i===actual))**2,0);
    }
    const bucket=buckets[Math.min(4,Math.floor(probs[0]*5))];bucket.count++;bucket.predicted+=probs[0];bucket.actual+=Number(actual===0);
   }
   if(n)summaries.push({league,sample:n,holdout:{sample:holdoutN,accuracy:holdoutN?+(holdoutCorrect/holdoutN).toFixed(4):null,brier_score:holdoutN?+(holdoutBrier/holdoutN).toFixed(4):null,baseline_brier_score:holdoutN?+(holdoutBaselineBrier/holdoutN).toFixed(4):null},accuracy:+(correct/n).toFixed(4),brier_score:+(brier/n).toFixed(4),baseline_accuracy:+(baselineCorrect/n).toFixed(4),baseline_brier_score:+(baselineBrier/n).toFixed(4),brier_improvement_vs_baseline:+((baselineBrier-brier)/n).toFixed(4),predicted_home_favorite_share:+(homePred/n).toFixed(4),actual_home_win_share:+(homeActual/n).toFixed(4),mean_predicted_home_win_probability:+(homeProb/n).toFixed(4),home_calibration:buckets.filter(b=>b.count).map(b=>({range:b.range,count:b.count,mean_predicted:+(b.predicted/b.count).toFixed(4),actual_home_win_rate:+(b.actual/b.count).toFixed(4)}))});
  }
  res.setHeader('Cache-Control','public, s-maxage=3600');
  return res.status(200).json({ok:true,model:'poisson_form_blend_v1_5_holdout_diagnostics',method:'walk_forward_no_future_results',note:'Diagnostic only; baseline uses historical league outcome frequencies available before each match. Lower Brier score is better. No demonstrated betting edge.',total_finished_rows:rows.length,leagues:summaries});
 }catch(e){return res.status(502).json({error:'backtest_failed',detail:String(e.message||e)})}
};
// SportVYN AI: transparent, deterministic league-separated multi-league baseline model.
// GET /api/analyze-football (public preview, read-only; no tips are published).
module.exports = async function handler(req,res){
 if(req.query?.mode==='backtest')return backtestHandler(req,res);
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_supabase_configuration'});
 try{
  const response=await fetch(base+'/rest/v1/sportvyn_matches?select=id,provider,league,home_team,away_team,starts_at,status,home_score,away_score&sport=eq.football&league=in.(Bundesliga,2.%20Bundesliga,Premier%20League,La%20Liga)&order=starts_at.asc&limit=1500',{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('database_http_'+response.status);
  const all=await response.json(),now=Date.now();
  const upcoming=all.filter(m=>m.status==='scheduled'&&Date.parse(m.starts_at)>now).slice(0,100);
  // Only trusted live fixture feeds; reject conflicting same-day league schedules.
  const counts=new Map();
  for(const m of upcoming){if(m.provider!=='openligadb'||!m.league||!m.home_team||!m.away_team||m.home_team.trim().toLowerCase()===m.away_team.trim().toLowerCase())continue;
   const day=new Date(m.starts_at).toISOString().slice(0,10);
   for(const team of [m.home_team,m.away_team]){const k=m.league+'|'+day+'|'+team.trim().toLowerCase();counts.set(k,(counts.get(k)||0)+1)}
  }
  const validUpcoming=upcoming.filter(m=>m.provider==='openligadb'&&m.league&&m.home_team&&m.away_team&&m.home_team.trim().toLowerCase()!==m.away_team.trim().toLowerCase()&&[m.home_team,m.away_team].every(team=>(counts.get(m.league+'|'+new Date(m.starts_at).toISOString().slice(0,10)+'|'+team.trim().toLowerCase())||0)===1));
  const history=all.filter(m=>m.status==='finished'&&Number.isInteger(m.home_score)&&Number.isInteger(m.away_score));
  // V1.2: use recent overall form alongside venue-specific form; shrink small samples.
  function rate(team,home,cutoff,league){
   const matches=history.filter(m=>m.league===league&&Date.parse(m.starts_at)<cutoff&&(m.home_team===team||m.away_team===team)).sort((x,y)=>Date.parse(y.starts_at)-Date.parse(x.starts_at));
   const overall=matches.slice(0,10);
   const venue=matches.filter(m=>(home?m.home_team:m.away_team)===team).slice(0,8);
   function avg(items){
    if(!items.length)return {n:0,scored:0,conceded:0};
    let scored=0,conceded=0,weights=0;
    items.forEach((m,i)=>{const w=Math.pow(.92,i),isHome=m.home_team===team;scored+=w*(isHome?m.home_score:m.away_score);conceded+=w*(isHome?m.away_score:m.home_score);weights+=w});
    return {n:items.length,scored:scored/weights,conceded:conceded/weights};
   }
   return {overall:avg(overall),venue:avg(venue)};
  }
  const predictions=validUpcoming.map(m=>{
   const cutoff=Date.parse(m.starts_at),h=rate(m.home_team,true,cutoff,m.league),a=rate(m.away_team,false,cutoff,m.league);
   const baseInfo={match_id:m.id,league:m.league,match:m.home_team+' – '+m.away_team,starts_at:m.starts_at,home_games:h.venue.n,away_games:a.venue.n,home_recent_games:h.overall.n,away_recent_games:a.overall.n};
   if(h.overall.n<5||a.overall.n<5||h.venue.n<3||a.venue.n<3)return {...baseInfo,status:'insufficient_data'};
   const prior=history.filter(x=>x.league===m.league&&Date.parse(x.starts_at)<cutoff).slice(-200);
   if(prior.length<20)return {...baseInfo,status:'insufficient_data'};
   const leagueHome=prior.reduce((sum,x)=>sum+x.home_score,0)/prior.length;
   const leagueAway=prior.reduce((sum,x)=>sum+x.away_score,0)/prior.length;
   const blend=(x,y)=>.55*x+.45*y;
   const homeAttack=blend(h.venue.scored,h.overall.scored),homeDefense=blend(h.venue.conceded,h.overall.conceded);
   const awayAttack=blend(a.venue.scored,a.overall.scored),awayDefense=blend(a.venue.conceded,a.overall.conceded);
   // League priors prevent a handful of extreme scorelines from dominating.
   const homeLambda=Math.max(.2,Math.min(4.5,(homeAttack+awayDefense+leagueHome)/3));
   const awayLambda=Math.max(.2,Math.min(4.5,(awayAttack+homeDefense+leagueAway)/3));
   const confidence=h.overall.n>=10&&a.overall.n>=10&&h.venue.n>=6&&a.venue.n>=6?'moderate':'low';
   function pois(k,l){let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p}
   let home=0,draw=0,away=0,total=0,over25=0,btts=0;
   for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const p=pois(i,homeLambda)*pois(j,awayLambda);total+=p;if(i+j>=3)over25+=p;if(i>0&&j>0)btts+=p;if(i>j)home+=p;else if(i===j)draw+=p;else away+=p}
   const ranked=[{selection:'1',probability:home/total},{selection:'X',probability:draw/total},{selection:'2',probability:away/total}].sort((a,b)=>b.probability-a.probability);
   return {...baseInfo,status:'model_ready',confidence,model_favorite:ranked[0].selection,model_favorite_probability:+ranked[0].probability.toFixed(4),fair_odds:{home:+(total/home).toFixed(2),draw:+(total/draw).toFixed(2),away:+(total/away).toFixed(2)},expected_goals:{home:+homeLambda.toFixed(2),away:+awayLambda.toFixed(2)},goal_markets:{over_2_5:+(over25/total).toFixed(4),under_2_5:+(1-over25/total).toFixed(4),both_teams_score_yes:+(btts/total).toFixed(4),both_teams_score_no:+(1-btts/total).toFixed(4)},probabilities:{home:+(home/total).toFixed(4),draw:+(draw/total).toFixed(4),away:+(away/total).toFixed(4)}};
  });
  return res.status(200).json({ok:true,model:'poisson_form_blend_v1_2',disclaimer:'Experimental model, not calibrated; fair odds are model-derived, not bookmaker odds; no value assessment; no bets placed or tips published.',completed_matches:history.length,upcoming_analyzed:predictions.length,fixtures_excluded:upcoming.length-validUpcoming.length,fixture_validation:'provider_and_same_day_conflicts_only',predictions});
 }catch(e){return res.status(502).json({error:'analysis_failed',detail:String(e.message||e)})}
};
