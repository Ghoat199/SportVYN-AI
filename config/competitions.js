// SportVYN AI competition registry. "planned" competitions are NOT imported or analyzed yet.
// Do not add a competition to the production import until its provider feed, season,
// result semantics, and available history have been verified.
module.exports = [
  {id:'bundesliga',name:'Bundesliga',country:'DE',provider:'openligadb',providerCode:'bl1',status:'import_configured',market:'1x2_90min'},
  {id:'zweite_bundesliga',name:'2. Bundesliga',country:'DE',provider:'openligadb',providerCode:'bl2',status:'import_configured',market:'1x2_90min'},
  {id:'dfb_pokal',name:'DFB-Pokal',country:'DE',provider:'openligadb',providerCode:'dfb',status:'import_configured',market:'1x2_90min_requires_verification'},
  {id:'premier_league',name:'Premier League',country:'EN',provider:'openligadb',providerCode:'pl',status:'feed_identified',market:'1x2_90min'},
  {id:'la_liga',name:'La Liga',country:'ES',provider:'openligadb',providerCode:'la1',status:'feed_identified',market:'1x2_90min'},
  {id:'serie_a',name:'Serie A',country:'IT',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'ligue_1',name:'Ligue 1',country:'FR',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'eredivisie',name:'Eredivisie',country:'NL',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'primeira_liga',name:'Primeira Liga',country:'PT',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'super_lig',name:'Süper Lig',country:'TR',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'dritte_liga',name:'3. Liga',country:'DE',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'belgian_pro_league',name:'Belgian Pro League',country:'BE',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'swiss_super_league',name:'Swiss Super League',country:'CH',provider:null,providerCode:null,status:'planned',market:'1x2_90min'},
  {id:'champions_league',name:'Champions League',country:'UEFA',provider:'openligadb',providerCode:'ucl',status:'feed_verified',market:'1x2_90min'},
  {id:'europa_league',name:'Europa League',country:'UEFA',provider:'openligadb',providerCode:'uel2026',status:'feed_verified',market:'1x2_90min'},
  {id:'conference_league',name:'Conference League',country:'UEFA',provider:'openligadb',providerCode:'uecl2026',status:'feed_verified',market:'1x2_90min'}
];
