// SportVYN V1.7 — read-only historical source preview; NO database writes.
const years=process.argv.slice(2).map(Number);
const seasons=years.length?years:[2024,2025];
if(seasons.some(y=>!Number.isInteger(y)||y<2000||y>2100))throw Error('Pass valid season start years');
const leagues={bl1:'Bundesliga',bl2:'2. Bundesliga',bl3:'3. Liga'};
const summary=[];
const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\\s+/g,' ');
const teamNames=new Map();
for(const year of seasons)for(const [code,league] of Object.entries(leagues)){
 try{
  const response=await fetch(`https://api.openligadb.de/getmatchdata/${code}/${year}`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const items=await response.json();
  if(!Array.isArray(items))throw Error('Unexpected source format');
  const finished=items.filter(m=>m.matchIsFinished===true&&m.team1?.teamName&&m.team2?.teamName&&Number.isFinite(Date.parse(m.matchDateTimeUTC))&&Array.isArray(m.matchResults)&&m.matchResults.some(x=>x.resultTypeID===2&&Number.isInteger(x.pointsTeam1)&&Number.isInteger(x.pointsTeam2)));
  const ids=finished.map(m=>m.matchID);
  const aliases=[];
  for(const m of finished)for(const team of [m.team1,m.team2]){
   const key=league+'|'+String(team.teamId??team.teamID??norm(team.teamName));
   const seen=teamNames.get(key)||new Set();seen.add(team.teamName);teamNames.set(key,seen);
  }
  const missingIds=finished.filter(m=>!Number.isInteger(m.matchID)).length;
  const invalidScores=items.filter(m=>m.matchIsFinished===true&&!finished.includes(m)).length;
  summary.push({league,season:year,source_rows:items.length,finished_valid:finished.length,duplicate_source_ids:ids.length-new Set(ids).size,missing_source_ids:missingIds,finished_rows_rejected:invalidScores,preview:finished.slice(0,2).map(m=>({source_id:m.matchID,home:m.team1.teamName,away:m.team2.teamName,date:m.matchDateTimeUTC}))});
 }catch(e){summary.push({league,season:year,error:String(e.message||e)})}
}
const team_name_variants=[...teamNames.entries()].filter(([,names])=>names.size>1).map(([team_key,names])=>({team_key,names:[...names]}));
console.log(JSON.stringify({mode:'dry_run_no_writes',source:'OpenLigaDB',summary,team_name_variants},null,2));
