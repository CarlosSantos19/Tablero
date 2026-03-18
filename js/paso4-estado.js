// ─── PASO 2: ESTADO & ALERTAS ─────────────────────────────────────────────
function renderPaso2(){
  var c=CAND_SELEC, obs=c.observaciones||{}, est=obs.estado||{};
  var alertas=obs.alertas||[], advs=obs.advertencias||[], infs=obs.informativas||[];

  // ── Calcular tope real (por partido) PRIMERO — igual que renderPaso3 ─────
  var gas2=c.total_gastos_rep||(obs.financiero||{}).total_gastos||c.total_gastos_cand||0;
  var nPart2=_contarCandPartidoCC(c.cargo, c.partido);
  var topeTot2=buscarTopeTotal(c.cargo,c.poblacion||0);
  var topeRT=topeTot2?Math.round(topeTot2/nPart2*100)/100:null;
  var superaTopeRT=(topeRT&&topeRT>0&&gas2>topeRT);

  // Datos de artículos recalculados con tope correcto
  var art2=obs.articulos||{};
  var maxDon2=art2.art23_max_donacion||0;
  var gas24_2=art2.art24_gastos_201_209||0;
  var art25ob2=art2.art25_obligado||false;
  var art25umb2=art2.art25_umbral||232000000;
  var art27anon2=art2.art27_ingresos_anonimos||0;
  var limArt23=topeRT?Math.round(topeRT*0.10):0;
  var art23Falla=topeRT&&maxDon2>limArt23;
  var art24Supera2=topeRT&&gas24_2>topeRT;

  // Recalcular requiere_investigacion con tope correcto (no usar el del JSON)
  var requiereInv=art23Falla||superaTopeRT||(art27anon2>0);

  // Filtrar alertas del JSON — excluir artículos (se ven en Módulo 6 y tabla globales) e investigación
  var alertasBase=alertas.filter(function(a){
    return a.indexOf('SUPERA TOPE')===-1
      && a.indexOf('ART.23')===-1 && a.indexOf('ART.24')===-1
      && a.indexOf('ART.25')===-1 && a.indexOf('ART.27')===-1
      && a.indexOf('Art.23')===-1 && a.indexOf('Art.24')===-1
      && a.indexOf('Art.25')===-1 && a.indexOf('Art.27')===-1
      && a.indexOf('INVESTIGACI')===-1;
  });

  var html='';
  html+='<div class="row g-3"><div class="col-md-6"><div class="card h-100">'+
    '<div class="card-header fw-semibold py-2 bg-light">Estado del candidato</div>'+
    '<div class="card-body">';
  html+=chipEstado('RENUNCIÓ',est.renuncio,'Aparece en listado Renuncias 2023-10-28');
  html+=chipEstado('NO PRESENTÓ INFORME',est.no_presento,'Alcance - Candidatos que No Presentaron');
  html+=chipEstado('PRESENTÓ EXTEMPORÁNEAMENTE',est.extemporaneo,'Alcance - Candidatos Extemporáneos');
  html+=chipEstado('INSCRIPCIÓN REVOCADA',est.revocado,'Revocatorias de Inscripción 2023-10-29');
  if(requiereInv){
    html+='<div class="alert alert-danger py-2 mt-2 mb-0"><strong>SE REQUIERE ABRIR INVESTIGACIÓN</strong><br>'+
      '<small>Ver Plantillas Oficios e Investigaciones</small></div>';
  } else {
    html+='<div class="alert alert-success py-2 mb-0">Sin novedades críticas de estado</div>';
  }
  html+='</div></div></div>';
  // Filtrar informativas del JSON — excluir todas las de artículos
  var infsBase=infs.filter(function(a){
    return a.indexOf('Art.23')===-1 && a.indexOf('Art.24')===-1
      && a.indexOf('Art.25')===-1 && a.indexOf('Art.27')===-1;
  });

  html+='<div class="col-md-6"><div class="card h-100">'+
    '<div class="card-header fw-semibold py-2 bg-light">Alertas y advertencias</div>'+
    '<div class="card-body">';
  // Alerta roja solo si supera tope total
  if(superaTopeRT){
    html+='<div class="alert alert-danger py-1 mb-1 small"><i class="fa fa-exclamation-circle me-1"></i>'+
      'SUPERA TOPE LEGAL — Gastos: '+fmtCOP(gas2)+' / Tope: '+fmtCOP(topeRT)+'</div>';
  }
  // Otras alertas del JSON no relacionadas con artículos (ej. PARTIDO SIN MAI/SAI)
  alertasBase.forEach(function(a){html+='<div class="alert alert-danger py-1 mb-1 small"><i class="fa fa-exclamation-circle me-1"></i>'+esc(a)+'</div>';});
  // Advertencias no relacionadas con artículos
  advs.filter(function(a){
    return a.indexOf('INFORME NO RADICADO')===-1
      && a.indexOf('Art.23')===-1 && a.indexOf('Art.24')===-1
      && a.indexOf('Art.25')===-1 && a.indexOf('Art.27')===-1;
  }).forEach(function(a){html+='<div class="alert alert-warning py-1 mb-1 small"><i class="fa fa-exclamation-triangle me-1"></i>'+esc(a)+'</div>';});
  // Informativas no relacionadas con artículos
  infsBase.forEach(function(a){html+='<div class="alert alert-info py-1 mb-1 small"><i class="fa fa-info-circle me-1"></i>'+esc(a)+'</div>';});
  if(!superaTopeRT&&!alertasBase.length&&!advs.filter(function(a){return a.indexOf('INFORME NO RADICADO')===-1&&a.indexOf('Art.')===-1;}).length&&!infsBase.length) html+='<div class="text-muted small">Sin alertas críticas</div>';
  html+='</div></div></div></div>';

  // ── Coalición — respetar filtro Paso 1 ────────────────────────────────────
  _pendingCoalKey=null; // reset
  var _selPCoal=document.getElementById('selPartido');
  var _pCoalSrc=(_selPCoal&&_selPCoal.value)?_selPCoal.value:(c?c.partido:'');
  var _cCoal={partido:_pCoalSrc,departamento:c.departamento,municipio:c.municipio};
  var coal3=_findCoalicion(_cCoal);
  if(coal3){
    var coalLogo=coal3.url_logo?coal3.url_logo.replace('../storage/','https://app.cne.gov.co/fondo/storage/'):'';
    var coalKey='cne_coal_'+_alphaKey(_pCoalSrc)+'_'+norm(c.municipio||c.departamento);
    var coalLS={};try{coalLS=JSON.parse(localStorage.getItem(coalKey)||'{}');}catch(e){}

    // Auto-verify 1: Coalición registrada en FNFP
    var v1=coal3.estado?'CUMPLE':'NO CUMPLE';
    var v1badge=coal3.estado?'<span class="badge bg-success">REGISTRADA Y ACTIVA</span>':'<span class="badge bg-danger">INACTIVA</span>';

    // Auto-verify 2: Candidatos del partido en el municipio
    var coalParties=(coal3.nombre_coalicion||'').toUpperCase().split(/\s+Y\s+/);
    var candCoal=[];
    for(var _cc in CANDIDATOS){
      var _cx=CANDIDATOS[_cc];
      var pUp=(_cx.partido||'').toUpperCase();
      for(var _cp=0;_cp<coalParties.length;_cp++){
        if(pUp.indexOf(coalParties[_cp].trim())!==-1||coalParties[_cp].trim().indexOf(pUp)!==-1){candCoal.push(_cx);break;}
      }
    }

    // Auto-verify 4: Transferencias entre partidos (códigos 106/212)
    var transfer106=[],transfer212=[];
    if(TX_CACHE){
      for(var _tc in TX_CACHE){
        var txArr=TX_CACHE[_tc];
        if(txArr&&txArr.length) txArr.forEach(function(t){
          var cod=String(t.cco_id||'').trim();
          if(cod==='106') transfer106.push(t);
          if(cod==='212') transfer212.push(t);
        });
      }
    }
    var tieneTransf=transfer106.length>0||transfer212.length>0;

    html+='<div class="card mt-3 mb-3 border-warning"><div class="card-header fw-semibold py-2 bg-warning text-dark">'+
      '<i class="fa fa-handshake me-2"></i>COALICIÓN: '+esc(coal3.nombre_coalicion)+'</div>'+
      '<div class="card-body"><div class="row g-2 mb-3">'+
      (coalLogo?'<div class="col-md-2 text-center"><img src="'+esc(coalLogo)+'" style="max-height:60px;max-width:100%" alt="Logo" onerror="this.style.display=\'none\'"></div>':'')+
      '<div class="col-md-5"><label class="small fw-semibold">Representante Legal Coalición</label>'+
      '<div class="fw-bold">'+esc(coal3.nombre_representante||'N/D')+'</div>'+
      '<div class="small text-muted">Este es el responsable al que se oficia</div></div>'+
      '<div class="col-md-5"><label class="small fw-semibold">Estado</label>'+
      '<div>'+v1badge+'</div>'+
      '<div class="small text-muted mt-1">ID FNFP: '+coal3.id+'</div></div>'+
      '</div>';

    // ── Subir acuerdo de coalición ──
    html+='<div class="border rounded p-2 mb-3 bg-light">';
    html+='<div class="d-flex align-items-center gap-2">';
    html+='<i class="fa fa-file-pdf fa-lg text-danger"></i>';
    html+='<strong class="small">Acuerdo de Coalición</strong>';
    html+='<input type="file" accept=".pdf" class="form-control form-control-sm" style="max-width:300px" ';
    html+='onchange="if(this.files[0]) _leerAcuerdoCoalicion(\''+coalKey+'\',this.files[0])">';
    html+='<span id="coalAcuerdoStatus" class="small"></span>';
    html+='</div>';
    html+='<div id="coalAcuerdoResult"></div>';
    html+='</div>';
    _pendingCoalKey=coalKey; // para auto-búsqueda después de innerHTML

    // ── Verificaciones ──
    html+='<table class="table table-sm table-bordered mb-2"><thead class="table-warning"><tr>'+
      '<th class="small" style="width:30px">#</th><th class="small">Verificación</th><th class="small text-center" style="width:140px">Auto</th><th class="small text-center" style="width:160px">Resultado</th>'+
      '</tr></thead><tbody>';

    // 1. Acuerdo de coalición
    html+='<tr><td class="small fw-bold">1</td><td class="small">Que exista el acuerdo de coalición</td>'+
      '<td class="text-center">'+v1badge+'</td>'+
      '<td class="text-center">'+_selectCritCoal(coalKey,'acuerdo_existe',coalLS.acuerdo_existe||'')+'</td></tr>';

    // 2. Candidatos listados
    var candListHtml=candCoal.map(function(cx){return esc(cx.nombre)+' ('+esc(cx.id)+')';}).join(', ');
    var v2auto=candCoal.length>0?'<span class="badge bg-info">'+candCoal.length+' candidato(s)</span>':'<span class="badge bg-secondary">0</span>';
    html+='<tr><td class="small fw-bold">2</td><td class="small">Que los candidatos estén listados en el acuerdo'+
      '<div class="text-muted" style="font-size:0.7rem">Encontrados: '+candListHtml+'</div></td>'+
      '<td class="text-center">'+v2auto+'</td>'+
      '<td class="text-center">'+_selectCritCoal(coalKey,'candidatos_listados',coalLS.candidatos_listados||'')+'</td></tr>';

    // 3. Fecha del acuerdo
    var fechaAcVal=coalLS.fecha_acuerdo||'';
    html+='<tr><td class="small fw-bold">3</td><td class="small">Extraer fecha del acuerdo para la certificación</td>'+
      '<td class="text-center"><input type="date" class="form-control form-control-sm" style="width:130px;display:inline-block" value="'+esc(fechaAcVal)+'" onchange="_saveCoalField(\''+coalKey+'\',\'fecha_acuerdo\',this.value)"></td>'+
      '<td class="text-center">'+(fechaAcVal?'<span class="badge bg-success">'+fechaAcVal+'</span>':'<span class="badge bg-secondary">Pendiente</span>')+'</td></tr>';

    // 4. Distribución de recursos
    var v4auto=tieneTransf?'<span class="badge bg-warning text-dark">'+transfer106.length+' ing. (106) / '+transfer212.length+' gas. (212)</span>':'<span class="badge bg-secondary">Sin transferencias</span>';
    html+='<tr><td class="small fw-bold">4</td><td class="small">Verificar distribución de recursos entre partidos</td>'+
      '<td class="text-center">'+v4auto+'</td>'+
      '<td class="text-center">'+_selectCritCoal(coalKey,'distribucion_recursos',coalLS.distribucion_recursos||'')+'</td></tr>';

    html+='</tbody></table>';

    // Detalle transferencias si hay
    if(tieneTransf){
      html+='<div class="alert alert-warning py-2 mb-0 small"><i class="fa fa-exchange-alt me-1"></i><strong>Transferencias del partido detectadas:</strong><ul class="mb-0 mt-1">';
      transfer106.forEach(function(t){html+='<li><strong>106</strong> (Ing. partido) — '+esc(t.tercero||'')+' — '+fmtCOP(parseFloat(t.valor)||0)+' — '+esc(t.fecha||'')+'</li>';});
      transfer212.forEach(function(t){html+='<li><strong>212</strong> (Gas. partido) — '+esc(t.tercero||'')+' — '+fmtCOP(parseFloat(t.valor)||0)+' — '+esc(t.fecha||'')+'</li>';});
      html+='</ul></div>';
    }

    html+='</div></div>';
  }

  // ── Tabla de candidatos del mismo municipio/corporación ──────────────────
  html+='<div class="card mt-3 mb-3"><div class="card-header fw-semibold py-2 bg-light d-flex justify-content-between align-items-center">'+
    '<span><i class="fa fa-users me-2"></i>Candidatos del municipio</span>'+
    '<span><span class="badge bg-secondary" id="contCandPaso3">0</span> <small id="contArtPaso3" class="ms-2"></small></span></div>'+
    '<div class="card-body p-0"><div class="table-responsive">'+
    '<table class="table table-hover table-sm mb-0"><thead class="table-dark"><tr>'+
    '<th>Candidato</th><th>Cédula</th><th>ANI</th>'+
    '<th>Art.23</th><th>Art.27</th><th>Art.34</th>'+
    '<th>Retiro</th><th>Revocado</th><th>No Presentó</th><th>Extemporáneo</th>'+
    '</tr></thead><tbody id="tbodyCandPaso3"></tbody></table></div></div></div>';


  document.getElementById('panelEstado').innerHTML=html;
  if(_pendingCoalKey){ setTimeout(function(){ var k=_pendingCoalKey; _pendingCoalKey=null; _buscarAcuerdoAuto(k); },300); }

  // Poblar tabla de candidatos del municipio
  _poblarCandidatosPaso3(c);
}

