// ─── PASO 6: TRANSACCIONES ────────────────────────────────────────────────
// Deriva la URL del archivo de transacciones aunque tx_url esté vacío en el JSON
function txUrlFor(c){
  if(c.tx_url) return 'data/'+c.tx_url;
  var folderMap={
    'ALCALDIA':'ALCALDIA_FUN','ASAMBLEA':'ASAMBLEA',
    'CONCEJO':'CONCEJO','GOBERNACION':'GOBERNACION'
  };
  var _rawCargo=c.cargo||'';
  if(!_rawCargo){try{_rawCargo=document.getElementById('selCorp').value||'';}catch(e){}}
  var cargoUp=_rawCargo.toUpperCase().trim();
  if(cargoUp.indexOf('JUNTA')!==-1) cargoUp='JAL';
  var folder=folderMap[cargoUp]||null;
  if(!folder) return null;
  return 'data/transacciones/'+folder+'/'+c.id+'.json';
}

// ── Función centralizada: contar candidatos del partido desde CC ──
function _contarCandPartidoCC(cargo, partido){
  var n=0;
  if(_ccCandsMun&&_ccCandsMun.length){
    var cN=norm(cargo||'');
    var corpId=cN.indexOf('ALCALD')!==-1?3:cN.indexOf('CONCEJ')!==-1?6:
      cN.indexOf('ASAMBLEA')!==-1||cN.indexOf('DIPUTA')!==-1?5:2;
    var pN=norm(partido||'');
    _ccCandsMun.forEach(function(cc){
      if(corpId&&cc.corp_id!==corpId) return;
      if(pN&&norm(cc.org||'').indexOf(pN)>=0) n++;
    });
  }
  if(!n){
    var pl=(partido||'').toLowerCase().trim();
    if(CANDIDATOS){for(var x in CANDIDATOS){if((CANDIDATOS[x].partido||'').toLowerCase().trim()===pl)n++;}}
  }
  return Math.max(n,1);
}

function _topeInd6(){
  var c=CAND_SELEC;
  var tot=buscarTopeTotal(c.cargo,c.poblacion||0);
  if(!tot) return null;
  var n=_contarCandPartidoCC(c.cargo, c.partido);
  return Math.round(tot/n*100)/100;
}

var _FI_MANUAL_LS_KEY='cne_fecha_insc_manual';
function guardarFechaInsc(id, val){
  try{
    var c=CAND_SELEC;
    var filtroKey=c?_getFechaInscFiltroKey(c):('cne_fecha_insc_'+id);
    if(val){ localStorage.setItem(filtroKey,val); localStorage.setItem('cne_fecha_insc_'+id,val); }
    else { localStorage.removeItem(filtroKey); localStorage.removeItem('cne_fecha_insc_'+id); }
    // Persistir en FECHA_INSC_CARGUE (memoria) + localStorage estructurado
    if(c){
      var corp=_normCorpCatalogo(c.cargo||'');
      var dpto=norm(c.departamento||'');
      var mun=(corp==='ASAMBLEA'||corp==='GOBERNACION')?'_DPTO_':norm(c.municipio||'');
      var fiKey=dpto+'/'+mun+'/'+corp;
      if(!FECHA_INSC_CARGUE) FECHA_INSC_CARGUE={};
      if(val) FECHA_INSC_CARGUE[fiKey]=val; else delete FECHA_INSC_CARGUE[fiKey];
      // Guardar todas las fechas manuales en un solo localStorage key
      var all=JSON.parse(localStorage.getItem(_FI_MANUAL_LS_KEY)||'{}');
      if(val) all[fiKey]=val; else delete all[fiKey];
      localStorage.setItem(_FI_MANUAL_LS_KEY,JSON.stringify(all));
    }
  }catch(e){}
  if(TX_CACHE[id]) renderPaso6();  // re-render con nueva fecha (datos ya en caché)
}

function _headerPaso6(c, fechaInsc, topeInd, fiFuente){
  var fnfpUrl=c.fnfp_url||'https://app.cne.gov.co/fnfp';
  var _fiBadge=fiFuente==='cargue'?' <span class="badge bg-success ms-1" style="font-size:.6rem" title="Extraído automáticamente del Formulario E6 (catálogo de cargue)"><i class="fa fa-database me-1"></i>Formulario E6</span>':'';
  var infoFecha=fechaInsc
    ?'Inscripción: <strong>'+fechaInsc+'</strong>'+_fiBadge+' · Elecciones: <strong>29 Oct 2023</strong>'
    :'<span class="text-warning fw-semibold"><i class="fa fa-exclamation-triangle me-1"></i>Ingrese fecha de inscripción para análisis Art.34</span>';
  var topeHtml=topeInd
    ?'<span class="badge bg-dark me-1" title="Tope individual de campaña">Tope: '+fmtCOP(topeInd)+'</span>'+
      '<span class="badge bg-info text-dark" title="Límite donación individual Art.23 (10% del tope)">10% Art.23: '+fmtCOP(Math.round(topeInd*0.10))+'</span>'
    :'<span class="badge bg-secondary">Tope: N/D</span>';

  // Libro contable del candidato (de ingresos_gastos via IG_INDEX)
  var d6=_normFNFP(c.departamento), m6=_normFNFP(c.municipio), p6=_normFNFP(c.partido);
  var _r9bE6=R9B_INDEX?R9B_INDEX[d6+'/'+m6+'/'+p6]:null;
  if(!_r9bE6&&R9B_INDEX){ for(var _k6 in R9B_INDEX){ if(_k6.indexOf(d6+'/'+m6+'/')===0&&_k6.substring(_k6.lastIndexOf('/')+1)===p6){_r9bE6=R9B_INDEX[_k6];break;} } }
  var _r9bD6=_r9bE6?_r9bE6.d:d6, _r9bM6=_r9bE6?_r9bE6.mu:m6, _r9bPF6=_r9bE6?_r9bE6.pf:p6;
  var r9bBase='data/fnfp/reporte_9b/'+_r9bD6+'/'+_r9bM6+'/'+encodeURIComponent(_r9bPF6)+'/';
  var igMatch=IG_INDEX?_igMatchPartido(c.id, c.partido):null;
  var libroBase=igMatch?igMatch.base:'';
  var libroHtml='<div class="card card-body py-2 mb-2 bg-light border-secondary">'+
    '<div class="small fw-semibold mb-1"><i class="fa fa-book me-1"></i>Libro Contable</div>'+
    '<div class="d-flex flex-wrap gap-2">';
  if(libroBase){
    libroHtml+='<a href="'+_encodePath(libroBase+'/libro_contable.pdf')+'" target="_blank" class="btn btn-sm btn-outline-primary">'+
      '<i class="fa fa-file-pdf me-1"></i>Libro Contable (PDF)</a>'+
      '<a href="'+_encodePath(libroBase+'/libro_contable.xlsx')+'" target="_blank" class="btn btn-sm btn-outline-success">'+
      '<i class="fa fa-file-excel me-1"></i>Libro Contable (Excel)</a>';
  } else {
    libroHtml+='<a href="'+_encodePath(r9bBase+'libro_contable_partido.pdf')+'" target="_blank" class="btn btn-sm btn-outline-primary">'+
      '<i class="fa fa-file-pdf me-1"></i>Libro Contable (PDF)</a>'+
      '<a href="'+_encodePath(r9bBase+'libro_contable_partido.xlsx')+'" target="_blank" class="btn btn-sm btn-outline-success">'+
      '<i class="fa fa-file-excel me-1"></i>Libro Contable (Excel)</a>';
  }
  libroHtml+='<a href="'+_encodePath(r9bBase+'obligaciones/')+'" target="_blank" class="btn btn-sm btn-outline-secondary">'+
    '<i class="fa fa-folder-open me-1"></i>Obligaciones</a>'+
    '</div></div>';

  return '<h5 class="fw-bold text-success mb-3 border-bottom pb-2"><i class="fa fa-exchange-alt me-2"></i>INGRESOS Y GASTOS</h5>'+
    '<div class="d-flex flex-wrap gap-2 align-items-center mb-2">'+
    topeHtml+
    '<button class="btn btn-sm btn-outline-success" onclick="descargarTxExcel()"><i class="fa fa-file-excel me-1"></i>Descargar Excel</button>'+
    '</div>'+
    libroHtml+
    '<div class="card card-body py-2 mb-3 bg-light border-primary">'+
    '<div class="d-flex align-items-center gap-3 flex-wrap">'+
    '<div><label class="form-label mb-1 fw-semibold small text-primary"><i class="fa fa-calendar-check me-1"></i>Fecha inscripción lista/candidato</label>'+
    '<input type="date" id="inputFechaInsc" class="form-control form-control-sm" style="width:170px" value="'+(fechaInsc||'2023-07-01')+'" '+
    'onchange="guardarFechaInsc(\''+c.id+'\',this.value)" '+
    'title="Fecha de inscripción de la lista. Antes → ANTES INSCRIPCIÓN; después del 29-Oct-2023 → POST ELECTORAL; entre ambas → EN TÉRMINO"></div>'+
    '<div class="small">'+infoFecha+'</div>'+
    '</div></div>';
}

