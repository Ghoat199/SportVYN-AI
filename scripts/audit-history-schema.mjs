// Read-only Supabase column availability check. Never prints credentials.
const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key){console.log(JSON.stringify({ok:false,error:'missing_supabase_secrets'}));process.exit(0)}
const headers={apikey:key,Authorization:'Bearer '+key};
const fields=['id','provider','league','home_team','away_team','starts_at','status','home_score','away_score','sport','provider_match_id','external_id','season'];
const results=[];
for(const field of fields){try{const q=new URLSearchParams({select:field,limit:'1'});const response=await fetch(base+'/rest/v1/sportvyn_matches?'+q,{headers,signal:AbortSignal.timeout(8000)});results.push({field,available:response.ok,http_status:response.status})}catch(e){results.push({field,available:false,error:String(e.message||e)})}}
console.log(JSON.stringify({ok:true,mode:'read_only_no_writes',fields:results},null,2));
