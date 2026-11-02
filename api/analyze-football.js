async function backtestHandler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 try{
  // Use the same public historical feed as the live preview; never use future results.
  const season=new Date().getUTCMonth()>=6?new Date().getUTCFullYear():new Date().getUTCFullYear()-1;
  const codes=[['bl1','Bundesliga'],['bl2','2. Bundesliga'],['bl3','3. Liga']];
  const feeds=await Promise.all(codes.flatMap(([code,league])=>[season-1,season].map(async year=>{
   try{
    const response=await fetch('https://api.openligadb.de/getmatchdata/'+code+'/'+year,{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const raw=await response.json();if(!Array.isArray(raw))throw Error('invalid_response');
    return {league,year,ok:true,rows:raw.filter(m=>m.matchIsFinished&&m.team1?.teamName&&m.team2?.teamName&&m.matchDateTimeUTC).map(m=>{
     const score=(m.matchResults||[]).find(x=>x.resultTypeID===2||x.resultTypeKind==='After90Minutes');
     if(!score||!Number.isInteger(score.pointsTeam1)||!Number.isInteger(score.pointsTeam2))return null;
     return {id:m.matchID,league,home_team:m.team1.teamName,away_team:m.team2.teamName,starts_at:Date.parse(m.matchDateTimeUTC),home_score:score.pointsTeam1,away_score:score.pointsTeam2};
    }).filter(Boolean)};
   }catch(e){return {league,year,ok:false,rows:[],error:String(e.message||e)}}
  })));
  const pois=(k,l)=>{let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p};
  const results=[];
  for(const league of codes.map(x=>x[1])){
   const matches=feeds.filter(x=>x.league===league).flatMap(x=>x.rows).sort((a,b)=>a.starts_at-b.starts_at);
   const eligible=[];
   for(const target of matches){
    const prior=matches.filter(x=>x.starts_at<target.starts_at);
    if(prior.length<20)continue;
    function rate(team,home){
     const played=prior.filter(m=>m.home_team===team||m.away_team===team).sort((a,b)=>b.starts_at-a.starts_at);
     const overall=played.slice(0,10),venue=played.filter(m=>(home?m.home_team:m.away_team)===team).slice(0,8);
     function avg(items){let scored=0,conceded=0,weights=0;items.forEach((m,i)=>{const w=Math.pow(.92,i),isHome=m.home_team===team;scored+=w*(isHome?m.home_score:m.away_score);conceded+=w*(isHome?m.away_score:m.home_score);weights+=w});return {n:items.length,scored:scored/weights,conceded:conceded/weights}}
     return {overall:avg(overall),venue:avg(venue)};
    }
    const h=rate(target.home_team,true),a=rate(target.away_team,false);
    if(h.overall.n<5||a.overall.n<5||h.venue.n<3||a.venue.n<3)continue;
    const last=prior.slice(-200);
    const leagueHome=last.reduce((s,x)=>s+x.home_score,0)/last.length,leagueAway=last.reduce((s,x)=>s+x.away_score,0)/last.length;
    const blend=(x,y)=>.55*x+.45*y;
    const shrink=(v,base,n)=>base+(v-base)*n/(n+8);
    const ha=shrink(blend(h.venue.scored,h.overall.scored),leagueHome,h.venue.n);
    const hd=shrink(blend(h.venue.conceded,h.overall.conceded),leagueAway,h.venue.n);
    const aa=shrink(blend(a.venue.scored,a.overall.scored),leagueAway,a.venue.n);
    const ad=shrink(blend(a.venue.conceded,a.overall.conceded),leagueHome,a.venue.n);
    const hl=Math.max(.2,Math.min(4.5,ha*ad/Math.max(.3,leagueHome)));
    const al=Math.max(.2,Math.min(4.5,aa*hd/Math.max(.3,leagueAway)));
    let probs=[0,0,0],total=0;
    for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const v=pois(i,hl)*pois(j,al);total+=v;probs[i>j?0:i===j?1:2]+=v}
    probs=probs.map(x=>x/total);
    const actual=target.home_score>target.away_score?0:target.home_score===target.away_score?1:2;
    const favorite=probs.indexOf(Math.max(...probs));
    const counts=[0,0,0];for(const x of prior)counts[x.home_score>x.away_score?0:x.home_score===x.away_score?1:2]++;
    const baseline=counts.map(n=>n/prior.length);
    const brier=(p)=>p.reduce((s,v,i)=>s+(v-Number(i===actual))**2,0);
    eligible.push({actual,favorite,probs,baseline,brier:brier(probs),baselineBrier:brier(baseline)});
   }
   const holdout=eligible.slice(Math.floor(eligible.length*.7));
   const avg=(arr,fn)=>arr.length?+(arr.reduce((s,x)=>s+fn(x),0)/arr.length).toFixed(4):null;
   const summarize=arr=>({sample:arr.length,accuracy:avg(arr,x=>Number(x.favorite===x.actual)),brier_score:avg(arr,x=>x.brier),baseline_brier_score:avg(arr,x=>x.baselineBrier),predicted_home_favorite_share:avg(arr,x=>Number(x.favorite===0)),actual_home_win_share:avg(arr,x=>Number(x.actual===0)),mean_predicted_home_win_probability:avg(arr,x=>x.probs[0]),favorite_distribution:{home:arr.filter(x=>x.favorite===0).length,draw:arr.filter(x=>x.favorite===1).length,away:arr.filter(x=>x.favorite===2).length}});
   results.push({league,...summarize(eligible),holdout:summarize(holdout)});
  }
  res.setHeader('Cache-Control','public, s-maxage=3600');
  return res.status(200).json({ok:true,model:'poisson_league_relative_shrunk_v1_3',method:'chronological_walk_forward_no_future_results',history_source:'openligadb_read_only',history_fetch_status:feeds.map(x=>({league:x.league,season:x.year,ok:x.ok,count:x.rows.length,error:x.error})),completed_matches:feeds.reduce((s,x)=>s+x.rows.length,0),note:'Historical diagnostic, not proof of betting edge. Holdout is final 30% of eligible matches. Lower Brier score is better; baseline uses prior league outcome frequencies.',leagues:results});
 }catch(e){return res.status(502).json({error:'backtest_failed',detail:String(e.message||e)})}
};
// SportVYN AI: transparent, deterministic league-separated multi-league baseline model.
// GET /api/analyze-football (public preview, read-only; no tips are published).
module.exports = async function handler(req,res){
 if(req.query?.mode==='backtest')return backtestHandler(req,res);
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const base=(process.env.SUPABASE_URL||process.env.SPORTIQ_STATS_SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SPORTIQ_STATS_ANON_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_supabase_configuration',diagnostic_version:'sportiq-model-2',missing:[!base?'url':null,!key?'key':null].filter(Boolean)});
 try{
  const response=await fetch(base+'/rest/v1/sportvyn_matches?select=id,provider,league,home_team,away_team,starts_at,status,home_score,away_score&sport=eq.football&league=in.(Bundesliga,2.%20Bundesliga,3.%20Liga,Premier%20League,La%20Liga)&order=starts_at.asc&limit=1500',{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
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
  // Public historical result fallback, read-only. Only final 90-minute scores.
  const season=new Date().getUTCMonth()>=6?new Date().getUTCFullYear():new Date().getUTCFullYear()-1;
  const leagueCodes=[['bl1','Bundesliga'],['bl2','2. Bundesliga'],['bl3','3. Liga']];
  let historySource='supabase',historyFetchStatus=[];
  if(history.length===0){
   const feeds=await Promise.all(leagueCodes.flatMap(([code,league])=>[season-1,season].map(async year=>{
    try{
     const response=await fetch('https://api.openligadb.de/getmatchdata/'+code+'/'+year,{signal:AbortSignal.timeout(8000)});
     if(!response.ok)throw Error('HTTP '+response.status);
     const data=await response.json();if(!Array.isArray(data))throw Error('invalid_response');
     const rows=data.filter(m=>m.matchIsFinished&&m.team1?.teamName&&m.team2?.teamName&&m.matchDateTimeUTC).map(m=>{
      const score=(m.matchResults||[]).find(x=>x.resultTypeID===2||x.resultTypeKind==='After90Minutes');
      if(!score||!Number.isInteger(score.pointsTeam1)||!Number.isInteger(score.pointsTeam2))return null;
      return {id:'openliga-'+code+'-'+m.matchID,provider:'openligadb',league,home_team:m.team1.teamName,away_team:m.team2.teamName,starts_at:new Date(m.matchDateTimeUTC).toISOString(),status:'finished',home_score:score.pointsTeam1,away_score:score.pointsTeam2};
     }).filter(Boolean);
     return {league,year,ok:true,rows};
    }catch(e){return {league,year,ok:false,rows:[]}}
   })));
   historyFetchStatus=feeds.map(x=>({league:x.league,season:x.year,ok:x.ok,count:x.rows.length}));
   history.push(...feeds.flatMap(x=>x.rows));
   historySource='openligadb_read_only';
  }
  // Read-only diagnostics: distinguish missing finished rows from insufficient team history.
  const historyByLeague=history.reduce((acc,m)=>(acc[m.league]=(acc[m.league]||0)+1,acc),{});

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
   // Compare team performance to league venue baselines instead of adding raw
   // goal averages. Shrink team rates towards league averages for small samples.
   const shrink=(observed,baseline,n)=>baseline+(observed-baseline)*n/(n+8);
   const ha=shrink(homeAttack,leagueHome,h.venue.n);
   const hd=shrink(homeDefense,leagueAway,h.venue.n);
   const aa=shrink(awayAttack,leagueAway,a.venue.n);
   const ad=shrink(awayDefense,leagueHome,a.venue.n);
   const homeLambda=Math.max(.2,Math.min(4.5,ha*ad/Math.max(.3,leagueHome)));
   const awayLambda=Math.max(.2,Math.min(4.5,aa*hd/Math.max(.3,leagueAway)));
   const confidence=h.overall.n>=10&&a.overall.n>=10&&h.venue.n>=6&&a.venue.n>=6?'moderate':'low';
   function pois(k,l){let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p}
   let home=0,draw=0,away=0,total=0,over25=0,btts=0;
   for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const p=pois(i,homeLambda)*pois(j,awayLambda);total+=p;if(i+j>=3)over25+=p;if(i>0&&j>0)btts+=p;if(i>j)home+=p;else if(i===j)draw+=p;else away+=p}
   const ranked=[{selection:'1',probability:home/total},{selection:'X',probability:draw/total},{selection:'2',probability:away/total}].sort((a,b)=>b.probability-a.probability);
   return {...baseInfo,status:'model_ready',confidence,model_favorite:ranked[0].selection,model_favorite_probability:+ranked[0].probability.toFixed(4),fair_odds:{home:+(total/home).toFixed(2),draw:+(total/draw).toFixed(2),away:+(total/away).toFixed(2)},expected_goals:{home:+homeLambda.toFixed(2),away:+awayLambda.toFixed(2)},goal_markets:{over_2_5:+(over25/total).toFixed(4),under_2_5:+(1-over25/total).toFixed(4),both_teams_score_yes:+(btts/total).toFixed(4),both_teams_score_no:+(1-btts/total).toFixed(4)},probabilities:{home:+(home/total).toFixed(4),draw:+(draw/total).toFixed(4),away:+(away/total).toFixed(4)}};
  });
  return res.status(200).json({ok:true,model:'poisson_league_relative_shrunk_v1_3',disclaimer:'Experimental model, not calibrated; fair odds are model-derived, not bookmaker odds; no value assessment; no bets placed or tips published.',completed_matches:history.length,history_source:historySource,history_fetch_status:historyFetchStatus,history_by_league:historyByLeague,model_ready:predictions.filter(p=>p.status==='model_ready').length,model_favorite_distribution:predictions.filter(p=>p.status==='model_ready').reduce((a,p)=>(a[p.model_favorite]=(a[p.model_favorite]||0)+1,a),{'1':0,'X':0,'2':0}),insufficient_data:predictions.filter(p=>p.status==='insufficient_data').length,upcoming_analyzed:predictions.length,fixtures_excluded:upcoming.length-validUpcoming.length,fixture_validation:'provider_and_same_day_conflicts_only',predictions});
 }catch(e){return res.status(502).json({error:'analysis_failed',detail:String(e.message||e)})}
};
