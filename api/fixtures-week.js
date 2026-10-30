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
  // Independent comparison is optional and conservative: unmatched != incorrect.
  // Requires FOOTBALL_DATA_API_KEY in Vercel. Never expose the token.
  let crosscheck='not_configured';
  if(process.env.FOOTBALL_DATA_API_KEY){
   try{
    const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10);
    const external=await fetch('https://api.football-data.org/v4/matches?dateFrom='+from+'&dateTo='+to,{headers:{'X-Auth-Token':process.env.FOOTBALL_DATA_API_KEY},signal:AbortSignal.timeout(10000)});
    if(!external.ok)throw Error('source_http_'+external.status);
    const payload=await external.json();
    if(!Array.isArray(payload.matches))throw Error('invalid_source');
    const normalize=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const names=new Map([['Bundesliga','BL1'],['2. Bundesliga','BL2'],['Premier League','PL'],['La Liga','PD']]);
    const known=payload.matches.filter(m=>m.utcDate&&m.homeTeam&&m.awayTeam);
    games=games.map(g=>{
     if(g.validation_status==='review_required')return g;
     const code=names.get(g.league);
     if(!code)return g;
     const [home,away]=g.match.split(' – ');
     const found=known.some(m=>m.competition?.code===code&&Math.abs(Date.parse(m.utcDate)-Date.parse(g.starts_at))<=3*3600000&&
      [m.homeTeam?.name,m.homeTeam?.shortName].some(n=>normalize(n)===normalize(home))&&
      [m.awayTeam?.name,m.awayTeam?.shortName].some(n=>normalize(n)===normalize(away)));
     return {...g,validation_status:found?'independently_matched':'unconfirmed'};
    });
    crosscheck='completed_conservative';
   }catch(e){console.error('Independent fixture comparison unavailable',String(e.message||e));crosscheck='source_unavailable'}
  }
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,timezone:'Europe/Berlin',days:7,source:'already_imported_only',total:games.length,rejected_invalid_records:rejected,requires_review:games.filter(g=>g.validation_status==='review_required').length,verification:crosscheck,games});
 }catch(e){return res.status(502).json({error:'fixtures_unavailable'})}
};