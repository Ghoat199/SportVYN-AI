// Offline-capable dry-run validator for OpenFootball season files.
// Usage: node scripts/check-openfootball.mjs <serie-a.json> <ligue-1.json>
// Reads local JSON only. Does not connect to Vercel or Supabase.
import {readFileSync} from 'node:fs';
const inputs=process.argv.slice(2);
if(inputs.length!==2){console.error('Usage: node scripts/check-openfootball.mjs <serie-a.json> <ligue-1.json>');process.exitCode=2}
else {
 const leagues=['Serie A','Ligue 1'];
 const all=[];
 for(let i=0;i<2;i++){
  try{
   const doc=JSON.parse(readFileSync(inputs[i],'utf8'));
   const matches=Array.isArray(doc)?doc:Array.isArray(doc.matches)?doc.matches:Array.isArray(doc.rounds)?doc.rounds.flatMap(r=>r.matches||[]):null;
   if(!matches)throw Error('Unsupported JSON structure');
   const seen=new Set(),issues=[],upcoming=[];
   for(const [idx,m] of matches.entries()){
    const home=m.team1||m.home||m.home_team||m.team1?.name;
    const away=m.team2||m.away||m.away_team||m.team2?.name;
    const h=typeof home==='string'?home:home?.name;
    const a=typeof away==='string'?away:away?.name;
    const date=m.date||m.matchDateTimeUTC||m.starts_at;
    const time=m.time||null;
    if(!h||!a||!date){issues.push({row:idx+1,reason:'missing_team_or_date'});continue}
    const key=[leagues[i],String(date),h.toLowerCase(),a.toLowerCase()].join('|');
    if(seen.has(key))issues.push({row:idx+1,reason:'duplicate'});else seen.add(key);
    if(!time&&!String(date).includes('T'))issues.push({row:idx+1,reason:'kickoff_time_unverified'});
    const dateString=String(date).slice(0,10);
    if(dateString>='2026-10-29'&&dateString<='2026-11-05')upcoming.push({date:dateString,home:h,away:a,time});
   }
   all.push({league:leagues[i],total:matches.length,unique:seen.size,issues:issues.slice(0,30),issue_count:issues.length,week_matches:upcoming});
  }catch(e){all.push({league:leagues[i],error:String(e.message||e)})}
 }
 console.log(JSON.stringify({mode:'dry_run_only',database_changes:0,results:all},null,2));
 if(all.some(x=>x.error))process.exitCode=1;
}
