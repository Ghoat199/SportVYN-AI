// SportVYN V1.7 — read-only historical source preview; NO database writes.
const years=process.argv.slice(2).map(Number);
const seasons=years.length?years:[2024,2025];
if(seasons.some(y=>!Number.isInteger(y)||y<2000||y>2100))throw Error('Pass valid season start years');
const leagues={bl1:'Bundesliga',bl2:'2. Bundesliga',bl3:'3. Liga'};
const summary=[];
for(const year of seasons)for(const [code,league] of Object.entries(leagues)){
 try{
  const response=await fetch(`https://api.openligadb.de/getmatchdata/${code}/${year}`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const items=await response.json();
  if(!Array.isArray(items))throw Error('Unexpected source format');
  const finished=items.filter(m=>m.matchIsFinished===true&&m.team1?.teamName&&m.team2?.teamName&&Number.isFinite(Date.parse(m.matchDateTimeUTC))&&Array.isArray(m.matchResults)&&m.matchResults.some(x=>x.resultTypeID===2&&Number.isInteger(x.pointsTeam1)&&Number.isInteger(x.pointsTeam2)));
  const ids=finished.map(m=>m.matchID);
  summary.push({league,season:year,source_rows:items.length,finished_valid:finished.length,duplicate_source_ids:ids.length-new Set(ids).size,preview:finished.slice(0,2).map(m=>({source_id:m.matchID,home:m.team1.teamName,away:m.team2.teamName,date:m.matchDateTimeUTC}))});
 }catch(e){summary.push({league,season:year,error:String(e.message||e)})}
}
console.log(JSON.stringify({mode:'dry_run_no_writes',source:'OpenLigaDB',summary},null,2));
