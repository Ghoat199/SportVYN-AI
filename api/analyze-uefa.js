// Read-only UEFA 1X2 preview. No forecasts are stored or tips published.
// Results must be verified as regulation-time scores before being used for training.
const leagues=['Champions League','Europa League','Conference League'];
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_supabase_configuration'});
 try{
  const headers={apikey:key,Authorization:'Bearer '+key};
  const all=[];
  for(const league of leagues){
   const query='sportvyn_matches?select=id,league,home_team,away_team,starts_at,status,home_score,away_score&sport=eq.football&league=eq.'+encodeURIComponent(league)+'&order=starts_at.asc&limit=1000';
   const response=await fetch(base+'/rest/v1/'+query,{headers,signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('database_http_'+response.status+': '+(await response.text()).slice(0,140));
   const rows=await response.json();
   all.push(...rows);
  }
  const now=Date.now();
  // UEFA importer deliberately does not populate scores. Never infer 90-minute
  // results from cup full-time scores that may include extra time or penalties.
  const history=all.filter(m=>m.status==='finished'&&Number.isInteger(m.home_score)&&Number.isInteger(m.away_score));
  function form(team,isHome,cutoff,league){
   const games=history.filter(m=>m.league===league&&Date.parse(m.starts_at)<cutoff&&(isHome?m.home_team===team:m.away_team===team)).slice(-8);
   return {n:games.length,scored:games.reduce((s,m)=>s+(isHome?m.home_score:m.away_score),0),conceded:games.reduce((s,m)=>s+(isHome?m.away_score:m.home_score),0)};
  }
  function poisson(k,lambda){let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p}
  const upcoming=all.filter(m=>m.status==='scheduled'&&Date.parse(m.starts_at)>now).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).slice(0,30);
  const predictions=upcoming.map(m=>{
   const cutoff=Date.parse(m.starts_at),h=form(m.home_team,true,cutoff,m.league),a=form(m.away_team,false,cutoff,m.league);
   const baseRow={match_id:m.id,league:m.league,match:m.home_team+' – '+m.away_team,starts_at:m.starts_at,home_games:h.n,away_games:a.n};
   if(h.n<3||a.n<3)return {...baseRow,status:'insufficient_verified_90min_history'};
   const hl=Math.max(.2,Math.min(4.5,(h.scored/h.n+a.conceded/a.n)/2));
   const al=Math.max(.2,Math.min(4.5,(a.scored/a.n+h.conceded/h.n)/2));
   let home=0,draw=0,away=0,sum=0;
   for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const p=poisson(i,hl)*poisson(j,al);sum+=p;if(i>j)home+=p;else if(i===j)draw+=p;else away+=p}
   return {...baseRow,status:'model_ready',expected_goals:{home:+hl.toFixed(2),away:+al.toFixed(2)},probabilities:{home:+(home/sum).toFixed(4),draw:+(draw/sum).toFixed(4),away:+(away/sum).toFixed(4)}};
  });
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,model:'poisson_uefa_preview_v1',read_only:true,verified_completed_matches:history.length,upcoming_checked:predictions.length,disclaimer:'Experimental uncalibrated model. Requires verified 90-minute scores; fixture import alone does not provide them. No betting tips or forecasts published.',predictions});
 }catch(e){return res.status(502).json({error:'uefa_analysis_failed',detail:String(e.message||e)})}
};