function _poblarCandidatosPaso3(c){
  var tbody=document.getElementById('tbodyCandPaso3');
  var cont=document.getElementById('contCandPaso3');
  if(!tbody||!CANDIDATOS) return;
  var filtroPartido=norm(document.getElementById('selPartido').value);
  var rows=[];
  var txQueue=[];
  function _estBadge(val,label){
    return val?'<span class="badge bg-danger" style="font-size:.65rem">'+label+'</span>':'<span class="text-success small">\u2014</span>';
  }
  // Pre-calcular conteo por partido — usar CC si disponible
  var _partCount={};
  var _partCountCC=false;
  if(_ccCandsMun&&_ccCandsMun.length){
    var _corpMapPC={'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2};
    var _corpIdPC=_corpMapPC[(document.getElementById('selCorp').value||'').toUpperCase()]||null;
    _ccCandsMun.forEach(function(cc){
      if(_corpIdPC&&cc.corp_id!==_corpIdPC) return;
      var pn=norm(cc.org||'');
      _partCount[pn]=(_partCount[pn]||0)+1;
    });
    if(Object.keys(_partCount).length) _partCountCC=true;
  }
  if(!_partCountCC){
    for(var _pc in CANDIDATOS){var _pp=norm(CANDIDATOS[_pc].partido||''); _partCount[_pp]=(_partCount[_pp]||0)+1;}
  }

  for(var cid in CANDIDATOS){
    var cx=CANDIDATOS[cid];
    if(filtroPartido && norm(cx.partido)!==filtroPartido) continue;
    var obs2=cx.observaciones||{}, est2=obs2.estado||{};
    if(!est2.renuncio&&cx.renuncio!==undefined) est2={renuncio:cx.renuncio,no_presento:cx.no_presento,extemporaneo:cx.extemporaneo,revocado:cx.revocado};
    var isCurrent=(cx.id==c.id);
    var aniBadge=typeof _aniBadge==='function'?_aniBadge(cx.id):'';
    var spinHtml='<span class="spinner-border spinner-border-sm text-muted" style="width:.7rem;height:.7rem"></span>';
    rows.push('<tr class="'+(isCurrent?'table-primary':'')+'" style="cursor:pointer" onclick="_selCandIrPaso(\''+esc(cx.id)+'\',6)" id="trCP3_'+esc(cx.id)+'">'+
      '<td class="small fw-semibold text-nowrap">'+(isCurrent?'<i class="fa fa-arrow-right me-1 text-primary"></i>':'')+esc(cx.nombre)+'</td>'+
      '<td class="small text-nowrap">'+esc(cx.id)+'</td>'+
      '<td class="text-center text-nowrap">'+aniBadge+'</td>'+
      '<td class="text-center" id="a23_'+esc(cx.id)+'">'+spinHtml+'</td>'+
      '<td class="text-center" id="a27_'+esc(cx.id)+'">'+spinHtml+'</td>'+
      '<td class="text-center" id="a34_'+esc(cx.id)+'">'+spinHtml+'</td>'+
      '<td class="text-center">'+_estBadge(est2.renuncio,'S\u00cd')+'</td>'+
      '<td class="text-center">'+_estBadge(est2.revocado,'S\u00cd')+'</td>'+
      '<td class="text-center">'+_estBadge(est2.no_presento,'S\u00cd')+'</td>'+
      '<td class="text-center">'+_estBadge(est2.extemporaneo,'S\u00cd')+'</td>'+
      '</tr>');
    txQueue.push(cx);
  }
  tbody.innerHTML=rows.join('');
  if(cont)cont.textContent=rows.length;
  // Cargar transacciones async para Art.23/27/34
  _cargarArtPaso3Async(txQueue, _partCount);
}

// ── Carga async de transacciones para tabla Paso 4 ──
function _calcArtFromTx(data, topeInd, fechaInsc, fechaElec){
  var txList=Array.isArray(data)?data:(data.transacciones||data.ingresos||[]);
  if(!Array.isArray(txList)) txList=[];
  if(!Array.isArray(data) && data.gastos) txList=txList.concat(data.gastos);
  var maxDon102=0, anonTotal=0, hayArt34=false;
  for(var i=0;i<txList.length;i++){
    var t=txList[i];
    var cco=String(t.cco_id||t.codigo_contable||t.cco||t.codigo||'').trim();
    var val=parseFloat(t.valor||t.monto||0)||0;
    var concepto=(t.concepto||t.tipo||'').toUpperCase();
    var fecha=t.fecha||t.fecha_transaccion||'';
    if(typeof fecha==='string') fecha=fecha.substring(0,10);
    var nit=String(t.nit_cc||t.nit||t.cc||t.identificacion||t.cedula||'').trim();
    // Art.23: solo código 102 (donaciones particulares)
    if(cco==='102' && val>maxDon102) maxDon102=val;
    // Art.27: financiación prohibida (anónimos, sin registro ANI, canceladas)
    // Excluye código 101 (recursos propios) y 103 (créditos/anticipos)
    if(concepto==='INGRESO' && cco!=='101' && cco!=='103'){
      var isAnon=(!nit||nit==='0'||nit.toUpperCase()==='ANONIMO'||nit==='nan'||nit==='-'||nit==='');
      var aniMiss=(nit&&!isAnon&&(function(n,tx){
        // 1. ANI pre-indexado del item
        if(tx&&tx._ani_tercero){var v2=(tx._ani_tercero.v||'').toLowerCase();return v2==='sin registro'||v2==='no encontrada'||v2.indexOf('cancelada')!==-1;}
        // 2. ANI_INDEX global
        if(typeof ANI_INDEX!=='object'||!ANI_INDEX) return false;
        var r=ANI_INDEX[n];if(!r)return true;var v=(r.v||'').toLowerCase();return v==='sin registro'||v==='no encontrada'||v.indexOf('cancelada')!==-1;
      })(nit,t));
      if((isAnon||aniMiss) && val>0) anonTotal+=val;
    }
    // Art.34: fechas fuera de período
    if(fecha && fecha!=='\u2014' && fecha.length>=10){
      if(fechaInsc && fecha<fechaInsc) hayArt34=true;
      if(fecha>fechaElec) hayArt34=true;
    }
  }
  var lim23=topeInd>0?(topeInd*0.10):0;
  return { a23: topeInd>0 && maxDon102>lim23, a23max: maxDon102, a27: anonTotal>0, a27val: anonTotal, a34: hayArt34 };
}

function _setArtCells(c23,c27,c34, a23,a23max,tI, a27,a27val, a34){
  if(c23) c23.innerHTML=a23?'<span class="badge bg-danger" style="font-size:.65rem" title="Don. c\u00f3d.102: '+fmtCOP(a23max)+' > 10% tope '+fmtCOP(Math.round(tI*0.10))+'">ALERTA</span>':'<span class="text-success small">\u2014</span>';
  if(c27) c27.innerHTML=a27?'<span class="badge bg-danger" style="font-size:.65rem" title="An\u00f3nimos: '+fmtCOP(a27val)+'">ALERTA</span>':'<span class="text-success small">\u2014</span>';
  if(c34) c34.innerHTML=a34?'<span class="badge bg-warning text-dark" style="font-size:.65rem" title="Fechas fuera de per\u00edodo">ADV</span>':'<span class="text-success small">\u2014</span>';
  var tr=c23?c23.parentElement:null;
  if(tr && !tr.classList.contains('table-primary')){
    if(a23||a27||a34) tr.classList.add('table-warning');
  }
}

function _cargarArtPaso3Async(queue, partCount){
  var FECHA_ELEC='2023-10-29';
  var batch=5, idx=0;
  var totals={a23:0,a27:0,a34:0};
  function _updateArtStats(){
    var el=document.getElementById('contArtPaso3');
    if(el) el.innerHTML='Art.23: <span class="badge bg-danger">'+totals.a23+'</span> | Art.27: <span class="badge bg-danger">'+totals.a27+'</span> | Art.34: <span class="badge bg-warning text-dark">'+totals.a34+'</span>';
  }
  function _processCand(cx){
    var cellA23=document.getElementById('a23_'+cx.id);
    var cellA27=document.getElementById('a27_'+cx.id);
    var cellA34=document.getElementById('a34_'+cx.id);
    if(!cellA23) return Promise.resolve();
    var nP=_contarCandPartidoCC(cx.cargo, cx.partido);
    var tT=buscarTopeTotal(cx.cargo,cx.poblacion||0);
    var tI=tT?Math.round(tT/nP*100)/100:(cx.tope_legal||0);
    var fiKey=typeof _getFechaInscFiltroKey==='function'?_getFechaInscFiltroKey(cx):null;
    var fechaInsc=null;
    if(fiKey && typeof FECHA_INSC_CARGUE==='object' && FECHA_INSC_CARGUE) fechaInsc=FECHA_INSC_CARGUE[fiKey]||null;
    if(!fechaInsc) try{ fechaInsc=localStorage.getItem('cne_fecha_insc_'+cx.id)||null; }catch(e){}
    var txUrl=txUrlFor(cx);
    if(!txUrl){ _setArtCells(cellA23,cellA27,cellA34,false,0,tI,false,0,false); return Promise.resolve(); }
    if(TX_CACHE[cx.id]){
      var r=_calcArtFromTx(TX_CACHE[cx.id],tI,fechaInsc,FECHA_ELEC);
      _setArtCells(cellA23,cellA27,cellA34,r.a23,r.a23max,tI,r.a27,r.a27val,r.a34);
      if(r.a23)totals.a23++; if(r.a27)totals.a27++; if(r.a34)totals.a34++;
      _updateArtStats();
      return Promise.resolve();
    }
    return fetch(txUrl).then(function(resp){
      if(!resp.ok) return null;
      return resp.json();
    }).then(function(data){
      if(!data){ _setArtCells(cellA23,cellA27,cellA34,false,0,tI,false,0,false); return; }
      TX_CACHE[cx.id]=data;
      var r=_calcArtFromTx(data,tI,fechaInsc,FECHA_ELEC);
      _setArtCells(cellA23,cellA27,cellA34,r.a23,r.a23max,tI,r.a27,r.a27val,r.a34);
      if(r.a23)totals.a23++; if(r.a27)totals.a27++; if(r.a34)totals.a34++;
      _updateArtStats();
    }).catch(function(){
      _setArtCells(cellA23,cellA27,cellA34,false,0,tI,false,0,false);
    });
  }
  function _nextBatch(){
    var promises=[];
    while(idx<queue.length && promises.length<batch){
      promises.push(_processCand(queue[idx]));
      idx++;
    }
    if(promises.length>0){
      Promise.all(promises).then(function(){ _updateArtStats(); if(idx<queue.length) setTimeout(_nextBatch,50); });
    } else {
      _updateArtStats();
    }
  }
  _updateArtStats();
  _nextBatch();
}

// ─── PASO 5: LISTA DE CANDIDATOS ──────────────────────────────────────────
var _CAND_LIST_5=[]; // lista ordenada para "Siguiente candidato"

function renderCandidatosLista(){
  if(!CANDIDATOS||!Object.keys(CANDIDATOS).length){
    document.getElementById('panelCandidatos5').innerHTML='<div class="alert alert-secondary">Seleccione un municipio en Paso 1 primero.</div>';
    return;
  }
  // Cargar inscripciones + IG_DOCS_INDEX antes de renderizar
  _cargarInscripcionesIndex(function(){ _cargarFechaInscCargue(function(){ _cargarIGDocsIndex(function(){ _renderCandidatosListaInner(); }); }); });
}
function _renderCandidatosListaInner(){
  var filtroPartido=norm(document.getElementById('selPartido').value);
  var lista=Object.values(CANDIDATOS);
  if(filtroPartido) lista=lista.filter(function(x){return norm(x.partido)===filtroPartido;});
  // Filtrar también por corporación seleccionada
  var _corpVal=document.getElementById('selCorp').value;
  if(_corpVal){
    var _cN=norm(_corpVal);
    var _cargoFiltro=_cN.indexOf('ALCALD')!==-1?'ALCALDIA':
                     _cN.indexOf('CONCEJ')!==-1?'CONCEJO':
                     _cN.indexOf('ASAMBLEA')!==-1||_cN.indexOf('DIPUTA')!==-1?'ASAMBLEA':
                     _cN.indexOf('JAL')!==-1||_cN.indexOf('JUNTA ADMIN')!==-1?'JAL':'GOBERNACION';
    lista=lista.filter(function(x){return norm(x.cargo||'').indexOf(_cargoFiltro)!==-1;});
  }
  lista.sort(function(a,b){return (a.nombre||'').localeCompare(b.nombre||'');});
  _CAND_LIST_5=lista.map(function(x){return x.id;});


  var html='<div class="card"><div class="card-header fw-semibold py-2 bg-light">'+
    '<div class="d-flex justify-content-between align-items-center flex-wrap gap-1">'+
    '<span><i class="fa fa-users me-2"></i>Candidatos</span>'+
    '<span><span class="badge bg-primary">'+lista.length+'</span></span>'+
    '</div></div>'+
    '<div class="card-body p-0"><div class="table-responsive">'+
    '<table class="table table-hover table-sm mb-0"><thead class="table-dark"><tr>'+
    '<th>Candidato</th><th>Cédula</th><th>Partido</th><th>F. Inscripción</th><th>Elegido</th>'+
    '<th class="text-end">Ingresos</th><th class="text-end">Gastos</th>'+
    '<th class="text-end">Votos</th><th class="text-end">Tope Ind.</th><th>Tope</th><th>Soportes</th><th>Alertas</th>'+
    '</tr></thead><tbody>';

  // Pre-calcular conteo por partido (CC si disponible)
  var _ccPartCountP5={};
  if(_ccCandsMun&&_ccCandsMun.length){
    var _corpMapP5C={'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2};
    var _corpIdP5C=_corpMapP5C[(_corpVal||'').toUpperCase()]||null;
    _ccCandsMun.forEach(function(cc){
      if(_corpIdP5C&&cc.corp_id!==_corpIdP5C) return;
      var pn=norm(cc.org||'');
      _ccPartCountP5[pn]=(_ccPartCountP5[pn]||0)+1;
    });
  }

  // Rutas base para soportes ingresos/gastos
  var _p5dpto=_normFNFP(document.getElementById('selDpto').value);
  var _p5mun=_normFNFP(document.getElementById('selMun').value);
  var _p5base='ig/'+_p5dpto+'/'+_p5mun+'/';
  var _p5fechaInsc=(function(){
    var _fic={departamento:document.getElementById('selDpto').value,municipio:document.getElementById('selMun').value,cargo:document.getElementById('selCorp').value};
    return _lookupFechaInscCargue(_fic);
  })();

  var sIng=0,sGas=0,sVot=0;
  lista.forEach(function(cx){
    var obs2=cx.observaciones||{}, fin2=obs2.financiero||{}, est2=obs2.estado||{};
    if(!est2.renuncio&&cx.renuncio!==undefined) est2={renuncio:cx.renuncio,no_presento:cx.no_presento,extemporaneo:cx.extemporaneo,revocado:cx.revocado};
    var ing2=cx.total_ingresos_rep||fin2.total_ingresos||cx.total_ingresos_cand||0;
    var gas2c=cx.total_gastos_rep||fin2.total_gastos||cx.total_gastos_cand||0;
    var nP2=_contarCandPartidoCC(cx.cargo, cx.partido);
    var tT2=buscarTopeTotal(cx.cargo,cx.poblacion||0);
    var tI2=tT2?Math.round(tT2/nP2*100)/100:(cx.tope_legal||0);
    var supera2=tI2>0&&gas2c>tI2;
    var aniBadge=typeof _aniBadge==='function'?_aniBadge(cx.id):'';
    // Alertas del candidato
    var alertas=[];
    // Estado
    if(est2.renuncio)    alertas.push('<span class="badge bg-danger" title="Renunci\u00f3">REN</span>');
    if(est2.no_presento) alertas.push('<span class="badge bg-danger" title="No present\u00f3 informe">NP</span>');
    if(est2.extemporaneo)alertas.push('<span class="badge bg-warning text-dark" title="Present\u00f3 extemporaneamente">EXT</span>');
    if(est2.revocado)    alertas.push('<span class="badge bg-dark" title="Inscripci\u00f3n revocada">REV</span>');
    // Tope real (recalculado)
    if(supera2) alertas.push('<span class="badge bg-danger">TOPE</span>');
    // Alertas del análisis Excel (analisis_full.py) — excluir SUPERA TOPE (ya se muestra)
    var _al2raw=obs2.alertas||cx.alertas||[];
    var _al2=Array.isArray(_al2raw)?_al2raw.filter(function(a){return a.toUpperCase().indexOf('SUPERA TOPE')===-1;}):[];
    var _al2cnt=Array.isArray(_al2raw)?_al2.length:(typeof _al2raw==='number'?_al2raw:0);
    if(_al2.length){
      var _al2tip=_al2.slice(0,3).join(' | ').substring(0,200);
      alertas.push('<span class="badge bg-danger" title="'+_al2tip.replace(/"/g,"'")+'" style="cursor:help">'+_al2.length+' alerta'+(+_al2.length>1?'s':'')+'</span>');
    } else if(_al2cnt>0){

      alertas.push('<span class="badge bg-danger" style="cursor:help">'+_al2cnt+' alerta'+(_al2cnt>1?'s':'')+'</span>');

    }

    // Advertencias — artículos (Art.23/24/25/27/34) separadas de otras
    var _adv2raw=obs2.advertencias||cx.advertencias||[];
    var _adv2=Array.isArray(_adv2raw)?_adv2raw:[];
    var _adv2cnt=typeof _adv2raw==='number'?_adv2raw:_adv2.length;
    var _artAdv=_adv2.filter(function(a){return /Art\.\d+/.test(a);});
    var _otAdv=_adv2.filter(function(a){return !/Art\.\d+/.test(a)&&a.indexOf('MAI/SAI')===-1&&a.indexOf('INFORME NO RADICADO')===-1;});
    if(_artAdv.length){
      var _artTip=_artAdv.slice(0,3).join(' | ').substring(0,200);
      alertas.push('<span class="badge bg-warning text-dark" title="'+_artTip.replace(/"/g,"'")+'" style="cursor:help">Art('+_artAdv.length+')</span>');
    }
    if(_otAdv.length){
      alertas.push('<span class="badge bg-secondary" title="'+_otAdv.slice(0,3).join(' | ').replace(/"/g,"'")+'" style="cursor:help">+'+_otAdv.length+'</span>');
    } else if(_adv2cnt>0&&!_artAdv.length){

      alertas.push('<span class="badge bg-warning text-dark" style="cursor:help">'+_adv2cnt+' adv</span>');

    }

    if(!alertas.length&&(obs2.requiere_investigacion||cx.requiere_investigacion)) alertas.push('<span class="badge bg-danger"><i class="fa fa-exclamation-triangle me-1"></i>INV</span>');
    var alertHtml=alertas.length?alertas.join(' '):'<span class="text-success small">—</span>';
    sIng+=ing2; sGas+=gas2c; sVot+=(cx.votos||0);
    var isCurrent=CAND_SELEC&&cx.id===CAND_SELEC.id;
    var rowClass=(isCurrent?'table-primary':'')+(supera2?' table-danger':'')+(alertas.length&&!supera2&&!isCurrent?' table-warning':'');
    var fInsc=_p5fechaInsc;
    html+='<tr class="'+rowClass+'" style="cursor:pointer" onclick="_selCandIrPaso(\''+esc(cx.id)+'\',6)">'+
      '<td class="small fw-semibold">'+(isCurrent?'<i class="fa fa-arrow-right me-1 text-primary"></i>':'')+esc(cx.nombre)+'</td>'+
      '<td class="small">'+esc(cx.id)+aniBadge+'</td>'+
      '<td class="small">'+esc(cx.partido||'')+'</td>'+
      '<td class="small text-nowrap">'+(fInsc?esc(fInsc):'<span class="text-muted">—</span>')+'</td>'+
      '<td class="small">'+(cx.elegido&&cx.elegido!=='-'?'<span class="badge bg-success">'+esc(cx.elegido)+'</span>':'—')+'</td>'+
      '<td class="text-end small">'+fmtCOP(ing2)+'</td>'+
      '<td class="text-end small fw-semibold '+(supera2?'text-danger':'')+'">'+fmtCOP(gas2c)+'</td>'+
      '<td class="text-end small">'+fmtNum(cx.votos||0)+'</td>'+
      '<td class="text-end small">'+fmtCOP(tI2)+'</td>'+
      '<td class="text-center">'+(supera2?'<span class="badge bg-danger">EXCEDE</span>':'<span class="badge bg-success">OK</span>')+'</td>'+
      '<td class="text-center text-nowrap" onclick="event.stopPropagation()">'+
        (function(){
          var cxP=_normFNFP(cx.partido);
          var igFolder=cx.id;
          var _p5cxPReal=cxP, _p5dReal=_p5dpto, _p5mReal=_p5mun;
          if(IG_DOCS_INDEX){
            var igKey=_p5dpto+'/'+_p5mun+'/'+cxP;
            var igObj=IG_DOCS_INDEX[igKey];
            if(!igObj){
              for(var _igk in IG_DOCS_INDEX){
                if(_igk.indexOf(_p5dpto+'/'+_p5mun+'/')===0&&_alphaKey(_igk.split('/')[2])===_alphaKey(cxP)){igObj=IG_DOCS_INDEX[_igk];break;}
              }
            }
            if(igObj){
              if(igObj.pf) _p5cxPReal=igObj.pf;
              if(igObj.d)  _p5dReal=igObj.d;
              if(igObj.mu) _p5mReal=igObj.mu;
              if(igObj.e){
                for(var _ige=0;_ige<igObj.e.length;_ige++){
                  if(igObj.e[_ige].id===String(cx.id)){igFolder=igObj.e[_ige].f||cx.id;break;}
                }
              }
            }
          }
          var ingUrl=_encodePath('ig/'+_p5dReal+'/'+_p5mReal+'/'+encodeURIComponent(_p5cxPReal)+'/'+igFolder+'/ingresos/');
          var gasUrl=_encodePath('ig/'+_p5dReal+'/'+_p5mReal+'/'+encodeURIComponent(_p5cxPReal)+'/'+igFolder+'/gastos/');
          return '<a href="'+ingUrl+'" target="_blank" class="btn btn-outline-success btn-sm me-1" style="font-size:.6rem;padding:1px 4px" title="Soportes Ingresos '+esc(cx.nombre)+'"><i class="fa fa-arrow-circle-down me-1"></i>Ing</a>'+
            '<a href="'+gasUrl+'" target="_blank" class="btn btn-outline-danger btn-sm" style="font-size:.6rem;padding:1px 4px" title="Soportes Gastos '+esc(cx.nombre)+'"><i class="fa fa-arrow-circle-up me-1"></i>Gas</a>';
        })()+'</td>'+
      '<td class="text-center text-nowrap">'+alertHtml+'</td>'+
      '</tr>';
  });

  html+='</tbody><tfoot><tr class="table-secondary fw-bold"><td colspan="5" class="small">TOTAL</td>'+
    '<td class="text-end small">'+fmtCOP(sIng)+'</td>'+
    '<td class="text-end small">'+fmtCOP(sGas)+'</td>'+
    '<td class="text-end small">'+fmtNum(sVot)+'</td>'+
    '<td colspan="4"></td></tr></tfoot></table></div></div></div>';

  // Botones de acción globales
  html+='<div class="d-flex gap-2 flex-wrap mt-3">'+
    '<button class="btn btn-warning" onclick="irPaso(7)"><i class="fa fa-envelope me-1"></i>Oficiar</button>'+
    '<button class="btn btn-success" onclick="irPaso(10)"><i class="fa fa-certificate me-1"></i>Certificar</button>'+
    '<button class="btn btn-danger" onclick="irPaso(9)"><i class="fa fa-gavel me-1"></i>Investigar</button>'+
    '<button class="btn btn-primary ms-auto" onclick="irPaso(7)">Siguiente: Observaciones <i class="fa fa-arrow-right ms-1"></i></button>'+
    '</div>';

  document.getElementById('panelCandidatos5').innerHTML=html;
}

// ─── ACCIONES POR CANDIDATO (sec6 footer) ─────────────────────────────────
function _renderAccionesCand(){
  var panel=document.getElementById('panelAccionesCand');
  if(!panel||!CAND_SELEC) return;
  // Solo mostrar en sec6 (sub-vista de Paso 5 Candidatos)
  if(_PASO_ACTUAL!==6){ panel.innerHTML=''; return; }
  var idx=_CAND_LIST_5.indexOf(CAND_SELEC.id);
  var nextCid=(idx>=0&&idx<_CAND_LIST_5.length-1)?_CAND_LIST_5[idx+1]:null;
  var prevCid=(idx>0)?_CAND_LIST_5[idx-1]:null;
  var totalCand=_CAND_LIST_5.length;
  var posLabel=(idx>=0)?(idx+1)+'/'+totalCand:'';

  // Fila 1: Volver | Anterior | posición | Siguiente
  var html='<div class="d-flex gap-2 justify-content-center align-items-center mb-2">';
  html+='<button class="btn btn-outline-dark" onclick="irPaso(5)"><i class="fa fa-list me-1"></i>Volver al listado</button>';
  if(prevCid){
    html+='<button class="btn btn-outline-secondary" onclick="_selCandIrPaso(\''+esc(prevCid)+'\',6)"><i class="fa fa-arrow-left me-1"></i>Anterior</button>';
  }
  html+='<span class="badge bg-dark fs-6">'+esc(posLabel)+'</span>';
  if(nextCid){
    html+='<button class="btn btn-primary" onclick="_selCandIrPaso(\''+esc(nextCid)+'\',6)">Siguiente candidato <i class="fa fa-arrow-right ms-1"></i></button>';
  }
  html+='</div>';

  // Oficiar/Certificar/Investigar solo en listado (Paso 5), NO dentro del candidato

  panel.innerHTML=html;

  // Update sec6 title
  var titleEl=document.getElementById('sec6Title');
  if(titleEl) titleEl.innerHTML='<i class="fa fa-user me-2 text-info"></i>'+esc(CAND_SELEC.nombre)+' <span class="text-muted small">('+esc(posLabel)+')</span>';
}

function chipEstado(label,activo,tooltip){
  return '<div class="d-flex align-items-center gap-2 mb-2">'+
    '<span class="badge '+(activo?'bg-danger':'bg-secondary')+'">'+esc(label)+'</span>'+
    (activo?'<span class="small text-danger">'+esc(tooltip)+'</span>':'<span class="small text-muted">No aplica</span>')+
    '</div>';
}

// ─── TOPES EN TIEMPO REAL ─────────────────────────────────────────────────
function normStr(s){
  // Normaliza a UPPERCASE sin acentos (igual que Python norm())
  return (s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

/**
 * Busca el tope TOTAL del municipio para una corporación y población.
 * Si la población es menor al rango mínimo disponible, retorna el tope
 * mínimo de esa corporación (fallback para municipios muy pequeños).
 */
function buscarTopeTotal(cargo, poblacion){
  var topes = ANALISIS.topes || [];
  if(!topes.length || !cargo) return null;
  var corpN = normStr(cargo);  // ej: "CONCEJO", "ALCALDIA"

  var matches = topes.filter(function(t){
    var tc = normStr(t.corporacion);
    return tc.indexOf(corpN) !== -1 || corpN.indexOf(tc) !== -1;
  });
  if(!matches.length) return null;

  // Ordenar: rangos acotados (hi finito) van primero, de menor a mayor.
  // Cuando dos rangos tienen hi=∞ (censo_max=null), el de MAYOR lo va primero:
  //   → el rango "techo" (5M+, tope máximo) se evalúa ANTES que el "piso" (25k-∞, tope mínimo).
  // Así Bogotá (6M hab) obtiene el tope correcto y no el del rango piso.
  matches.sort(function(a, b){
    var ha = (a.censo_max !== null && a.censo_max !== undefined) ? a.censo_max : 9999999999;
    var hb = (b.censo_max !== null && b.censo_max !== undefined) ? b.censo_max : 9999999999;
    if(ha !== hb) return ha - hb;           // distintos hi → menor hi primero
    // mismo hi (ambos ∞): mayor lo primero (más específico = más restrictivo)
    var la = (a.censo_min !== null && a.censo_min !== undefined) ? a.censo_min : 0;
    var lb = (b.censo_min !== null && b.censo_min !== undefined) ? b.censo_min : 0;
    return lb - la;
  });

  // Buscar rango exacto (el más acotado posible)
  for(var i=0; i<matches.length; i++){
    var t = matches[i];
    var lo = (t.censo_min !== null && t.censo_min !== undefined) ? t.censo_min : 0;
    var hi = (t.censo_max !== null && t.censo_max !== undefined) ? t.censo_max : 9999999999;
    if(lo <= poblacion && poblacion <= hi) return t.tope;
  }

  // Fallback: municipio muy pequeño (debajo de todos los rangos) → tope mínimo
  matches.sort(function(a,b){ return a.tope - b.tope; });
  return matches[0].tope;
}

/**
 * Devuelve el tope INDIVIDUAL = tope_total_municipio / n.
 * n = candidatos del mismo partido en el municipio (pasado por el caller).
 * Para Alcaldía con 1 candidato por partido → n=1 → tope_total sin cambio.
 * Para Concejo MAIS con 17 candidatos → n=17 → tope_total / 17.
 */
function calcTopeLegal(cargo, poblacion, nInscritos){
  var total = buscarTopeTotal(cargo, poblacion);
  if(!total) return null;
  var n = (nInscritos && nInscritos > 0) ? nInscritos : 1;
  return Math.round(total / n * 100) / 100;
}

// ─── PASO 3: FINANCIERO ───────────────────────────────────────────────────
function renderPaso3(){
  var c=CAND_SELEC, obs=c.observaciones||{}, fin=obs.financiero||{};
  // Prioridad: REPORTES (tx) > CANDIDATOS.xlsx > 0
  var ing=c.total_ingresos_rep||fin.total_ingresos||c.total_ingresos_cand||0;
  var gas=c.total_gastos_rep ||fin.total_gastos ||c.total_gastos_cand ||0;
  var pob=c.poblacion||0, votos=c.votos||0;

  // ── Tope total del municipio (de la resolución de topes) ──────────────────
  var topeTotal = buscarTopeTotal(c.cargo, pob);

  // ── Contar candidatos del MISMO PARTIDO — CC si disponible ──
  var nPartido = _contarCandPartidoCC(c.cargo, c.partido);

  // ── Tope individual = tope_total ÷ candidatos del mismo partido ───────────
  var topeInd = topeTotal ? Math.round(topeTotal / nPartido * 100) / 100 : null;
  var tope = topeInd || c.tope_legal || fin.tope_legal || 0;

  // ── Alertas con tope real ─────────────────────────────────────────────────
  var superaTope = tope>0 && gas>tope;
  var pct = tope>0 ? Math.min(100,(gas/tope)*100) : 0;
  var barColor = superaTope?'bg-danger':(pct>80?'bg-warning':'bg-success');
  var gxv = votos>0 ? (gas/votos).toFixed(0) : 'N/A';
  var informe = obs.informe||{};

  var html='';

  // ── Análisis de artículos ──────────────────────────────────────────────────
  var art=(obs.articulos||{});
  var art23max=art.art23_max_donacion||0;
  var art24gas=art.art24_gastos_201_209||0;
  var art25ob=art.art25_obligado;
  var art25umb=art.art25_umbral||232000000;
  var art27anon=art.art27_ingresos_anonimos||0;
  var cod103=art.cod103_valor||0;
  function artRow(art,label,val,estado,nota){
    var cls=estado==='ALERTA'?'table-danger':estado==='ADVERTENCIA'?'table-warning':estado==='OK'?'table-success':'';
    return '<tr class="'+cls+'"><td class="small fw-semibold">'+art+'</td><td class="small">'+label+'</td><td class="text-end small fw-semibold">'+val+'</td><td class="small text-muted">'+nota+'</td></tr>';
  }
  html+='<div class="card mb-3"><div class="card-header fw-semibold py-2"><i class="fa fa-balance-scale me-2 text-primary"></i>Análisis de Artículos Ley 1475/2011 (globales)</div>'+
    '<div class="card-body p-0"><table class="table table-sm mb-0">'+
    '<thead class="table-light"><tr><th>Artículo</th><th>Descripción</th><th class="text-end">Valor</th><th>Estado</th></tr></thead><tbody>'+
    artRow('Art.24','Gastos de campaña (Cód.201-209)',fmtCOP(art24gas),(tope&&art24gas>tope)?'ALERTA':'OK',
      tope?('vs tope '+fmtCOP(tope)):'')+
    artRow('Art.25','Obligación gerente/cuenta bancaria',tope?fmtCOP(tope):'N/D',(tope&&tope>=art25umb)?'ADVERTENCIA':'OK',
      (tope&&tope>=art25umb)?'OBLIGADO — Tope candidato ≥ '+fmtCOP(art25umb)+' — Verificar en 8B':'NO OBLIGADO — Tope candidato '+fmtCOP(tope||0)+' < '+fmtCOP(art25umb))+
    artRow('Cód.103','Pignoración / Crédito / Anticipo',fmtCOP(cod103),cod103>0?'ADVERTENCIA':'OK',
      cod103>0?'Verificar soporte':'Sin registros')+
    '</tbody></table></div></div>';

  document.getElementById('panelFinanciero').innerHTML=html;
}

function card3(label,cls,val,sub){
  return '<div class="col-md-3"><div class="card text-center"><div class="card-body py-3">'+
    '<div class="fw-bold fs-5 '+cls+'">'+val+'</div>'+
    '<div class="small text-muted">'+label+'</div>'+
    '<div class="text-muted" style="font-size:.7rem">'+sub+'</div>'+
    '</div></div></div>';
}

// ─── guardarRespOficio (legacy — ahora usa _subirRespuesta) ──────────────
function guardarRespOficio(){ _subirRespuesta(); }

// Normalizar nombre partido/dpto/mun a formato carpeta FNFP (MAYUS, _)
function _normFNFP(s){
  s=(s||'').replace(/_/g,' ').toUpperCase();
  s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); // convierte á→a, é→e, etc.
  return s.replace(/[^A-Z0-9&\u00d1 ]/g,'').replace(/ +/g,'_').replace(/_+$/,'');
}
// Normalizar cargo a formato carpeta dictamen
function _normCargoDict(cargo){
  var c=norm(cargo);
  if(c.indexOf('ALCALD')!==-1) return 'ALCALDIA_FUN';
  if(c.indexOf('CONCEJ')!==-1) return 'CONCEJO';
  if(c.indexOf('ASAMBLEA')!==-1||c.indexOf('DIPUTA')!==-1) return 'ASAMBLEA';
  if(c.indexOf('JAL')!==-1||c.indexOf('JUNTA')!==-1) return 'JUNTA_ADMINISTRADORAS_LOCALES';
  return 'GOBERNACION';
}

