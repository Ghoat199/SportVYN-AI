// SportVYN AI competition registry. "planned" competitions are NOT imported or analyzed yet.
// Do not add a competition to the production import until its provider feed, season,
// result semantics, and available history have been verified.
module.exports = [
  {id:'bundesliga',name:'Bundesliga',country:'DE',provider:'openligadb',providerCode:'bl1',status:'import_configured',market:'1x2_90min'},
  {id:'zweite_bundesliga',name:'2. Bundesliga',country:'DE',provider:'openligadb',providerCode:'bl2',status:'import_configured',market:'1x2_90min'},
  {id:'dfb_pokal',name:'DFB-Pokal',country:'DE',provider:'openligadb',providerCode:'dfb',status:'import_configured',market:'1x2_90min_requires_verification'},
  {id:'premier_league',name:'Premier League',country:'EN',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'la_liga',name:'La Liga',country:'ES',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'serie_a',name:'Serie A',country:'IT',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'ligue_1',name:'Ligue 1',country:'FR',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'champions_league',name:'Champions League',country:'UEFA',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'europa_league',name:'Europa League',country:'UEFA',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'conference_league',name:'Conference League',country:'UEFA',provider:null,providerCode:null,status:'planned',market:'1x2_90min'}
];
