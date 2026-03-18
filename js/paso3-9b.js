// ─── PASO 4: 9B Y ANEXOS ────────────────────────────────────────────────
// TX_GLOBAL_9B: aggregated transactions for all candidates of same partido/mun
var TX_GLOBAL_9B=null;

function _findCandidatosMismoPartido(c){
  // Find ALL candidates with same partido + municipio + departamento + corporación (respeta Paso 1)
  var res=[];
  var pN=(c.partido||'').toUpperCase().trim();
  var mN=(c.municipio||'').toUpperCase().trim();
  var dN=(c.departamento||'').toUpperCase().trim();
  var _corpSel='';
  try{_corpSel=(document.getElementById('selCorp').value||'').toUpperCase().trim();}catch(e){}
  for(var id in CANDIDATOS){
    var x=CANDIDATOS[id];
    if((x.partido||'').toUpperCase().trim()===pN &&
       (x.municipio||'').toUpperCase().trim()===mN &&
       (x.departamento||'').toUpperCase().trim()===dN){
      if(_corpSel&&_corpSel!=='TODOS'){
        var xCargo=(x.cargo||'').toUpperCase().trim();
        // Normalizar cargo al mismo formato que selCorp
        if(xCargo.indexOf('ALCALD')!==-1) xCargo='ALCALDIA';
        else if(xCargo.indexOf('CONCEJO')!==-1) xCargo='CONCEJO';
        else if(xCargo.indexOf('ASAMBLEA')!==-1) xCargo='ASAMBLEA';
        else if(xCargo.indexOf('GOBERN')!==-1) xCargo='GOBERNACION';
        else if(xCargo.indexOf('JUNTA')!==-1||xCargo.indexOf('JAL')!==-1) xCargo='JAL';
        else if(xCargo.indexOf('CAMARA')!==-1) xCargo='CAMARA DE REPRESENTANTES';
        else if(xCargo.indexOf('SENADO')!==-1) xCargo='SENADO DE LA REPUBLICA';
        if(xCargo!==_corpSel) continue;
      }
      res.push(x);
    }
  }
  return res;
}

function _cargarTxGlobal9B(c, cb){
  // Load transactions for ALL candidates of same partido/mun and aggregate
  var compas=_findCandidatosMismoPartido(c);
  var pendientes=[];
  compas.forEach(function(x){
    if(!TX_CACHE[x.id]){
      var url=txUrlFor(x);
      if(url) pendientes.push({cand:x, url:url});
    }
  });
  if(!pendientes.length){
    // All already cached — aggregate
    TX_GLOBAL_9B=[];
    compas.forEach(function(x){ TX_GLOBAL_9B=TX_GLOBAL_9B.concat(TX_CACHE[x.id]||[]); });
    cb();
    return;
  }
  // Fetch all pending in parallel
  var fetches=pendientes.map(function(p){
    return fetch(p.url)
      .then(function(r){ if(!r.ok) throw new Error(); return r.json(); })
      .then(function(data){ TX_CACHE[p.cand.id]=data; })
      .catch(function(){ /* no tx for this candidate */ });
  });
  Promise.all(fetches).then(function(){
    TX_GLOBAL_9B=[];
    compas.forEach(function(x){ TX_GLOBAL_9B=TX_GLOBAL_9B.concat(TX_CACHE[x.id]||[]); });
    cb();
  });
}

// Parsear valor de CC que puede venir como string "8.000.000" (formato colombiano) o número 8000000
function _parseValorCC(v){
  if(typeof v==='number') return v;
  if(!v) return 0;
  var s=String(v).trim();
  // Si tiene múltiples puntos: formato colombiano (8.000.000)
  if((s.match(/\./g)||[]).length>=2){
    s=s.replace(/\./g,'').replace(',','.');
  } else if(s.indexOf(',')!==-1&&s.indexOf('.')===-1){
    // Solo coma: puede ser decimal colombiano (8000000,50)
    s=s.replace(',','.');
  } else if((s.match(/\./g)||[]).length===1){
    // Un punto: verificar si es miles (8.000) o decimal (8.50)
    var afterDot=s.split('.')[1]||'';
    if(afterDot.length===3) s=s.replace('.',''); // 8.000 = 8000
  }
  return parseFloat(s)||0;
}