// ── VISOR_INDEX: archivos E6/E7/E8 del visor CNE ──
function _cargarVisorIndex(cb){
  if(VISOR_INDEX!==null) return cb();
  fetch('data/visor_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function(d){ VISOR_INDEX=d; cb(); })
    .catch(function(){ VISOR_INDEX={}; cb(); });
}
function _cargarVisorMapeo(cb){
  if(VISOR_MAPEO!==null) return cb();
  fetch('data/visor_mapeo.json').then(function(r){
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function(d){ VISOR_MAPEO=d; cb(); })
    .catch(function(){ VISOR_MAPEO={}; cb(); });
}
// Dept name → visor dept_id mapping
var _VISOR_DEPT={
  'AMAZONAS':'60','ANTIOQUIA':'01','ATLANTICO':'03','BOLIVAR':'05','BOYACA':'07',
  'CALDAS':'09','CAUCA':'11','CESAR':'12','CHOCO':'17','CORDOBA':'13',
  'CUNDINAMARCA':'15','BOGOTA':'16','HUILA':'19','MAGDALENA':'21','NARINO':'23',
  'NORTE DE SANTANDER':'25','QUINDIO':'26','RISARALDA':'24','SANTANDER':'27',
  'SUCRE':'28','TOLIMA':'29','VALLE DEL CAUCA':'31','ARAUCA':'40','CAQUETA':'44',
  'CASANARE':'46','LA GUAJIRA':'48','GUAINIA':'50','META':'52','GUAVIARE':'54',
  'SAN ANDRES':'56','PUTUMAYO':'64','VAUPES':'68','VICHADA':'72'
};
// Cargo name → visor cargo codes
var _VISOR_CARGO={'CONCEJO':['_CON','CON'],'JAL':['JAL','_JAL'],'ALCALDIA':['ALC','_ALC'],'GOBERNACION':['GOB','_GOB'],'ASAMBLEA':['ASA','_ASA']};

// ── VISOR_DOCS_SLIM: índice ligero de visor_docs.json por dept/mun/corp/partido ──
function _cargarVisorDocSlim(cb){
  if(VISOR_DOCS_SLIM!==null) return cb();
  fetch('data/visor_docs_slim.json').then(function(r){
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function(d){ VISOR_DOCS_SLIM=d; cb(); })
    .catch(function(){ VISOR_DOCS_SLIM={}; cb(); });
}

function _cargarInscripcionesIndex(cb){
  if(INSCRIPCIONES_INDEX!==null) return cb();
  fetch('data/inscripciones_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function(d){ INSCRIPCIONES_INDEX=d; cb(); })
    .catch(function(){ INSCRIPCIONES_INDEX={}; cb(); });
}
function _cargarFechaInscCargue(cb){
  if(FECHA_INSC_CARGUE!==null) return cb();
  fetch('data/fecha_inscripcion_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function(d){ FECHA_INSC_CARGUE=d; _restaurarFechasInscManuales(); cb(); })
    .catch(function(){ FECHA_INSC_CARGUE={}; _restaurarFechasInscManuales(); cb(); });
}
// Restaurar fechas manuales desde localStorage a FECHA_INSC_CARGUE
function _restaurarFechasInscManuales(){
  try{
    var all=JSON.parse(localStorage.getItem(_FI_MANUAL_LS_KEY)||'{}');
    if(!FECHA_INSC_CARGUE) FECHA_INSC_CARGUE={};
    for(var k in all){
      // Fechas manuales complementan al catálogo (no sobrescriben datos automáticos)
      if(!FECHA_INSC_CARGUE[k]) FECHA_INSC_CARGUE[k]=all[k];
    }
  }catch(e){}
}
// Genera clave filtro para localStorage: nivel corp+dpto+mun (todos los candidatos del filtro)
function _getFechaInscFiltroKey(c){
  var corp=_normCargoDict(c.cargo||''), dpto=norm(c.departamento||''), mun=norm(c.municipio||'');
  return 'cne_fi_'+corp+'_'+dpto+'_'+(mun||'_DPTO_');
}
// Corp -> clave del catálogo CNE (ALCALDIA, CONCEJO, ASAMBLEA, GOBERNACION, JAL)
function _normCorpCatalogo(cargo){
  var c=norm(cargo||'');
  if(c.indexOf('ALCALD')!==-1) return 'ALCALDIA';
  if(c.indexOf('CONCEJ')!==-1) return 'CONCEJO';
  if(c.indexOf('ASAMBLEA')!==-1||c.indexOf('DIPUTA')!==-1) return 'ASAMBLEA';
  if(c.indexOf('JAL')!==-1||c.indexOf('JUNTA')!==-1) return 'JAL';
  return 'GOBERNACION';
}
// Busca fecha de inscripción en FECHA_INSC_CARGUE (E6 del catálogo) para el candidato actual
function _lookupFechaInscCargue(c){
  if(!FECHA_INSC_CARGUE||!c) return '';
  var _rawCargo=c.cargo||'', _rawDpto=c.departamento||'', _rawMun=c.municipio||'';
  if(!_rawCargo||!_rawDpto){try{_rawCargo=_rawCargo||document.getElementById('selCorp').value||'';_rawDpto=_rawDpto||document.getElementById('selDpto').value||'';_rawMun=_rawMun||document.getElementById('selMun').value||'';}catch(e){}}
  var corp=_normCorpCatalogo(_rawCargo);
  var dpto=norm(_rawDpto);
  var mun=(corp==='ASAMBLEA'||corp==='GOBERNACION')?'_DPTO_':norm(_rawMun);
  var key=dpto+'/'+mun+'/'+corp;
  // Buscar con partido (filtro paso 1) primero, luego general
  var _partido='';
  try{_partido=c.partido?norm(c.partido):norm(document.getElementById('selPartido').value||'');}catch(e){}
  if(_partido){
    var keyP=key+'/'+_partido;
    if(FECHA_INSC_CARGUE[keyP]) return FECHA_INSC_CARGUE[keyP];
  }
  return FECHA_INSC_CARGUE[key]||'';
}

/** Buscar fecha de inscripción de la lista/candidato.
 *  c: objeto candidato con .departamento, .municipio, .cargo, .partido
 *  Retorna "YYYY-MM-DD" o '' si no se encuentra.
 */
function _buscarFechaInscripcion(c){
  if(!c) return '';
  var _catFallback=_lookupFechaInscCargue(c);
  if(!INSCRIPCIONES_INDEX) return _catFallback;
  var dN=norm(c.departamento||''), mN=norm(c.municipio||'');
  var cargo=String(c.cargo||'').toUpperCase().replace(/\s+/g,' ').trim();
  // Normalizar cargo
  if(cargo.indexOf('ALCALD')>=0) cargo='ALCALDIA';
  else if(cargo.indexOf('GOBERN')>=0) cargo='GOBERNACION';
  else if(cargo.indexOf('ASAMB')>=0) cargo='ASAMBLEA';
  else if(cargo.indexOf('CONCEJ')>=0) cargo='CONCEJO';
  else if(cargo.indexOf('JAL')>=0||cargo.indexOf('JUNTA')>=0) cargo='JAL';
  // Para cargos departamentales, mun = _DPTO
  var mKey=(cargo==='ASAMBLEA'||cargo==='GOBERNACION')?'_DPTO':mN;
  var pN=norm(c.partido||'');
  // Buscar departamento (fuzzy)
  var dData=null;
  for(var dk in INSCRIPCIONES_INDEX){
    if(norm(dk)===dN){ dData=INSCRIPCIONES_INDEX[dk]; break; }
  }
  if(!dData) return _catFallback;
  // Buscar municipio
  var mData=null;
  for(var mk in dData){
    if(norm(mk)===mKey){ mData=dData[mk]; break; }
  }
  if(!mData) return _catFallback;
  // Buscar cargo
  var cData=mData[cargo];
  if(!cData) return _catFallback;
  // Buscar partido: exact match
  for(var pk in cData){
    if(norm(pk)===pN) return cData[pk];
  }
  // Fuzzy: contains (either direction)
  for(var pk in cData){
    var npk=norm(pk);
    if(npk.indexOf(pN)!==-1||pN.indexOf(npk)!==-1) return cData[pk];
  }
  return _catFallback;
}

// ── Filtrar visor_index (archivos locales del catálogo de cargue) ──
function _filterVisorIndex(dptoVal, munVal, corpVal, candsFiltrados){
  var dNorm=(dptoVal||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var visorDept=_VISOR_DEPT[dNorm]||'';
  if(!visorDept){
    for(var vk in _VISOR_DEPT){ if(dNorm.indexOf(vk)!==-1||vk.indexOf(dNorm)!==-1){ visorDept=_VISOR_DEPT[vk]; break; } }
  }
  var deptData=visorDept?VISOR_INDEX[visorDept]:null;
  if(!deptData) return {fileCount:0,html:''};
  var corpNorm=corpVal.toUpperCase().replace(/[^A-Z]/g,'');
  var cargoCodes=[];
  for(var ck in _VISOR_CARGO){ if(corpNorm.indexOf(ck)!==-1||ck.indexOf(corpNorm)!==-1) cargoCodes=_VISOR_CARGO[ck]; }
  var munNorm=(munVal||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,'').trim();
  var filteredMuns=null;
  var isDpto=!munVal||munVal.toLowerCase()==='dpto'||munVal===document.getElementById('selDpto').value;
  if(munNorm && !isDpto && VISOR_MAPEO && VISOR_MAPEO[visorDept]){
    var mapDept=VISOR_MAPEO[visorDept]; filteredMuns=[];
    for(var mc in mapDept){
      if(mc==='_dept_nombre') continue;
      var mnVal=(mapDept[mc]||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,'').trim();
      if(mnVal.indexOf(munNorm)!==-1||munNorm.indexOf(mnVal)!==-1) filteredMuns.push(mc);
    }
    if(!filteredMuns.length) filteredMuns=[];  // No match → mostrar vacío, NO todo
  }
  // Filtro por partido: obtener groupIds permitidos desde candsFiltrados
  var _vGrps=VISOR_INDEX._groups||{};
  var _allowGids=null;
  if(candsFiltrados&&candsFiltrados.length){
    var _pSet={};
    candsFiltrados.forEach(function(cx){ var p=norm(cx.partido||''); if(p) _pSet[p]=1; });
    if(Object.keys(_pSet).length){
      _allowGids=[];
      for(var _gk in _vGrps){
        var _gN=norm(_vGrps[_gk]);
        for(var _pn in _pSet){ if(_gN===_pn){ _allowGids.push(parseInt(_gk)); break; } }
      }
    }
  }
  var _VBC={'E6':'bg-primary','E7':'bg-info','E8':'bg-success','AVAL':'bg-warning text-dark','CC':'bg-secondary','OMD':'bg-dark','REN':'bg-danger','EIS':'bg-info','XLS':'bg-success'};
  var groups={'E6':[],'E7':[],'E8':[],'AVAL':[],'CC':[],'OMD':[],'REN':[],'EIS':[],'_OTHER':[]};
  var fileCount=0;
  for(var munCode in deptData){
    if(munCode==='_nombre') continue;
    if(filteredMuns && filteredMuns.indexOf(munCode)===-1) continue;
    var munData2=deptData[munCode];
    for(var parCode in munData2){
      var parData2=munData2[parCode];
      for(var carCode in parData2){
        var carInfo=parData2[carCode];
        if(!carInfo||!carInfo.archivos) continue;
        if(cargoCodes.length && cargoCodes.indexOf(carCode)===-1) continue;
        var archivos=carInfo.archivos;
        for(var ai=0;ai<archivos.length;ai++){
          var ar=archivos[ai];
          if(_allowGids&&ar.g!==undefined&&_allowGids.indexOf(ar.g)===-1) continue;
          var localUrl='vsr/'+visorDept+'/'+munCode+'/'+parCode+'/'+carCode+'/'+encodeURIComponent(ar.f);
          var gk=(ar.e&&groups[ar.e])?ar.e:'_OTHER';
          groups[gk].push({url:localUrl,ar:ar,cargo:carCode});
          fileCount++;
        }
      }
    }
  }
  var hV='';
  if(fileCount>0){
    var gOrder=['E6','E7','E8','AVAL','CC','OMD','REN','EIS','_OTHER'];
    var gLabels={'E6':'Formulario E-6','E7':'Formulario E-7','E8':'Formulario E-8','AVAL':'Avales','CC':'Cédulas','OMD':'OMD','REN':'Renuncias','EIS':'Código EIS','_OTHER':'Otros documentos'};
    for(var gi=0;gi<gOrder.length;gi++){
      var gk2=gOrder[gi];
      if(!groups[gk2]||!groups[gk2].length) continue;
      var badgeCls=_VBC[gk2]||'bg-secondary';
      hV+='<div class="mt-1 mb-1"><span class="badge '+badgeCls+' me-1">'+gk2.replace('_OTHER','')+'</span><span class="small fw-semibold">'+(gLabels[gk2]||gk2)+' ('+groups[gk2].length+')</span></div>';
      hV+='<div class="d-flex gap-1 flex-wrap mb-1">';
      for(var fi=0;fi<groups[gk2].length;fi++){
        var item=groups[gk2][fi];
        var icon2=item.ar.t==='pdf'?'fa-file-pdf text-danger':item.ar.t==='img'?'fa-image text-info':item.ar.t==='xls'?'fa-file-excel text-success':'fa-file text-secondary';
        var cargoTag=item.cargo?'<span class="badge bg-light text-dark border me-1" style="font-size:.6rem">'+item.cargo+'</span>':'';
        hV+='<a href="'+item.url+'" target="_blank" class="btn btn-sm btn-outline-secondary mb-1" title="'+esc(item.ar.f)+'">'+
          cargoTag+'<i class="fa '+icon2+' me-1"></i>'+esc(item.ar.f.length>35?item.ar.f.substring(0,32)+'...':item.ar.f)+'</a>';
      }
      hV+='</div>';
    }
  }
  return {fileCount:fileCount,html:hV};
}

// ── Filtrar visor_docs_slim por dept+mun+corp + partidos de candidatos filtrados ──
function _filterVisorDocs(dptoVal, munVal, corpVal, resultados, isDpto){
  if(!VISOR_DOCS_SLIM||!Object.keys(VISOR_DOCS_SLIM).length) return {groupCount:0,docCount:0,html:''};
  var dNorm=norm(dptoVal);
  var mNorm=isDpto?dNorm:norm(munVal);
  // Mapear corporación a códigos visor_docs
  var corpNorm=corpVal.toUpperCase().replace(/[^A-Z]/g,'');
  var visorCorps=[];
  if(corpNorm.indexOf('CONCEJO')!==-1) visorCorps=['CON','_CON'];
  else if(corpNorm.indexOf('ALCALD')!==-1) visorCorps=['ALC','_ALC'];
  else if(corpNorm.indexOf('ASAMBLEA')!==-1) visorCorps=['ASA','_ASA'];
  else if(corpNorm.indexOf('GOBERNAC')!==-1) visorCorps=['GOB','_GOB'];
  else if(corpNorm.indexOf('JAL')!==-1||corpNorm.indexOf('JUNTA')!==-1) visorCorps=['JAL','_JAL'];
  // Recoger partidos únicos de candidatos filtrados
  var candPartyKeys={};
  resultados.forEach(function(c){ var pk=_alphaKey(c.partido); if(pk) candPartyKeys[pk]=c.partido; });
  var partyKeyList=Object.keys(candPartyKeys);
  // Buscar departamento en slim
  var deptData=null;
  if(VISOR_DOCS_SLIM[dNorm]) deptData=VISOR_DOCS_SLIM[dNorm];
  else { for(var dk in VISOR_DOCS_SLIM){ if(dk.indexOf(dNorm)!==-1||dNorm.indexOf(dk)!==-1){ deptData=VISOR_DOCS_SLIM[dk]; break; } } }
  if(!deptData) return {groupCount:0,docCount:0,html:''};
  // Buscar municipio
  var munData=null;
  if(deptData[mNorm]) munData=deptData[mNorm];
  else { for(var mk in deptData){ if(mk.indexOf(mNorm)!==-1||mNorm.indexOf(mk)!==-1){ munData=deptData[mk]; break; } } }
  if(!munData) return {groupCount:0,docCount:0,html:''};
  // Recoger grupos que matcheen corp + partido
  var matched=[];
  for(var ci=0;ci<visorCorps.length;ci++){
    var vc=visorCorps[ci];
    if(!munData[vc]) continue;
    var groups=munData[vc];
    for(var gi=0;gi<groups.length;gi++){
      var grp=groups[gi];
      var partyMatch=false;
      if(partyKeyList.length===0){ partyMatch=true; }
      else {
        // grp.k viene del Python (con espacios), _alphaKey quita espacios → normalizar ambos
        var gKey=_alphaKey(grp.k||grp.g||'');
        for(var pi=0;pi<partyKeyList.length;pi++){
          if(gKey===partyKeyList[pi]||gKey.indexOf(partyKeyList[pi])!==-1||partyKeyList[pi].indexOf(gKey)!==-1){ partyMatch=true; break; }
        }
      }
      if(partyMatch) matched.push({g:grp.g,gid:grp.gid,t:grp.t,c:grp.c,corp:vc});
    }
  }
  if(!matched.length) return {groupCount:0,docCount:0,html:''};
  // Agrupar por partido y renderizar
  var byParty={}, totalDocs=0;
  matched.forEach(function(mg){
    var pk=_alphaKey(mg.g);
    if(!byParty[pk]) byParty[pk]={name:mg.g,groups:[],totalDocs:0};
    byParty[pk].groups.push(mg);
    byParty[pk].totalDocs+=mg.t;
    totalDocs+=mg.t;
  });
  var hV='';
  Object.keys(byParty).sort().forEach(function(pk){
    var entry=byParty[pk];
    hV+='<div class="mt-1 mb-1">';
    hV+='<span class="badge bg-info text-dark me-1">'+esc(entry.name.length>45?entry.name.substring(0,42)+'...':entry.name)+'</span>';
    hV+='<span class="small text-muted">'+entry.totalDocs+' documentos</span>';
    hV+='<div class="d-flex gap-1 flex-wrap mt-1">';
    entry.groups.forEach(function(mg){
      var c=mg.c||{};
      var badges='';
      if(c.E6) badges+='<span class="badge bg-primary me-1">E6:'+c.E6+'</span>';
      if(c.E7) badges+='<span class="badge bg-info me-1">E7:'+c.E7+'</span>';
      if(c.E8) badges+='<span class="badge bg-success me-1">E8:'+c.E8+'</span>';
      var ot=(mg.t||0)-(c.E6||0)-(c.E7||0)-(c.E8||0);
      if(ot>0) badges+='<span class="badge bg-secondary me-1">Otros:'+ot+'</span>';
      hV+='<div class="btn btn-sm btn-outline-info mb-1" title="GID: '+mg.gid+'">';
      hV+='<span class="small text-muted me-1">['+mg.corp+']</span>'+badges;
      hV+='<span class="small ms-1">'+mg.t+' docs</span>';
      hV+='</div>';
    });
    hV+='</div></div>';
  });
  return {groupCount:matched.length,docCount:totalDocs,html:hV};
}

// ── Renderizar PDFs inline del visor: E6, E7, E8 + Acuerdo ──
function _renderVisorPDFsInline(elPDFs, dptoVal, munVal, corpVal, candsFiltrados){
  if(!elPDFs) return;
  if(!VISOR_INDEX||!Object.keys(VISOR_INDEX).length){
    elPDFs.innerHTML='<span class="text-muted small">Sin datos del visor</span>'; return;
  }
  // Mapear dept → visor_id (mismo lógica que _filterVisorIndex)
  var dNorm=(dptoVal||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var visorDept=_VISOR_DEPT[dNorm]||'';
  if(!visorDept){ for(var vk in _VISOR_DEPT){ if(dNorm.indexOf(vk)!==-1||vk.indexOf(dNorm)!==-1){ visorDept=_VISOR_DEPT[vk]; break; } } }
  var deptData=visorDept?VISOR_INDEX[visorDept]:null;
  if(!deptData){ elPDFs.innerHTML='<span class="text-muted small">Dept no encontrado en visor</span>'; return; }
  // Corp → cargo codes
  var corpNorm=corpVal.toUpperCase().replace(/[^A-Z]/g,'');
  var cargoCodes=[];
  for(var ck in _VISOR_CARGO){ if(corpNorm.indexOf(ck)!==-1||ck.indexOf(corpNorm)!==-1) cargoCodes=_VISOR_CARGO[ck]; }
  // Municipio filter
  var munNorm=(munVal||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,'').trim();
  var isDpto=!munVal||munVal===document.getElementById('selDpto').value;
  var filteredMuns=null;
  if(munNorm && !isDpto && VISOR_MAPEO && VISOR_MAPEO[visorDept]){
    var mapDept=VISOR_MAPEO[visorDept]; filteredMuns=[];
    for(var mc in mapDept){ if(mc==='_dept_nombre') continue;
      var mnVal=(mapDept[mc]||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,'').trim();
      if(mnVal.indexOf(munNorm)!==-1||munNorm.indexOf(mnVal)!==-1) filteredMuns.push(mc);
    }
    if(!filteredMuns.length) filteredMuns=[];
  }
  // Partido filter: match groupIds from candidates
  var _vGroups=VISOR_INDEX._groups||{};
  var allowedGids=[];
  var selPartidoName='';
  if(candsFiltrados&&candsFiltrados.length){
    var pNames={};
    candsFiltrados.forEach(function(cx){
      var p=norm(cx.partido||'');
      if(p){ pNames[p]=1; if(!selPartidoName) selPartidoName=cx.partido; }
    });
    for(var gk in _vGroups){
      var gNorm=norm(_vGroups[gk]);
      for(var pn in pNames){
        if(gNorm===pn){ allowedGids.push(parseInt(gk)); break; }
      }
    }
  }
  // Recoger E6/E7/E8 SOLO del partido seleccionado
  var matchPdfs=[], otherCount=0;
  for(var munCode in deptData){
    if(munCode==='_nombre') continue;
    if(filteredMuns && filteredMuns.indexOf(munCode)===-1) continue;
    var munData2=deptData[munCode];
    for(var parCode in munData2){
      var parData2=munData2[parCode];
      for(var carCode in parData2){
        if(cargoCodes.length && cargoCodes.indexOf(carCode)===-1) continue;
        var carInfo=parData2[carCode];
        if(!carInfo||!carInfo.archivos) continue;
        for(var ai=0;ai<carInfo.archivos.length;ai++){
          var ar=carInfo.archivos[ai];
          if(ar.e==='E6'||ar.e==='E7'||ar.e==='E8'){
            var isMatch=allowedGids.length>0&&ar.g!==undefined&&allowedGids.indexOf(ar.g)!==-1;
            if(isMatch){
              var url='vsr/'+visorDept+'/'+munCode+'/'+parCode+'/'+carCode+'/'+encodeURIComponent(ar.f);
              matchPdfs.push({url:url, name:ar.f, e:ar.e});
            } else { otherCount++; }
          }
        }
      }
    }
  }
  matchPdfs.sort(function(a,b){ return a.e<b.e?-1:a.e>b.e?1:0; });
  // Buscar acuerdo de coalición
  var acuerdoUrl=null, acuerdoName='';
  var coalMatch=null;
  candsFiltrados.forEach(function(cx){ if(!coalMatch) coalMatch=_findCoalicion(cx); });
  if(coalMatch && COAL_ACUERDOS_INDEX){
    var dN=norm(dptoVal), mN=norm(munVal||''), cN=corpVal;
    var acKey=dN+'/'+(mN||'_DPTO_')+'/'+cN;
    var entries=COAL_ACUERDOS_INDEX[acKey];
    if(entries&&entries.length){
      var match=entries[0];
      acuerdoUrl='data/fnfp/coalicion/acuerdos/'+match.groupId+'.pdf';
      acuerdoName=match.docs&&match.docs[0]?match.docs[0].name:'Acuerdo.pdf';
    }
  }
  // Renderizar
  var h='', idCounter=0;
  var _EBC={'E6':'bg-primary','E7':'bg-info','E8':'bg-success'};
  function addPdf(label,badge,url,name){
    var id='vPdf'+(idCounter++);
    h+='<div class="mb-2 border rounded p-2">';
    h+='<div class="d-flex align-items-center gap-2 mb-1 flex-wrap">';
    h+='<span class="badge '+badge+'">'+label+'</span>';
    h+='<span class="small text-truncate" style="max-width:300px" title="'+esc(name)+'">'+esc(name.length>45?name.substring(0,42)+'...':name)+'</span>';
    h+='<a href="'+url+'" target="_blank" class="btn btn-sm btn-outline-danger py-0"><i class="fa fa-external-link-alt"></i></a>';
    h+='<button class="btn btn-sm btn-outline-dark py-0" onclick="var e=document.getElementById(\''+id+'\');if(e.style.display===\'none\'){e.src=\''+url+'\';e.style.display=\'block\';this.innerHTML=\'<i class=fa fa-eye-slash></i> Ocultar\';}else{e.style.display=\'none\';e.src=\'\';this.innerHTML=\'<i class=fa fa-eye></i> Ver\';}"><i class="fa fa-eye"></i> Ver</button>';
    h+='</div>';
    h+='<embed id="'+id+'" src="" type="application/pdf" style="width:100%;height:500px;border:1px solid #dee2e6;border-radius:4px;display:none">';
    h+='</div>';
  }
  // Acuerdo primero
  if(acuerdoUrl) addPdf('ACUERDO','bg-warning text-dark',acuerdoUrl,acuerdoName);
  // E6/E7/E8 del partido
  matchPdfs.forEach(function(item){ addPdf(item.e,_EBC[item.e]||'bg-secondary',item.url,item.name); });
  // Mensaje si no hay archivos del partido
  if(!matchPdfs.length&&!acuerdoUrl){
    var pShort=selPartidoName?esc(selPartidoName.substring(0,40)):'partido seleccionado';
    h='<span class="text-muted small"><i class="fa fa-info-circle me-1"></i>No hay E6/E7/E8 descargados del visor para <b>'+pShort+'</b>';
    if(otherCount>0) h+=' (hay '+otherCount+' de otros partidos en carpeta local)';
    h+='</span>';
  }
  elPDFs.innerHTML=h;
}
// ── Renderizar visor combinado: Catálogo + Visor 2023 (Dictamen se renderiza aparte) ──
function _renderVisorCombined(elE, dptoVal, munVal, corpVal, resultados){
  var dN0=_normFNFP(dptoVal);
  var mN0=_normFNFP(munVal);
  var isDpto=_esDepartamental(corpVal);
  // ── Catálogo local ──
  var hLocal='';
  if(VISOR_INDEX&&Object.keys(VISOR_INDEX).length){
    var lr=_filterVisorIndex(dptoVal, munVal, corpVal, resultados);
    if(lr.fileCount>0){
      hLocal+='<div class="mt-2 mb-1"><span class="badge bg-secondary me-1">CATALOGO</span>';
      hLocal+='<span class="small fw-semibold">Archivos del Catálogo de Cargue ('+lr.fileCount+')</span></div>';
      hLocal+=lr.html;
    }
  }
  // ── Visor 2023 ──
  var hVisor='';
  if(VISOR_DOCS_SLIM&&Object.keys(VISOR_DOCS_SLIM).length){
    var vr=_filterVisorDocs(dptoVal, munVal, corpVal, resultados, isDpto);
    if(vr.groupCount>0){
      hVisor+='<div class="mt-2 mb-1"><span class="badge bg-primary me-1">VISOR 2023</span>';
      hVisor+='<span class="small fw-semibold">Documentos del Visor ('+vr.docCount+' docs en '+vr.groupCount+' inscripciones)</span></div>';
      hVisor+=vr.html;
    } else {
      hVisor+='<div class="small text-muted mt-1"><i class="fa fa-info-circle me-1"></i>No se encontraron documentos del Visor 2023 para los partidos filtrados</div>';
    }
  }
  elE.innerHTML=hLocal+hVisor;
}

// ── IG_INDEX: mapeo PDFs locales ingresos/gastos ──
function _cargarIGIndex(cb){
  if(IG_INDEX!==null) return cb();
  fetch('data/fnfp/ig_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function(d){ IG_INDEX=d; cb(); })
    .catch(function(){ IG_INDEX={}; cb(); });
}
function _cargarNovedadesLibro(cb){
  if(NOVEDADES_LIBRO!==null) return cb();
  fetch('data/novedades_libro.json').then(function(r){
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function(d){ NOVEDADES_LIBRO=d; cb(); })
    .catch(function(){ NOVEDADES_LIBRO={}; cb(); });
}

// Nombres de códigos contables (CCO)
var _CCO_NOMBRES={
  '101':'6.1 RECURSOS PROPIOS DEL CANDIDATO','102':'6.2B CONTRIBUCIONES, DONACIONES',
  '103':'6.3 CRÉDITOS','104':'6.4 INGRESOS ORIGINADOS EN ACTOS','105':'6.5 RENDIMIENTOS FINANCIEROS',
  '106':'6.6 APORTES DEL ESTADO','107':'6.7 OTROS INGRESOS',
  '201':'6.8 ADMINISTRACIÓN DE CAMPAÑA','202':'6.9 GASTOS DE OFICINA Y ADQUISICIONES',
  '203':'6.10 MEDIOS DE COMUNICACIÓN','204':'6.11 PUBLICACIONES','205':'6.12 PROPAGANDA Y PUBLICIDAD',
  '206':'6.13 ACTOS PÚBLICOS','207':'6.14 GASTOS DE TRANSPORTE','208':'6.15 PROPAGANDA ELECTORAL',
  '209':'6.16 GASTOS JUDICIALES Y RENDICIÓN','210':'6.17 OTROS GASTOS','211':'6.18 GASTOS FINANCIEROS'
};

function _renderNovedadesLibro(c, header){
  var nov=NOVEDADES_LIBRO[c.id];
  if(!nov||!nov.novedades||!nov.novedades.length){
    document.getElementById('panelTransacciones').innerHTML=header+
      '<div class="alert alert-secondary"><i class="fa fa-info-circle me-1"></i>No se encontraron transacciones reportadas ni novedades en el libro contable para este candidato (CC: '+esc(c.id)+').</div>';
    return;
  }
  var h='<div class="alert alert-info mb-2"><i class="fa fa-book me-1"></i>'+
    '<strong>Datos del libro contable (8B)</strong> — '+nov.total_libro+' registros en libro'+
    (nov.total_tx>0?' vs '+nov.total_tx+' transacciones reportadas':' (sin transacciones reportadas)')+
    ' — <strong>'+nov.novedades.length+' novedad(es)</strong></div>'+
    '<div class="table-responsive"><table class="table table-sm table-bordered table-hover" style="font-size:.75rem">'+
    '<thead class="table-dark"><tr>'+
    '<th>Tipo</th><th>Cód.</th><th>Cuenta</th><th>Comp.</th><th>Fecha</th><th>Valor</th><th>Tercero</th><th>Detalle</th>'+
    '</tr></thead><tbody>';

  nov.novedades.forEach(function(n){
    var tipo=n.tipo;
    var badge='';
    if(tipo==='SOLO_LIBRO') badge='<span class="badge bg-warning text-dark">Solo Libro</span>';
    else if(tipo==='SOLO_TX') badge='<span class="badge bg-info">Solo TX</span>';
    else if(tipo==='DIFERENCIA') badge='<span class="badge bg-danger">Diferencia</span>';

    var ccoNombre=_CCO_NOMBRES[n.cco]||n.cco;
    var concepto=parseInt(n.cco)<200?'ING':'GAS';
    var rowClass=concepto==='ING'?'table-success':'table-danger';

    var detalle='';
    if(tipo==='DIFERENCIA'&&n.campos){
      var parts=[];
      if(n.campos.indexOf('VALOR')!==-1) parts.push('Valor TX: $'+fmtNum(n.valor_tx||0)+' vs Libro: $'+fmtNum(n.valor_libro||0));
      if(n.campos.indexOf('FECHA')!==-1) parts.push('Fecha TX: '+(n.fecha_tx||'-')+' vs Libro: '+(n.fecha_libro||'-'));
      if(n.campos.indexOf('TERCERO')!==-1) parts.push('Tercero TX: '+(n.tercero_tx||'-')+' vs Libro: '+(n.tercero_libro||'-'));
      detalle=parts.join('<br>');
    } else {
      detalle=esc(n.desc||n.tercero||'');
    }

    h+='<tr class="'+rowClass+'">'+
      '<td>'+badge+'</td>'+
      '<td class="text-center">'+(n.cco||'')+'</td>'+
      '<td>'+esc(ccoNombre)+'</td>'+
      '<td class="text-center">'+(n.comp||'')+'</td>'+
      '<td>'+(n.fecha||n.fecha_tx||n.fecha_libro||'')+'</td>'+
      '<td class="text-end">$'+fmtNum(n.valor||n.valor_tx||n.valor_libro||0)+'</td>'+
      '<td>'+esc(n.tercero||n.tercero_tx||n.tercero_libro||'')+'</td>'+
      '<td style="font-size:.7rem">'+detalle+'</td>'+
      '</tr>';
  });

  h+='</tbody></table></div>';
  document.getElementById('panelTransacciones').innerHTML=header+h;
}
function _igAlpha(s){ return (s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function _igMatchPartido(cedula, partido){
  // Lookup directo por cédula
  var entry=IG_INDEX[cedula];
  // Fallback: buscar por prefijo cédula_ (keys formato "123456_NOMBRE")
  if(!entry){
    var pfx=String(cedula)+'_';
    for(var ik in IG_INDEX){
      if(ik.indexOf(pfx)===0){ entry=IG_INDEX[ik]; break; }
    }
  }
  if(!entry) return null;
  var pn=_igAlpha(partido);
  var keys=Object.keys(entry);
  // Match exacto de partido
  for(var i=0;i<keys.length;i++){
    if(_igAlpha(keys[i])===pn) return entry[keys[i]];
  }
  // Fuzzy: check if one contains the other
  for(var j=0;j<keys.length;j++){
    var kn=_igAlpha(keys[j]);
    if(kn.indexOf(pn)!==-1||pn.indexOf(kn)!==-1) return entry[keys[j]];
  }
  // Último recurso: si solo hay un partido, retornarlo
  if(keys.length===1) return entry[keys[0]];
  return null;
}
function _igPdfUrl(t, cedula, partidoCand){
  if(!IG_INDEX||!t) return '';
  var partido=t.partido||partidoCand||'';
  var match=_igMatchPartido(cedula, partido);
  if(!match) return '';
  var cco=(t.cco_id||'').toString().replace(/\.0$/,'').trim();
  var comp=(t.comprobante||t.nro_comprobante||'').toString().replace(/\.0$/,'').trim();
  var prefix=t.concepto==='INGRESO'?'I':'G';
  // Buscar primero por comprobante+cco (preciso), luego fallback por cco
  var preciseKey=comp?prefix+'_'+comp+'_'+cco:'';
  var fallbackKey=prefix+'_'+cco;
  var relPath=match[preciseKey]||match[fallbackKey]||'';
  if(!relPath) return '';
  return match.base+'/'+relPath;
}

// ── Cache de soportes CC (ingresos/gastos pre-indexados o vía API) ──
var CC_SOPORTES_CACHE={}; // cedula → {ing:[items], gas:[items], porCodigo:{codigo→[{archivo,nombre}]}}
function _cargarSoportesCC(c, cb){
  var cedula=String(c.id||'').replace(/\./g,'').trim();
  if(CC_SOPORTES_CACHE[cedula]){cb();return;}
  var dptoVal=document.getElementById('selDpto').value||'';

  // ── 1. Intentar datos PRE-INDEXADOS (ig_detalle) ──
  fetch('/api/ig_detalle?dpto='+encodeURIComponent(dptoVal)+'&cedula='+encodeURIComponent(cedula))
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.ok&&d.candidato){
        var cand=d.candidato;
        var ingItems=cand.ingresos||[];
        var gasItems=cand.gastos||[];
        // Convertir formato pre-indexado a formato esperado por el portal
        var porCodigo={};
        ingItems.forEach(function(it){
          var cod=(it.codigo||'').toString().trim();
          if(!porCodigo[cod]) porCodigo[cod]=[];
          porCodigo[cod].push({archivo:it.archivo||'',nombre:it.formato||'Ingreso',tipo:'INGRESO',codigo:cod,
            valor:_parseValorCC(it.total||0),nro_comp:(it.no_comprobante||'').toString()});
        });
        gasItems.forEach(function(it){
          var cod=(it.codigo||'').toString().trim();
          if(!porCodigo[cod]) porCodigo[cod]=[];
          porCodigo[cod].push({archivo:it.archivo||'',nombre:it.formato||'Gasto',tipo:'GASTO',codigo:cod,
            valor:_parseValorCC(it.total||0),nro_comp:(it.no_comprobante||'').toString()});
        });
        // Adaptar items al formato que espera renderTablaTx
        var ingAdapt=ingItems.map(function(it){return{
          nom_formato:it.formato,codigo:it.codigo,total:it.total,subtotal:it.subtotal,otros:it.otros,
          nombre_persona:it.nombre_persona,nit_cedula:it.nit_cedula,concepto:it.concepto,
          observaciones:it.observaciones,tipo_contribucion:it.tipo_contribucion,
          aporte:it.aporte,contribucion:it.contribucion,credito:it.credito,donacion:it.donacion,especie:it.especie,
          clasificacion:it.clasificacion,tipo_actividad:it.tipo_actividad,
          fecha_ingreso:it.fecha,no_comprobante_interno:it.no_comprobante,
          estado_ingreso:it.estado,archivo:it.archivo,parentesco:it.parentesco,
          tipo_persona:it.tipo_persona,documento_referencia:it.documento_referencia,
          cantidad:it.cantidad,valor_unitario:it.valor_unitario,
          ani_tercero:it.ani_tercero||null
        };});
        var gasAdapt=gasItems.map(function(it){return{
          nom_formato:it.formato,codigo:it.codigo,total:it.total,subtotal:it.subtotal,otros:it.otros,
          nombre_persona:it.nombre_persona,nit_cedula:it.nit_cedula,concepto:it.concepto,
          observaciones:it.observaciones,clasificacion:it.clasificacion,
          fecha_gasto:it.fecha,no_comprobante_interno:it.no_comprobante,
          estado_gastos:it.estado,archivo:it.archivo,tipo_persona:it.tipo_persona,
          documento_referencia:it.documento_referencia,cantidad:it.cantidad,valor_unitario:it.valor_unitario,
          nombre_clasificacion_propaganda:it.clasificacion_propaganda,nombre_propaganda:it.tipo_propaganda,
          nombre_clasificacion_gasto:it.clasificacion_gasto,nombre_gasto:it.gasto_admin,
          ani_tercero:it.ani_tercero||null
        };});
        CC_SOPORTES_CACHE[cedula]={ing:ingAdapt,gas:gasAdapt,porCodigo:porCodigo,
          ccMatch:{cand_id:cand.cand_id,nombre:cand.nombre,cedula:cand.cedula,org:cand.org,corp:cand.corp},
          fuente:'indexado'};
        console.log('[Soportes CC] '+cedula+' (INDEXADO): '+ingItems.length+' ing, '+gasItems.length+' gas');
        cb();
        return;
      }
      // No encontrado en índice → fallback a API en vivo
      _cargarSoportesCCLive(c, cedula, cb);
    }).catch(function(){
      // Error en ig_detalle → fallback a API en vivo
      _cargarSoportesCCLive(c, cedula, cb);
    });
}

function _cargarSoportesCCLive(c, cedula, cb){
  // Buscar candidato CC por cédula o nombre
  var ccMatch=null;
  var nombre=_alphaKey(c.nombre||'');
  (_ccCandsMun||[]).forEach(function(cc){
    if(ccMatch) return;
    var ccCed=String(cc.cedula||'').replace(/\./g,'').trim();
    if(cedula&&ccCed&&cedula===ccCed){ccMatch=cc; return;}
    if(nombre&&_alphaKey(cc.nombre||'')===nombre) ccMatch=cc;
  });
  console.log('[Soportes CC LIVE] '+cedula+' → '+(ccMatch?'MATCH '+ccMatch.cand_id:'NO MATCH'));
  if(!ccMatch){CC_SOPORTES_CACHE[cedula]={ing:[],gas:[],porCodigo:{}};cb();return;}
  var dpto=window._ccDptoEntry, mun=window._ccMunEntry;
  if(!dpto||!mun){CC_SOPORTES_CACHE[cedula]={ing:[],gas:[],porCodigo:{}};cb();return;}
  var qIG='id_candi='+ccMatch.cand_id+'&id_corporacion='+ccMatch.corp_id+'&id_circunscripcion='+ccMatch.circ_id+
    '&id_departamento='+dpto.id+'&id_municipio='+mun.id+'&id_proceso='+PROCESO_ID_CC;
  Promise.all([
    _ccFetchJSON('/api/cne/ingreso/listarIngresos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG),
    _ccFetchJSON('/api/cne/gasto/listarGastos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG)
  ]).then(function(r){
    var r0=r[0],r1=r[1];
    var ingItems=(r0&&r0.ingreso&&r0.ingreso.data)?r0.ingreso.data:(Array.isArray(r0)?r0:[]);
    var gasItems=(r1&&r1.gasto&&r1.gasto.data)?r1.gasto.data:(Array.isArray(r1)?r1:[]);
    var ingLP=(r0&&r0.ingreso&&r0.ingreso.last_page)?r0.ingreso.last_page:1;
    var gasLP=(r1&&r1.gasto&&r1.gasto.last_page)?r1.gasto.last_page:1;
    var extraP=[],extraM=[];
    for(var pg=2;pg<=ingLP&&pg<=20;pg++){extraM.push('ing');extraP.push(_ccFetchJSON('/api/cne/ingreso/listarIngresos?page='+pg+'&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG));}
    for(var pg2=2;pg2<=gasLP&&pg2<=20;pg2++){extraM.push('gas');extraP.push(_ccFetchJSON('/api/cne/gasto/listarGastos?page='+pg2+'&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG));}
    return Promise.all(extraP).then(function(exR){
      exR.forEach(function(er,i){
        if(extraM[i]==='ing'&&er&&er.ingreso&&er.ingreso.data) ingItems=ingItems.concat(er.ingreso.data);
        if(extraM[i]==='gas'&&er&&er.gasto&&er.gasto.data) gasItems=gasItems.concat(er.gasto.data);
      });
      var porCodigo={};
      ingItems.forEach(function(it){
        var cod=(it.codigo||'').toString().trim();
        if(!porCodigo[cod]) porCodigo[cod]=[];
        porCodigo[cod].push({archivo:it.archivo||'',nombre:it.nom_formato||'Ingreso',tipo:'INGRESO',codigo:cod,valor:_parseValorCC(it.total||0),nro_comp:(it.no_comprobante_interno||'').toString()});
      });
      gasItems.forEach(function(it){
        var cod=(it.codigo||'').toString().trim();
        if(!porCodigo[cod]) porCodigo[cod]=[];
        porCodigo[cod].push({archivo:it.archivo||'',nombre:it.nom_formato||'Gasto',tipo:'GASTO',codigo:cod,valor:_parseValorCC(it.total||0),nro_comp:(it.no_comprobante_interno||'').toString()});
      });
      CC_SOPORTES_CACHE[cedula]={ing:ingItems,gas:gasItems,porCodigo:porCodigo,ccMatch:ccMatch,fuente:'live'};
      console.log('[Soportes CC LIVE] '+cedula+': '+ingItems.length+' ing, '+gasItems.length+' gas');
      cb();
    });
  }).catch(function(e){console.log('[Soportes CC] Error:',e);CC_SOPORTES_CACHE[cedula]={ing:[],gas:[],porCodigo:{}};cb();});
}

function renderPaso6(){
  var c=CAND_SELEC;
  var topeInd=_topeInd6();
  _cargarFechaInscCargue(function(){
    var _filtroKey=c?_getFechaInscFiltroKey(c):'';
    var fechaInsc='';
    try{
      fechaInsc=_lookupFechaInscCargue(c)
        ||(_filtroKey&&localStorage.getItem(_filtroKey))
        ||localStorage.getItem('cne_fecha_insc_'+c.id)||'';
    }catch(e){}
    var _fiFuente='';
    try{
      var _catVal=_lookupFechaInscCargue(c);
      if(_catVal&&fechaInsc===_catVal) _fiFuente='cargue';
    }catch(e){}
    var header=_headerPaso6(c,fechaInsc,topeInd,_fiFuente);
    // Cargar soportes CC + IG_INDEX en paralelo
    var done=0, total=2;
    function _checkDone(){done++;if(done>=total) _renderPaso6Inner(c,topeInd,fechaInsc,header);}
    _cargarIGIndex(_checkDone);
    _cargarSoportesCC(c, _checkDone);
  });
}
// Convierte CC_SOPORTES_CACHE items (ing/gas) a TX format para renderTablaTx
// La API CC devuelve un registro por cada soporte PDF adjunto → agrupar en 1 TX con múltiples archivos
function _ccToTxFormat(cedula){
  var cc=CC_SOPORTES_CACHE[cedula];
  if(!cc) return null;
  var ing=cc.ing||[], gas=cc.gas||[];
  if(!ing.length&&!gas.length) return null;
  var grouped={};
  function addItem(it, concepto){
    var cco=(it.codigo||'').toString().trim();
    var comp=(it.no_comprobante_interno||'').toString();
    var val=_parseValorCC(it.total||it.subtotal||0);
    var nit=(it.nit_cedula||'').toString();
    var fecha=(concepto==='INGRESO'?(it.fecha_ingreso||it.fecha):(it.fecha_gasto||it.fecha)||'').toString().substring(0,10);
    var key=concepto+'|'+cco+'|'+comp+'|'+Math.round(val)+'|'+nit;
    if(!grouped[key]){
      grouped[key]={
        concepto:concepto,cco_id:cco,valor:val,fecha:fecha,
        tercero:it.nombre_persona||'',nit_cc:nit,comprobante:comp,
        url_preview:'',partido:'',_fuente_cc:true,
        _ani_tercero:it.ani_tercero||null,
        _cc_archivos:[]
      };
    }
    var arch=it.archivo||'';
    if(arch) grouped[key]._cc_archivos.push(arch);
  }
  ing.forEach(function(it){addItem(it,'INGRESO');});
  gas.forEach(function(it){addItem(it,'GASTO');});
  var txArr=[];
  for(var k in grouped) txArr.push(grouped[k]);
  txArr.sort(function(a,b){
    if(a.concepto!==b.concepto) return a.concepto==='INGRESO'?-1:1;
    if(a.cco_id!==b.cco_id) return a.cco_id<b.cco_id?-1:1;
    return (a.comprobante||'')>(b.comprobante||'')?1:-1;
  });
  return txArr;
}
function _renderPaso6Inner(c,topeInd,fechaInsc,header){
  if(TX_CACHE[c.id]){
    document.getElementById('panelTransacciones').innerHTML=header+renderTablaTx(TX_CACHE[c.id],topeInd,fechaInsc);
    return;
  }
  var txUrl=txUrlFor(c);
  if(txUrl){
    document.getElementById('panelTransacciones').innerHTML=header+
      '<div class="text-center p-4"><div class="spinner-border text-primary"></div><p class="mt-2">Cargando transacciones...</p></div>';
    fetch(txUrl).then(function(r){
      if(r.status===404){
        // Sin TX local → intentar CC pre-indexado
        var _ced404=String(c.id||'').replace(/\./g,'').trim();
        var _ccTx404=_ccToTxFormat(_ced404);
        if(_ccTx404&&_ccTx404.length){
          TX_CACHE[c.id]=_ccTx404;
          var _ccHtml=header+'<div class="alert alert-info mb-2" style="font-size:.78rem"><i class="fa fa-cloud me-1"></i>Datos de <strong>Cuentas Claras</strong> ('+_ccTx404.length+' registros). No se encontraron transacciones locales (FNFP).</div>'+
            renderTablaTx(_ccTx404,topeInd,fechaInsc);
          document.getElementById('panelTransacciones').innerHTML=_ccHtml;
          return;
        }
        // Sin CC tampoco → novedades libro contable
        _cargarNovedadesLibro(function(){
          _renderNovedadesLibro(c, header);
        });
        return;
      }
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    }).then(function(data){
      if(!data) return;
      TX_CACHE[c.id]=data;
      var txHtml=header+renderTablaTx(data,topeInd,fechaInsc);
      // Verificar novedades del libro contable
      _cargarNovedadesLibro(function(){
        var nov=NOVEDADES_LIBRO[c.id];
        if(nov&&nov.novedades&&nov.novedades.length){
          txHtml+='<div class="alert alert-warning mt-2"><i class="fa fa-exclamation-triangle me-1"></i>'+
            '<strong>'+nov.novedades.length+' novedad(es)</strong> al comparar con el libro contable (8B).'+
            ' <button class="btn btn-sm btn-outline-dark ms-2" onclick="this.style.display=\'none\';document.getElementById(\'novLibro_'+esc(c.id)+'\').style.display=\'block\'">'+
            '<i class="fa fa-eye me-1"></i>Ver detalle</button></div>'+
            '<div id="novLibro_'+esc(c.id)+'" style="display:none">';
          // Render tabla de novedades inline
          txHtml+='<table class="table table-sm table-bordered" style="font-size:.72rem"><thead class="table-warning"><tr>'+
            '<th>Tipo</th><th>Cód.</th><th>Cuenta</th><th>Comp.</th><th>Fecha</th><th>Valor</th><th>Tercero</th><th>Detalle</th></tr></thead><tbody>';
          nov.novedades.forEach(function(n){
            var badge2=n.tipo==='SOLO_LIBRO'?'<span class="badge bg-warning text-dark">Solo Libro</span>':
              n.tipo==='SOLO_TX'?'<span class="badge bg-info">Solo TX</span>':
              '<span class="badge bg-danger">Diferencia</span>';
            var ccoN=_CCO_NOMBRES[n.cco]||n.cco;
            var det='';
            if(n.tipo==='DIFERENCIA'&&n.campos){
              var pp=[];
              if(n.campos.indexOf('VALOR')!==-1) pp.push('TX: $'+fmtNum(n.valor_tx||0)+' vs Libro: $'+fmtNum(n.valor_libro||0));
              if(n.campos.indexOf('FECHA')!==-1) pp.push('TX: '+(n.fecha_tx||'-')+' vs Libro: '+(n.fecha_libro||'-'));
              if(n.campos.indexOf('TERCERO')!==-1) pp.push('TX: '+(n.tercero_tx||'-')+' vs Libro: '+(n.tercero_libro||'-'));
              det=pp.join('; ');
            } else det=esc(n.desc||'');
            txHtml+='<tr><td>'+badge2+'</td><td>'+esc(n.cco||'')+'</td><td>'+esc(ccoN)+'</td>'+
              '<td>'+esc(n.comp||'')+'</td><td>'+esc(n.fecha||n.fecha_tx||n.fecha_libro||'')+'</td>'+
              '<td class="text-end">$'+fmtNum(n.valor||n.valor_tx||n.valor_libro||0)+'</td>'+
              '<td>'+esc(n.tercero||n.tercero_tx||n.tercero_libro||'')+'</td><td>'+det+'</td></tr>';
          });
          txHtml+='</tbody></table></div>';
        }
        document.getElementById('panelTransacciones').innerHTML=txHtml;
      });
    }).catch(function(err){
      console.error('Error cargando transacciones:',err,txUrl);
      // Error TX local → intentar CC pre-indexado
      var _cedErr=String(c.id||'').replace(/\./g,'').trim();
      var _ccTxErr=_ccToTxFormat(_cedErr);
      if(_ccTxErr&&_ccTxErr.length){
        TX_CACHE[c.id]=_ccTxErr;
        document.getElementById('panelTransacciones').innerHTML=header+
          '<div class="alert alert-info mb-2" style="font-size:.78rem"><i class="fa fa-cloud me-1"></i>Datos de <strong>Cuentas Claras</strong> ('+_ccTxErr.length+' registros). Error cargando TX locales.</div>'+
          renderTablaTx(_ccTxErr,topeInd,fechaInsc);
        return;
      }
      document.getElementById('panelTransacciones').innerHTML=header+
        '<div class="alert alert-warning"><i class="fa fa-exclamation-triangle me-1"></i>Error cargando transacciones: '+esc(String(err))+'</div>';
    });
    return;
  }
  // Sin TX local → intentar CC pre-indexado
  var _cedNoTx=String(c.id||'').replace(/\./g,'').trim();
  var _ccTxNoTx=_ccToTxFormat(_cedNoTx);
  if(_ccTxNoTx&&_ccTxNoTx.length){
    TX_CACHE[c.id]=_ccTxNoTx;
    var _ccHtmlNoTx=header+'<div class="alert alert-info mb-2" style="font-size:.78rem"><i class="fa fa-cloud me-1"></i>Datos de <strong>Cuentas Claras</strong> ('+_ccTxNoTx.length+' registros). No se encontraron transacciones locales (FNFP).</div>'+
      renderTablaTx(_ccTxNoTx,topeInd,fechaInsc);
    document.getElementById('panelTransacciones').innerHTML=_ccHtmlNoTx;
    return;
  }
  document.getElementById('panelTransacciones').innerHTML=header+
    '<div class="alert alert-secondary">No hay transacciones en los reportes para este candidato.</div>';
}

// Motivos de deducción según dictamen — compartidos con Paso 6
var _MOTIVOS_ART27 = [
  'Aportes anónimos',
  'Contribuciones de empresas extranjeras',
  'Financiación de empresas ilegales',
  'Aportes de entidades estatales',
  'No aplica',
];

var _KEYWORDS_ESTATAL = [
  'ALCALDIA','ALCALDÍA','GOBERNACION','GOBERNACIÓN','MUNICIPIO','DEPARTAMENTO',
  'MINISTERIO','SECRETARIA','SECRETARÍA','HOSPITAL','FONDO NAC','POLICIA','POLICÍA',
  'EJERCITO','EJÉRCITO','SENA','ICBF','COLPENSIONES','CONTRALORIA','CONTRALORÍA',
  'PERSONERIA','PERSONERÍA','PROCURADURIA','PROCURADURÍA','CONCEJO','ASAMBLEA',
  'ENTIDAD ESTATAL','EMPRESA SOCIAL','ESE ','UNIDAD NACIONAL','GOBIERNO',
  'ADMINISTRACION','ADMINISTRACIÓN','REPUBLICA','REPÚBLICA','CONGRESO',
];

// ── Diccionario de códigos contables y requisitos de soportes ──
var _COD_INGRESO = {
  '101':{nombre:'Recursos propios candidato/familia',
    soportes:'Comprobante de ingreso, documento identidad aportante',
    regla:'Recursos propios del candidato, cónyuge/compañero permanente, parientes hasta 4° consanguinidad'},
  '102':{nombre:'Contribuciones/donaciones de particulares',
    soportes:'Comprobante ingreso, acta donación, cédula y RUT donante. Si persona jurídica: acta junta/asamblea socios, RUT, cédula rep. legal. Si donación en especie: especificar bien/servicio + valor comercial + soporte compra. Si excede 50 SMMLV: insinuación escritura pública (Decreto 1712/1989). Comprobante transferencia/consignación',
    regla:'Donación individual máx 10% del tope. Art.23. Si persona jurídica necesita acta aprobación mitad+1 junta directiva/asamblea'},
  '103':{nombre:'Créditos entidades financieras',
    soportes:'Documento crédito entidad financiera legalmente constituida. Si pignoración reposición gastos (Art.17 Ley130/94): indicar valor pignoración',
    regla:'Solo entidades financieras legalmente autorizadas'},
  '104':{nombre:'Ingresos actos públicos/actividades lucrativas',
    soportes:'Valor bruto obtenido. Anexo con relación personas participantes con identificación y valor',
    regla:'Bazares, fiestas, bonos contribución, actividades culturales, publicaciones'},
  '105':{nombre:'Financiación estatal — Anticipos',
    soportes:'Comprobante giro Registraduría Nacional',
    regla:'Valor total anticipo girado por Registraduría'},
  '106':{nombre:'Recursos privados del partido para campaña',
    soportes:'Acta y/o constancia transferencia recursos propios origen privado del partido/movimiento',
    regla:'⚠ Este código NO debe ser diligenciado por el candidato — solo por el partido'},
  '107':{nombre:'Otros ingresos (rendimientos financieros)',
    soportes:'Comprobante rendimientos financieros',
    regla:'Rendimientos financieros y otros'},
};
var _COD_GASTO = {
  '201':{nombre:'Gastos de administración',
    soportes:'Comprobante egreso, facturas/cuentas cobro + RUT',
    regla:'Honorarios, arriendo sede, servicios públicos, vigilancia, aseo'},
  '202':{nombre:'Gastos de oficina y adquisiciones',
    soportes:'Comprobante egreso, facturas electrónicas/doc. equivalentes + RUT',
    regla:'Cafetería, papelería, fotocopiado, internet, ferretería, elementos oficina'},
  '203':{nombre:'Inversión en materiales y publicaciones',
    soportes:'Comprobante egreso, facturas + RUT',
    regla:'Llaveros, esferos, gorras, agendas, pintura, material publicaciones'},
  '204':{nombre:'Actos públicos',
    soportes:'Comprobante egreso, facturas + Anexo. Incluir costos eventos código 104',
    regla:'Alquiler salón, sillas, mesas, conjuntos musicales, refrigerios'},
  '205':{nombre:'Servicio de transporte y correo',
    soportes:'Comprobante egreso, facturas, contrato servicios (si combustible/parqueadero)',
    regla:'Transporte aéreo/terrestre, taxis, combustible, peajes, correo'},
  '206':{nombre:'Gastos capacitación e investigación política',
    soportes:'Comprobante egreso, facturas capacitadores/conferencistas, encuestas',
    regla:'Capacitadores, conferencistas, material apoyo, encuestas, alquiler instalaciones'},
  '207':{nombre:'Gastos judiciales y rendición de cuentas',
    soportes:'Comprobante egreso, facturas honorarios',
    regla:'Honorarios abogado, gerente campaña, contador público'},
  '208':{nombre:'Gastos propaganda electoral',
    soportes:'Comprobante egreso, facturas + contratos. Si persona apoya con propaganda: valor como donación especie',
    regla:'Cuñas radiales, TV, vallas, pendones, medios digitales, prensa. Respetar límites CNE'},
  '209':{nombre:'Gastos día de elecciones',
    soportes:'Comprobante egreso, facturas',
    regla:'Gastos operativos del día de elecciones'},
  '211':{nombre:'Gastos financieros',
    soportes:'Comprobante egreso, extractos bancarios',
    regla:'Gastos financieros (comisiones, intereses, GMF)'},
};

// Verifica si una cédula/NIT NO existe en el índice ANI
function _aniNoExiste(nit, txItem){
  if(!nit) return false;
  var key=String(nit).trim();
  if(!key||key==='0'||key==='-'||key.toUpperCase()==='ANONIMO'||key==='nan') return false;
  // Usar ANI pre-indexado del item si disponible
  if(txItem&&txItem._ani_tercero){
    var v2=(txItem._ani_tercero.v||'').toLowerCase();
    return (v2==='sin registro'||v2==='no encontrada');
  }
  if(!ANI_INDEX) return false;
  var r=ANI_INDEX[key];
  if(!r) return true;
  var v=(r.v||'').toLowerCase();
  return (v==='sin registro'||v==='no encontrada');
}
function _aniStatus(nit, txItem){
  if(!nit) return null;
  var key=String(nit).trim();
  if(!key||key==='0'||key==='-'||key.toUpperCase()==='ANONIMO'||key==='nan') return null;
  if(txItem&&txItem._ani_tercero) return txItem._ani_tercero;
  if(ANI_INDEX&&ANI_INDEX[key]) return ANI_INDEX[key];
  return null;
}

// ── Keywords gastos SIN relación de causalidad con campaña ──
var _KW_SIN_CAUSALIDAD = [
  'OLLA','OLLAS','SARTEN','CACEROLA','UTENSILIO','CUBIERTO',
  'COMPUTADOR','COMPUTADORA','PORTATIL','PORTÁTIL','LAPTOP','TABLET','IPAD',
  'PLANCHA','LICUADORA','NEVERA','LAVADORA','SECADORA','MICROONDAS','ESTUFA','HORNO',
  'TELEVISOR','TV ','TELEVISIÓN',
  'LLANTA','ACEITE MOTOR','ACEITE DE MOTOR','REPUESTO','BATERIA VEHICULO','BATERÍA VEHÍCULO',
  'LICOR','AGUARDIENTE','CERVEZA','WHISKY','RON ','VODKA','VINO ','BEBIDA ALCOHOLICA','BEBIDA ALCOHÓLICA',
  'ROPA ','VESTIDO','CALZADO','ZAPATO','TENIS ','CAMISA ','PANTALON','PANTALÓN','JEAN',
  'MEDICAMENTO','FARMACIA','DROGUERIA','DROGUERÍA','CONSULTA MEDICA','CONSULTA MÉDICA',
  'MERCADO','MERCADEO DE HOGAR','ARROZ ','ACEITE COMEST','AZUCAR','AZÚCAR',
  'CEMENTO','LADRILLO','ARENA ','VARILLA','BLOQUE','CONSTRUCCION','CONSTRUCCIÓN','FERRETERIA','FERRETERÍA',
  'CAMA ','COLCHON','COLCHÓN','ALMOHADA','COBIJA','SABANA','SÁBANA',
  'DEUDA PERSONAL','PRESTAMO PERSONAL','PRÉSTAMO PERSONAL',
  'ASESOR DE IMAGEN','ASESORA DE IMAGEN','ASESORIA DE IMAGEN','ASESORÍA DE IMAGEN',
  'ENCUESTA ELECTORAL','ENCUESTA POLITICA','ENCUESTA POLÍTICA','ENCUESTADORA',
];
// Keywords que requieren contrato de alquiler de vehículo
var _KW_REQUIERE_CONTRATO_VEH = ['COMBUSTIBLE','GASOLINA','DIESEL','DIÉSEL','ACPM','TANQUEO','PARQUEADERO','PEAJE'];
// Keywords transporte aéreo
var _KW_TRANSPORTE_AEREO = ['TIQUETE AEREO','TIQUETE AÉREO','VUELO','AVIANCA','LATAM','VIVA AIR','EASYFLY','SATENA','PASAJE AEREO','PASAJE AÉREO'];
// Keywords persona jurídica
var _KW_PERSONA_JURIDICA = ['S.A.S','SAS ','S.A.','S.A ','LTDA','LIMITADA','E.U.','FUNDACION','FUNDACIÓN','CORPORACION','CORPORACIÓN','COOPERATIVA','ASOCIACION','ASOCIACIÓN','E.S.P','EPS ','IPS '];
// Keywords para reclasificación — mapeo descripción → código correcto
var _KW_RECLASIFICAR = [
  {kw:['REFRIGERIO','ALMUERZO','DESAYUNO','COMIDA','MERIENDA','BEBIDA','GASEOSA','JUGO','AGUA '],codOk:['201','204'],msg:'Refrigerios → código 201 (equipo) o 204 (evento público)'},
  {kw:['TRANSPORTE','TAXI','UBER','BUS ','BUSETA','FLOTA','PASAJE'],codOk:['205'],msg:'Transporte → código 205'},
  {kw:['PENDÓN','PENDON','VOLANTE','PANCARTA','VALLA','PASACALLE','AFICHE','BANNER','STICKER','CALCOMANÍA','CALCOMANIA'],codOk:['203','208'],msg:'Material publicitario → código 203 o 208'},
  {kw:['CUÑA','CUNA ','PAUTA','EMISORA','RADIO ','PERIFONEO','FACEBOOK','GOOGLE','INSTAGRAM','TIKTOK','RED SOCIAL','REDES SOCIAL'],codOk:['208'],msg:'Propaganda/medios → código 208'},
  {kw:['ABOGADO','HONORARIO','GERENTE','CONTADOR'],codOk:['207'],msg:'Honorarios/judiciales → código 207'},
  {kw:['ARRIENDO','ARRENDAMIENTO','ALQUILER SEDE','ALQUILER BODEGA','ALQUILER LOCAL','ALQUILER SALON','ALQUILER SALÓN'],codOk:['201'],msg:'Arriendo sede → código 201'},
  {kw:['SONIDO','TARIMA','SILLA EVENTO','MESA EVENTO','TOLDO','CARPA','CONJUNTO MUSICAL','GRUPO MUSICAL','DJ '],codOk:['204'],msg:'Actos públicos → código 204'},
];

// Genera observaciones automáticas para una transacción
function _autoObsSoporte(t, concepto, c, fechaInsc, topeInd){
  var obs=[];
  var cco=(t.cco_id||'').toString().replace(/\.0$/,'').trim();
  var val=parseFloat(t.valor||0);
  var fecha=(t.fecha||'').trim();
  var nit=(t.nit_cc||'').toString().replace(/\s/g,'');
  var FECHA_ELECCION='2023-10-29';

  // 1. Verificar si existe soporte PDF
  var hasPdf=false;
  if(IG_INDEX && c){
    var match=_igMatchPartido(c.id, c.partido||t.partido||'');
    if(match){
      var pfx=concepto==='INGRESO'?'I_':'G_';
      hasPdf=!!match[pfx+cco];
    }
  }
  if(!hasPdf && t.url_preview) hasPdf=true;
  if(!hasPdf) obs.push('⚠ SIN SOPORTE CONTABLE código '+cco);

  // 2. Verificar fecha vs período inscripción-elección (Art.34)
  if(fecha && fecha!=='—'){
    if(fechaInsc && fecha<fechaInsc)
      obs.push('⚠ FECHA ANTES INSCRIPCIÓN ('+fecha+' < '+fechaInsc+') — Art.34');
    if(fecha>FECHA_ELECCION)
      obs.push('⚠ FECHA POSTERIOR ELECCIONES ('+fecha+' > '+FECHA_ELECCION+') — Art.34');
  }

  // 3. Reglas específicas por código de INGRESO
  if(concepto==='INGRESO'){
    var codInfo=_COD_INGRESO[cco];
    if(cco==='102'){
      // Art.23: donación individual máx 10% tope
      if(topeInd && val>topeInd*0.10)
        obs.push('⚠ DONACIÓN EXCEDE 10% TOPE ($'+Math.round(topeInd*0.10).toLocaleString()+') — Art.23');
      // Verificar si tiene NIT/CC
      var isAnon=(!nit||nit==='0'||nit.toUpperCase()==='ANONIMO'||nit==='nan'||nit==='-');
      if(isAnon) obs.push('⚠ Sin identificación donante — posible aporte anónimo Art.27');
      // ANI check
      if(!isAnon && _aniNoExiste && _aniNoExiste(nit, t))
        obs.push('⚠ CC '+nit+' NO existe en ANI — verificar identidad donante Art.27');
      // Persona jurídica — necesita acta
      var ter=(t.tercero||'').toUpperCase();
      if(ter.indexOf('S.A.')!==-1||ter.indexOf('SAS')!==-1||ter.indexOf('LTDA')!==-1||ter.indexOf('S.A.S')!==-1||ter.indexOf('FUNDACION')!==-1||ter.indexOf('FUNDACIÓN')!==-1||ter.indexOf('CORPORACION')!==-1||ter.indexOf('CORPORACIÓN')!==-1||ter.indexOf('COOPERATIVA')!==-1)
        obs.push('ℹ Persona jurídica — verificar acta junta/asamblea aprobación donación');
      // Donación > 50 SMMLV → insinuación escritura pública
      var smmlv2023=1160000;
      if(val>50*smmlv2023)
        obs.push('⚠ Donación > 50 SMMLV ($'+Math.round(50*smmlv2023).toLocaleString()+') — requiere insinuación escritura pública (Dec.1712/89)');
    }
    if(cco==='106')
      obs.push('⚠ Código 106 NO debe ser diligenciado por el candidato — solo por el partido');
    // Entidad estatal en ingreso
    if(cco!=='105'){
      var terU=(t.tercero||'').toUpperCase();
      if(_KEYWORDS_ESTATAL && _KEYWORDS_ESTATAL.some(function(k){return terU.indexOf(k)!==-1;}))
        obs.push('⚠ Tercero posible entidad estatal — verificar Art.27');
    }
  }

  // 4. Reglas específicas por código de GASTO
  if(concepto==='GASTO'){
    var codInfoG=_COD_GASTO[cco];
    var terG=(t.tercero||'').toUpperCase();
    var descG=(t.descripcion||t.detalle||'').toUpperCase();
    var textoG=terG+' '+descG;

    // 4a. Gastos SIN relación de causalidad
    var sinCausal=_KW_SIN_CAUSALIDAD.filter(function(kw){return textoG.indexOf(kw)!==-1;});
    if(sinCausal.length){
      obs.push('⚠ SIN RELACIÓN DE CAUSALIDAD — "'+sinCausal.join(', ')+'" no es gasto de campaña. Descontar');
    }

    // 4b. Gastos bancarios (211) solo si Art.25 obligado
    if(cco==='211'){
      if(!topeInd || topeInd < 232000000){
        obs.push('⚠ Gastos financieros (211) — candidato NO obligado a cuenta exclusiva (tope < $232M). Sin relación de causalidad');
      } else {
        obs.push('ℹ Gastos financieros (211) — verificar comisiones/GMF en extracto cuenta exclusiva Art.25');
      }
    }

    // 4c. Combustible/parqueadero/peajes → requiere contrato alquiler vehículo
    var reqVeh=_KW_REQUIERE_CONTRATO_VEH.filter(function(kw){return textoG.indexOf(kw)!==-1;});
    if(reqVeh.length){
      obs.push('⚠ '+reqVeh.join('/')+' — requiere CONTRATO DE ALQUILER DE VEHÍCULO en otro egreso. Si no existe → sin relación de causalidad');
    }

    // 4d. Transporte aéreo → solo dentro de circunscripción
    var esAereo=_KW_TRANSPORTE_AEREO.some(function(kw){return textoG.indexOf(kw)!==-1;});
    if(esAereo){
      obs.push('⚠ TRANSPORTE AÉREO — solo válido dentro de la circunscripción electoral. Si es fuera del municipio/departamento → RECHAZAR');
    }

    // 4e. Propaganda electoral → requiere contrato
    if(cco==='208'){
      obs.push('ℹ Propaganda electoral — verificar CONTRATO firmado y límites CNE');
    }

    // 4f. Art.25: si tope >= $232M, todo gasto debe tener soporte en cuenta exclusiva
    if(topeInd && topeInd >= 232000000 && cco!=='211'){
      obs.push('⚠ Art.25 OBLIGADO (tope ≥ $232M) — verificar registro en extracto bancario cuenta exclusiva');
    }

    // 4g. Persona jurídica → requiere factura electrónica + CUFE
    var esJuridica=_KW_PERSONA_JURIDICA.some(function(kw){return terG.indexOf(kw)!==-1;});
    if(esJuridica){
      obs.push('⚠ PERSONA JURÍDICA — requiere FACTURA ELECTRÓNICA + CUFE. Verificar RUT y cédula rep. legal');
    }

    // 4h. Soportes obligatorios de todo gasto
    obs.push('ℹ Soportes obligatorios: Egreso + Cuenta de cobro/Factura + RUT + Cédula proveedor');
    if(esJuridica || textoG.indexOf('IVA')!==-1 || textoG.indexOf('FACTURA ELECTR')!==-1){
      obs.push('⚠ Si responsable de IVA o facturador electrónico → factura DEBE ser electrónica. Extraer CUFE');
    }

    // 4i. Verificar clasificación correcta
    for(var ri=0;ri<_KW_RECLASIFICAR.length;ri++){
      var regla=_KW_RECLASIFICAR[ri];
      var matchKw=regla.kw.some(function(kw){return textoG.indexOf(kw)!==-1;});
      if(matchKw && regla.codOk.indexOf(cco)===-1){
        obs.push('⚠ RECLASIFICAR — '+regla.msg+' (actualmente en código '+cco+')');
        break;
      }
    }
  }

  // 5. Art.25: ingresos también deben reflejarse en cuenta exclusiva si obligado
  if(concepto==='INGRESO' && topeInd && topeInd >= 232000000){
    obs.push('⚠ Art.25 OBLIGADO — verificar consignación reflejada en extracto cuenta exclusiva');
  }

  // 6. Requisitos de soportes según código contable
  var codRef=concepto==='INGRESO'?_COD_INGRESO[cco]:null;
  if(codRef && codRef.soportes){
    obs.push('ℹ Soportes requeridos: '+codRef.soportes);
  }

  // 7. Art.27: verificar financiación prohibida en todos los ingresos (no solo 102)
  if(concepto==='INGRESO' && cco!=='101' && cco!=='102' && cco!=='103' && cco!=='105'){
    var nitChk=(t.nit_cc||'').toString().replace(/\s/g,'');
    var isAnonChk=(!nitChk||nitChk==='0'||nitChk.toUpperCase()==='ANONIMO'||nitChk==='nan'||nitChk==='-');
    if(isAnonChk && val>0) obs.push('⚠ Ingreso código '+cco+' sin identificación del aportante — Art.27');
  }

  return obs;
}

// ═══ ANÁLISIS DE SOPORTES CC — Lee PDFs y genera observaciones ═══
var _SOPORTE_ANALISIS_CACHE={};

// Requisitos de soportes obligatorios por código contable
var _REQ_SOPORTE={
  // INGRESOS
  '101':{req:['COMPROBANTE','CEDULA'],desc:'Comprobante ingreso + Cédula aportante'},
  '102':{req:['COMPROBANTE','CEDULA','RUT'],desc:'Comprobante ingreso + Cédula + RUT donante. PJ: acta junta/asamblea',
    pj:['ACTA','JUNTA','ASAMBLEA'],especie:['ESPECIE','BIEN','SERVICIO','VALOR COMERCIAL']},
  '103':{req:['CREDITO','ENTIDAD FINANCIERA'],desc:'Documento crédito entidad financiera'},
  '104':{req:['COMPROBANTE'],desc:'Comprobante + relación personas participantes'},
  '105':{req:['COMPROBANTE','REGISTRADURIA'],desc:'Comprobante giro Registraduría'},
  '106':{req:['ACTA','PARTIDO'],desc:'Acta transferencia recursos del partido'},
  '107':{req:['COMPROBANTE'],desc:'Comprobante rendimientos financieros'},
  // GASTOS
  '201':{req:['COMPROBANTE','EGRESO'],desc:'Comprobante egreso + Factura/Cuenta cobro + RUT',factura:true},
  '202':{req:['COMPROBANTE','EGRESO'],desc:'Comprobante egreso + Factura electrónica + RUT',factura:true},
  '203':{req:['COMPROBANTE','EGRESO'],desc:'Comprobante egreso + Factura + RUT',factura:true},
  '204':{req:['COMPROBANTE','EGRESO'],desc:'Comprobante egreso + Factura + Anexo evento',factura:true},
  '205':{req:['COMPROBANTE','EGRESO'],desc:'Comprobante egreso + Factura + Contrato transporte',factura:true,
    transporte:['CONTRATO','ALQUILER','VEHICULO','VEHÍCULO']},
  '206':{req:['COMPROBANTE','EGRESO'],desc:'Comprobante egreso + Factura capacitación',factura:true},
  '207':{req:['COMPROBANTE','EGRESO'],desc:'Comprobante egreso + Factura honorarios',factura:true},
  '208':{req:['COMPROBANTE','EGRESO','CONTRATO'],desc:'Comprobante egreso + Contrato propaganda + Factura',factura:true},
  '209':{req:['COMPROBANTE','EGRESO'],desc:'Comprobante egreso + Factura día elecciones',factura:true},
  '211':{req:['EXTRACTO'],desc:'Extracto bancario con comisiones/GMF'}
};

function _leerSoportePdfCC(url, cb){
  if(typeof pdfjsLib==='undefined'){cb(null);return;}
  fetch(url).then(function(r){
    if(!r.ok){cb(null);return r.text();}
    return r.arrayBuffer();
  }).then(function(buf){
    if(!buf||typeof buf==='string'){cb(null);return;}
    var pdfData=new Uint8Array(buf);
    pdfjsLib.getDocument({data:pdfData}).promise.then(function(pdf){
      var pages=pdf.numPages, texts=[], done=0;
      if(pages===0){cb('');return;}
      for(var i=1;i<=pages;i++){
        (function(pi){
          pdf.getPage(pi).then(function(page){
            page.getTextContent().then(function(tc){
              var items=tc.items||[];
              var lines={};
              items.forEach(function(it){
                var y=Math.round((it.transform?it.transform[5]:0)*10);
                if(!lines[y])lines[y]=[];
                lines[y].push({x:it.transform?it.transform[4]:0,t:it.str});
              });
              var sortedY=Object.keys(lines).sort(function(a,b){return b-a;});
              var pageText='';
              sortedY.forEach(function(y){
                lines[y].sort(function(a,b){return a.x-b.x;});
                pageText+=lines[y].map(function(i){return i.t;}).join(' ')+'\n';
              });
              texts[pi-1]=pageText;
              done++;
              if(done===pages){
                var fullText=texts.join('\n').trim();
                // Si no hay texto suficiente, intentar OCR
                if(fullText.length<20){
                  console.log('[SoporteCC] PDF sin texto, intentando OCR para '+url);
                  _ocrPdfPages(pdf, pages, cb);
                } else {
                  cb(fullText);
                }
              }
            });
          });
        })(i);
      }
    }).catch(function(){cb(null);});
  }).catch(function(){cb(null);});
}

function _ocrPdfPages(pdf, numPages, cb){
  // Renderizar cada página a canvas y hacer OCR con Tesseract.js
  if(typeof Tesseract==='undefined'){console.log('[OCR] Tesseract.js no disponible');cb(null);return;}
  var maxPages=Math.min(numPages, 5); // Limitar a 5 páginas para no tardar mucho
  var ocrTexts=[], ocrDone=0;
  for(var i=1;i<=maxPages;i++){
    (function(pi){
      pdf.getPage(pi).then(function(page){
        var scale=2.0; // Buena resolución para OCR
        var vp=page.getViewport({scale:scale});
        var canvas=document.createElement('canvas');
        canvas.width=vp.width;
        canvas.height=vp.height;
        var ctx=canvas.getContext('2d');
        page.render({canvasContext:ctx,viewport:vp}).promise.then(function(){
          var dataUrl=canvas.toDataURL('image/png');
          Tesseract.recognize(dataUrl,'spa',{
            logger:function(){}
          }).then(function(result){
            ocrTexts[pi-1]=(result&&result.data&&result.data.text)?result.data.text:'';
            ocrDone++;
            console.log('[OCR] Página '+pi+'/'+maxPages+' completada ('+ocrTexts[pi-1].length+' chars)');
            if(ocrDone===maxPages){
              var fullOcr=ocrTexts.join('\n').trim();
              cb(fullOcr.length>5?fullOcr:null);
            }
          }).catch(function(e){
            console.log('[OCR] Error página '+pi+':',e);
            ocrTexts[pi-1]='';
            ocrDone++;
            if(ocrDone===maxPages) cb(ocrTexts.join('\n').trim()||null);
          });
        }).catch(function(){
          ocrTexts[pi-1]='';ocrDone++;
          if(ocrDone===maxPages) cb(ocrTexts.join('\n').trim()||null);
        });
      }).catch(function(){
        ocrTexts[pi-1]='';ocrDone++;
        if(ocrDone===maxPages) cb(ocrTexts.join('\n').trim()||null);
      });
    })(i);
  }
}

// Parsear monto en formato colombiano: 8.000.000 → 8000000, 8.000.000,50 → 8000000.50
function _parseMontoCol(s){
  if(!s) return 0;
  s=s.trim();
  // Detectar formato: si tiene puntos como separador de miles (ej: 8.000.000)
  var dotCount=(s.match(/\./g)||[]).length;
  var commaCount=(s.match(/,/g)||[]).length;
  if(dotCount>=2){
    // Múltiples puntos = separadores de miles colombianos: 8.000.000 o 8.000.000,50
    s=s.replace(/\./g,''); // quitar puntos de miles
    s=s.replace(',','.'); // coma decimal → punto
  } else if(dotCount===1&&commaCount===0){
    // Un solo punto: puede ser decimal (8.50) o miles (8.000)
    var afterDot=s.split('.')[1]||'';
    if(afterDot.length===3){
      // 8.000 = 8000 (separador de miles)
      s=s.replace('.','');
    }
    // else: 8.50 = decimal, dejar como está
  } else if(commaCount>=1&&dotCount===0){
    // Solo comas: 8,000,000 → formato US
    s=s.replace(/,/g,'');
  } else if(dotCount===1&&commaCount===1){
    // 8.000,50 → colombiano
    s=s.replace('.','').replace(',','.');
  }
  return parseFloat(s)||0;
}

function _checkSoporteContent(text, codigo, concepto, valor, tercero){
  var obs=[];
  if(!text||text.trim().length<20){
    obs.push({tipo:'error',msg:'PDF sin texto extraíble (posiblemente escaneado sin OCR)'});
    return obs;
  }
  var upper=text.toUpperCase().replace(/[ÁÀÄÂ]/g,'A').replace(/[ÉÈËÊ]/g,'E')
    .replace(/[ÍÌÏÎ]/g,'I').replace(/[ÓÒÖÔ]/g,'O').replace(/[ÚÙÜÛ]/g,'U').replace(/Ñ/g,'N');
  var req=_REQ_SOPORTE[codigo];

  // 1. Verificar documentos requeridos presentes
  var tieneComprobante=/COMPROBANTE/.test(upper);
  var tieneEgreso=/EGRESO|COMPROBANTE DE EGRESO/.test(upper);
  var tieneCedula=/CEDULA|C\.?C\.?\s*N|DOCUMENTO DE IDENTIDAD|IDENTIFICACION/.test(upper);
  var tieneRUT=/RUT|REGISTRO UNICO TRIBUTARIO|R\.U\.T/.test(upper);
  var tieneFactura=/FACTURA|CUENTA DE COBRO|CUENTA COBRO|DOCUMENTO EQUIVALENTE/.test(upper);
  var tieneFacturaE=/FACTURA ELECTRONICA|FACTURA ELECTR|CUFE|DIAN/.test(upper);
  var tieneContrato=/CONTRATO/.test(upper);
  var tieneExtracto=/EXTRACTO|ESTADO DE CUENTA|MOVIMIENTO/.test(upper);
  var tieneActa=/ACTA/.test(upper);

  if(concepto==='GASTO'){
    if(!tieneComprobante&&!tieneEgreso)
      obs.push({tipo:'warn',msg:'No se detecta COMPROBANTE DE EGRESO en el soporte'});
    if(req&&req.factura&&!tieneFactura)
      obs.push({tipo:'warn',msg:'No se detecta FACTURA ni CUENTA DE COBRO — soporte incompleto'});
    if(!tieneRUT)
      obs.push({tipo:'info',msg:'No se detecta RUT del proveedor en el soporte'});
    if(!tieneCedula)
      obs.push({tipo:'info',msg:'No se detecta cédula del proveedor en el soporte'});
    // Persona jurídica requiere factura electrónica
    var terU=(tercero||'').toUpperCase();
    var esJuridica=_KW_PERSONA_JURIDICA.some(function(kw){return terU.indexOf(kw)!==-1;});
    if(esJuridica&&!tieneFacturaE)
      obs.push({tipo:'warn',msg:'Tercero es PERSONA JURÍDICA pero no se detecta FACTURA ELECTRÓNICA ni CUFE'});
    // Código 205 transporte: requiere contrato
    if(codigo==='205'&&!tieneContrato){
      var textoG=upper;
      var reqVeh=_KW_REQUIERE_CONTRATO_VEH.some(function(kw){return textoG.indexOf(kw)!==-1;});
      if(reqVeh)
        obs.push({tipo:'warn',msg:'Soporte de transporte sin CONTRATO DE ALQUILER DE VEHÍCULO'});
    }
    // Código 208 propaganda: requiere contrato
    if(codigo==='208'&&!tieneContrato)
      obs.push({tipo:'warn',msg:'Propaganda electoral sin CONTRATO en el soporte'});
    // Código 211: requiere extracto
    if(codigo==='211'&&!tieneExtracto)
      obs.push({tipo:'warn',msg:'Gastos financieros (211) sin EXTRACTO BANCARIO en el soporte'});
  }

  if(concepto==='INGRESO'){
    if(!tieneComprobante)
      obs.push({tipo:'info',msg:'No se detecta COMPROBANTE DE INGRESO en el soporte'});
    // Código 102: donación
    if(codigo==='102'){
      if(!tieneCedula&&!tieneRUT)
        obs.push({tipo:'warn',msg:'Donación (102) sin cédula ni RUT del donante en el soporte'});
      // Persona jurídica → acta
      var terUI=(tercero||'').toUpperCase();
      var esJurI=_KW_PERSONA_JURIDICA.some(function(kw){return terUI.indexOf(kw)!==-1;});
      if(esJurI&&!tieneActa)
        obs.push({tipo:'warn',msg:'Donación de PERSONA JURÍDICA sin ACTA de junta/asamblea en el soporte'});
      // Donación en especie
      if(/ESPECIE|BIEN\s+DONADO|DONACION EN ESPECIE|DONACION\s+EN\s+ESPECIE/.test(upper))
        obs.push({tipo:'info',msg:'Donación EN ESPECIE detectada — verificar valor comercial y soporte de compra'});
    }
    // Código 103: crédito
    if(codigo==='103'&&!(/CREDITO|PRESTAMO|PAGARE|DESEMBOLSO/.test(upper)))
      obs.push({tipo:'warn',msg:'Crédito (103) sin documento de crédito/pagaré en el soporte'});
    // Código 106: no debe ser del candidato
    if(codigo==='106')
      obs.push({tipo:'error',msg:'Código 106 NO debe ser diligenciado por el candidato — solo por el partido'});
  }

  // 2. Verificar montos — buscar valores en el PDF y comparar con el valor reportado
  if(valor>0){
    var montos=[];
    var montosDollar=[]; // montos con signo $ (alta confianza)
    var valorTx=parseFloat(valor);
    // Helper: verificar si posición está en contexto de cédula/NIT/teléfono
    var _ctxID=/(?:C\.?\s*C\.?|CEDULA|NIT|N\.?I\.?T\.?|DOCUMENTO|IDENTIFICACION|TEL|CELULAR|FAX|No\.?\s*$|NUM|PAGINA|PAG|FOLIO)\s*:?\s*$/i;
    function _esContextoID(pos){
      var antes=text.substring(Math.max(0,pos-30),pos);
      return _ctxID.test(antes);
    }
    // Patrón 1: con signo $ → $8.000.000 o $8,000,000 o $8000000
    var montoRe1=/\$\s*([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/g;
    var mm;
    while((mm=montoRe1.exec(text))!==null){
      var parsed=_parseMontoCol(mm[1]);
      if(parsed>0&&parsed<1e12){ montos.push(parsed); montosDollar.push(parsed); }
    }
    // Patrón 2: números grandes sin $ (>= 1000) con formato colombiano: 8.000.000
    var montoRe2=/(?:^|[^0-9$])(\d{1,3}(?:\.\d{3})+)(?:[^0-9]|$)/g;
    while((mm=montoRe2.exec(text))!==null){
      if(_esContextoID(mm.index)) continue; // saltar cédulas/NIT
      var parsed2=_parseMontoCol(mm[1]);
      if(parsed2>=1000&&parsed2<1e12) montos.push(parsed2);
    }
    // Patrón 3: números sin formato >= 10000: 8000000
    var montoRe3=/(?:^|[^0-9.$])(\d{5,10})(?:[^0-9]|$)/g;
    while((mm=montoRe3.exec(text))!==null){
      if(_esContextoID(mm.index)) continue;
      var parsed3=parseFloat(mm[1]);
      if(parsed3>=10000&&parsed3<1e12) montos.push(parsed3);
    }
    // Patrón 4: con separador de miles coma (formato US): 8,000,000
    var montoRe4=/(\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?/g;
    while((mm=montoRe4.exec(text))!==null){
      if(_esContextoID(mm.index)) continue;
      var parsed4=parseFloat(mm[0].replace(/,/g,''));
      if(parsed4>=1000&&parsed4<1e12) montos.push(parsed4);
    }
    // Eliminar duplicados y verificar
    montos=montos.filter(function(v,i,a){return a.indexOf(v)===i;});
    montosDollar=montosDollar.filter(function(v,i,a){return a.indexOf(v)===i;});
    if(montos.length>0){
      // Si hay montos con $, priorizar esos para la comparación
      var listaComp=montosDollar.length>0?montosDollar:montos;
      var matchExacto=listaComp.some(function(m){return Math.abs(m-valorTx)<2;});
      var matchCerca=listaComp.some(function(m){return valorTx>0&&Math.abs(m-valorTx)/valorTx<0.05;});
      if(!matchExacto&&!matchCerca&&valorTx>10000){
        // Intentar también con todos los montos
        matchExacto=montos.some(function(m){return Math.abs(m-valorTx)<2;});
        matchCerca=montos.some(function(m){return valorTx>0&&Math.abs(m-valorTx)/valorTx<0.05;});
        if(!matchExacto&&!matchCerca){
          var maxMonto=Math.max.apply(null,listaComp.length>0?listaComp:montos);
          obs.push({tipo:'warn',msg:'Valor reportado $'+Math.round(valorTx).toLocaleString()+' NO coincide con montos en soporte (máx encontrado: $'+Math.round(maxMonto).toLocaleString()+')'});
        }
      }
    }
  }

  // 3. Verificar fechas en el PDF
  var fechaRe=/(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/g;
  var fechas=[];
  var fm;
  while((fm=fechaRe.exec(text))!==null){
    var yr=parseInt(fm[3]);
    if(yr>=2023&&yr<=2024) fechas.push(fm[0]);
  }
  // Buscar fechas fuera de 2023 — solo si están en contexto de fecha (dd/mm/YYYY, dd-mm-YYYY, o precedido por palabras de fecha)
  var fechasFuera=[];
  var fechaRe2=/(?:(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.])(20\d{2}))|(?:(?:FECHA|ANO|AÑO|A[ÑN]O|YEAR|ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC|ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s*:?\s*(?:\d{1,2}\s*)?(?:DE\s+)?)(20\d{2})/gi;
  var fm2;
  while((fm2=fechaRe2.exec(text))!==null){
    var yr2=parseInt(fm2[1]||fm2[2]);
    if(yr2<2023||yr2>2024) fechasFuera.push(yr2);
  }
  if(fechasFuera.length>0){
    var uniq=fechasFuera.filter(function(v,i,a){return a.indexOf(v)===i;});
    if(uniq.some(function(y){return y<2023;}))
      obs.push({tipo:'info',msg:'Se detectan fechas anteriores a 2023 en el soporte ('+uniq.join(', ')+')'});
  }

  // 4. Si no hay observaciones, todo OK
  if(obs.length===0)
    obs.push({tipo:'ok',msg:'Soporte aparenta estar completo'});

  return obs;
}

function _analizarTodosSoportesCC(){
  if(!CAND_SELEC) return;
  var cedula=String(CAND_SELEC.id||'').replace(/\./g,'').trim();
  var ccSop=CC_SOPORTES_CACHE[cedula];
  if(!ccSop||!ccSop.porCodigo){
    alert('No hay soportes CC cargados para este candidato');return;
  }
  var panel=document.getElementById('panelAnalisisSoportes');
  if(!panel) return;
  panel.innerHTML='<div class="text-center py-3"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Leyendo y analizando soportes CC...</div></div>';
  panel.style.display='block';

  // Recopilar soportes: por cada transacción, buscar el soporte CC que corresponde por comprobante+valor
  var items=[];
  var txData=window._lastTxData||[];
  var usedArchivos={};
  txData.forEach(function(t){
    var cco=(t.cco_id||'').toString().replace(/\.0$/,'').trim();
    var tipoTx=(t.concepto||'').toUpperCase();
    var tVal=parseFloat(t.valor||0);
    var tComp=(t.comprobante||t.nro_comprobante||'').toString().replace(/\.0$/,'').trim();
    var matches=ccSop.porCodigo[cco]||[];
    if(!matches.length) return;
    // Buscar el soporte correcto: 1) por nro_comprobante+valor, 2) por valor, 3) por nro_comprobante, 4) primero disponible
    var best=null;
    // Filtrar por tipo
    var typed=matches.filter(function(m){return (m.tipo||'').toUpperCase()===tipoTx;});
    if(!typed.length) typed=matches;
    // Intentar match por comprobante exacto
    if(tComp){
      var byComp=typed.filter(function(m){return m.nro_comp===tComp;});
      if(byComp.length===1) best=byComp[0];
      else if(byComp.length>1&&tVal){
        var byCompVal=byComp.filter(function(m){return Math.abs(m.valor-tVal)<1;});
        best=byCompVal.length?byCompVal[0]:byComp[0];
      } else if(byComp.length>1) best=byComp[0];
    }
    // Si no matcheó por comprobante, intentar por valor
    if(!best&&tVal){
      var byVal=typed.filter(function(m){return Math.abs(m.valor-tVal)<1&&!usedArchivos[m.archivo];});
      if(byVal.length) best=byVal[0];
    }
    // Fallback: primer disponible no usado
    if(!best){
      var avail=typed.filter(function(m){return m.archivo&&!usedArchivos[m.archivo];});
      if(avail.length) best=avail[0];
      else if(typed.length) best=typed[0];
    }
    if(best&&best.archivo){
      usedArchivos[best.archivo]=true;
      items.push({codigo:cco, tipo:best.tipo||tipoTx, nombre:best.nombre||'', archivo:best.archivo, tercero:t.tercero||best.nombre||'', valor:tVal, terceroTx:t.tercero||'', nro_comp:tComp});
    }
  });

  if(!items.length){
    panel.innerHTML='<div class="alert alert-info">No hay soportes CC con archivo para analizar</div>';
    return;
  }

  var resultados=[];
  var done=0;
  var cacheKey='cne_sopanal_'+cedula;

  // Verificar cache
  try{
    var cached=JSON.parse(localStorage.getItem(cacheKey)||'null');
    if(cached&&cached.length===items.length){
      _renderAnalisisSoportes(cached, items, panel);
      return;
    }
  }catch(e){}

  items.forEach(function(it, idx){
    var url='/api/cne/storage/app/'+encodeURI(it.archivo);
    _leerSoportePdfCC(url, function(text){
      var obs;
      if(text===null){
        obs=[{tipo:'error',msg:'No se pudo leer el PDF'}];
      } else {
        obs=_checkSoporteContent(text, it.codigo, it.tipo, it.valor, it.terceroTx);
      }
      resultados[idx]=obs;
      done++;
      // Actualizar progreso
      var pct=Math.round(done*100/items.length);
      var progBar=panel.querySelector('.progress-bar');
      if(progBar){progBar.style.width=pct+'%';progBar.textContent=done+'/'+items.length;}
      if(done===items.length){
        // Guardar en cache
        try{localStorage.setItem(cacheKey,JSON.stringify(resultados));}catch(e){}
        _renderAnalisisSoportes(resultados, items, panel);
      }
    });
    // Agregar barra de progreso después del primer fetch
    if(idx===0){
      panel.innerHTML='<div class="mb-2 fw-bold"><i class="fa fa-search me-1"></i>Analizando '+items.length+' soportes CC... <small class="text-muted">(PDFs escaneados usarán OCR, puede tardar)</small></div>'+
        '<div class="progress mb-3" style="height:20px"><div class="progress-bar progress-bar-striped progress-bar-animated" style="width:0%">0/'+items.length+'</div></div>'+
        '<div id="analisisResultParcial"></div>';
    }
  });
}

function _renderAnalisisSoportes(resultados, items, panel){
  var totalObs=0, errores=0, warnings=0, oks=0;
  resultados.forEach(function(obs){
    obs.forEach(function(o){
      if(o.tipo==='error') errores++;
      else if(o.tipo==='warn') warnings++;
      else if(o.tipo==='ok') oks++;
    });
    totalObs+=obs.length;
  });

  var h='<div class="card border-primary mb-3"><div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">'+
    '<span><i class="fa fa-search me-1"></i>Análisis de Soportes CC — '+items.length+' documentos</span>'+
    '<button class="btn btn-sm btn-outline-light" onclick="localStorage.removeItem(\'cne_sopanal_'+String(CAND_SELEC.id||'').replace(/\./g,'').trim()+'\');_analizarTodosSoportesCC()"><i class="fa fa-refresh me-1"></i>Re-analizar</button>'+
    '</div><div class="card-body p-2">';

  // Resumen
  h+='<div class="row g-2 mb-2">'+
    '<div class="col"><div class="border rounded p-2 text-center '+(errores?'bg-danger bg-opacity-10':'bg-light')+'">'+
    '<div class="fw-bold text-danger">'+errores+'</div><div class="small">Errores</div></div></div>'+
    '<div class="col"><div class="border rounded p-2 text-center '+(warnings?'bg-warning bg-opacity-25':'bg-light')+'">'+
    '<div class="fw-bold text-warning">'+warnings+'</div><div class="small">Advertencias</div></div></div>'+
    '<div class="col"><div class="border rounded p-2 text-center bg-light">'+
    '<div class="fw-bold text-success">'+oks+'</div><div class="small">OK</div></div></div>'+
    '</div>';

  // Tabla detallada — solo mostrar soportes con observaciones relevantes (no solo OK)
  h+='<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="font-size:.78rem">'+
    '<thead class="table-light"><tr><th>Tipo</th><th>Cód.</th><th>Concepto</th><th>Soporte CC</th><th>Observaciones</th></tr></thead><tbody>';

  items.forEach(function(it, idx){
    var obs=resultados[idx]||[];
    var hasIssue=obs.some(function(o){return o.tipo==='error'||o.tipo==='warn';});
    if(!hasIssue&&obs.length===1&&obs[0].tipo==='ok') return; // skip OK items
    var codInfo=(it.tipo==='INGRESO'?_COD_INGRESO:_COD_GASTO)[it.codigo];
    var codNombre=codInfo?codInfo.nombre:('Código '+it.codigo);
    var rowCls=obs.some(function(o){return o.tipo==='error';})?'table-danger':
      obs.some(function(o){return o.tipo==='warn';})?'table-warning':'';
    var obsHtml=obs.map(function(o){
      var icon=o.tipo==='error'?'<i class="fa fa-times-circle text-danger me-1"></i>':
        o.tipo==='warn'?'<i class="fa fa-exclamation-triangle text-warning me-1"></i>':
        o.tipo==='ok'?'<i class="fa fa-check-circle text-success me-1"></i>':
        '<i class="fa fa-info-circle text-info me-1"></i>';
      return '<div>'+icon+esc(o.msg)+'</div>';
    }).join('');
    var link=it.archivo?'<a href="/api/cne/storage/app/'+encodeURI(it.archivo)+'" target="_blank" class="btn btn-sm btn-outline-primary py-0"><i class="fa fa-cloud me-1"></i>PDF</a>':'—';
    h+='<tr class="'+rowCls+'">'+
      '<td><span class="badge '+(it.tipo==='INGRESO'?'bg-success':'bg-danger')+'">'+it.tipo+'</span></td>'+
      '<td>'+esc(it.codigo)+'</td>'+
      '<td class="small">'+esc(codNombre)+'</td>'+
      '<td>'+link+'</td>'+
      '<td>'+obsHtml+'</td></tr>';
  });

  // Mostrar resumen de OK
  var okCount=0;
  items.forEach(function(it,idx){
    var obs=resultados[idx]||[];
    if(obs.length===1&&obs[0].tipo==='ok') okCount++;
  });
  if(okCount>0){
    h+='<tr class="table-success"><td colspan="5"><i class="fa fa-check-circle text-success me-1"></i>'+okCount+' soporte(s) sin observaciones</td></tr>';
  }
  h+='</tbody></table></div></div></div>';
  panel.innerHTML=h;
}

function guardarMotivoArt27(key, val){
  try {
    if(val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
    var sel=document.querySelector('select[data-a27key="'+key+'"]');
    if(sel){ var tr=sel.closest('tr'); if(tr) tr.classList.toggle('table-warning',!!val&&val!=='No aplica'); }
  } catch(e){}
}

var _OPCIONES_ART25 = [
  'EXISTE EL REGISTRO EN LOS EXTRACTOS',
  'NO EXISTE EL REGISTRO EN LOS EXTRACTOS',
  'NO APLICA',
];

function guardarArt25(key, val){
  try {
    if(val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch(e){}
}

var _MOTIVOS_DEDUCCION = [
  '(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 34',
  '(-) TRANSFERENCIAS',
  '(-) GASTOS CANDIDATOS NO PRESENTARON EN DEBIDA FORMA',
  '(-) GASTOS CANDIDATOS QUE NO PRESENTARON EL INFORME',
  '(-) GASTOS SIN RELACIÓN DE CAUSALIDAD',
  '(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 23',
  '(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 24',
  '(-) GASTOS CANDIDATOS RETIRADOS',
  '(-) GASTOS CANDIDATOS REVOCADOS',
  '(-) GASTOS QUE NO ESTÁN DEBIDAMENTE SOPORTADOS',
  '(-) GASTOS CON POSTERIORIDAD A LA FECHA DEL DEBATE',
];

function guardarMotivoTx(txKey, val){
  try {
    if(val) localStorage.setItem(txKey, val);
    else localStorage.removeItem(txKey);
    var sel=document.querySelector('select[data-txkey="'+txKey+'"]');
    if(sel){ var tr=sel.closest('tr'); if(tr) tr.classList.toggle('table-warning',!!val); }
  } catch(e){}
}

function guardarObsTx(obsKey, val){
  try {
    if(val) localStorage.setItem(obsKey, val);
    else localStorage.removeItem(obsKey);
  } catch(e){}
}

function renderTablaTx(data, topeInd, fechaInsc){
  window._lastTxData=data; // Para análisis de soportes CC
  var c=CAND_SELEC;
  var FECHA_ELECCION='2023-10-29';
  var ing=data.filter(function(t){return t.concepto==='INGRESO';});
  var gas=data.filter(function(t){return t.concepto==='GASTO';});
  var tI=ing.reduce(function(s,t){return s+parseFloat(t.valor||0);},0);
  var tG=gas.reduce(function(s,t){return s+parseFloat(t.valor||0);},0);
  var limArt23=topeInd?topeInd*0.10:null;
  var art25Oblig=topeInd&&topeInd>=232000000;

  // Debug: log una vez
  var _urlBtnDebug=false;
  function urlBtn(t){
    // 0) Datos CC agrupados: el item ya trae sus archivos directamente
    if(t._cc_archivos&&t._cc_archivos.length){
      if(t._cc_archivos.length===1){
        return '<a href="/api/cne/storage/app/'+encodeURI(t._cc_archivos[0])+'" target="_blank" class="btn btn-sm btn-outline-primary url-preview-btn"><i class="fa fa-cloud me-1"></i>CC</a>';
      }
      var btns='<div class="d-flex flex-column gap-1" style="min-width:42px">';
      t._cc_archivos.forEach(function(arch,ai){
        btns+='<a href="/api/cne/storage/app/'+encodeURI(arch)+'" target="_blank" class="btn btn-sm btn-outline-primary url-preview-btn py-0 px-1" style="font-size:.68rem;line-height:1.4" title="Soporte '+(ai+1)+'"><i class="fa fa-cloud me-1"></i>CC'+(ai+1)+'</a>';
      });
      btns+='</div>';
      return btns;
    }
    // Prioridad: 1) Soporte CC (Cuentas Claras porCodigo), 2) PDF local, 3) url_preview FNFP
    var cedula=String(c.id||'').replace(/\./g,'').trim();
    var ccSop=CC_SOPORTES_CACHE[cedula];
    if(!_urlBtnDebug){
      _urlBtnDebug=true;
      console.log('[urlBtn] cedula='+cedula+', ccSop='+(ccSop?'OK ('+Object.keys(ccSop.porCodigo||{}).join(',')+')':'NULL/EMPTY')+', cco_id='+(t.cco_id||''));
    }
    if(ccSop&&ccSop.porCodigo){
      var cco=(t.cco_id||'').toString().replace(/\.0$/,'').trim();
      var matches=ccSop.porCodigo[cco]||[];
      if(matches.length){
        var tVal=parseFloat(t.valor||0);
        var comp=(t.comprobante||t.nro_comprobante||'').toString().replace(/\.0$/,'').trim();
        // Filtrar: 1) por nro_comprobante, 2) por valor, 3) todos
        var filtered=matches;
        if(matches.length>1){
          if(comp){
            var byComp=matches.filter(function(m){return m.nro_comp&&m.nro_comp===comp;});
            if(byComp.length>=1) filtered=byComp;
          }
          if(filtered.length===matches.length&&tVal){
            var byVal=matches.filter(function(m){return m.valor&&Math.abs(m.valor-tVal)<1;});
            if(byVal.length>=1&&byVal.length<matches.length) filtered=byVal;
          }
        }
        // Si queda 1 solo → botón simple CC
        if(filtered.length===1&&filtered[0].archivo){
          return '<a href="/api/cne/storage/app/'+encodeURI(filtered[0].archivo)+'" target="_blank" class="btn btn-sm btn-outline-primary url-preview-btn" title="'+esc(filtered[0].nombre)+'"><i class="fa fa-cloud me-1"></i>CC</a>';
        }
        // Múltiples soportes → dropdown compacto vertical
        if(filtered.length>1){
          var btns='<div class="d-flex flex-column gap-1" style="min-width:42px">';
          filtered.forEach(function(m,mi){
            if(m.archivo){
              var label=_shortSoporteName(m.nombre)||(filtered.length>1?'CC'+(mi+1):'CC');
              btns+='<a href="/api/cne/storage/app/'+encodeURI(m.archivo)+'" target="_blank" class="btn btn-sm btn-outline-primary url-preview-btn py-0 px-1" style="font-size:.68rem;line-height:1.4" title="'+esc(m.nombre)+'"><i class="fa fa-cloud me-1"></i>'+esc(label)+'</a>';
            }
          });
          btns+='</div>';
          return btns;
        }
      }
    }
    var localPdf=_igPdfUrl(t, c.id, c.partido);
    if(localPdf)
      return '<a href="'+_encodePath(localPdf)+'" target="_blank" class="btn btn-sm btn-outline-success url-preview-btn" title="PDF local"><i class="fa fa-file-pdf me-1"></i>Ver</a>';
    if(t.url_preview)
      return '<a href="'+esc(t.url_preview)+'" target="_blank" class="btn btn-sm btn-outline-danger url-preview-btn" title="Vista en FNFP"><i class="fa fa-file-pdf me-1"></i>Ver</a>';
    return '<span class="text-muted small">—</span>';
  }
  // Abreviar nombre de soporte para labels compactos
  function _shortSoporteName(n){
    if(!n) return '';
    var u=n.toUpperCase();
    if(/EGRESO|COMPROBANTE/.test(u)) return 'Egreso';
    if(/FACTURA/.test(u)) return 'Factura';
    if(/RUT/.test(u)) return 'RUT';
    if(/CEDULA|CC |C\.C/.test(u)) return 'Cédula';
    if(/CONTRATO/.test(u)) return 'Contrato';
    if(/EXTRACTO/.test(u)) return 'Extracto';
    if(/COTIZACION/.test(u)) return 'Cotización';
    if(/CUENTA.*COBRO/.test(u)) return 'Cta Cobro';
    if(/ACTA/.test(u)) return 'Acta';
    if(/INGRESO/.test(u)) return 'Ingreso';
    if(/RECIBO/.test(u)) return 'Recibo';
    // Tomar primeras 8 letras
    return n.length>10?n.substring(0,8)+'…':n;
  }

  // Columna PERÍODO: antes de inscripción / en término / post electoral
  function celdaPeriodo(t){
    var f=(t.fecha||'').trim();
    if(!f||f==='—') return '<td class="text-center text-muted small">—</td>';
    if(!fechaInsc)
      return '<td class="text-center text-muted small" title="Ingrese fecha de inscripción">N/D</td>';
    if(f<fechaInsc)
      return '<td class="text-center"><span class="badge bg-danger" title="Gasto/ingreso ANTES de la fecha de inscripción de la lista">ANTES INSCRIPCIÓN</span></td>';
    if(f>FECHA_ELECCION)
      return '<td class="text-center"><span class="badge bg-warning text-dark" title="Gasto/ingreso DESPUÉS del evento electoral (29-Oct-2023)">POST ELECTORAL</span></td>';
    return '<td class="text-center text-success small">✓ EN TÉRMINO</td>';
  }

  function celda23(t){
    var cco=(t.cco_id||'').toString().trim();
    var val=parseFloat(t.valor||0);
    if(cco!=='102') return '<td class="text-center text-muted small">N/A</td>';
    if(limArt23&&val>limArt23)
      return '<td class="text-center"><span class="badge bg-danger" title="Donación individual excede 10% del tope ('+fmtCOP(limArt23)+')">ALERTA</span></td>';
    return '<td class="text-center text-success small">✓ OK</td>';
  }

  function _autoArt27Hint(t){
    var nit=(t.nit_cc||'').toString().replace(/\s/g,'');
    var cco=(t.cco_id||'').toString().trim();
    var ter=(t.tercero||'').toUpperCase();
    if(cco==='101'||cco==='103') return '';
    var hints=[];
    var isAnon=(!nit||nit==='0'||nit.toUpperCase()==='ANONIMO'||nit==='nan'||nit==='-');
    if(isAnon) hints.push('⚠ Sin NIT/CC → posible aporte anónimo (Art.27)');
    // Art.27: código 102 — si cédula no existe en ANI → aporte anónimo
    if(cco==='102' && !isAnon && _aniNoExiste(nit, t))
      hints.push('⚠ CC '+nit+' NO existe en ANI → aporte anónimo (Art.27)');
    if(_KEYWORDS_ESTATAL.some(function(k){return ter.indexOf(k)!==-1;}))
      hints.push('⚠ Tercero: posible entidad estatal — verificar Art.27');
    return hints.join(' | ');
  }

  function celda27(t, idx){
    var nit=(t.nit_cc||'').toString().replace(/\s/g,'');
    var cco=(t.cco_id||'').toString().trim();
    if(cco==='101'||cco==='103') return '<td class="text-center text-muted small">N/A</td>';
    var a27Key='cne_art27_'+(c?c.id:'X')+'_I_'+idx;
    var curMot=''; try{curMot=localStorage.getItem(a27Key)||'';}catch(e){}
    var isAnon=(!nit||nit==='0'||nit.toUpperCase()==='ANONIMO'||nit==='nan'||nit==='-');
    var aniMissing=(cco==='102' && !isAnon && _aniNoExiste(nit, t));
    // Auto-fill "Aportes anónimos" si no tiene valor manual y ANI falla
    if(!curMot && (isAnon || aniMissing)){
      curMot='Aportes anónimos';
      try{localStorage.setItem(a27Key,curMot);}catch(e){}
    }
    var badge='';
    if(isAnon) badge='<span class="badge bg-danger d-block mb-1" title="Sin NIT/CC identificado">ANÓNIMO</span>';
    else if(aniMissing) badge='<span class="badge bg-danger d-block mb-1" title="CC '+esc(nit)+' NO existe en ANI — posible aporte anónimo">ANI: NO EXISTE</span>';
    var opts='<option value="">(sin marca)</option>'+
      _MOTIVOS_ART27.map(function(m){
        return '<option value="'+esc(m)+'"'+(curMot===m?' selected':'')+'>'+esc(m)+'</option>';
      }).join('');
    return '<td style="min-width:175px">'+badge+
      '<select class="form-select form-select-sm" style="font-size:.7rem" '+
      'data-a27key="'+esc(a27Key)+'" '+
      'onchange="guardarMotivoArt27(\''+a27Key+'\',this.value)">'+opts+'</select></td>';
  }

  function _autoArt25Hint(){
    if(!topeInd) return '';
    if(art25Oblig) return '⚠ Tope ≥ $232M — verificar extracto cuenta bancaria exclusiva Art.25';
    return 'Tope < $232M — Art.25 no aplica';
  }

  function celda25(idx, concepto){
    if(!topeInd) return '<td class="text-center text-muted small">N/D</td>';
    var a25Key='cne_art25_'+(c?c.id:'X')+'_'+(concepto||'X')+'_'+(idx||0);
    var curVal=''; try{curVal=localStorage.getItem(a25Key)||'';}catch(e){}
    if(!curVal) curVal=art25Oblig?'':'NO APLICA';
    var badge=art25Oblig?'<span class="badge bg-warning text-dark d-block mb-1" style="font-size:.65rem">VERIFICAR ≥$232M</span>':'';
    var opts=_OPCIONES_ART25.map(function(o){
      return '<option value="'+esc(o)+'"'+(curVal===o?' selected':'')+'>'+esc(o)+'</option>';
    }).join('');
    return '<td style="min-width:175px">'+badge+
      '<select class="form-select form-select-sm" style="font-size:.7rem" '+
      'onchange="guardarArt25(\''+a25Key+'\',this.value)">'+
      '<option value="">(sin marca)</option>'+opts+'</select></td>';
  }

  function celda34(txKey, curMot){
    var motOpts='<option value="">(sin deducción)</option>'+
      _MOTIVOS_DEDUCCION.map(function(m){
        return '<option value="'+esc(m)+'"'+(curMot===m?' selected':'')+'>'+esc(m)+'</option>';
      }).join('');
    return '<td><select class="form-select form-select-sm" style="font-size:.72rem;min-width:190px" '+
      'data-txkey="'+esc(txKey)+'" '+
      'onchange="guardarMotivoTx(\''+txKey+'\',this.value)">'+motOpts+'</select></td>';
  }

  function celdaObs(obsKey, curObs, autoHints){
    var hintHtml='';
    if(autoHints && autoHints.length){
      hintHtml='<div class="mt-1" style="font-size:.65rem;line-height:1.2">';
      autoHints.forEach(function(h){
        var cls=h.indexOf('⚠')!==-1?'text-danger fw-semibold':'text-warning';
        if(h.indexOf('ℹ')!==-1) cls='text-info';
        hintHtml+='<div class="'+cls+'">'+esc(h)+'</div>';
      });
      hintHtml+='</div>';
    }
    return '<td style="min-width:220px"><input type="text" class="form-control form-control-sm" '+
      'style="font-size:.72rem" '+
      'value="'+esc(curObs)+'" '+
      'placeholder="Observaciones..." '+
      'onchange="guardarObsTx(\''+obsKey+'\',this.value)">'+hintHtml+'</td>';
  }

  // Badge de soporte contable
  function soporteBadge(t, concepto){
    var cco=(t.cco_id||'').toString().replace(/\.0$/,'').trim();
    var comp=(t.comprobante||t.nro_comprobante||'').toString().replace(/\.0$/,'').trim();
    var hasPdf=false;
    if(IG_INDEX && c){
      var match=_igMatchPartido(c.id, c.partido||t.partido||'');
      if(match){
        var pfx=concepto==='INGRESO'?'I':'G';
        var preciseKey=comp?pfx+'_'+comp+'_'+cco:'';
        var fallbackKey=pfx+'_'+cco;
        hasPdf=!!(match[preciseKey]||match[fallbackKey]);
      }
    }
    if(!hasPdf && t.url_preview) hasPdf=true;
    var codInfo=concepto==='INGRESO'?_COD_INGRESO[cco]:_COD_GASTO[cco];
    var codNombre=codInfo?codInfo.nombre:('Código '+cco);
    if(hasPdf)
      return '<span class="badge bg-success" style="font-size:.55rem" title="Soporte encontrado: '+esc(codNombre)+'">✓ SOPORTE</span>';
    return '<span class="badge bg-danger" style="font-size:.55rem" title="Sin soporte: '+esc(codNombre)+'">SIN SOPORTE</span>';
  }

  function mkTxKey(t, idx){
    var comp=(t.comprobante||t.nro_comprobante||String(idx)).replace(/[^a-zA-Z0-9]/g,'_');
    return 'cne_tx_'+(c?c.id:'X')+'_'+(t.concepto==='INGRESO'?'I':'G')+'_'+comp;
  }

  function filasIng(arr){
    // INGRESOS: Fecha|Cód.|Concepto|Tercero|NIT/CC|Comp.|Valor|Art.23|Art.27|Art.34|Art.25|Observaciones|PDF  (13 cols)
    return arr.map(function(t, idx){
      var comp=t.comprobante||t.nro_comprobante||'—';
      var cco=(t.cco_id||'').toString().trim();
      var obsKey='cne_obs_'+(c?c.id:'X')+'_I_'+idx;
      var curObs=''; try{curObs=localStorage.getItem(obsKey)||'';}catch(e){}
      var autoHints=_autoObsSoporte(t,'INGRESO',c,fechaInsc,topeInd);
      if(!curObs && autoHints.length){
        curObs=autoHints.filter(function(h){return h.indexOf('⚠')!==-1;}).join(' | ');
      }
      var codInfo=_COD_INGRESO[cco];
      var codTip=codInfo?codInfo.nombre:('Código '+cco);
      var rowCls=autoHints.some(function(h){return h.indexOf('⚠')!==-1;})?'table-warning':'';
      return '<tr class="'+rowCls+'">'+
        '<td class="small">'+esc(t.fecha||'—')+'</td>'+
        '<td class="small">'+esc(cco)+'</td>'+
        '<td class="small text-info" style="font-size:.7rem;max-width:160px">'+esc(codTip)+'</td>'+
        '<td class="small">'+esc(t.tercero||'—')+'</td>'+
        '<td class="small text-muted">'+esc(t.nit_cc||'—')+' '+_aniBadge(t.nit_cc, t._ani_tercero)+'</td>'+
        '<td class="small">'+esc(comp)+'</td>'+
        '<td class="text-end fw-semibold">'+fmtCOP(parseFloat(t.valor||0))+'</td>'+
        celda23(t)+
        celda27(t,idx)+
        celdaPeriodo(t)+
        celda25(idx,'I')+
        celdaObs(obsKey, curObs, autoHints)+
        '<td>'+urlBtn(t)+'</td></tr>';
    }).join('');
  }

  function filasGas(arr){
    // GASTOS: Fecha|Cód.|Tercero|NIT/CC|Soporte|Comp.|Valor|Período|Art.25|Observaciones|Motivo deducción|PDF  (12 cols)
    return arr.map(function(t, idx){
      var comp=t.comprobante||t.nro_comprobante||'—';
      var cco=(t.cco_id||'').toString().trim();
      var txKey=mkTxKey(t,idx);
      var obsKey='cne_obs_'+(c?c.id:'X')+'_G_'+idx;
      var curMot=''; try{curMot=localStorage.getItem(txKey)||'';}catch(e){}
      var curObs=''; try{curObs=localStorage.getItem(obsKey)||'';}catch(e){}
      var autoHints=_autoObsSoporte(t,'GASTO',c,fechaInsc,topeInd);
      if(!curObs && autoHints.length){
        curObs=autoHints.filter(function(h){return h.indexOf('⚠')!==-1;}).join(' | ');
      }
      // Auto-deducción si fecha fuera de período y no tiene motivo manual
      if(!curMot){
        var fecha=(t.fecha||'').trim();
        if(fechaInsc && fecha && fecha<fechaInsc)
          curMot='(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 34';
        else if(fecha && fecha>'2023-10-29')
          curMot='(-) GASTOS CON POSTERIORIDAD A LA FECHA DEL DEBATE';
      }
      var codInfo=_COD_GASTO[cco];
      var codTip=codInfo?codInfo.nombre:('Código '+cco);
      var rowCls=(curMot||autoHints.some(function(h){return h.indexOf('⚠')!==-1;}))?'table-warning':'';
      return '<tr class="'+rowCls+'">'+
        '<td class="small">'+esc(t.fecha||'—')+'</td>'+
        '<td class="small">'+esc(cco)+'</td>'+
        '<td class="small text-info" style="font-size:.7rem;max-width:160px">'+esc(codTip)+'</td>'+
        '<td class="small">'+esc(t.tercero||'—')+'</td>'+
        '<td class="small text-muted">'+esc(t.nit_cc||'—')+' '+_aniBadge(t.nit_cc, t._ani_tercero)+'</td>'+
        '<td class="small">'+esc(comp)+'</td>'+
        '<td class="text-end fw-semibold">'+fmtCOP(parseFloat(t.valor||0))+'</td>'+
        celdaPeriodo(t)+
        celda25(idx,'G')+
        celdaObs(obsKey, curObs, autoHints)+
        celda34(txKey, curMot)+
        '<td>'+urlBtn(t)+'</td></tr>';
    }).join('');
  }

  var leyenda='<div class="d-flex flex-wrap gap-3 mb-2 small border rounded p-2 bg-light">'+
    '<span><span class="badge bg-danger">ALERTA / ANTES INSCRIPCIÓN</span> Vulneración o antes del período</span>'+
    '<span><span class="badge bg-warning text-dark">POST ELECTORAL / VERIFICAR</span> Fuera del período o requiere revisión</span>'+
    '<span class="text-success fw-semibold">✓ EN TÉRMINO / OK</span> Válido'+
    ' &nbsp;<span class="text-muted">N/A</span> No aplica &nbsp;<span class="text-muted">N/D</span> Sin dato'+
    '</div>';

  // Resumen de soportes contables
  function _resumenSoportes(){
    var cedula2=String(c.id||'').replace(/\./g,'').trim();
    var ccSop2=CC_SOPORTES_CACHE[cedula2];
    var iOk=0,iNo=0,gOk=0,gNo=0,iArt34=0,gArt34=0;
    ing.forEach(function(t){
      var cco=(t.cco_id||'').toString().replace(/\.0$/,'').trim();
      var has=false;
      // Primero buscar en CC
      if(ccSop2&&ccSop2.porCodigo&&ccSop2.porCodigo[cco]&&ccSop2.porCodigo[cco].length) has=true;
      if(!has&&IG_INDEX&&c){var m=_igMatchPartido(c.id,c.partido||t.partido||'');if(m&&m['I_'+cco])has=true;}
      if(!has&&t.url_preview)has=true;
      if(has)iOk++;else iNo++;
      var f=(t.fecha||'').trim();
      if(f&&fechaInsc&&f<fechaInsc)iArt34++;
      if(f&&f>'2023-10-29')iArt34++;
    });
    gas.forEach(function(t){
      var cco=(t.cco_id||'').toString().replace(/\.0$/,'').trim();
      var has=false;
      if(ccSop2&&ccSop2.porCodigo&&ccSop2.porCodigo[cco]&&ccSop2.porCodigo[cco].length) has=true;
      if(!has&&IG_INDEX&&c){var m=_igMatchPartido(c.id,c.partido||t.partido||'');if(m&&m['G_'+cco])has=true;}
      if(!has&&t.url_preview)has=true;
      if(has)gOk++;else gNo++;
      var f=(t.fecha||'').trim();
      if(f&&fechaInsc&&f<fechaInsc)gArt34++;
      if(f&&f>'2023-10-29')gArt34++;
    });
    var html='<div class="row g-2 mb-3">';
    html+='<div class="col-md-3"><div class="border rounded p-2 text-center bg-light">'+
      '<div class="fw-bold">Soportes Ingresos</div>'+
      '<span class="badge bg-success">'+iOk+' con soporte</span> '+
      (iNo?'<span class="badge bg-danger">'+iNo+' SIN soporte</span>':'<span class="badge bg-success">Todos OK</span>')+
      '</div></div>';
    html+='<div class="col-md-3"><div class="border rounded p-2 text-center bg-light">'+
      '<div class="fw-bold">Soportes Gastos</div>'+
      '<span class="badge bg-success">'+gOk+' con soporte</span> '+
      (gNo?'<span class="badge bg-danger">'+gNo+' SIN soporte</span>':'<span class="badge bg-success">Todos OK</span>')+
      '</div></div>';
    var totArt34=iArt34+gArt34;
    html+='<div class="col-md-3"><div class="border rounded p-2 text-center '+(totArt34?'bg-warning bg-opacity-25':'bg-light')+'">'+
      '<div class="fw-bold">Art.34 Fechas</div>'+
      (totArt34?'<span class="badge bg-danger">'+totArt34+' fuera de período</span>':'<span class="badge bg-success">Todas en período</span>')+
      '</div></div>';
    // SAI status
    var saiData=SAI_INDEX?SAI_INDEX[_alphaKey?_normFNFP(c.partido):c.partido]:null;
    if(!saiData){var pn=(c.partido||'').toUpperCase().replace(/[^A-Z0-9 ]/g,'').trim();for(var sk in SAI_INDEX){if(sk.toUpperCase().indexOf(pn)!==-1||pn.indexOf(sk.toUpperCase())!==-1){saiData=SAI_INDEX[sk];break;}}}
    html+='<div class="col-md-3"><div class="border rounded p-2 text-center bg-light">'+
      '<div class="fw-bold">MAI/SAI</div>'+
      (saiData?'<span class="badge bg-success">'+esc(saiData.tipo)+' disponible</span> <a href="data/'+esc(saiData.url)+'" target="_blank" class="small"><i class="fa fa-file-pdf text-danger"></i> Ver</a>':'<span class="badge bg-danger">Sin MAI/SAI</span>')+
      '</div></div>';
    html+='</div>';
    // Botón analizar soportes CC
    var cedula4=String(c.id||'').replace(/\./g,'').trim();
    var ccSop4=CC_SOPORTES_CACHE[cedula4];
    if(ccSop4&&ccSop4.porCodigo&&Object.keys(ccSop4.porCodigo).length){
      var totalSop=0;
      Object.keys(ccSop4.porCodigo).forEach(function(k){totalSop+=ccSop4.porCodigo[k].length;});
      html+='<div class="mb-2"><button class="btn btn-sm btn-outline-primary" onclick="_analizarTodosSoportesCC()">'+
        '<i class="fa fa-search me-1"></i>Analizar contenido de '+totalSop+' soportes CC (leer PDFs)</button>'+
        ' <span class="text-muted small">Lee cada PDF y verifica documentos requeridos</span></div>';
    }
    html+='<div id="panelAnalisisSoportes" style="display:none"></div>';
    return html;
  }

  // ── Soportes CC sin transacción local ──
  function _ccSinTxLocal(tipoCC){
    var cedula3=String(c.id||'').replace(/\./g,'').trim();
    var ccSop3=CC_SOPORTES_CACHE[cedula3];
    if(!ccSop3||!ccSop3.porCodigo) return '';
    var codsLocal={};
    var arr=(tipoCC==='INGRESO')?ing:gas;
    arr.forEach(function(t){
      var cod=(t.cco_id||'').toString().replace(/\.0$/,'').trim();
      if(cod) codsLocal[cod]=(codsLocal[cod]||0)+1;
    });
    var sinMatch=[];
    Object.keys(ccSop3.porCodigo).forEach(function(cod){
      var items=ccSop3.porCodigo[cod];
      items.forEach(function(it){
        if(it.tipo!==tipoCC) return;
        var localCount=codsLocal[cod]||0;
        if(localCount<=0) sinMatch.push(it);
        else codsLocal[cod]--;
      });
    });
    if(!sinMatch.length) return '';
    var h='<div class="alert alert-warning mt-2 py-2"><i class="fa fa-exclamation-triangle me-1"></i>'+
      '<strong>'+sinMatch.length+' soporte(s) CC sin transacción local</strong> — Registrados en Cuentas Claras pero sin registro en Módulo 5/6:'+
      '<div class="table-responsive mt-2"><table class="table table-sm table-bordered mb-0" style="font-size:.8rem">'+
      '<thead class="table-warning"><tr><th>Cód.</th><th>Concepto</th><th>Soporte CC</th></tr></thead><tbody>';
    sinMatch.forEach(function(m){
      var cod=m.codigo||'';
      var desc=_CODIGOS_8B[cod]||m.nombre||'';
      var link=m.archivo?'<a href="/api/cne/storage/app/'+encodeURI(m.archivo)+'" target="_blank" class="btn btn-sm btn-outline-primary py-0"><i class="fa fa-cloud me-1"></i>PDF</a>':'—';
      h+='<tr><td>'+esc(cod)+'</td><td class="small">'+esc(desc)+'</td><td>'+link+'</td></tr>';
    });
    h+='</tbody></table></div></div>';
    return h;
  }

  return _resumenSoportes()+'<ul class="nav nav-tabs mb-2">'+
    '<li class="nav-item"><a class="nav-link active" href="#" onclick="txTab(\'ing\');return false">'+
    '<i class="fa fa-arrow-down text-success me-1"></i>Ingresos ('+ing.length+') — '+fmtCOP(tI)+'</a></li>'+
    '<li class="nav-item"><a class="nav-link" href="#" onclick="txTab(\'gas\');return false">'+
    '<i class="fa fa-arrow-up text-danger me-1"></i>Gastos ('+gas.length+') — '+fmtCOP(tG)+'</a></li></ul>'+

    '<div id="txI">'+leyenda+'<div class="table-responsive"><table class="table table-sm table-hover">'+
    '<thead class="table-success"><tr>'+
    '<th>Fecha</th><th>Cód.</th><th>Concepto</th><th>Tercero / Donante</th><th>NIT/CC</th><th>Comp.</th><th class="text-end">Valor</th>'+
    '<th class="text-center" title="Art.23: Límite donación individual (máx 10% tope candidato)">Art.23</th>'+
    '<th class="text-center" title="Art.27: Prohibición de financiación anónima">Art.27</th>'+
    '<th class="text-center" title="Período respecto a inscripción ('+(fechaInsc||'sin fecha')+') y elecciones (29-Oct-2023) — Art.34">Art.34</th>'+
    '<th class="text-center" title="Art.25: Tope ≥ $232M obliga cuenta bancaria exclusiva">Art.25</th>'+
    '<th style="min-width:220px">Observaciones</th>'+
    '<th>PDF</th></tr></thead>'+
    '<tbody>'+filasIng(ing)+'</tbody>'+
    '<tfoot><tr class="fw-bold table-success"><td colspan="6">TOTAL INGRESOS</td><td class="text-end">'+fmtCOP(tI)+'</td><td colspan="6"></td></tr></tfoot>'+
    '</table></div>'+_ccSinTxLocal('INGRESO')+'</div>'+

    '<div id="txG" style="display:none">'+leyenda+'<div class="table-responsive"><table class="table table-sm table-hover">'+
    '<thead class="table-danger"><tr>'+
    '<th>Fecha</th><th>Cód.</th><th>Concepto</th><th>Tercero</th><th>NIT/CC</th><th>Comp.</th><th class="text-end">Valor</th>'+
    '<th class="text-center" title="Período respecto a inscripción ('+(fechaInsc||'sin fecha')+') y elecciones (29-Oct-2023)">Período Art.34</th>'+
    '<th class="text-center" title="Art.25: Tope ≥ $232M obliga cuenta bancaria exclusiva">Art.25</th>'+
    '<th style="min-width:220px">Observaciones</th>'+
    '<th style="min-width:195px" title="Art.34: Gastos fuera del período de campaña — seleccione motivo de deducción">Motivo deducción</th>'+
    '<th>PDF</th></tr></thead>'+
    '<tbody>'+filasGas(gas)+'</tbody>'+
    '<tfoot><tr class="fw-bold table-danger"><td colspan="6">TOTAL GASTOS</td><td class="text-end">'+fmtCOP(tG)+'</td><td colspan="5"></td></tr></tfoot>'+
    '</table></div>'+_ccSinTxLocal('GASTO')+'</div>';
}

function txTab(tab){
  document.getElementById('txI').style.display=tab==='ing'?'block':'none';
  document.getElementById('txG').style.display=tab==='gas'?'block':'none';
  document.querySelectorAll('#panelTransacciones .nav-link').forEach(function(el,i){
    el.classList.toggle('active',(i===0&&tab==='ing')||(i===1&&tab==='gas'));
  });
}

