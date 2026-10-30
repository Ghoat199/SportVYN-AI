// Vercel Serverless Function: import Bundesliga, 2. Bundesliga and DFB-Pokal from OpenLigaDB.
// Required Vercel secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SPORTVYN_CRON_SECRET or CRON_SECRET.
// Never expose the service-role key in client-side code.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'method_not_allowed'});
  const secrets = [process.env.SPORTVYN_CRON_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (!secrets.length || !secrets.some(secret => req.headers.authorization === 'Bearer ' + secret))
    return res.status(401).json({error:'unauthorized'});
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return res.status(503).json({error:'missing_supabase_configuration'});
  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const season = now.getUTCMonth() >= 6 ? year : year - 1;
    const leagues=[{code:'bl1',name:'Bundesliga'},{code:'bl2',name:'2. Bundesliga'},{code:'bl3',name:'3. Liga'},{code:'ffb1',name:'Frauen-Bundesliga'},{code:'pl',name:'Premier League'},{code:'la1',name:'La Liga'},{code:'dfb',name:'DFB-Pokal'}];
    const results=[];
    const endpoint=base+'/rest/v1/sportvyn_matches?on_conflict=provider,provider_match_id';
    const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};
    for(const league of leagues){
    try {
    const source='https://api.openligadb.de/getmatchdata/'+league.code+'/'+season;
    const sourceResp=await fetch(source,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
    if(!sourceResp.ok)throw new Error('OpenLigaDB HTTP '+sourceResp.status);
    const matches=await sourceResp.json();
    if(!Array.isArray(matches)||!matches.length)throw new Error('Empty or invalid match feed');
    const rows = matches.filter(m=>m.matchID && m.team1?.teamName && m.team2?.teamName && m.team1.teamName.trim().toLowerCase()!==m.team2.teamName.trim().toLowerCase() && m.matchDateTimeUTC && Number.isFinite(Date.parse(m.matchDateTimeUTC)) && Math.abs(Date.parse(m.matchDateTimeUTC)-now.getTime())<370*86400000)
      .map(m=>{
        const final = Boolean(m.matchIsFinished);
        const scores = Array.isArray(m.matchResults) ? m.matchResults : [];
        const end = scores.find(x=>x.resultTypeID===2) || scores.find(x=>x.resultName==='Endergebnis') || scores[scores.length-1];
        return {
          provider:'openligadb',
          provider_match_id:String(m.matchID),
          sport:'football',
          league:league.name,
          home_team:m.team1.teamName,
          away_team:m.team2.teamName,
          starts_at:new Date(m.matchDateTimeUTC).toISOString(),
          status:final?'finished':'scheduled',
          // Cup final scores can include extra time: do not label them as 90-minute results.
          home_score:league.code!=='dfb' && final && end && Number.isInteger(end.pointsTeam1)?end.pointsTeam1:null,
          away_score:league.code!=='dfb' && final && end && Number.isInteger(end.pointsTeam2)?end.pointsTeam2:null
        };
      });
    let count=0;
    for(let i=0;i<rows.length;i+=50){
      const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(rows.slice(i,i+50)),signal:AbortSignal.timeout(15000)});
      if(!r.ok) throw new Error('Supabase HTTP '+r.status+': '+(await r.text()).slice(0,300));
      count+=Math.min(50,rows.length-i);
    }
    results.push({league:league.name,imported:count,ok:true});
    }catch(err){console.error('SportVYN import '+league.code,err);results.push({league:league.name,ok:false,error:String(err.message||err)});}
    }
    // Historical 90-minute results only. CSV feeds are NOT treated as a verified future fixture calendar.
    // Separate provider IDs prevent collisions with OpenLigaDB.
    const seasonCode=String(season).slice(-2)+String(season+1).slice(-2);
    function parseCsv(csv){
      const lines=csv.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
      function fields(line){const out=[];let field='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'&&quoted){field+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){out.push(field);field=''}else field+=c}out.push(field);return out}
      const columns=fields(lines.shift()).map(v=>v.trim());
      return lines.map(line=>{const values=fields(line),row={};columns.forEach((key,i)=>row[key]=(values[i]||'').trim());return row});
    }
    for(const league of [{code:'I1',name:'Serie A'},{code:'F1',name:'Ligue 1'}]){
      try{
        const source='https://www.football-data.co.uk/mmz4281/'+seasonCode+'/'+league.code+'.csv';
        const response=await fetch(source,{headers:{accept:'text/csv'},signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw Error('Football-Data HTTP '+response.status);
        const csv=await response.text(),parsed=parseCsv(csv);
        if(!parsed.length||!parsed.some(r=>r.HomeTeam&&r.AwayTeam&&r.Date))throw Error('Invalid CSV feed');
        const rows=[];
        for(const m of parsed){
          if(m.Div&&m.Div!==league.code)continue;
          if(!m.HomeTeam||!m.AwayTeam||!m.Date||!/^\d+$/.test(m.FTHG||'')||!/^\d+$/.test(m.FTAG||''))continue;
          const parts=m.Date.split('/');if(parts.length!==3)continue;
          let [day,month,yr]=parts.map(Number);if(yr<100)yr+=2000;
          if(!Number.isInteger(day)||!Number.isInteger(month)||yr<2020||day<1||day>31||month<1||month>12)continue;
          const date=new Date(Date.UTC(yr,month-1,day,12));
          if(date.getUTCFullYear()!==yr||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||date.getTime()>Date.now())continue;
          // Noon UTC represents the result's calendar date, not a verified kickoff time.
          const dateKey=[yr,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
          rows.push({provider:'football-data-co-uk',provider_match_id:[league.code,dateKey,m.HomeTeam,m.AwayTeam].join('|'),sport:'football',league:league.name,home_team:m.HomeTeam,away_team:m.AwayTeam,starts_at:date.toISOString(),status:'finished',home_score:Number(m.FTHG),away_score:Number(m.FTAG)});
        }
        if(!rows.length)throw Error('No verified completed matches in CSV');
        for(let i=0;i<rows.length;i+=50){
          const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(rows.slice(i,i+50)),signal:AbortSignal.timeout(15000)});
          if(!r.ok)throw Error('Supabase HTTP '+r.status+': '+(await r.text()).slice(0,200));
        }
        results.push({league:league.name,imported:rows.length,ok:true,source:'football-data.co.uk',historical_only:true});
      }catch(err){console.error('SportVYN historical import '+league.code,err);results.push({league:league.name,ok:false,error:String(err.message||err)});}
    }
    return res.status(results.some(r=>r.ok)?200:502).json({ok:results.every(r=>r.ok),season,results});
  } catch(e) {
    console.error('SportVYN import failed:',e);
    return res.status(502).json({error:'import_failed',detail:String(e.message||e)});
  }
};
