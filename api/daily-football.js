// Daily forecast snapshots and result settlement. Requires SQL migration 001.
// Authenticated by Vercel CRON_SECRET or dedicated SPORTVYN_CRON_SECRET.
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const secrets=[process.env.CRON_SECRET,process.env.SPORTVYN_CRON_SECRET].filter(Boolean);
 if(!secrets.some(s=>req.headers.authorization==='Bearer '+s))return res.status(401).json({error:'unauthorized'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'missing_supabase_configuration'});
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 async function read(path){const r=await fetch(base+'/rest/v1/'+path,{headers,signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('read '+r.status+' '+(await r.text()).slice(0,160));return r.json()}
 async function write(path,method,body,prefer){const r=await fetch(base+'/rest/v1/'+path,{method,headers:{...headers,Prefer:prefer||'return=minimal'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('write '+r.status+' '+(await r.text()).slice(0,200))}
 try{
  const now=Date.now();
  const matches=await read('sportvyn_matches?select=id,home_team,away_team,starts_at,status,home_score,away_score&sport=eq.football&league=eq.Bundesliga&order=starts_at.asc&limit=400');
  const completed=matches.filter(m=>m.status==='finished'&&Number.isInteger(m.home_score)&&Number.isInteger(m.away_score));
  const snapshots=await read('sportvyn_model_forecasts?select=id,match_id,settled_at&limit=400');
  const byMatch=new Map(matches.map(m=>[m.id,m]));
  let settled=0,created=0;
  for(const snap of snapshots){
   if(snap.settled_at)continue;
   const m=byMatch.get(snap.match_id);
   if(!m||m.status!=='finished'||!Number.isInteger(m.home_score)||!Number.isInteger(m.away_score))continue;
   const actual=m.home_score>m.away_score?'home':m.home_score<m.away_score?'away':'draw';
   // Database compares actual outcome to the original stored prediction.
   const original=await read('sportvyn_model_forecasts?select=predicted_outcome&id=eq.'+encodeURIComponent(snap.id)+'&limit=1');
   if(!original.length)continue;
   await write('sportvyn_model_forecasts?id=eq.'+encodeURIComponent(snap.id),'PATCH',{actual_outcome:actual,correct:original[0].predicted_outcome===actual,settled_at:new Date().toISOString()});
   settled++;
  }
  const existing=new Set(snapshots.map(s=>s.match_id));
  const future=matches.filter(m=>m.status==='scheduled'&&Date.parse(m.starts_at)>now).slice(0,15);
  function form(team,home,cutoff){
   const g=completed.filter(m=>Date.parse(m.starts_at)<cutoff&&(home?m.home_team===team:m.away_team===team)).slice(-8);
   return {n:g.length,scored:g.reduce((s,m)=>s+(home?m.home_score:m.away_score),0),conceded:g.reduce((s,m)=>s+(home?m.away_score:m.home_score),0)}
  }
  function poisson(k,l){let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p}
  for(const m of future){
   if(existing.has(m.id))continue;
   const cutoff=Date.parse(m.starts_at),h=form(m.home_team,true,cutoff),a=form(m.away_team,false,cutoff);
   if(h.n<3||a.n<3)continue;
   const hl=Math.max(.2,Math.min(4.5,(h.scored/h.n+a.conceded/a.n)/2)),al=Math.max(.2,Math.min(4.5,(a.scored/a.n+h.conceded/h.n)/2));
   let p=[0,0,0],sum=0;
   for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const v=poisson(i,hl)*poisson(j,al);sum+=v;p[i>j?0:i===j?1:2]+=v}
   p=p.map(v=>v/sum);
   const outcomes=['home','draw','away'];
   const pick=outcomes[p.indexOf(Math.max(...p))];
   const row={match_id:m.id,model_version:'poisson_baseline_v1',starts_at:m.starts_at,home_probability:p[0],draw_probability:p[1],away_probability:p[2],predicted_outcome:pick,home_expected_goals:hl,away_expected_goals:al,home_sample:h.n,away_sample:a.n};
   await write('sportvyn_model_forecasts?on_conflict=match_id,model_version','POST',[row],'resolution=ignore-duplicates,return=minimal');
   created++;
  }
  return res.status(200).json({ok:true,created,settled,completed_matches:completed.length,upcoming_checked:future.length});
 }catch(e){console.error('SportVYN daily analysis:',e);return res.status(502).json({error:'daily_analysis_failed',detail:String(e.message||e)})}
};
