// Public read-only seven-day fixture calendar for all imported leagues and cups.
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_configuration'});
 try{
  const start=new Date(),end=new Date(start.getTime()+7*86400000);
  const query=new URLSearchParams({select:'id,league,home_team,away_team,starts_at,status',sport:'eq.football',status:'eq.scheduled',order:'starts_at.asc',limit:'1500'});
  query.append('starts_at','gte.'+start.toISOString());query.append('starts_at','lt.'+end.toISOString());
  const r=await fetch(base+'/rest/v1/sportvyn_matches?'+query,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('database_http_'+r.status);
  const rows=await r.json(),dateFmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
  const today=dateFmt.format(start),max=new Date(start.getTime()+6*86400000),last=dateFmt.format(max);
  // Structural checks only; these do not certify that fixtures match official schedules.
  const valid=rows.filter(m=>m.id!=null&&typeof m.league==='string'&&m.league.trim()&&typeof m.home_team==='string'&&m.home_team.trim()&&typeof m.away_team==='string'&&m.away_team.trim()&&m.home_team.trim().toLowerCase()!==m.away_team.trim().toLowerCase()&&Number.isFinite(Date.parse(m.starts_at)));
  const rejected=rows.length-valid.length;
  const inWindow=valid.filter(m=>{const d=dateFmt.format(new Date(m.starts_at));return d>=today&&d<=last});
  const counts=new Map();
  for(const m of inWindow){const day=dateFmt.format(new Date(m.starts_at));for(const team of [m.home_team,m.away_team]){const k=m.league+'|'+day+'|'+team.trim().toLowerCase();counts.set(k,(counts.get(k)||0)+1)}}
  let games=inWindow.map(m=>{const day=dateFmt.format(new Date(m.starts_at));const conflict=[m.home_team,m.away_team].some(team=>(counts.get(m.league+'|'+day+'|'+team.trim().toLowerCase())||0)>1);return {id:m.id,league:m.league,match:m.home_team+' – '+m.away_team,starts_at:m.starts_at,date:day,validation_status:conflict?'review_required':'structurally_valid'};});
  // Optional small independent sample from TheSportsDB free API (maximum three events/day).
  // Never interpret absence from a truncated sample as evidence that a fixture is wrong.
  let sampleEvents=[],sampleError=null;
  try{
   const d=today;
   const u='https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d='+encodeURIComponent(d)+'&s=Soccer';
   const ext=await fetch(u,{signal:AbortSignal.timeout(3500),headers:{Accept:'application/json'}});
   if(!ext.ok)throw Error('http_'+ext.status);
   const payload=await ext.json();
   sampleEvents=(Array.isArray(payload.events)?payload.events:[]).slice(0,3).map(e=>({home:String(e.strHomeTeam||''),away:String(e.strAwayTeam||''),date:String(e.dateEvent||'')}));
  }catch(e){sampleError=String(e.message||e).slice(0,80)}
  const norm=s=>String(s||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\b(fc|cf|sc|sv|afc|vfl|tsg|fk|club|football|fussball)\\b/g,'').replace(/[^a-z0-9]/g,'');
  games=games.map(g=>{
   const [home,away]=g.match.split(' – ');
   const confirmed=sampleEvents.some(e=>e.date===g.date&&norm(e.home)===norm(home)&&norm(e.away)===norm(away));
   return {...g,independent_check:confirmed?'sample_match':'not_verified'};
  });
  // Read-only source reconciliation: never delete or update stored matches.
  // A missing match is only a review candidate if its league feed was successfully retrieved.
  const season=start.getUTCMonth()>=6?start.getUTCFullYear():start.getUTCFullYear()-1;
  const leagueCodes={'Bundesliga':'bl1','2. Bundesliga':'bl2','3. Liga':'bl3'};
  const sourceResults=await Promise.all(Object.entries(leagueCodes).map(async ([league,code])=>{
   try{
    const response=await fetch('https://api.openligadb.de/getmatchdata/'+code+'/'+season,{headers:{accept:'application/json'},signal:AbortSignal.timeout(6500)});
    if(!response.ok)throw Error('http_'+response.status);
    const items=await response.json();
    if(!Array.isArray(items)||items.length===0)throw Error('empty_feed');
    const relevant=items.filter(m=>m.team1?.teamName&&m.team2?.teamName&&Number.isFinite(Date.parse(m.matchDateTimeUTC)));
    return {league,ok:true,entries:relevant.map(m=>({home:m.team1.teamName,away:m.team2.teamName,day:dateFmt.format(new Date(m.matchDateTimeUTC)),time:Date.parse(m.matchDateTimeUTC)}))};
   }catch(e){return {league,ok:false,error:String(e.message||e).slice(0,60),entries:[]}}
  }));
  const sourceByLeague=new Map(sourceResults.map(x=>[x.league,x]));
  games=games.map(g=>{
   const source=sourceByLeague.get(g.league);
   if(!source)return {...g,source_check:'not_supported'};
   if(!source.ok)return {...g,source_check:'source_unavailable'};
   const [home,away]=g.match.split(' – ');
   const candidates=source.entries.filter(e=>norm(e.home)===norm(home)&&norm(e.away)===norm(away));
   if(candidates.some(e=>e.day===g.date&&Math.abs(e.time-Date.parse(g.starts_at))<=90*60000))return {...g,source_check:'current_source_match'};
   if(candidates.length)return {...g,source_check:'date_or_time_changed',validation_status:'review_required'};
   return {...g,source_check:'missing_from_current_source',validation_status:'review_required'};
  });
  const sourceSummary={checked_leagues:sourceResults.map(x=>({league:x.league,available:x.ok,feed_entries:x.entries.length,...(x.error?{error:x.error}:{})})),matched:games.filter(g=>g.source_check==='current_source_match').length,review_candidates:games.filter(g=>['date_or_time_changed','missing_from_current_source'].includes(g.source_check)).length,mode:'read_only_no_deletions'};
  // No football-data.org requests: reserve the shared quota for BetValue AI.
  const crosscheck='disabled_to_preserve_quota';
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({ok:true,timezone:'Europe/Berlin',days:7,source:'already_imported_only',total:games.length,rejected_invalid_records:rejected,requires_review:games.filter(g=>g.validation_status==='review_required').length,verification:crosscheck,source_reconciliation:sourceSummary,independent_sample:{source:'TheSportsDB',scope:'today_only',returned:sampleEvents.length,matched:games.filter(g=>g.independent_check==='sample_match').length,limited:true,error:sampleError},checked_at:new Date().toISOString(),by_league:games.reduce((acc,g)=>(acc[g.league]=(acc[g.league]||0)+1,acc),{}),games});
 }catch(e){return res.status(502).json({error:'fixtures_unavailable'})}
};