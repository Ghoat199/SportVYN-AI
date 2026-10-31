// SportVYN V1.7: compare OpenLigaDB history to existing Supabase rows. READ ONLY.
const years=process.argv.slice(2).map(Number);
const seasons=years.length?years:[2024,2025];
if(seasons.some(y=>!Number.isInteger(y)||y<2000||y>2100))throw Error('Invalid season');
const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,'').replace(/\/rest\/v1$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key)throw Error('Missing Supabase environment. Run with existing Vercel production environment.');
const headers={apikey:key,Authorization:'Bearer '+key};
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9äöüß]+/g,' ').trim();
const day=s=>new Date(s).toISOString().slice(0,10);
const signature=(league,home,away,date)=>[normalize(league),normalize(home),normalize(away),day(date)].join('|');
const stored=[];
for(let offset=0;offset<10000;offset+=1000){
 const q=new URLSearchParams({select:'id,league,home_team,away_team,starts_at,status,home_score,away_score',sport:'eq.football',order:'starts_at.asc',limit:'1000',offset:String(offset)});
 const r=await fetch(base+'/rest/v1/sportvyn_matches?'+q,{headers,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Supabase read failed HTTP '+r.status);
 const rows=await r.json();if(!Array.isArray(rows))throw Error('Unexpected Supabase response');
 stored.push(...rows);if(rows.length<1000)break;
 if(offset===9000)throw Error('Stored data exceeds safety limit; pagination incomplete');
}
const existing=new Set(stored.filter(m=>m.league&&m.home_team&&m.away_team&&m.starts_at).map(m=>signature(m.league,m.home_team,m.away_team,m.starts_at)));
const leagues={bl1:'Bundesliga',bl2:'2. Bundesliga',bl3:'3. Liga'};
const result=[];
for(const season of seasons)for(const [code,league] of Object.entries(leagues)){
 const r=await fetch('https://api.openligadb.de/getmatchdata/'+code+'/'+season,{signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('OpenLigaDB HTTP '+r.status);
 const games=await r.json();if(!Array.isArray(games))throw Error('Unexpected OpenLigaDB response');
 const valid=games.filter(m=>m.matchIsFinished===true&&m.team1?.teamName&&m.team2?.teamName&&Number.isFinite(Date.parse(m.matchDateTimeUTC))&&m.matchResults?.some(x=>x.resultTypeID===2&&Number.isInteger(x.pointsTeam1)&&Number.isInteger(x.pointsTeam2)));
 const overlap=valid.filter(m=>existing.has(signature(league,m.team1.teamName,m.team2.teamName,m.matchDateTimeUTC)));
 result.push({league,season,source_finished:valid.length,exact_name_date_matches:overlap.length,needs_alias_or_identity_review:valid.length-overlap.length});
}
console.log(JSON.stringify({mode:'read_only_comparison',stored_rows:stored.length,warning:'Unmatched rows are NOT confirmed new matches; team aliases and provider IDs require verification.',result},null,2));