// ── Libros CC: cargar ingresos-campana/gastos-campana de CC para TODOS candidatos del partido ──
var LIBROS_CC_CACHE={}; // cand_id → {ingresos:[], gastos:[]}
var LIBROS_CC_GLOBAL=[]; // all aggregated
function _cargarLibrosCCGlobal(partido, cb){
  // Candidatos CC del municipio actual filtrados por partido Y corporación
  var pN=_alphaKey(partido);
  var _corpSel=(document.getElementById('selCorp').value||'').toUpperCase();
  var _corpMapCC={'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2,'CAMARA DE REPRESENTANTES':1,'SENADO DE LA REPUBLICA':4};
  var _corpIdFiltro=_corpMapCC[_corpSel]||null;
  var ccCands=(_ccCandsMun||[]).filter(function(c){
    var oN=_alphaKey(c.org||'');
    if(!(oN===pN||oN.indexOf(pN)!==-1||pN.indexOf(oN)!==-1)) return false;
    if(_corpIdFiltro && c.corp_id && c.corp_id!==_corpIdFiltro) return false;
    return true;
  });
  if(!ccCands.length){ LIBROS_CC_GLOBAL=[]; cb(); return; }

  var dpto=window._ccDptoEntry, mun=window._ccMunEntry;
  if(!dpto||!mun){ LIBROS_CC_GLOBAL=[]; cb(); return; }

  var pendientes=[];
  ccCands.forEach(function(c){
    if(!LIBROS_CC_CACHE[c.cand_id]) pendientes.push(c);
  });

  if(!pendientes.length){
    LIBROS_CC_GLOBAL=[];
    ccCands.forEach(function(c){ var d=LIBROS_CC_CACHE[c.cand_id]||{}; LIBROS_CC_GLOBAL=LIBROS_CC_GLOBAL.concat(d.ingresos||[]).concat(d.gastos||[]); });
    cb(); return;
  }

  var fetches=pendientes.map(function(c){
    var qIG='id_candi='+c.cand_id+'&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
      '&id_departamento='+dpto.id+'&id_municipio='+mun.id+'&id_proceso='+PROCESO_ID_CC;
    // Usar listarIngresos/listarGastos con paginación completa
    return Promise.all([
      _ccFetchJSON('/api/cne/ingreso/listarIngresos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG),
      _ccFetchJSON('/api/cne/gasto/listarGastos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG)
    ]).then(function(r){
      var r0=r[0], r1=r[1];
      var ing=(r0&&r0.ingreso&&r0.ingreso.data)?r0.ingreso.data:(Array.isArray(r0)?r0:[]);
      var gas=(r1&&r1.gasto&&r1.gasto.data)?r1.gasto.data:(Array.isArray(r1)?r1:[]);
      var ingLP=(r0&&r0.pagination)?r0.pagination.last_page:((r0&&r0.ingreso&&r0.ingreso.last_page)?r0.ingreso.last_page:1);
      var gasLP=(r1&&r1.pagination)?r1.pagination.last_page:((r1&&r1.gasto&&r1.gasto.last_page)?r1.gasto.last_page:1);
      // Paginar ingresos y gastos restantes
      var extraP=[], extraM=[];
      for(var pg=2;pg<=ingLP&&pg<=20;pg++){extraM.push('ing');extraP.push(_ccFetchJSON('/api/cne/ingreso/listarIngresos?page='+pg+'&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG));}
      for(var pg2=2;pg2<=gasLP&&pg2<=20;pg2++){extraM.push('gas');extraP.push(_ccFetchJSON('/api/cne/gasto/listarGastos?page='+pg2+'&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG));}
      return Promise.all(extraP).then(function(exR){
        exR.forEach(function(er,i){
          if(extraM[i]==='ing'&&er&&er.ingreso&&er.ingreso.data) ing=ing.concat(er.ingreso.data);
          if(extraM[i]==='gas'&&er&&er.gasto&&er.gasto.data) gas=gas.concat(er.gasto.data);
        });
        // Normalizar valores (pueden venir en formato colombiano "8.000.000")
        ing.forEach(function(t){t._cc_cand=c.nombre||'';t._cc_cand_id=c.cand_id;t.concepto='INGRESO';t.valor=_parseValorCC(t.valor||t.monto||t.total||0);});
        gas.forEach(function(t){t._cc_cand=c.nombre||'';t._cc_cand_id=c.cand_id;t.concepto='GASTO';t.valor=_parseValorCC(t.valor||t.monto||t.total||0);});
        if(ingLP>1||gasLP>1) console.log('[Libros CC] '+c.nombre+': paginado ing='+ingLP+'p('+ing.length+'), gas='+gasLP+'p('+gas.length+')');
        LIBROS_CC_CACHE[c.cand_id]={ingresos:ing, gastos:gas};
      });
    }).catch(function(e){ console.log('[Libros CC] Error cand '+c.cand_id+':', e); LIBROS_CC_CACHE[c.cand_id]={ingresos:[],gastos:[]}; });
  });

  Promise.all(fetches).then(function(){
    LIBROS_CC_GLOBAL=[];
    ccCands.forEach(function(c){ var d=LIBROS_CC_CACHE[c.cand_id]||{}; LIBROS_CC_GLOBAL=LIBROS_CC_GLOBAL.concat(d.ingresos||[]).concat(d.gastos||[]); });
    console.log('[Libros CC] Cargados '+ccCands.length+' candidatos, '+LIBROS_CC_GLOBAL.length+' items totales');
    if(LIBROS_CC_GLOBAL.length) console.log('[Libros CC] primer item:', JSON.stringify(LIBROS_CC_GLOBAL[0]));
    cb();
  });
}

function render9BAnexos(){
  var c=CAND_SELEC;
  // Respetar filtro Paso 1: usar partido del selector
  var _selP=document.getElementById('selPartido');
  if(_selP&&_selP.value&&c) c={departamento:c.departamento,municipio:c.municipio,partido:_selP.value,
    cargo:c.cargo,observaciones:c.observaciones||{},informes:c.informes||[],nombre:c.nombre||'',id:c.id};
  document.getElementById('panel9BAnexos').innerHTML=
    '<div class="text-center p-4"><div class="spinner-border text-primary"></div><p class="mt-2">Cargando datos 9B (global: todos los candidatos del partido)...</p></div>';
  var _p3partido=(_selP&&_selP.value)?_selP.value:(c?c.partido:'');
  _cargarDictAnalisis(function(){
    _cargarAuditorDB(function(){
      _cargarConsolidado44(function(){
        _cargarTxGlobal9B(c, function(){
          _cargarLibrosCCGlobal(_p3partido, function(){
            _render9BAnexosInner(c);
          });
        });
      });
    });
  });
}

// Buscar org CC que coincida con el partido del candidato
function _findCCOrg9B(partido){
  var orgs=(window._ccGestionMunData&&window._ccGestionMunData._9b_orgs)?window._ccGestionMunData._9b_orgs:[];
  if(!orgs.length) return null;
  var pN=_alphaKey(partido);
  for(var i=0;i<orgs.length;i++){
    var oN=_alphaKey(orgs[i].orgName||'');
    if(oN===pN || oN.indexOf(pN)!==-1 || pN.indexOf(oN)!==-1) return orgs[i];
  }
  return orgs[0]; // fallback: primera org
}

// Buscar InfOrg CC que coincida con el partido (envíos/devoluciones/respuestas)
function _findCCInfOrg(partido){
  var orgs=(window._ccGestionMunData&&window._ccGestionMunData._infOrg)?window._ccGestionMunData._infOrg:[];
  if(!orgs.length) return null;
  var pN=_alphaKey(partido);
  for(var i=0;i<orgs.length;i++){
    var oN=_alphaKey(orgs[i].orgName||'');
    if(oN===pN || oN.indexOf(pN)!==-1 || pN.indexOf(oN)!==-1) return orgs[i];
  }
  return orgs[0];
}

// Construir URL de consolidado CC
function _ccConsolidadoUrl(ccOrg, fid){
  if(!ccOrg||!ccOrg.q9b) return '';
  // Extraer idDepartamento e idMunicipio de q9b
  var dM=ccOrg.q9b.match(/id_departamento=(\d+)/), mM=ccOrg.q9b.match(/id_municipio=(\d+)/);
  var pM=ccOrg.q9b.match(/idproceso=(\d+)/);
  return '/api/cne/descargar-consolidado?id='+fid+'&rol=contador&idproceso='+(pM?pM[1]:'')+
    '&idFormato='+fid+'&tipoOrganizacion='+ccOrg.tipo_id+'&idOrganizacion='+ccOrg.org_id+
    '&idCandidato=&idCorporacion='+ccOrg.corp_id+'&idCircunscripcion='+ccOrg.circ_id+
    '&idDepartamento='+(dM?dM[1]:'')+'&idMunicipio='+(mM?mM[1]:'');
}

// Nombres descriptivos de los códigos 9B
var _CODIGOS_9B={
  '100':'TOTAL INGRESOS','101':'Recursos propios del candidato','102':'Créditos o aportes del candidato',
  '103':'Contribuciones, donaciones y créditos de particulares','104':'Créditos obtenidos en entidades financieras',
  '105':'Ingresos originados en actos públicos de partidos','106':'Recursos propios de origen privado que los partidos destinan',
  '107':'Rendimientos financieros',
  '200':'TOTAL GASTOS','201':'Propaganda electoral','202':'Publicaciones y prensa',
  '203':'Jornada electoral y escrutinios','204':'Administración y funcionamiento de la campaña',
  '205':'Servicio de transporte, difusión, comunicación','206':'Gastos jurídicos y de rendición de cuentas',
  '207':'Inversiones realizadas anticipadas a la campaña','208':'Servicios públicos',
  '209':'Gastos financieros, incluidos intereses','210':'Créditos reconocidos por el Estado',
  '211':'Pagos y abonos de créditos obtenidos de entidades financieras','212':'Transferencias y/o giros a los candidatos'
};

// ── Lector PDF para CONSOLIDADO_44 (Radicación 9B) ───────────────────────
function _leer9BPdf(url, lsKey){
  var el=document.getElementById('res9bPdf');
  if(!el) return;
  el.style.display='block';
  el.innerHTML='<span class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Leyendo CONSOLIDADO_44.pdf...</span>';
  fetch(url).then(function(r){
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.arrayBuffer();
  }).then(function(buf){
    if(typeof pdfjsLib==='undefined'){
      el.innerHTML='<div class="alert alert-danger small py-1">PDF.js no disponible. Verifique conexión a internet.</div>';
      return;
    }
    pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise.then(function(pdf){
      var pageTexts=[], n=pdf.numPages, loaded=0;
      for(var i=1;i<=n;i++){
        (function(pn){
          pdf.getPage(pn).then(function(page){
            page.getTextContent().then(function(tc){
              // Reconstruir líneas usando coordenada Y
              var lines={};
              tc.items.forEach(function(it){
                var y=Math.round(it.transform[5]);
                if(!lines[y]) lines[y]=[];
                lines[y].push({x:it.transform[4],s:it.str});
              });
              var yKeys=Object.keys(lines).map(Number).sort(function(a,b){return b-a;});
              pageTexts[pn-1]=yKeys.map(function(y){
                return lines[y].sort(function(a,b){return a.x-b.x;}).map(function(it){return it.s;}).join(' ');
              }).join('\n');
              loaded++;
              if(loaded===n){
                var fullTxt=pageTexts.join('\n');
                var result=_extraer9BRadicacion(fullTxt);
                _mostrar9BResult(result, el, lsKey);
              }
            });
          });
        })(i);
      }
    }).catch(function(err){
      el.innerHTML='<div class="alert alert-danger small py-1">Error leyendo PDF: '+esc(String(err.message||err))+'</div>';
    });
  }).catch(function(err){
    el.innerHTML='<div class="alert alert-danger small py-1">Error cargando PDF: '+esc(String(err.message||err))+'</div>';
  });
}
function _extraer9BRadicacion(txt){
  var r={fecha:'',radicacion:'',aud_nombre:'',aud_cc:'',aud_tp:'',rep_nombre:'',rep_cc:'',found:false,codigos:{},total_ingresos:0,total_gastos:0};
  // ─ Fecha: 2023-12-13 18:51:46
  var fM=txt.match(/Fecha:\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)/);
  if(fM) r.fecha=fM[1].trim();
  // ─ No. Radicación Cuentas Claras(s+): CODIGO  (soporta typo "Clarasss")
  var rM=txt.match(/No\.?\s*Radicaci[oó]n\s+Cuentas\s+Claras+\s*:?\s*([A-Z0-9]{4,25})/i);
  if(rM) r.radicacion=rM[1].trim();
  if(!r.radicacion){
    var rM2=txt.match(/Radicaci[oó]n[^:]*:\s*([A-Z0-9]{6,20})/i);
    if(rM2) r.radicacion=rM2[1].trim();
  }
  // ─ Representante Legal: NOMBRE ... C.C. NUMCC
  var repM=txt.match(/Nombre\s+del\s+Representante\s+Legal:\s+([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s\.]+?)\s+C\.?C\.?\s+([\d\.]+)/i);
  if(repM){ r.rep_nombre=repM[1].trim(); r.rep_cc=repM[2].replace(/\./g,''); }
  // ─ Auditor Interno: NOMBRE ... C.C. NUMCC T.P. NUMTP
  var audM=txt.match(/Nombre\s+del\s+Auditor\s+Interno:\s+([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s\.]+?)\s+C\.?C\.?\s+([\d\.]+)\s+T\.?P\.?\s+([\d\.\-]+)/i);
  if(audM){ r.aud_nombre=audM[1].trim(); r.aud_cc=audM[2].replace(/\./g,''); r.aud_tp=audM[3].trim(); }
  // ─ Códigos financieros (100-212): CODE ...texto... $ ORG $ CAND $ TOTAL
  function _parseMoney9B(s){
    if(!s) return 0;
    s=s.replace(/\$/g,'').replace(/\s/g,'').trim();
    if(!s||s==='0'||s==='0,00') return 0;
    s=s.replace(/\./g,'').replace(',','.');
    return parseFloat(s)||0;
  }
  // Primero intentar con ancla ^ (texto con líneas reconstruidas por Y)
  var codPat=/^\s*(10[0-7]|20\d|21[0-2])\s+.*?\$\s*([\d\.,]+)\s*\$\s*([\d\.,]+)\s*\$\s*([\d\.,]+)/gm;
  var cm;
  while((cm=codPat.exec(txt))!==null){
    var cod=cm[1];
    r.codigos[cod]={org:_parseMoney9B(cm[2]),cand:_parseMoney9B(cm[3]),total:_parseMoney9B(cm[4])};
  }
  // Fallback: sin ancla (texto space-joined sin líneas)
  if(!Object.keys(r.codigos).length){
    var codPat2=/\b(10[0-7]|20\d|21[0-2])\b[^$]*?\$\s*([\d\.,]+)\s*\$\s*([\d\.,]+)\s*\$\s*([\d\.,]+)/g;
    while((cm=codPat2.exec(txt))!==null){
      r.codigos[cm[1]]={org:_parseMoney9B(cm[2]),cand:_parseMoney9B(cm[3]),total:_parseMoney9B(cm[4])};
    }
  }
  // Debug: mostrar líneas que contienen códigos para diagnosticar
  var debugLines=txt.split('\n').filter(function(l){return /\b(100|101|200|201)\b/.test(l);});
  console.log('[9B Extract] líneas con códigos (100/101/200/201):', debugLines.slice(0,6));
  if(r.codigos['100']) r.total_ingresos=r.codigos['100'].total;
  if(r.codigos['200']) r.total_gastos=r.codigos['200'].total;
  console.log('[9B Extract] codigos encontrados:', Object.keys(r.codigos).length, JSON.stringify(r.codigos));
  if(!Object.keys(r.codigos).length) console.log('[9B Extract] texto PDF (primeros 3000 chars):', txt.substring(0,3000));
  if(r.fecha||r.radicacion||r.aud_cc||r.rep_cc) r.found=true;
  return r;
}
function _mostrar9BResult(r, el, lsKey){
  if(!r.found){
    el.innerHTML='<div class="alert alert-warning small py-1 mb-0"><i class="fa fa-exclamation-triangle me-1"></i>No se encontró información en el PDF. Verifique que sea el CONSOLIDADO_44 correcto.</div>';
    return;
  }
  try{localStorage.setItem(lsKey, JSON.stringify({
    fecha:r.fecha, radicacion:r.radicacion,
    aud_nombre:r.aud_nombre, aud_cc:r.aud_cc, aud_tp:r.aud_tp,
    rep_nombre:r.rep_nombre, rep_cc:r.rep_cc,
    codigos:r.codigos, total_ingresos:r.total_ingresos, total_gastos:r.total_gastos
  }));}catch(e){}
  var info='';
  if(r.fecha||r.radicacion) info+='<div class="mb-1">'+
    (r.fecha?'<span class="me-3">Fecha: <strong>'+esc(r.fecha)+'</strong></span>':'')+
    (r.radicacion?'<span>No. Radicado: <strong>'+esc(r.radicacion)+'</strong></span>':'')+'</div>';
  if(r.aud_nombre||r.aud_cc) info+='<div class="mb-1">'+
    'Auditor: <strong>'+esc(r.aud_nombre||'—')+'</strong>'+
    (r.aud_cc?' &nbsp;C.C. '+esc(r.aud_cc):'')+
    (r.aud_tp?' &nbsp;T.P. '+esc(r.aud_tp):'')+'</div>';
  if(r.rep_nombre||r.rep_cc) info+='<div>'+
    'Representante: <strong>'+esc(r.rep_nombre||'—')+'</strong>'+
    (r.rep_cc?' &nbsp;C.C. '+esc(r.rep_cc):'')+'</div>';
  el.innerHTML='<div class="alert alert-success small py-2 mb-0">'+
    '<i class="fa fa-check-circle me-1"></i><strong>Extraído del PDF:</strong><br>'+info+
    '<button class="btn btn-sm btn-light border mt-1" onclick="render9BAnexos()" style="font-size:.7rem;padding:1px 8px">'+
    '<i class="fa fa-sync-alt me-1"></i>Actualizar</button></div>';
}

// Auto-leer CONSOLIDADO_44 de CC y refrescar Paso 3 automáticamente
function _leer9BPdfAutoRefresh(url, lsKey){
  var el=document.getElementById('res9bPdf');
  if(!el) return;
  el.style.display='block';
  el.innerHTML='<span class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Leyendo CONSOLIDADO_44 de Cuentas Claras...</span>';
  fetch(url).then(function(r){
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.arrayBuffer();
  }).then(function(buf){
    if(typeof pdfjsLib==='undefined'){
      el.innerHTML='<div class="alert alert-warning small py-1">PDF.js no disponible. Use el botón "Leer" manualmente.</div>';
      return;
    }
    pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise.then(function(pdf){
      var pageTexts=[], n=pdf.numPages, loaded=0;
      for(var i=1;i<=n;i++){
        (function(pn){
          pdf.getPage(pn).then(function(page){
            page.getTextContent().then(function(tc){
              // Reconstruir líneas usando coordenada Y para preservar filas
              var lines={};
              tc.items.forEach(function(it){
                var y=Math.round(it.transform[5]);
                if(!lines[y]) lines[y]=[];
                lines[y].push({x:it.transform[4],s:it.str});
              });
              var yKeys=Object.keys(lines).map(Number).sort(function(a,b){return b-a;});
              pageTexts[pn-1]=yKeys.map(function(y){
                return lines[y].sort(function(a,b){return a.x-b.x;}).map(function(it){return it.s;}).join(' ');
              }).join('\n');
              loaded++;
              if(loaded===n){
                var fullTxt=pageTexts.join('\n');
                var result=_extraer9BRadicacion(fullTxt);
                if(result.found){
                  try{localStorage.setItem(lsKey, JSON.stringify({
                    fecha:result.fecha, radicacion:result.radicacion,
                    aud_nombre:result.aud_nombre, aud_cc:result.aud_cc, aud_tp:result.aud_tp,
                    rep_nombre:result.rep_nombre, rep_cc:result.rep_cc,
                    codigos:result.codigos, total_ingresos:result.total_ingresos, total_gastos:result.total_gastos
                  }));}catch(e){}
                  // Auto-refrescar para mostrar datos extraídos
                  render9BAnexos();
                } else {
                  el.innerHTML='<div class="alert alert-warning small py-1 mb-0"><i class="fa fa-exclamation-triangle me-1"></i>No se pudo extraer información del PDF.</div>';
                }
              }
            });
          });
        })(i);
      }
    }).catch(function(err){
      el.innerHTML='<div class="alert alert-warning small py-1">Error leyendo PDF: '+esc(String(err.message||err))+'</div>';
    });
  }).catch(function(err){
    el.innerHTML='<div class="alert alert-warning small py-1">Error cargando PDF de CC: '+esc(String(err.message||err))+'</div>';
  });
}

function _render9BAnexosInner(c){
  // Respetar filtro Paso 1: usar partido del selector para TODOS los lookups
  var _selP9El=document.getElementById('selPartido');
  var _partido9bSrc=(_selP9El&&_selP9El.value)?_selP9El.value:(c?c.partido:'');
  var obs=c.observaciones||{}, f9b=obs.formato_9b||{};
  var analisis=_findDictAnalisis(c);
  // Auditores: usar partido del filtro (no CAND_SELEC)
  var auditores=_findAuditores(_partido9bSrc);
  // CC org para URLs de consolidados
  var ccOrg9B=_findCCOrg9B(_partido9bSrc);
  // c44 local para tabla de códigos y comparación módulo 6 (si existe)
  var _cForC44={departamento:c.departamento,municipio:c.municipio,partido:_partido9bSrc};
  var c44=_findConsolidado44(_cForC44);
  // CC InfOrg: envíos del Informe Organización Política
  // Ordenar por id ASC (secuencial: menor id = envío más antiguo = INICIAL)
  var ccInfOrg=_findCCInfOrg(_partido9bSrc);
  var ccEnvios=(ccInfOrg&&ccInfOrg.envios)?ccInfOrg.envios.slice():[];
  ccEnvios.sort(function(a,b){
    var idA=parseInt(a.id||a.informe_id||0);
    var idB=parseInt(b.id||b.informe_id||0);
    return idA-idB;
  });
  var ccEnvInicial=ccEnvios.length?ccEnvios[0]:null;
  var ccEnvActual=ccEnvios.length>1?ccEnvios[ccEnvios.length-1]:null;

  // Informes (radicación) — ya no se usa local, se toman de CC
  var informes4=c.informes||[];
  if(!informes4.length){var _i4=obs.informe||{}; if(_i4.fecha||_i4.numero) informes4=[_i4];}

  var d9=_normFNFP(c.departamento), m9=_normFNFP(c.municipio);
  var p9=_normFNFP(_partido9bSrc);

  // Auto-evaluación criterios
  var autoCrit={};
  autoCrit.partido_presento_informe=informes4.length>0?'CUMPLE':'NO CUMPLE';
  // Verificar auditor: localStorage > c44 > dictamen análisis
  var _9bRadLSKey='cne_9b_rad_'+d9+'_'+m9+'_'+p9;
  var _9bRadLS={};
  try{_9bRadLS=JSON.parse(localStorage.getItem(_9bRadLSKey)||'{}');}catch(e){}
  if((_9bRadLS.aud_cc||(c44&&c44.auditor_cc))&&auditores.length){
    var c44CC=(_9bRadLS.aud_cc||(c44&&c44.auditor_cc)||'').replace(/\./g,'');
    var c44TP=_9bRadLS.aud_tp||(c44&&c44.auditor_tp)||'';
    var audMatch=false;
    auditores.forEach(function(a){
      var aCC=(a.c||'').replace(/\./g,'');
      var aTP=(a.tp||[]).join(' ');
      if(c44CC&&aCC&&aCC===c44CC) audMatch=true;
      if(!audMatch&&c44TP&&aTP&&aTP.replace(/[\-\s]/g,'').indexOf(c44TP.replace(/[\-\s]/g,''))!==-1) audMatch=true;
    });
    autoCrit.cedula_tarjeta_auditor=audMatch?'CUMPLE':'NO CUMPLE';
  } else if(analisis&&auditores.length){
    var dCC=(analisis.auditor_cc||'').replace(/\./g,'');
    var dTP=analisis.auditor_tp||'';
    var audMatch2=false;
    auditores.forEach(function(a){
      var aCC=(a.c||'').replace(/\./g,'');
      var aTP=(a.tp||[]).join(' ');
      if(dCC&&aCC&&aCC===dCC) audMatch2=true;
      if(!audMatch2&&dTP&&aTP&&aTP.replace(/[\-\s]/g,'').indexOf(dTP.replace(/[\-\s]/g,''))!==-1) audMatch2=true;
    });
    autoCrit.cedula_tarjeta_auditor=audMatch2?'CUMPLE':'NO CUMPLE';
  }

  var mai=f9b.mai_sai_acreditado||'';

  // ═══════════════════════════════════════════════════════════════════════
  //  9B INICIAL
  // ═══════════════════════════════════════════════════════════════════════
  var html='<h5 class="fw-bold text-primary mb-3 border-bottom pb-2"><i class="fa fa-file-invoice me-2"></i>9B INICIAL</h5>';

  // ── Radicación 9B INICIAL (desde CC InfOrg: primer envío) ──
  var fechaDictamen=analisis?_validarFecha(analisis.fecha_dictamen||analisis.fecha||''):'';
  if(!fechaDictamen) fechaDictamen=_validarFecha((obs.informe||{}).fecha||'');
  // Prioridad: CC envío inicial > PDF leído (localStorage) > informes locales
  var c44Radicado=(ccEnvInicial?(ccEnvInicial.radicado||ccEnvInicial.radicado_final||ccEnvInicial.numero_radicado||''):'')||_9bRadLS.radicacion||(informes4.length?informes4[0].numero||'':'');
  var c44Fecha=(ccEnvInicial?(ccEnvInicial.created_at||ccEnvInicial.fecha||ccEnvInicial.fecha_final||''):'')||_9bRadLS.fecha||(informes4.length?informes4[0].fecha||'':'');
  var ccEnvInicialId=ccEnvInicial?(ccEnvInicial.id||ccEnvInicial.informe_id||''):'';

  html+='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">'+
    '<i class="fa fa-history me-2"></i>Radicación 9B Inicial'+
    (ccEnvInicial?' <small class="text-muted"><i class="fa fa-cloud me-1"></i>Cuentas Claras</small>':'')+
    '</div><div class="card-body p-0"><table class="table table-sm table-striped mb-0">'+
    '<thead class="table-light"><tr><th>N. Radicado</th><th>Fecha</th><th>Enviado</th>'+
    '<th>Fecha Dictamen</th><th>Firmado</th><th>Observaciones</th><th>Docs CC</th></tr></thead><tbody>';
  var enviadoBadge=(c44Radicado&&c44Fecha)?'<span class="badge bg-success">SI</span>':'<span class="badge bg-warning text-dark">EN LÍNEA</span>';
  var fdBadge=fechaDictamen?'<span class="badge bg-info">'+esc(fechaDictamen)+'</span>':'<span class="text-muted">—</span>';
  var firmado9b=f9b.firmado_9b||'';
  var obs9bInicial=f9b.obs_9b_inicial||'';
  // Links Formato/Radicación de CC
  var docsCC='';
  if(ccEnvInicialId){
    docsCC='<a href="/api/cne/imprimirFormato?id='+ccEnvInicialId+'&id_proceso='+PROCESO_ID_CC+'" target="_blank" class="btn btn-sm btn-outline-primary py-0 me-1">Formato</a>'+
      '<a href="/api/cne/descargarFormatoRadicacion?id='+ccEnvInicialId+'&id_proceso='+PROCESO_ID_CC+'" target="_blank" class="btn btn-sm btn-outline-info py-0">Radicación</a>';
  }
  html+='<tr><td class="fw-bold">'+esc(c44Radicado||'—')+'</td>'+
    '<td>'+esc(c44Fecha||'—')+'</td>'+
    '<td>'+enviadoBadge+'</td>'+
    '<td>'+fdBadge+'</td>'+
    '<td><select class="form-select form-select-sm" style="width:auto;min-width:80px" onchange="guardar9BField(\'firmado_9b\',this.value)">'+
      '<option value=""'+(firmado9b===''?' selected':'')+'>—</option>'+
      '<option value="SI"'+(firmado9b==='SI'?' selected':'')+'>SI</option>'+
      '<option value="NO"'+(firmado9b==='NO'?' selected':'')+'>NO</option></select></td>'+
    '<td><input type="text" class="form-control form-control-sm" style="min-width:120px" placeholder="Observaciones..." '+
      'value="'+esc(obs9bInicial)+'" onchange="guardar9BField(\'obs_9b_inicial\',this.value)"></td>'+
    '<td>'+docsCC+'</td></tr>';
  html+='</tbody></table></div></div>';


  // ── Link CONSOLIDADO_44 (desde Cuentas Claras) ──
  var urlC44=ccOrg9B?_ccConsolidadoUrl(ccOrg9B,44):'';
  var _lsKey9b=_9bRadLSKey.replace(/'/g,"\\'");
  var _ccBadge=ccOrg9B?'<small class="text-muted ms-2"><i class="fa fa-cloud me-1"></i>Fuente: Cuentas Claras</small>':'<small class="text-danger ms-2">Cargue soportes en Paso 1</small>';
  html+='<div class="card mb-3 border-primary"><div class="card-header fw-semibold py-1 bg-light d-flex justify-content-between align-items-center">'+
    '<span><i class="fa fa-file-pdf me-2 text-danger"></i>Formato 9B — CONSOLIDADO_44'+_ccBadge+
    (c44Radicado?' <span class="badge bg-info ms-2" style="font-size:.65rem">Datos de localStorage</span>':'')+'</span>'+
    '<div class="d-flex gap-1">';
  if(urlC44){
    html+='<button class="btn btn-sm btn-success py-0 px-2" onclick="_leer9BPdf(\''+urlC44.replace(/'/g,"\\'")+'\',\''+_lsKey9b+'\')">'+
    '<i class="fa fa-search me-1"></i>Leer</button>'+
    '<a href="'+urlC44+'" target="_blank" class="btn btn-sm btn-outline-primary py-0 px-2">'+
    '<i class="fa fa-external-link-alt me-1"></i>Abrir PDF</a>';
  }
  html+='</div></div>'+
    '<div id="res9bPdf" class="px-3 py-2 border-top" style="display:none"></div>'+
    '</div>';

  // ── Auditor Interno ──
  // Prioridad: PDF leído (localStorage) > índice c44 > dictamen análisis
  var audNombre=_9bRadLS.aud_nombre||(c44&&c44.auditor_nombre)||(analisis&&analisis.auditor_nombre)||'';
  var audCC    =_9bRadLS.aud_cc    ||(c44&&c44.auditor_cc)    ||(analisis&&analisis.auditor_cc)   ||'';
  var audTP    =_9bRadLS.aud_tp    ||(c44&&c44.auditor_tp)    ||(analisis&&analisis.auditor_tp)   ||'';
  var repNombre=_9bRadLS.rep_nombre||(c44&&c44.representante_nombre)||'';
  var repCC    =_9bRadLS.rep_cc    ||(c44&&c44.representante_cc)   ||'';
  var _tieneAudData=audNombre||audCC||audTP||repNombre||repCC;
  var _fuenteBadge=_9bRadLS.aud_nombre?'<span class="badge bg-info ms-2" style="font-size:.6rem">PDF leído</span>':
    (c44?'<span class="badge bg-success ms-2" style="font-size:.6rem">Índice</span>':
    (analisis?'<span class="badge bg-secondary ms-2" style="font-size:.6rem">Dictamen</span>':''));
  if(_tieneAudData){
    html+='<div class="card mb-3 border-info"><div class="card-header fw-semibold py-2 bg-info bg-opacity-10">'+
      '<i class="fa fa-user-tie me-2"></i>Datos extraídos del CONSOLIDADO_44'+_fuenteBadge+'</div>'+
      '<div class="card-body"><div class="row g-3">';
    // Auditor
    html+='<div class="col-md-6"><h6 class="fw-semibold">Auditor Interno</h6>'+
      '<table class="table table-sm mb-0"><tbody>'+
      '<tr><td class="text-muted small">Nombre:</td><td class="fw-bold">'+esc(audNombre||'(no detectado)')+'</td></tr>'+
      '<tr><td class="text-muted small">C.C.:</td><td>'+esc(audCC||'—')+'</td></tr>'+
      '<tr><td class="text-muted small">T.P.:</td><td>'+esc(audTP||'(no detectada)')+'</td></tr>'+
      '</tbody></table></div>';
    // Representante Legal
    html+='<div class="col-md-6"><h6 class="fw-semibold">Representante Legal</h6>'+
      '<table class="table table-sm mb-0"><tbody>'+
      '<tr><td class="text-muted small">Nombre:</td><td class="fw-bold">'+esc(repNombre||'(no detectado)')+'</td></tr>'+
      '<tr><td class="text-muted small">C.C.:</td><td>'+esc(repCC||'—')+'</td></tr>'+
      '</tbody></table></div>';
    html+='</div>';

    // Verificación Auditor vs Registrados
    if(auditores.length){
      var srcCC=(audCC||'').replace(/\./g,'');
      var srcTP=audTP||'';
      html+='<hr class="my-2"><h6 class="fw-semibold mb-2">Verificación: Auditor 9B vs Registrado en FNFP</h6>'+
        '<table class="table table-sm table-striped mb-0"><thead class="table-light">'+
        '<tr><th>Nombre Registrado</th><th>CC</th><th>T.P.</th><th>Coincide</th></tr></thead><tbody>';
      auditores.forEach(function(a){
        var aCC=(a.c||'').replace(/\./g,'');
        var tp=(a.tp||[]).join(', ');
        var esF=false;
        if(srcCC&&aCC&&aCC===srcCC) esF=true;
        if(!esF&&srcTP&&tp&&tp.replace(/[\-\s]/g,'').indexOf(srcTP.replace(/[\-\s]/g,''))!==-1) esF=true;
        var badge=esF?'<span class="badge bg-success"><i class="fa fa-check-circle me-1"></i>COINCIDE</span>':
          '<span class="badge bg-danger"><i class="fa fa-times-circle me-1"></i>NO COINCIDE</span>';
        html+='<tr'+(esF?' class="table-success"':'')+'><td>'+esc(a.n||'')+'</td><td>'+esc(a.c||'')+'</td><td>'+esc(tp)+'</td><td>'+badge+'</td></tr>';
      });
      html+='</tbody></table>';
    }
    html+='</div></div>';
  }

  // ══ CUADRO COMPARATIVO: 9B / Libros CC / Candidatos M5-6 / Dif ══
  // 9B: prioridad 1) localStorage (extraído del PDF CC), 2) c44 local
  var codigos9B=(_9bRadLS&&_9bRadLS.codigos&&Object.keys(_9bRadLS.codigos).length)?_9bRadLS.codigos:((c44&&c44.codigos)?c44.codigos:{});
  var src9B=(_9bRadLS&&_9bRadLS.codigos&&Object.keys(_9bRadLS.codigos).length)?'Cuentas Claras (PDF)':((c44&&c44.codigos&&Object.keys(c44.codigos).length)?'CONSOLIDADO_44 local':'');
  var txDataGlobal=TX_GLOBAL_9B||[];
  var libCCData=LIBROS_CC_GLOBAL||[];
  var compas=_findCandidatosMismoPartido(_cForC44);
  var nCandConTx=0;
  compas.forEach(function(x){ if((TX_CACHE[x.id]||[]).length) nCandConTx++; });

  // Libros CC (Cuentas Claras): agrupar por código
  var libCCPorCodigo={};
  libCCData.forEach(function(t){
    var cod=(t.codigo||t.cco_id||t.concepto_codigo||'').toString().replace(/\.0$/,'').trim(); if(!cod) return;
    if(!libCCPorCodigo[cod]) libCCPorCodigo[cod]=0;
    libCCPorCodigo[cod]+=_parseValorCC(t.valor||t.monto||t.total||0);
  });
  var libCC100=0, libCC200=0;
  ['101','102','103','104','105','106','107'].forEach(function(c){libCC100+=(libCCPorCodigo[c]||0);});
  ['201','202','203','204','205','206','207','208','209','210','211','212'].forEach(function(c){libCC200+=(libCCPorCodigo[c]||0);});
  if(libCC100) libCCPorCodigo['100']=libCC100;
  if(libCC200) libCCPorCodigo['200']=libCC200;
  var totLibCCIng=libCCData.filter(function(t){return t.concepto==='INGRESO';}).reduce(function(s,t){return s+_parseValorCC(t.valor||t.monto||t.total||0);},0);
  var totLibCCGas=libCCData.filter(function(t){return t.concepto==='GASTO';}).reduce(function(s,t){return s+_parseValorCC(t.valor||t.monto||t.total||0);},0);
  var nCandCC=Object.keys(LIBROS_CC_CACHE||{}).length;

  // Candidatos M5/6 (local): agrupar por código
  var candPorCodigo={};
  txDataGlobal.forEach(function(t){
    var cod=(t.cco_id||'').toString().replace(/\.0$/,'').trim(); if(!cod) return;
    if(!candPorCodigo[cod]) candPorCodigo[cod]=0;
    candPorCodigo[cod]+=parseFloat(t.valor||0);
  });
  var cand100=0, cand200=0;
  ['101','102','103','104','105','106','107'].forEach(function(c){cand100+=(candPorCodigo[c]||0);});
  ['201','202','203','204','205','206','207','208','209','210','211','212'].forEach(function(c){cand200+=(candPorCodigo[c]||0);});
  if(cand100) candPorCodigo['100']=cand100;
  if(cand200) candPorCodigo['200']=cand200;
  var totCandIng=txDataGlobal.filter(function(t){return t.concepto==='INGRESO';}).reduce(function(s,t){return s+parseFloat(t.valor||0);},0);
  var totCandGas=txDataGlobal.filter(function(t){return t.concepto==='GASTO';}).reduce(function(s,t){return s+parseFloat(t.valor||0);},0);

  // Recopilar todos los códigos
  var allCodes=Object.keys(codigos9B).concat(Object.keys(libCCPorCodigo)).concat(Object.keys(candPorCodigo));
  var allCodesUniq=[];
  allCodes.forEach(function(c){ if(allCodesUniq.indexOf(c)===-1) allCodesUniq.push(c); });

  var tiene9B=Object.keys(codigos9B).length>0;
  var tieneLibCC=libCCData.length>0;
  var tieneCand=txDataGlobal.length>0;

  if(tiene9B||tieneLibCC||tieneCand){
    var tot9bIng=(_9bRadLS&&_9bRadLS.total_ingresos)?_9bRadLS.total_ingresos:(c44?c44.total_ingresos||0:0);
    var tot9bGas=(_9bRadLS&&_9bRadLS.total_gastos)?_9bRadLS.total_gastos:(c44?c44.total_gastos||0:0);

    var hayDiff=(tiene9B&&tieneLibCC)&&(Math.abs(tot9bIng-totLibCCIng)>1||Math.abs(tot9bGas-totLibCCGas)>1);
    var borderCls=(!tiene9B||!tieneLibCC)?'border-info':(hayDiff?'border-danger':'border-success');

    html+='<div class="card mb-3 '+borderCls+'"><div class="card-header fw-semibold py-2 bg-light">'+
      '<i class="fa fa-balance-scale me-2"></i>Comparativo: 9B / Libros CC / Candidatos M5-6'+
      (tiene9B&&tieneLibCC?(hayDiff?' <span class="badge bg-danger ms-2">DIFERENCIAS</span>':' <span class="badge bg-success ms-2">COINCIDE</span>'):'')+
      '</div><div class="card-body p-0">'+
      '<div class="alert alert-info mb-0 rounded-0 py-1 small">'+
      '<i class="fa fa-info-circle me-1"></i><strong>9B</strong> = '+esc(src9B||'Sin datos 9B')+'. '+
      '<strong>Libros CC</strong> = Libros Contables Campa\u00f1a de CC ('+nCandCC+' candidatos, '+libCCData.length+' registros). '+
      '<strong>Candidatos M5/6</strong> = Reportes locales de '+compas.length+' candidatos ('+nCandConTx+' con datos).'+
      (!tiene9B?' <span class="text-danger fw-bold">Lea el CONSOLIDADO_44 arriba para cargar datos del 9B.</span>':'')+
      '</div>'+
      '<div class="table-responsive"><table class="table table-sm table-hover mb-0">'+
      '<thead class="table-light"><tr><th>C\u00f3d.</th><th>Concepto</th>'+
      '<th class="text-end">9B (CC)</th>'+
      '<th class="text-end">Libros CC</th>'+
      '<th class="text-end">Candidatos M5/6</th>'+
      '<th class="text-end">Dif (9B-Libros)</th><th>Estado</th></tr></thead><tbody>';

    function _renderCodRow(cod,isTot,rowCls){
      var v9b=codigos9B[cod]?codigos9B[cod].total:0;
      var vLib=libCCPorCodigo[cod]||0;
      var vCand=candPorCodigo[cod]||0;
      var diff=v9b-vLib;
      var absDiff=Math.abs(diff);
      var ok=absDiff<=1||!tiene9B||!tieneLibCC;
      var cls=isTot?(rowCls||''):(!ok?' class="table-danger"':'');
      var badge=(!tiene9B||!tieneLibCC)?'\u2014':(ok?'<span class="badge bg-success">OK</span>':'<span class="badge bg-danger">DIF</span>');
      html+='<tr'+cls+'><td>'+(isTot?'<strong>'+cod+'</strong>':cod)+'</td>'+
        '<td class="small">'+esc(_CODIGOS_9B[cod]||'C\u00f3digo '+cod)+'</td>'+
        '<td class="text-end'+(isTot?' fw-bold':'')+'">'+fmtCOP(v9b)+'</td>'+
        '<td class="text-end'+(isTot?' fw-bold':'')+'">'+fmtCOP(vLib)+'</td>'+
        '<td class="text-end'+(isTot?' fw-bold':'')+'">'+fmtCOP(vCand)+'</td>'+
        '<td class="text-end'+(absDiff>1&&tiene9B&&tieneLibCC?(diff>0?' text-danger':' text-success'):'')+'">'+(ok||!tiene9B||!tieneLibCC?'\u2014':fmtCOP(diff))+'</td>'+
        '<td>'+badge+'</td></tr>';
    }

    _renderCodRow('100',true,' class="table-primary fw-bold"');
    ['101','102','103','104','105','106','107'].forEach(function(cod){ _renderCodRow(cod,false); });
    html+='<tr><td colspan="7" class="py-0"></td></tr>';
    _renderCodRow('200',true,' class="table-warning fw-bold"');
    ['201','202','203','204','205','206','207','208','209','210','211','212'].forEach(function(cod){ _renderCodRow(cod,false); });

    var stdCodes=['100','101','102','103','104','105','106','107','200','201','202','203','204','205','206','207','208','209','210','211','212'];
    var extraCodes=allCodesUniq.filter(function(c){return stdCodes.indexOf(c)===-1;}).sort();
    if(extraCodes.length){
      html+='<tr><td colspan="7" class="py-0"></td></tr>';
      extraCodes.forEach(function(cod){ _renderCodRow(cod,false); });
    }

    var diffIng=tot9bIng-totLibCCIng, diffGas=tot9bGas-totLibCCGas;
    html+='<tr class="table-primary fw-bold"><td colspan="2">TOTAL INGRESOS</td>'+
      '<td class="text-end">'+fmtCOP(tot9bIng)+'</td>'+
      '<td class="text-end">'+fmtCOP(totLibCCIng)+'</td>'+
      '<td class="text-end">'+fmtCOP(totCandIng)+'</td>'+
      '<td class="text-end">'+(tiene9B&&tieneLibCC&&Math.abs(diffIng)>1?fmtCOP(diffIng):'\u2014')+'</td>'+
      '<td>'+(tiene9B&&tieneLibCC?(Math.abs(diffIng)<=1?'<span class="badge bg-success">OK</span>':'<span class="badge bg-danger">DIF</span>'):'\u2014')+'</td></tr>';
    html+='<tr class="table-warning fw-bold"><td colspan="2">TOTAL GASTOS</td>'+
      '<td class="text-end">'+fmtCOP(tot9bGas)+'</td>'+
      '<td class="text-end">'+fmtCOP(totLibCCGas)+'</td>'+
      '<td class="text-end">'+fmtCOP(totCandGas)+'</td>'+
      '<td class="text-end">'+(tiene9B&&tieneLibCC&&Math.abs(diffGas)>1?fmtCOP(diffGas):'\u2014')+'</td>'+
      '<td>'+(tiene9B&&tieneLibCC?(Math.abs(diffGas)<=1?'<span class="badge bg-success">OK</span>':'<span class="badge bg-danger">DIF</span>'):'\u2014')+'</td></tr>';

    html+='</tbody></table></div></div></div>';
  }

  // ══ OBSERVACIONES: Transacciones Post-Electorales ══
  // Fecha de elección Territoriales 2023: 29-Oct-2023
  var FECHA_ELECCION='2023-10-29';
  var txPostElec=txDataGlobal.filter(function(t){
    var f=(t.fecha||'').substring(0,10);
    return f>FECHA_ELECCION;
  });
  if(txPostElec.length){
    var totPostIng=0, totPostGas=0;
    txPostElec.forEach(function(t){
      if(t.concepto==='INGRESO') totPostIng+=parseFloat(t.valor||0);
      else totPostGas+=parseFloat(t.valor||0);
    });
    html+='<div class="card mb-3 border-danger"><div class="card-header fw-semibold py-2 bg-danger bg-opacity-10">'+
      '<i class="fa fa-exclamation-triangle me-2 text-danger"></i>Observaciones: Transacciones Post-Electorales '+
      '<span class="badge bg-danger">'+txPostElec.length+'</span>'+
      ' <small class="text-muted">(posteriores al 29-Oct-2023)</small></div>'+
      '<div class="card-body p-0">'+
      '<div class="alert alert-danger mb-0 rounded-0 py-1 small">'+
      (totPostIng?'<strong>Ingresos post-electorales:</strong> '+fmtCOP(totPostIng)+' &nbsp;':'')+(totPostGas?'<strong>Gastos post-electorales:</strong> '+fmtCOP(totPostGas):'')+
      '</div>'+
      '<div class="table-responsive"><table class="table table-sm table-striped mb-0">'+
      '<thead class="table-light"><tr><th>Fecha</th><th>Tipo</th><th>Cód.</th><th>Concepto</th><th>Candidato</th><th class="text-end">Valor</th></tr></thead><tbody>';
    txPostElec.sort(function(a,b){return (a.fecha||'').localeCompare(b.fecha||'');});
    txPostElec.forEach(function(t){
      var esIng=t.concepto==='INGRESO';
      html+='<tr class="'+(esIng?'table-info':'table-warning')+'">'+
        '<td class="small">'+esc((t.fecha||'').substring(0,10))+'</td>'+
        '<td><span class="badge '+(esIng?'bg-success':'bg-warning text-dark')+'">'+(esIng?'Ingreso':'Gasto')+'</span></td>'+
        '<td>'+esc((t.cco_id||'').toString())+'</td>'+
        '<td class="small">'+esc(t.descripcion||t.tercero||'\u2014')+'</td>'+
        '<td class="small">'+esc(t.nombre_candidato||t.candidato||'\u2014')+'</td>'+
        '<td class="text-end">'+fmtCOP(parseFloat(t.valor||0))+'</td></tr>';
    });
    html+='</tbody></table></div></div></div>';
  }

  // ── Criterios 9B ──
  var criterios9B=[
    ['partido_presento_informe','Partido presentó el informe'],
    ['firmas_coinciden','Firmas del dictamen y Formato 9B coinciden'],
    ['cedula_tarjeta_auditor','Cédula y Tarjeta Profesional corresponden al auditor'],
  ];
  var rows9B=criterios9B.map(function(cr){
    var userVal=f9b[cr[0]]||'';
    var autoVal=autoCrit[cr[0]]||'';
    var val=(userVal&&userVal!=='PENDIENTE')?userVal:((autoVal&&autoVal!=='PENDIENTE')?autoVal:'PENDIENTE');
    return '<tr><td class="small">'+esc(cr[1])+'</td><td>'+_selectCritDic('9b',cr[0],val)+'</td></tr>';
  }).join('');
  var rows9B_mai='<tr><td class="small">Organización acreditó MAI/SAI ante FNFP (Art.2 Res.3569/2023)</td>'+
    '<td>'+(mai?'<span class="badge bg-success">'+esc(mai)+'</span>':'<span class="badge bg-danger">SIN MAI/SAI</span>')+'</td></tr>';

  html+='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">Formato 9B — Criterios</div>'+
    '<div class="card-body p-0"><table class="table table-sm mb-0 tabla-obs"><tbody>'+rows9B+rows9B_mai+'</tbody></table></div></div>';

  // ── Otros Consolidados (desde Cuentas Claras) ──
  if(ccOrg9B){
    var consolidadoIds=[{id:43,n:'F43'},{id:44,n:'F44'},{id:45,n:'F45'},{id:46,n:'F46'},{id:47,n:'F47'},{id:48,n:'F48'},{id:100,n:'F100'}];
    html+='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">'+
      '<i class="fa fa-file-pdf me-2"></i>Consolidados del Partido <small class="text-muted"><i class="fa fa-cloud me-1"></i>Cuentas Claras</small></div>'+
      '<div class="card-body py-2"><div class="d-flex flex-wrap gap-2">';
    consolidadoIds.forEach(function(f){
      var url=_ccConsolidadoUrl(ccOrg9B,f.id);
      html+='<a href="'+url+'" target="_blank" class="btn btn-sm btn-outline-danger">'+
        '<i class="fa fa-file-pdf me-1"></i>'+f.n+'</a>';
    });
    html+='</div></div></div>';
  } else {
    html+='<div class="alert alert-warning small"><i class="fa fa-exclamation-triangle me-1"></i>Cargue soportes en Paso 1 para ver los consolidados de Cuentas Claras.</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  9B ACTUAL (último envío de CC InfOrg)
  // ═══════════════════════════════════════════════════════════════════════
  html+='<hr class="my-3"><h5 class="fw-bold text-success mb-3 border-bottom pb-2"><i class="fa fa-sync me-2"></i>9B ACTUAL</h5>';

  if(ccEnvActual){
    var actRad=ccEnvActual.radicado||ccEnvActual.radicado_final||ccEnvActual.numero_radicado||'';
    var actFecha=ccEnvActual.created_at||ccEnvActual.fecha||ccEnvActual.fecha_final||'';
    var actId=ccEnvActual.id||ccEnvActual.informe_id||'';
    var actDocsCC='';
    if(actId){
      actDocsCC='<a href="/api/cne/imprimirFormato?id='+actId+'&id_proceso='+PROCESO_ID_CC+'" target="_blank" class="btn btn-sm btn-outline-primary py-0 me-1">Formato</a>'+
        '<a href="/api/cne/descargarFormatoRadicacion?id='+actId+'&id_proceso='+PROCESO_ID_CC+'" target="_blank" class="btn btn-sm btn-outline-info py-0">Radicación</a>';
    }
    html+='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">'+
      '<i class="fa fa-history me-2"></i>Última Radicación (9B Actual) <small class="text-muted"><i class="fa fa-cloud me-1"></i>CC</small></div>'+
      '<div class="card-body p-0"><table class="table table-sm table-striped mb-0">'+
      '<thead class="table-light"><tr><th>N. Radicado</th><th>Fecha</th><th>Enviado</th><th>Docs CC</th></tr></thead><tbody>'+
      '<tr><td class="fw-bold">'+esc(actRad||'—')+'</td>'+
      '<td>'+esc(actFecha||'—')+'</td>'+
      '<td>'+((actRad&&actFecha)?'<span class="badge bg-success">SI</span>':'<span class="badge bg-warning text-dark">EN LÍNEA</span>')+'</td>'+
      '<td>'+actDocsCC+'</td></tr>'+
      '</tbody></table></div></div>';
  } else {
    html+='<div class="alert alert-info small"><i class="fa fa-info-circle me-1"></i>'+(ccEnvios.length===1?'Solo hay 1 envío (Inicial). No se detectó 9B Actual.':'Cargue soportes en Paso 1 para ver envíos.')+'</div>';
  }

  // ── Historial completo de envíos CC ──
  if(ccEnvios.length>1){
    html+='<div class="card mb-3 border-secondary"><div class="card-header fw-semibold py-2 bg-light">'+
      '<i class="fa fa-list me-2"></i>Historial de Envíos <span class="badge bg-secondary">'+ccEnvios.length+'</span>'+
      ' <small class="text-muted"><i class="fa fa-cloud me-1"></i>CC</small></div>'+
      '<div class="card-body p-0"><table class="table table-sm table-striped mb-0">'+
      '<thead class="table-light"><tr><th>#</th><th>Radicado</th><th>Fecha</th><th>Docs</th></tr></thead><tbody>';
    ccEnvios.forEach(function(e,idx){
      var eRad=e.radicado||e.radicado_final||e.numero_radicado||'';
      var eFecha=e.created_at||e.fecha||e.fecha_final||'';
      var eId=e.id||e.informe_id||'';
      var histId=e.historico||'';
      var label=idx===0?'<span class="badge bg-primary ms-1">INICIAL</span>':(idx===ccEnvios.length-1?'<span class="badge bg-success ms-1">ACTUAL</span>':'');
      var eDocs='';
      if(eId){
        eDocs='<a href="/api/cne/imprimirFormato?id='+eId+'&id_proceso='+PROCESO_ID_CC+'" target="_blank" class="btn btn-sm btn-outline-primary py-0 me-1">Formato</a>'+
          '<a href="/api/cne/descargarFormatoRadicacion?id='+eId+'&id_proceso='+PROCESO_ID_CC+'" target="_blank" class="btn btn-sm btn-outline-info py-0 me-1">Radicación</a>';
      }
      if(histId){
        eDocs+='<button class="btn btn-sm btn-outline-warning py-0" onclick="_ccVerHistoricoOrg('+histId+',this)"><i class="fa fa-history me-1"></i>Histórico</button>';
      }
      html+='<tr><td>'+(idx+1)+label+'</td><td class="fw-bold">'+esc(eRad)+'</td><td>'+esc(eFecha)+'</td><td>'+eDocs+'</td></tr>';
      if(histId) html+='<tr><td colspan="4" style="padding:0"><div id="ccHistOrg13_'+histId+'" style="display:none"></div></td></tr>';
    });
    html+='</tbody></table></div></div>';
  }

  // ── Devoluciones CC ──
  var ccDevs=(ccInfOrg&&ccInfOrg.devoluciones)?ccInfOrg.devoluciones:[];
  if(ccDevs.length){
    html+='<div class="card mb-3 border-danger"><div class="card-header fw-semibold py-2 bg-danger bg-opacity-10">'+
      '<i class="fa fa-undo me-2 text-danger"></i>Devoluciones <span class="badge bg-danger">'+ccDevs.length+'</span></div>'+
      '<div class="card-body p-0"><table class="table table-sm table-striped mb-0">'+
      '<thead class="table-light"><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
    ccDevs.forEach(function(d){
      html+='<tr><td><small>'+esc(d.created_at||d.fecha||'')+'</small></td><td><small>'+esc(d.observacion||d.motivo||'—')+'</small></td></tr>';
    });
    html+='</tbody></table></div></div>';
  }

  // ── Respuestas CC ──
  var ccResps=(ccInfOrg&&ccInfOrg.respuestas)?ccInfOrg.respuestas:[];
  if(ccResps.length){
    html+='<div class="card mb-3 border-success"><div class="card-header fw-semibold py-2 bg-success bg-opacity-10">'+
      '<i class="fa fa-reply me-2 text-success"></i>Respuestas <span class="badge bg-success">'+ccResps.length+'</span></div>'+
      '<div class="card-body p-0"><table class="table table-sm table-striped mb-0">'+
      '<thead class="table-light"><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
    ccResps.forEach(function(r){
      html+='<tr><td><small>'+esc(r.created_at||r.fecha||'')+'</small></td><td><small>'+esc(r.observacion||r.respuesta||'—')+'</small></td></tr>';
    });
    html+='</tbody></table></div></div>';
  }

  // ── Transferencias del Partido (códigos 106/212) — GLOBAL ──
  var txData2=TX_GLOBAL_9B||[];
  var tx106=txData2.filter(function(t){ return (t.cco_id||'').toString().trim()==='106'; });
  var tx212=txData2.filter(function(t){ return (t.cco_id||'').toString().trim()==='212'; });

  if(tx106.length||tx212.length){
    var tot106=tx106.reduce(function(s,t){return s+parseFloat(t.valor||0);},0);
    var tot212=tx212.reduce(function(s,t){return s+parseFloat(t.valor||0);},0);
    html+='<div class="card mb-3 border-warning"><div class="card-header fw-semibold py-2 bg-warning bg-opacity-25">'+
      '<i class="fa fa-exchange-alt me-2"></i>Transferencias del Partido Detectadas (Global: todos los candidatos)</div>'+
      '<div class="card-body p-0"><table class="table table-sm table-striped mb-0">'+
      '<thead class="table-light"><tr><th>Código</th><th>Concepto</th><th>Candidato</th><th>Tercero</th><th class="text-end">Valor</th></tr></thead><tbody>';
    tx106.forEach(function(t){
      html+='<tr class="table-info"><td><strong>106</strong></td><td>INGRESO — Recursos propios del partido</td>'+
        '<td class="small">'+esc(t.nombre_candidato||t.candidato||'—')+'</td>'+
        '<td class="small">'+esc(t.tercero||'—')+'</td>'+
        '<td class="text-end">'+fmtCOP(parseFloat(t.valor||0))+'</td></tr>';
    });
    tx212.forEach(function(t){
      html+='<tr class="table-danger"><td><strong>212</strong></td><td>GASTO — Transferencias a candidatos</td>'+
        '<td class="small">'+esc(t.nombre_candidato||t.candidato||'—')+'</td>'+
        '<td class="small">'+esc(t.tercero||'—')+'</td>'+
        '<td class="text-end">'+fmtCOP(parseFloat(t.valor||0))+'</td></tr>';
    });
    html+='</tbody></table>';
    html+='<div class="card-footer small bg-light">';
    if(tot106) html+='<strong>Total 106:</strong> '+fmtCOP(tot106)+' ';
    if(tot212) html+='<strong>Total 212:</strong> '+fmtCOP(tot212);
    html+='</div></div></div>';
  }

  html+='<div class="text-end mt-3"><button class="btn btn-primary" onclick="irPaso(5)">Siguiente: Formato 8B <i class="fa fa-arrow-right ms-1"></i></button></div>';
  document.getElementById('panel9BAnexos').innerHTML=html;

  // Auto-leer CONSOLIDADO_44 de CC siempre que haya URL
  if(urlC44){
    setTimeout(function(){
      _leer9BPdfAutoRefresh(urlC44, _9bRadLSKey);
    }, 300);
  }
}

// Helper: guardar campos editables de 9B en localStorage
function guardar9BField(key, val){
  var c=CAND_SELEC; if(!c) return;
  var obs=c.observaciones||(c.observaciones={});
  var f9b=obs.formato_9b||(obs.formato_9b={});
  f9b[key]=val;
  try{localStorage.setItem('cne_cand_'+c.id,JSON.stringify(obs));}catch(e){}
}

