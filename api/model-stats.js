// Public, aggregate-only model performance; no secrets exposed.
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)return res.status(503).json({error:'stats_unavailable'});
 try{
  const response=await fetch(base+'/rest/v1/sportvyn_model_forecasts?select=model_version,settled_at,correct,home_probability,draw_probability,away_probability,actual_outcome&order=predicted_at.desc&limit=1000',{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('database_'+response.status);
  const rows=await response.json();
  const settled=rows.filter(x=>x.settled_at&&['home','draw','away'].includes(x.actual_outcome));
  const correct=settled.filter(x=>x.correct===true).length;
  let brierSum=0,brierCount=0;
  for(const x of settled){const p=[Number(x.home_probability),Number(x.draw_probability),Number(x.away_probability)];if(p.every(Number.isFinite)){const a=['home','draw','away'];brierSum+=p.reduce((s,v,i)=>s+(v-(a[i]===x.actual_outcome?1:0))**2,0);brierCount++}}
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({ok:true,model:'poisson_baseline_v1',saved:rows.length,settled:settled.length,pending:rows.length-settled.length,correct,hit_rate:settled.length?Number((100*correct/settled.length).toFixed(1)):null,brier_score:brierCount?Number((brierSum/brierCount).toFixed(4)):null,limited_to:1000,disclaimer:'Experimental uncalibrated model. No odds, ROI or real-money betting.'});
 }catch(e){console.error('SportVYN stats:',e);return res.status(503).json({error:'stats_unavailable'})}
};
