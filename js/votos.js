// Mapeo corporación portal → código VOTOS
var _VP_CORP_MAP={'ALCALDIA':'ALC','CONCEJO':'_CON','ASAMBLEA':'ASA','GOBERNACION':'GOB','JUNTA ADMINISTRADORAS LOCALES':'JAL','JAL':'JAL'};
var _VP_MANUAL_LS_KEY='cne_votos_partido_manual';
// Guardar voto manual en VOTOS_PARTIDO (memoria) + localStorage
function _guardarVotoManual(dpto,mun,corpCode,partido,valor){
  if(!VOTOS_PARTIDO) VOTOS_PARTIDO={};
  if(!VOTOS_PARTIDO._lookup) VOTOS_PARTIDO._lookup={};
  var lk=VOTOS_PARTIDO._lookup;
  if(!lk[dpto]) lk[dpto]={};
  if(!lk[dpto][mun]) lk[dpto][mun]={};
  if(!lk[dpto][mun][corpCode]) lk[dpto][mun][corpCode]={};
  lk[dpto][mun][corpCode][partido]=parseInt(valor)||0;
  // Guardar en localStorage como JSON
  try{
    var all=JSON.parse(localStorage.getItem(_VP_MANUAL_LS_KEY)||'{}');
    var key=dpto+'/'+mun+'/'+corpCode+'/'+partido;
    if(parseInt(valor)||0) all[key]=parseInt(valor); else delete all[key];
    localStorage.setItem(_VP_MANUAL_LS_KEY,JSON.stringify(all));
  }catch(e){}
}
// Restaurar votos manuales desde localStorage a VOTOS_PARTIDO
function _restaurarVotosManuales(){
  try{
    var all=JSON.parse(localStorage.getItem(_VP_MANUAL_LS_KEY)||'{}');
    if(!VOTOS_PARTIDO) VOTOS_PARTIDO={};
    if(!VOTOS_PARTIDO._lookup) VOTOS_PARTIDO._lookup={};
    var lk=VOTOS_PARTIDO._lookup;
    for(var k in all){
      var p=k.split('/');
      if(p.length!==4) continue;
      var d=p[0],m=p[1],c=p[2],pt=p[3];
      if(!lk[d]) lk[d]={};
      if(!lk[d][m]) lk[d][m]={};
      if(!lk[d][m][c]) lk[d][m][c]={};
      // Solo sobrescribir si no existe ya (datos automáticos tienen prioridad)
      if(!lk[d][m][c][pt]) lk[d][m][c][pt]=all[k];
    }
  }catch(e){}
}

