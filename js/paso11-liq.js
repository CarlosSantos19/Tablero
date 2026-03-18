// ─── PASO 11: LIQUIDACIÓN ────────────────────────────────────────────────
function renderLiquidacion(){
  var c=CAND_SELEC;
  var el=document.getElementById('panelLiquidacion');
  if(!c){ el.innerHTML='<div class="alert alert-secondary">Seleccione un candidato primero.</div>'; return; }

  // Datos del candidato y partido — prioridad: filtro Paso 1, luego candidato
  var obs=c.observaciones||{}, fin=obs.financiero||{}, est=obs.estado||{};
  var _selP=document.getElementById('selPartido');
  var _partidoFiltro=_selP?_selP.value:'';
  var pLow=(_partidoFiltro||c.partido||'').toLowerCase().trim();
  var todosP=Object.values(CANDIDATOS).filter(function(x){return (x.partido||'').toLowerCase().trim()===pLow;});
  var nCand=_contarCandPartidoCC(c.cargo, _partidoFiltro||c.partido);
  var esUnica=(nCand<=1);

  // Gastos consolidados — Prioridad: 1) Sumar desde módulo 6 (TX_CACHE), 2) resGasTotal, 3) candidatos
  var gastosConsolidados=0;
  // Intentar sumar gastos desde transacciones (módulo 6) de TODOS los candidatos del partido
  if(typeof TX_CACHE!=='undefined'){
    todosP.forEach(function(cd){
      var txData=TX_CACHE[cd.id];
      if(txData&&txData.length){
        txData.forEach(function(t){if(t.concepto==='GASTO')gastosConsolidados+=parseFloat(t.valor||0);});
      }
    });
  }
  // Fallback: Paso 1 resGasTotal
  if(!gastosConsolidados){
    var _gcEl=document.getElementById('resGasTotal');
    if(_gcEl) gastosConsolidados=parseInt((_gcEl.textContent||'').replace(/[^0-9]/g,''))||0;
  }
  // Fallback: sumar de candidatos
  if(!gastosConsolidados) todosP.forEach(function(cd){gastosConsolidados+=parseFloat(cd.total_gastos_rep)||parseFloat(cd.total_gastos_cand)||0;});

  // Tope
  var topeTot=buscarTopeTotal(c.cargo,c.poblacion||0);
  var topeInd=topeTot?Math.round(topeTot/(nCand||1)*100)/100:0;

  // Cargar estado de liquidaciones guardadas
  var liqKey='cne_liq_'+_alphaKey(c.partido)+'_'+_alphaKey(c.municipio)+'_'+_alphaKey(c.cargo);
  var liqState={};
  try{liqState=JSON.parse(localStorage.getItem(liqKey)||'{}');}catch(e){}

  // Tomar Total Votos desde Paso 1 (Votos Cand. + Votos Partido)
  var totalVotosLista=0;
  var _tvEl=document.getElementById('resTotalVotos');
  if(_tvEl) totalVotosLista=parseInt((_tvEl.textContent||'').replace(/\./g,'').replace(/,/g,''))||0;
  if(!totalVotosLista){
    // Fallback: sumar votos de todos los candidatos
    todosP.forEach(function(cd){ totalVotosLista+=(cd.votos||0); });
  }

  // Descuentos sugeridos automáticamente (gastos Y votos)
  var descSug=[], descVot={};
  todosP.forEach(function(cd){
    var cdEst=cd.observaciones?cd.observaciones.estado||{}:{};
    var cdGas=parseFloat(cd.total_gastos_rep)||parseFloat(cd.total_gastos_cand)||0;
    var cdVot=cd.votos||0;
    if(cdEst.revocado){
      descSug.push({cat:'(-) GASTOS CANDIDATOS REVOCADOS',monto:cdGas,cand:cd.nombre});
      descVot.v_rev=(descVot.v_rev||0)+cdVot;
    }
    if(cdEst.renuncio){
      descSug.push({cat:'(-) GASTOS CANDIDATOS RETIRADOS',monto:cdGas,cand:cd.nombre});
      descVot.v_ret=(descVot.v_ret||0)+cdVot;
    }
    if(cdEst.no_presento){
      descSug.push({cat:'(-) GASTOS CANDIDATOS QUE NO PRESENTARON EL INFORME',monto:cdGas,cand:cd.nombre});
      descVot.v_nopres=(descVot.v_nopres||0)+cdVot;
    }
    if(cdEst.extemporaneo){
      descSug.push({cat:'(-) GASTOS CANDIDATOS NO PRESENTARON EN DEBIDA FORMA',monto:0,cand:cd.nombre});
      descVot.v_noforma=(descVot.v_noforma||0)+cdVot;
    }
    if(cdEst.inhabilitado){
      descVot.v_inhab=(descVot.v_inhab||0)+cdVot;
    }
    // Gastos en ceros → quitar votos
    if(cdGas===0 && cdVot>0){
      descVot.v_ceros=(descVot.v_ceros||0)+cdVot;
    }
  });

  // Tipo de liquidación
  var tipoLiq=liqState.tipo||(esUnica?'unica':'primera');
  var primeraGuardada=parseFloat(liqState.neto_primera)||0;
  var segundaGuardada=parseFloat(liqState.neto_segunda)||0;

  // ── Header ──
  var html='<div class="card mb-3 border-0 bg-light"><div class="card-body py-2 small">'+
    '<strong>'+esc(_partidoFiltro||c.partido)+'</strong> · '+esc(titleCase(c.cargo))+' · '+esc(titleCase(c.municipio))+', '+esc(titleCase(c.departamento))+'<br>'+
    'Candidatos: <strong>'+nCand+'</strong> · Gastos consolidados: <strong>'+fmtCOP(gastosConsolidados)+'</strong>'+
    ' · Tope por candidato: '+fmtCOP(topeInd)+
  '</div></div>';

  // ── Selector de tipo ──
  html+='<div class="card mb-3"><div class="card-header py-2 fw-semibold"><i class="fa fa-list me-2"></i>Tipo de liquidación</div>'+
  '<div class="card-body py-2">'+
  '<select class="form-select form-select-sm" id="selTipoLiq" onchange="cambiarTipoLiq()">'+
  '<option value="unica"'+(tipoLiq==='unica'?' selected':'')+'>Liquidación Única (MI-RR-FO02)</option>'+
  '<option value="primera"'+(tipoLiq==='primera'?' selected':'')+'>Primera Liquidación (MI-RR-FO03)</option>'+
  '<option value="segunda"'+(tipoLiq==='segunda'?' selected':'')+'>Segunda Liquidación (MI-RR-FO03)</option>'+
  '<option value="tercera"'+(tipoLiq==='tercera'?' selected':'')+'>Tercera Liquidación (MI-RR-FO03)</option>'+
  '</select>'+
  '</div></div>';

  // ── Tabla de liquidación ──
  var esUnicaFO02=(tipoLiq==='unica');
  var esSeg=(tipoLiq==='segunda'||tipoLiq==='tercera');
  var formato=esUnicaFO02?'MI-RR-FO02':'MI-RR-FO03';
  var tituloLiq=tipoLiq==='unica'?'LIQUIDACIÓN ÚNICA':tipoLiq==='primera'?'PRIMERA LIQUIDACIÓN':tipoLiq==='segunda'?'SEGUNDA LIQUIDACIÓN':'TERCERA LIQUIDACIÓN';

  html+='<div class="card mb-3"><div class="card-header py-2 fw-semibold bg-success text-white d-flex justify-content-between">'+
    '<span><i class="fa fa-calculator me-2"></i>'+tituloLiq+'</span>'+
    '<span class="badge bg-light text-dark">'+formato+'</span></div>'+
    '<div class="card-body p-0">'+
    '<table class="table table-sm mb-0" id="tblLiq">'+
    '<thead class="table-light"><tr><th colspan="2" class="small">VOTOS CERTIFICADO ELECTORAL</th>'+
    '<th colspan="2" class="small">GASTOS CONSOLIDADOS CAMPAÑA</th></tr></thead>'+
    '<tbody>';

  // Filas de votos (izq) y gastos (der) — las 12 categorías
  var cats=[
    {vl:'TOTAL VOTOS VALIDOS DE LA LISTA',vk:'votos_total',gl:'TOTAL GASTOS CONSOLIDADOS',gv:gastosConsolidados,gk:'gastos_total',gReadonly:true},
    {vl:'VOTOS CANDIDATOS EN INVESTIGACIÓN Art. 25',vk:'v_inv25',gl:'GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 25',gk:'g_inv25'},
    {vl:'VOTOS CANDIDATOS EN INVESTIGACIÓN Art. 34',vk:'v_inv34',gl:'(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 34',gk:'g_inv34'},
    {vl:'(-) VOTOS GASTOS EN CEROS',vk:'v_ceros',gl:'(-) TRANSFERENCIAS',gk:'g_transf'},
    {vl:'(-) VOTOS CANDIDATOS NO PRESENTARON EN DEBIDA FORMA',vk:'v_noforma',gl:'(-) GASTOS CANDIDATOS NO PRESENTARON EN DEBIDA FORMA',gk:'g_noforma'},
    {vl:'(-) VOTOS CANDIDATOS NO PRESENTARON INFORME',vk:'v_nopres',gl:'(-) GASTOS CANDIDATOS QUE NO PRESENTARON EL INFORME',gk:'g_nopres'},
    {vl:'(-) VOTOS CANDIDATOS INHABILITADOS',vk:'v_inhab',gl:'(-) GASTOS SIN RELACIÓN DE CAUSALIDAD',gk:'g_sinrel'},
    {vl:'(-) VOTOS CANDIDATOS EN INVESTIGACIÓN Art. 23',vk:'v_inv23',gl:'(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 23',gk:'g_inv23'},
    {vl:'(-) VOTOS CANDIDATOS EN INVESTIGACIÓN Art. 24',vk:'v_inv24',gl:'(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 24',gk:'g_inv24'},
    {vl:'(-) VOTOS CANDIDATOS RETIRADOS',vk:'v_ret',gl:'(-) GASTOS CANDIDATOS RETIRADOS',gk:'g_ret'},
    {vl:'(-) VOTOS CANDIDATOS REVOCADOS',vk:'v_rev',gl:'(-) GASTOS CANDIDATOS REVOCADOS',gk:'g_rev'},
    {vl:'',vk:'',gl:'(-) GASTOS QUE NO ESTAN DEBIDAMENTE SOPORTADOS',gk:'g_nosop'},
    {vl:'',vk:'',gl:'(-) GASTOS CON POSTERIORIDAD A LA FECHA DEL DEBATE',gk:'g_post'}
  ];

  // Auto-fill descuentos sugeridos (por estado del candidato)
  var autoG={};
  descSug.forEach(function(d){
    if(d.cat.indexOf('REVOCADOS')!==-1) autoG.g_rev=(autoG.g_rev||0)+d.monto;
    else if(d.cat.indexOf('RETIRADOS')!==-1) autoG.g_ret=(autoG.g_ret||0)+d.monto;
    else if(d.cat.indexOf('NO PRESENTARON EL INFORME')!==-1) autoG.g_nopres=(autoG.g_nopres||0)+d.monto;
    else if(d.cat.indexOf('NO PRESENTARON EN DEBIDA FORMA')!==-1) autoG.g_noforma=(autoG.g_noforma||0)+d.monto;
  });

  // ── Auto-fill desde Paso 6: leer motivos de deducción guardados por transacción ──
  var _motToGk={
    '(-) GASTOS CANDIDATOS EN INVESTIGACI':'g_inv34',
    'Art. 34':'g_inv34',
    '(-) TRANSFERENCIAS':'g_transf',
    '(-) GASTOS CANDIDATOS NO PRESENTARON EN DEBIDA FORMA':'g_noforma',
    '(-) GASTOS CANDIDATOS QUE NO PRESENTARON EL INFORME':'g_nopres',
    '(-) GASTOS SIN RELACI':'g_sinrel',
    '(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 23':'g_inv23',
    'Art. 23':'g_inv23',
    '(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 24':'g_inv24',
    'Art. 24':'g_inv24',
    '(-) GASTOS CANDIDATOS RETIRADOS':'g_ret',
    '(-) GASTOS CANDIDATOS REVOCADOS':'g_rev',
    '(-) GASTOS QUE NO EST':'g_nosop',
    'DEBIDAMENTE SOPORTADOS':'g_nosop',
    '(-) GASTOS CON POSTERIORIDAD':'g_post'
  };
  function _motivoToGk(mot){
    if(!mot) return null;
    var mu=mot.toUpperCase();
    for(var k in _motToGk){ if(mu.indexOf(k.toUpperCase())!==-1) return _motToGk[k]; }
    return null;
  }
  // Sumar gastos marcados con motivo de deducción desde TX_CACHE
  var autoGTx={};
  if(typeof TX_CACHE!=='undefined'){
    todosP.forEach(function(cd){
      var txData=TX_CACHE[cd.id];
      if(!txData||!txData.length) return;
      var gasArr=txData.filter(function(t){return t.concepto==='GASTO';});
      gasArr.forEach(function(t,idx){
        var comp=(t.comprobante||t.nro_comprobante||String(idx)).replace(/[^a-zA-Z0-9]/g,'_');
        var txKey='cne_tx_'+cd.id+'_G_'+comp;
        var mot='';try{mot=localStorage.getItem(txKey)||'';}catch(e){}
        if(!mot) return;
        var gk=_motivoToGk(mot);
        if(gk) autoGTx[gk]=(autoGTx[gk]||0)+parseFloat(t.valor||0);
      });
    });
  }
  // Merge: TX deducciones del Paso 6 tienen prioridad (no sumar doble con descSug)
  for(var _gk in autoGTx){
    // Si ya hay valor de descSug para la misma key, reemplazar con TX (más preciso)
    autoG[_gk]=autoGTx[_gk];
  }

  cats.forEach(function(r){
    var vVal=parseFloat(liqState[r.vk])||(r.vk==='votos_total'?totalVotosLista:(descVot[r.vk]||0));
    var gVal=r.gReadonly?r.gv:(parseFloat(liqState[r.gk])||(autoG[r.gk]||0));
    html+='<tr>'+
      '<td class="small py-1" style="width:30%">'+(r.vl?esc(r.vl):'')+'</td>'+
      '<td class="py-1" style="width:12%">'+(r.vk?'<input type="number" class="form-control form-control-sm text-end liq-v" data-k="'+r.vk+'" value="'+vVal+'" min="0" oninput="recalcLiq()">':'')+'</td>'+
      '<td class="small py-1" style="width:38%">'+esc(r.gl)+'</td>'+
      '<td class="py-1" style="width:20%">'+(r.gReadonly?
        '<span class="fw-bold text-end d-block" id="liqGasTotal" data-raw="'+gVal+'">'+formatPeso(gVal)+'</span>':
        '<input type="number" class="form-control form-control-sm text-end liq-g" data-k="'+r.gk+'" value="'+gVal+'" min="0" oninput="recalcLiq()">')+'</td></tr>';
  });

  // Totales
  html+='<tr class="fw-bold table-warning"><td class="small">TOTAL VOTOS A DESCONTAR</td><td class="text-end" id="liqTotVDesc">0</td>'+
    '<td class="small">TOTAL GASTOS A DESCONTAR</td><td class="text-end" id="liqTotGDesc">0</td></tr>';
  html+='<tr class="fw-bold table-success"><td class="small">TOTAL VOTOS NETOS A LIQUIDAR</td><td class="text-end" id="liqVotNeto">0</td>'+
    '<td class="small">TOTAL GASTOS NETOS</td><td class="text-end" id="liqGasNeto">0</td></tr>';

  // Si es segunda/tercera, mostrar resta de certificaciones anteriores
  if(esSeg){
    html+='<tr class="table-info"><td colspan="2"></td>'+
      '<td class="small fw-bold">(-) TOTAL GASTOS NETOS LIQUIDADOS EN PRIMERA CERTIFICACIÓN</td>'+
      '<td><input type="number" class="form-control form-control-sm text-end" id="liqPrimNeto" value="'+primeraGuardada+'" oninput="recalcLiq()"></td></tr>';
    if(tipoLiq==='tercera'){
      html+='<tr class="table-info"><td colspan="2"></td>'+
        '<td class="small fw-bold">(-) TOTAL GASTOS NETOS LIQUIDADOS EN SEGUNDA CERTIFICACIÓN</td>'+
        '<td><input type="number" class="form-control form-control-sm text-end" id="liqSegNeto" value="'+segundaGuardada+'" oninput="recalcLiq()"></td></tr>';
    }
    html+='<tr class="fw-bold table-primary"><td colspan="2"></td>'+
      '<td class="small">TOTAL GASTOS NETOS '+tituloLiq+'</td>'+
      '<td class="text-end" id="liqGasNetoFinal">0</td></tr>';
  }
  html+='</tbody></table></div></div>';

  // ── Consolidado de liquidación ──
  html+='<div class="card mb-3"><div class="card-header py-2 fw-semibold"><i class="fa fa-coins me-2 text-warning"></i>CONSOLIDADO '+tituloLiq+'</div>'+
    '<div class="card-body p-0"><table class="table table-sm mb-0">'+
    '<tr><td class="small">CENSO</td><td class="text-end"><input type="number" class="form-control form-control-sm text-end" id="liqCenso" value="'+(liqState.censo||c.poblacion||0)+'" oninput="recalcLiq()"></td></tr>'+
    '<tr><td class="small">TOPE DE GASTOS POR CANDIDATO</td><td class="text-end"><span class="fw-bold" id="liqTope">'+formatPeso(topeInd)+'</span></td></tr>'+
    '<tr><td class="small">VALOR DEL VOTO (Res. 0672/2023)</td><td class="text-end"><input type="number" class="form-control form-control-sm text-end" id="liqValorVoto" value="'+(liqState.valor_voto||VALOR_DEL_VOTO[c.cargo.toUpperCase()]||0)+'" oninput="recalcLiq()"></td></tr>'+
    '<tr class="table-light"><td class="small">VALOR REPOSICIÓN POR GASTOS NETOS</td><td class="text-end fw-bold" id="liqRepGas">0</td></tr>'+
    '<tr class="table-light"><td class="small">VALOR LIQUIDACIÓN POR VOTOS NETOS</td><td class="text-end fw-bold" id="liqRepVot">0</td></tr>'+
    '<tr class="table-success fw-bold"><td id="liqPayLabel">VALOR A PAGAR</td><td class="text-end" id="liqPay">0</td></tr>'+
    '<tr><td class="small">Descuento Auditoría Externa 1% × Valor Liquidación por Votos</td><td class="text-end" id="liqDescAud">0</td></tr>'+
    '<tr class="fw-bold"><td>VALOR NETO A REPONER</td><td class="text-end" id="liqNetoRep">0</td></tr>'+
    '<tr><td class="small">(-) MENOS ANTICIPOS</td><td class="text-end"><input type="number" class="form-control form-control-sm text-end" id="liqAnticipos" value="'+(parseFloat(liqState.anticipos)||0)+'" oninput="recalcLiq()"></td></tr>'+
    '<tr class="table-primary fw-bold fs-6"><td id="liqTotalLabel">TOTAL NETO A REPONER</td><td class="text-end" id="liqTotalNeto">0</td></tr>'+
    '</table></div></div>';

  // ── Botones ──
  html+='<div class="d-flex gap-2 flex-wrap">'+
    '<button class="btn btn-primary" onclick="guardarLiquidacion()"><i class="fa fa-save me-1"></i>Guardar liquidación</button>'+
    '<button class="btn btn-success" onclick="exportarLiquidacion()"><i class="fa fa-download me-1"></i>Descargar MI Excel</button>'+
    '</div>';

  el.innerHTML=html;
  recalcLiq();
}

function cambiarTipoLiq(){
  var sel=document.getElementById('selTipoLiq');
  if(!sel) return;
  var liqKey='cne_liq_'+_alphaKey(CAND_SELEC.partido)+'_'+_alphaKey(CAND_SELEC.municipio)+'_'+_alphaKey(CAND_SELEC.cargo);
  var liqState={};
  try{liqState=JSON.parse(localStorage.getItem(liqKey)||'{}');}catch(e){}
  liqState.tipo=sel.value;
  try{localStorage.setItem(liqKey,JSON.stringify(liqState));}catch(e){}
  renderLiquidacion();
}

function recalcLiq(){
  // Sumar votos a descontar (todas las filas liq-v excepto votos_total y las de investigación 25)
  var totalV=0, descV=0;
  document.querySelectorAll('.liq-v').forEach(function(inp){
    var k=inp.dataset.k, v=parseFloat(inp.value)||0;
    if(k==='votos_total') totalV=v;
    else if(k!=='v_inv25'&&k!=='v_inv34') descV+=v;
  });
  var votNeto=totalV-descV;
  var el1=document.getElementById('liqTotVDesc'); if(el1) el1.textContent=fmtNum(descV);
  var el2=document.getElementById('liqVotNeto'); if(el2) el2.textContent=fmtNum(votNeto);

  // Sumar gastos a descontar
  var totalG=0, descG=0;
  var c=CAND_SELEC; if(!c) return;
  // Leer total gastos del span mostrado (consistente con renderLiquidacion que usa TX_CACHE/resGasTotal)
  var _gtSpan=document.getElementById('liqGasTotal');
  if(_gtSpan) totalG=parseFloat(_gtSpan.dataset.raw)||0;
  document.querySelectorAll('.liq-g').forEach(function(inp){
    descG+=parseFloat(inp.value)||0;
  });
  var gasNeto=totalG-descG;
  var el3=document.getElementById('liqTotGDesc'); if(el3) el3.textContent=formatPeso(descG);
  var el4=document.getElementById('liqGasNeto'); if(el4) el4.textContent=formatPeso(gasNeto);

  // Si segunda/tercera: restar certificaciones anteriores
  var gasNetoFinal=gasNeto;
  var primEl=document.getElementById('liqPrimNeto');
  if(primEl) gasNetoFinal-=parseFloat(primEl.value)||0;
  var segEl=document.getElementById('liqSegNeto');
  if(segEl) gasNetoFinal-=parseFloat(segEl.value)||0;
  var el5=document.getElementById('liqGasNetoFinal');
  if(el5) el5.textContent=formatPeso(gasNetoFinal);

  // Consolidado
  var valorVoto=parseFloat((document.getElementById('liqValorVoto')||{}).value)||0;
  var repGas=el5?gasNetoFinal:gasNeto;
  var repVot=votNeto*valorVoto;
  var el6=document.getElementById('liqRepGas'); if(el6) el6.textContent=formatPeso(repGas);
  var el7=document.getElementById('liqRepVot'); if(el7) el7.textContent=formatPeso(repVot);
  var pagar=Math.min(repGas,repVot);
  var payLabel=repGas>repVot?'VALOR A PAGAR POR VOTOS':'VALOR A PAGAR POR GASTOS';
  pagar=repGas>repVot?repVot:repGas;
  var el8=document.getElementById('liqPay'); if(el8) el8.textContent=formatPeso(pagar);
  var el8b=document.getElementById('liqPayLabel'); if(el8b) el8b.textContent=payLabel;
  var descAud=Math.round(repVot*0.01); // 1% del valor a pagar por votos
  var el9=document.getElementById('liqDescAud'); if(el9) el9.textContent=formatPeso(descAud);
  var netoRep=pagar-descAud;
  var el10=document.getElementById('liqNetoRep'); if(el10) el10.textContent=formatPeso(netoRep);
  var anticipos=parseFloat((document.getElementById('liqAnticipos')||{}).value)||0;
  var totalNeto=netoRep-anticipos;
  var el11=document.getElementById('liqTotalNeto'); if(el11) el11.textContent=formatPeso(totalNeto);
  var totalLabel=repGas>repVot?'TOTAL NETO A REPONER POR VOTOS':'TOTAL NETO A REPONER POR GASTOS';
  var el12=document.getElementById('liqTotalLabel'); if(el12) el12.textContent=totalLabel;
}

function _recogerDatosLiq(){
  var c=CAND_SELEC; if(!c) return null;
  var obj={
    tipo:(document.getElementById('selTipoLiq')||{}).value||'unica',
    partido:c.partido||'',
    cargo:c.cargo||'',
    departamento:c.departamento||'',
    municipio:c.municipio||'',
    fecha:new Date().toISOString().substring(0,10)
  };
  document.querySelectorAll('.liq-v,.liq-g').forEach(function(inp){obj[inp.dataset.k]=parseFloat(inp.value)||0;});
  obj.censo=parseFloat((document.getElementById('liqCenso')||{}).value)||0;
  obj.valor_voto=parseFloat((document.getElementById('liqValorVoto')||{}).value)||0;
  obj.anticipos=parseFloat((document.getElementById('liqAnticipos')||{}).value)||0;
  // Leer totales calculados
  var ids=['liqTotVDesc','liqVotNeto','liqTotGDesc','liqGasNeto','liqGasNetoFinal',
           'liqRepGas','liqRepVot','liqPay','liqDescAud','liqNetoRep','liqTotalNeto'];
  ids.forEach(function(id){
    var el=document.getElementById(id);
    if(el) obj[id]=parseFloat((el.textContent||'').replace(/[^0-9.-]/g,''))||0;
  });
  var primEl=document.getElementById('liqPrimNeto');
  if(primEl) obj.neto_primera=parseFloat(primEl.value)||0;
  var segEl=document.getElementById('liqSegNeto');
  if(segEl) obj.neto_segunda=parseFloat(segEl.value)||0;
  obj['neto_'+obj.tipo]=obj.liqGasNeto||0;
  return obj;
}

function guardarLiquidacion(){
  var c=CAND_SELEC; if(!c) return;
  var obj=_recogerDatosLiq(); if(!obj) return;
  var liqKey='cne_liq_'+_alphaKey(c.partido)+'_'+_alphaKey(c.municipio)+'_'+_alphaKey(c.cargo);
  // Guardar en localStorage
  try{localStorage.setItem(liqKey,JSON.stringify(obj));}catch(e){}
  // Guardar en servidor (data/liquidacion/)
  var jsonBody=JSON.stringify(obj);
  fetch('/api/guardar_liquidacion',{
    method:'POST',
    headers:{'Content-Type':'application/json','Content-Length':String(new Blob([jsonBody]).size)},
    body:jsonBody
  }).then(function(r){
    return r.text().then(function(txt){
      try{return JSON.parse(txt);}catch(e){throw new Error('Respuesta inválida: '+txt.substring(0,200));}
    });
  }).then(function(resp){
    if(resp.ok) alert('Liquidación guardada en '+resp.path);
    else alert('Error guardando en servidor: '+(resp.error||'desconocido')+'\n(Guardado local OK)');
  }).catch(function(e){
    alert('Guardado local OK. Error en servidor: '+e.message);
  });
}

function exportarLiquidacion(){
  var c=CAND_SELEC; if(!c) return;
  var obj=_recogerDatosLiq(); if(!obj) return;
  obj.cargo=titleCase(c.cargo||'');
  obj.partido=c.partido||'';
  obj.municipio=titleCase(c.municipio||'');
  obj.departamento=titleCase(c.departamento||'');
  // Servidor genera el Excel con openpyxl (preserva formato/colores de la plantilla)
  var jsonBody=JSON.stringify(obj);
  fetch('/api/exportar_liquidacion',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:jsonBody
  }).then(function(r){
    if(!r.ok) return r.text().then(function(t){throw new Error(t);});
    return r.blob();
  }).then(function(blob){
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='Liquidacion_'+_alphaKey(c.partido)+'_'+_alphaKey(c.municipio)+'_'+_alphaKey(c.cargo)+'.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  }).catch(function(e){
    alert('Error descargando Excel: '+e.message);
    console.error(e);
  });
}

// Legacy wrappers — now uses _certRegenText
function generarResumenCert(){return '';}
function actualizarResumenCert(){_certRegenText();}

function copiarResumenCert(uid){
  var el=document.getElementById(uid+'_resumen');
  if(!el) return;
  var txt=el.innerText||el.textContent||'';
  navigator.clipboard.writeText(txt).then(function(){
    var btn=document.querySelector('[onclick="copiarResumenCert(\''+uid+'\')"]');
    if(btn){var orig=btn.innerHTML; btn.innerHTML='<i class="fa fa-check me-1"></i>Copiado'; btn.classList.add('btn-success'); setTimeout(function(){btn.innerHTML=orig;btn.classList.remove('btn-success');},2000);}
  }).catch(function(){
    var ta=document.createElement('textarea');
    ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    alert('Copiado al portapapeles');
  });
}

// ─── GENERAR DOCX CERTIFICADO (auto-fill plantilla completo) ─────────

/** Número entero a palabras en español (mayúsculas) para documentos legales */
function _numPalabras(n){
  if(!n||n<=0) return 'CERO';
  n=Math.floor(n);
  var u=['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ',
    'ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECIS\u00c9IS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE',
    'VEINTIUN','VEINTID\u00d3S','VEINTITR\u00c9S','VEINTICUATRO','VEINTICINCO','VEINTIS\u00c9IS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
  var d=['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  var c=['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  function _h(n){
    if(n===100) return 'CIEN';
    if(n<30) return u[n]||'';
    if(n<100){var dd=Math.floor(n/10),uu=n%10; return d[dd]+(uu?' Y '+u[uu]:'');}
    if(n<1000){var cc=Math.floor(n/100),r=n%100; return c[cc]+(r?' '+_h(r):'');}
    if(n<1000000){var mm=Math.floor(n/1000),r2=n%1000; return (mm===1?'MIL':_h(mm)+' MIL')+(r2?' '+_h(r2):'');}
    var mi=Math.floor(n/1000000),r3=n%1000000;
    return (mi===1?'UN MILL\u00d3N':_h(mi)+' MILLONES')+(r3?' '+_h(r3):'');
  }
  return _h(n);
}

/** Vaciar texto de todas las <w:t> en un rango del XML (preserva estructura) */
function _certVaciarRango(xml, desde, hasta){
  return xml.substring(0,desde)+
    xml.substring(desde,hasta).replace(/<w:t([^>]*)>[\s\S]*?<\/w:t>/g,'<w:t$1></w:t>')+
    xml.substring(hasta);
}

function generarDocxCert(uid){
  var c=CAND_SELEC; if(!c){alert('Seleccione un candidato.');return;}
  var g=function(id){var el=document.getElementById(uid+'_'+id);return el?el.value.trim():'';};
  var cargo=String(c.cargo||'').toUpperCase();
  var esGobAsamblea=(cargo.indexOf('GOBERNAC')>=0||cargo.indexOf('ASAMBLEA')>=0);
  var isAlcaldia=cargo.indexOf('ALCALD')>=0;
  var isConcejo=cargo.indexOf('CONCEJO')>=0;

  // ── 1. Recopilar datos ──────────────────────────────────────────────
  var partido=g('partido')||c.partido||'';
  var municipio=titleCase(c.municipio||'');
  var departamento=titleCase(c.departamento||'');
  var audNombre=g('audnombre')||'';
  var audTP=g('audtp')||'';
  var acta=g('acta')||'';
  var dia=g('dia')||'';
  var mes=g('mes')||'';
  var ano=g('ano')||'';
  var jefeOficina=g('jefe_oficina')||_getJefes()[0]||'ANDREA DEL PILAR LOPERA PRADA';
  var certTipo='PRIMERA'; try{certTipo=localStorage.getItem('cne_cert_tipo_'+c.id)||'PRIMERA';}catch(e){}

  // Coalición
  var coal=_findCoalicion(c);
  var isCoalicion=!!coal;
  var coalNombre=isCoalicion?(coal.nombre_coalicion||partido):partido;

  // Candidatos del partido en este municipio
  var pN=norm(partido);
  var candsPartido=Object.values(CANDIDATOS).filter(function(cx){return norm(cx.partido)===pN;});
  if(!candsPartido.length) candsPartido=[c];

  // Categorizar candidatos por estado
  var presentaron=[],noPresentaron=[],noDebidaForma=[],revocados=[];
  candsPartido.forEach(function(cx){
    var obs=cx.observaciones||{},est=obs.estado||{};
    if(est.revocado) revocados.push(cx);
    else if(est.no_presento) noPresentaron.push(cx);
    else if(est.extemporaneo) noDebidaForma.push(cx);
    else presentaron.push(cx);
  });

  // Totales financieros
  var totalGastos=0,totalIngresos=0,totalVotos=0;
  candsPartido.forEach(function(cx){
    totalGastos+=(cx.total_gastos_rep||0);
    totalIngresos+=(cx.total_ingresos_rep||0);
    totalVotos+=(cx.votos||0);
  });

  // Votos a descontar (no presentaron + revocados)
  var votosDesc=0;
  noPresentaron.forEach(function(cx){votosDesc+=(cx.votos||0);});
  revocados.forEach(function(cx){votosDesc+=(cx.votos||0);});
  var votosNetos=totalVotos-votosDesc;

  // Tope y valor del voto
  var poblacion=c.poblacion||0;
  var tope=buscarTopeTotal(c.cargo,poblacion)||0;
  var numCands=_contarCandPartidoCC(c.cargo, c.partido);
  var topeInd=tope?Math.round(tope/numCands*100)/100:0;
  var cargoVV=isAlcaldia?'ALCALDIA':isConcejo?'CONCEJO':esGobAsamblea?'GOBERNACION':'ALCALDIA';
  var valorVoto=VALOR_DEL_VOTO[cargoVV]||0;

  // Liquidación
  var gastosNetos=totalGastos;
  var vxv=valorVoto*votosNetos;
  var valorBruto=Math.min(gastosNetos,vxv);
  var esPorGastos=gastosNetos<=vxv;
  var sinDerecho=votosNetos<=0;

  // 9B datos
  var c44=_findConsolidado44(c);
  var radicacion=g('radicado')||(c44?c44.radicacion:'')||'';
  var fechaPres=g('fecpres')||(c44?c44.fecha:'')||'';

  // Dictamen
  var dict=_findDictAnalisis(c);

  // Presentación extemporánea
  var presExtemp=false;
  var obs0=c.observaciones||{},est0=obs0.estado||{};
  if(est0.extemporaneo) presExtemp=true;

  // ── 2. Plantilla ────────────────────────────────────────────────────
  var certFile=esGobAsamblea
    ?'plantillas/certificaciones/Certificacion_GOBERNACION_ASAMBLEA.docx'
    :'plantillas/certificaciones/Certificacion_ALCALDIA_CONCEJO.docx';

  // ── 3. Procesar DOCX ───────────────────────────────────────────────
  fetch(certFile).then(function(r){
    if(!r.ok) throw new Error('No se pudo descargar la plantilla ('+r.status+')');
    return r.arrayBuffer();
  }).then(function(buf){
    return JSZip.loadAsync(buf);
  }).then(function(zip){
    return zip.file('word/document.xml').async('string').then(function(xml){

      // ── 3a. Parsear TODOS los nodos top-level dentro de <w:body> ──
      // Nodos: <w:p ...>...</w:p> y <w:tbl>...</w:tbl>
      var bodyStart=xml.indexOf('<w:body');
      var bodyEnd=xml.lastIndexOf('</w:body>');
      if(bodyStart<0||bodyEnd<0){console.error('No se encontró <w:body>');return zip;}
      var bodyContent=xml.substring(bodyStart,bodyEnd);

      // Extraer texto de un nodo XML (todos los <w:t>)
      function _nodeText(s){
        var r='',m,re=/<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
        while((m=re.exec(s))!==null) r+=m[1];
        return r;
      }

      // Buscar nodos top-level (paragraphs + tables) con regex no-greedy
      var nodeRe=/<w:p[ >][\s\S]*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:sectPr[\s\S]*?<\/w:sectPr>/g;
      var nm, nodes=[];
      while((nm=nodeRe.exec(bodyContent))!==null){
        var isTbl=nm[0].substring(0,6)==='<w:tbl';
        var isSect=nm[0].substring(0,9)==='<w:sectPr';
        nodes.push({s:bodyStart+nm.index,e:bodyStart+nm.index+nm[0].length,
          t:_nodeText(nm[0]),isTbl:isTbl,isSect:isSect,raw:nm[0]});
      }

      // ── 3a2. Identificar secciones condicionales y decidir qué quitar ──
      var toRemove=new Set(); // node indices to remove entirely

      for(var ni=0;ni<nodes.length;ni++){
        var nt=nodes[ni].t;
        if(nt.indexOf('APLICA')<0&&nt.indexOf('ESTE P')<0&&
           nt.indexOf('CUANDO EXISTEN TRANSFERENCIAS')<0) continue;

        var quitar=false;
        // ── Cargo ──
        if(nt.indexOf('APLICA PARA CONCEJO')>=0 && !isConcejo) quitar=true;
        if(nt.indexOf('APLICA PARA ALCALD')>=0 && !isAlcaldia) quitar=true;
        if(nt.indexOf('APLICA PARA ASAMBLEA')>=0 && !isConcejo&&!esGobAsamblea) quitar=true;
        if(nt.indexOf('APLICA PARA GOBERNACI')>=0 && !isAlcaldia&&!esGobAsamblea) quitar=true;
        // Corporación correcta en template GOB/ASA
        if(esGobAsamblea){
          var isAsam=cargo.indexOf('ASAMBLEA')>=0;
          if(nt.indexOf('APLICA PARA ASAMBLEA')>=0 && !isAsam) quitar=true;
          if(nt.indexOf('APLICA PARA GOBERNACI')>=0 && isAsam) quitar=true;
        }
        // ── Coalición ──
        if((nt.indexOf('APLICA PARA COALICI')>=0||nt.indexOf('APLICAN CUANDO ES COALICI')>=0) && !isCoalicion) quitar=true;
        // ── Informes sin derecho ──
        if(nt.indexOf('SIN DERECHO')>=0 && nt.indexOf('APLICA')>=0){
          if(nt.indexOf('CONCEJO')>=0 && !(isConcejo&&sinDerecho)) quitar=true;
          if(nt.indexOf('ALCALD')>=0 && !(isAlcaldia&&sinDerecho)) quitar=true;
          if(nt.indexOf('ASAMBLEA')>=0) quitar=true; // Handle later if needed
          if(nt.indexOf('NO APLICA LA LIQUIDACI')>=0 && !sinDerecho) quitar=true;
        }
        // ── Anticipo ──
        if(nt.indexOf('SIN ANTICIPO')>=0 && sinDerecho) quitar=true;
        if(nt.indexOf('CON ANTICIPO')>=0) quitar=true; // Default: sin anticipo
        // ── Candidatos no presentaron ──
        if(nt.indexOf('QUE NO PRESENTARON Y QUE NO PRESENTARON EN DEBIDA FORMA')>=0
           && noPresentaron.length===0 && noDebidaForma.length===0) quitar=true;
        if(nt.indexOf('QUE NO PRESENTARON EN DEBIDA FORMA')>=0
           && nt.indexOf('Y QUE NO')<0 && nt.indexOf('Y NO PRESENTARON')<0
           && noDebidaForma.length===0) quitar=true;
        if(nt.indexOf('QUE NO PRESENTARON (SOLO')>=0 && noPresentaron.length===0) quitar=true;
        if(nt.indexOf('EN DEBIDA FORMA (SOLO')>=0 && noDebidaForma.length===0) quitar=true;
        // ── Revocados ──
        if(nt.indexOf('CANDIDATOS REVOCADOS')>=0 && revocados.length===0) quitar=true;
        // ── Descuento de votos ──
        if(nt.indexOf('DESCUENTO DE VOTOS')>=0 && votosDesc===0) quitar=true;
        // ── Art. 25, 34, gastos, transferencias ──
        if(nt.indexOf('ART. 25')>=0) quitar=true;
        if(nt.indexOf('ART. 34')>=0) quitar=true;
        if(nt.indexOf('SIN RELACI')>=0) quitar=true;
        if(nt.indexOf('NO SE ENCUENTRAN DEBIDAMENTE')>=0) quitar=true;
        if(nt.indexOf('TRANSFERENCIAS DE LAS ORGANIZACIONES')>=0) quitar=true;

        if(quitar){
          // Remove this marker + all following nodes until next marker or section header
          toRemove.add(ni);
          for(var ri=ni+1;ri<nodes.length;ri++){
            if(nodes[ri].isSect) break;
            var rt=nodes[ri].t;
            // Stop at next APLICA/conditional marker
            if(rt.indexOf('APLICA')>=0||rt.indexOf('ESTE P')>=0||
               rt.indexOf('CUANDO EXISTEN TRANSFERENCIAS')>=0) break;
            // Stop at section headers
            if(rt.indexOf('CANDIDATOS QUE NO PRESENTARON')>=0) break;
            if(rt.indexOf('PRESUNTA VULNERACI')>=0) break;
            if(rt.indexOf('CANDIDATOS REVOCADOS')>=0) break;
            if(rt.indexOf('LIQUIDACI')>=0&&rt.indexOf('APLICA')<0) break;
            if(rt.indexOf('RESUNTA VULNERACI')>=0) break;
            if(rt.indexOf('GASTOS SIN RELACI')>=0&&rt.indexOf('APLICA')<0) break;
            toRemove.add(ri);
          }
        } else {
          // Section applies: just remove the marker paragraph itself
          toRemove.add(ni);
        }
      }

      // ── 3a3. Remove nodes from XML (bottom-up to preserve offsets) ──
      var removeArr=Array.from(toRemove).sort(function(a,b){return b-a;});
      removeArr.forEach(function(idx){
        if(idx>=nodes.length) return;
        var nd=nodes[idx];
        xml=xml.substring(0,nd.s)+xml.substring(nd.e);
      });

      // ── 3b. Reemplazos de texto ──────────────────────────────────────
      var cargoLabel=isAlcaldia?'ALCALD\u00cdA':isConcejo?'CONCEJO':'GOBERNACI\u00d3N';
      var certTipoMap={'UNICA':'\u00daNICA','PRIMERA':'PRIMERA','SEGUNDA':'SEGUNDA','TERCERA':'TERCERA'};
      var certTipoLabel=certTipoMap[certTipo]||'PRIMERA';
      var fechaReparto=(dia||'___')+' de '+(mes||'___')+' de '+(ano||'___');

      // Reemplazos ordenados de más largo a más corto (evitar conflictos)
      var repl=[
        // Party name (multiple variants, longest first)
        ['PARTIDO, MOVIMIENTO O GRUPO SIGNIFICATIVO DE CIUDADANOS',partido],
        ['PARTIDO, MOVIMIENTO O G.S.C.',partido],
        // Coalition name in template
        ['Coalici\u00f3n Program\u00e1tica y Pol\u00edtica denominada \u00abXXXXXXXX\u00bb',
          isCoalicion?'Coalici\u00f3n Program\u00e1tica y Pol\u00edtica denominada \u00ab'+coalNombre+'\u00bb':''],
        ['conformada por el ',isCoalicion?'conformada por el ':''],
        // Geography
        ['SOACHA',municipio],
        ['CUNDINAMARCA',departamento],
        // Cargo
        ['ALCALD\u00cdA \u2013 CONCEJO',cargoLabel],
        // Auditor (longest first)
        ['NOMBRE Y APELLIDOS DEL/LA AUDITORA',audNombre||'[AUDITOR]'],
        ['NOMBRE Y APELLIDOS COMPLETOS',audNombre||'[AUDITOR]'],
        ['NOMBRE COMPLETO DEL CONTADOR',audNombre||'[AUDITOR]'],
        ['Contador(a) P\u00fablico(a)','Contador(a) P\u00fablico(a)'],
        ['XXXXXXX-T',audTP||'[T.P.]'],
        ['XXXXXX-T',audTP||'[T.P.]'],
        // Radicación 9B
        ['colocar el n\u00famero de radicaci\u00f3n del formulario 9B inicial',radicacion||'[RADICACI\u00d3N]'],
        // Fecha presentación
        ['29 de diciembre de 2023',fechaPres||'[FECHA PRESENTACI\u00d3N]'],
        // Presentación oportuna/extemporánea
        ['Extempor\u00e1neamente',presExtemp?'Extempor\u00e1neamente':'oportunamente'],
        // Censo (words + number)
        ['N\u00daMERO EN LETRAS',_numPalabras(poblacion)],
        // Tope (words + number)
        ['VALOR EN LETRAS',_numPalabras(tope)+' PESOS MONEDA CORRIENTE'],
        ['VALOR EN N\u00daMERO',fmtCOP(tope).replace('$','')],
        // Cert type
        ['\u00daNICA/PRIMERA',certTipoLabel],
        // Liquidation - valor del voto
        ['$2.766',fmtCOP(valorVoto)],
        // Gastos comparison
        ['SUPERIORES/INFERIORES',esPorGastos?'INFERIORES':'SUPERIORES'],
        // Jefe de Oficina
        ['ANDREA DEL PILAR LOPERA PRADA',jefeOficina],
        // Votos descuento en letras
        ['NUMERO EN LETRAS',_numPalabras(votosDesc)],
      ];

      // Aplicar reemplazos en orden
      repl.forEach(function(r){
        if(r[1]!==undefined&&r[1]!==null) xml=xml.split(r[0]).join(String(r[1]));
      });

      // ── 3c. Reemplazar fecha de reparto en runs standalone ──
      // Runs <w:t>día</w:t>, <w:t>mes</w:t>, <w:t>año</w:t> son placeholders
      if(dia) xml=xml.replace(/<w:t([^>]*)>d\u00eda<\/w:t>/g,'<w:t$1>'+dia+'</w:t>');
      if(mes) xml=xml.replace(/<w:t([^>]*)>mes<\/w:t>/g,'<w:t$1>'+mes+'</w:t>');
      if(ano) xml=xml.replace(/<w:t([^>]*)>a\u00f1o<\/w:t>/g,'<w:t$1>'+ano+'</w:t>');

      // ── 3d. "NÚMERO" standalone (censo) — solo en runs cortos ──
      if(poblacion>0){
        xml=xml.replace(/<w:t([^>]*)>N\u00daMERO<\/w:t>/g,'<w:t$1>'+fmtNum(poblacion)+'</w:t>');
      }

      // ── 3e. Llenar tabla de liquidación (celdas con $) ──
      // Gastos netos reportados: primer "$" en la tabla de liquidación
      // Votos: número en la celda de votos
      // Valor bruto: resultado de la liquidación
      // Enfoque: reemplazar valores específicos en celdas de la tabla
      if(!sinDerecho){
        // Tabla LIQUIDACIÓN SIN ANTICIPO:
        // Celda GASTOS NETOS → fmtCOP(gastosNetos)
        // Celda No. DE VOTOS → fmtNum(votosNetos)
        // Celda VALOR BRUTO → fmtCOP(vxv)
        // Celda POR VOTOS/GASTOS → fmtCOP(valorBruto)
        // Estos son difíciles de targetear por posición. Usar approach diferente:
        // No modificar la tabla — el usuario la completa manualmente con los datos del resumen.
      }

      // ── 3f. Re-empaquetar y descargar ──
      zip.file('word/document.xml',xml);
      return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    });
  }).then(function(blob){
    var fname='Certificacion_'+c.id+'_'+c.nombre.replace(/\s+/g,'_').substring(0,30)+'.docx';
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=fname;
    a.click();
    URL.revokeObjectURL(a.href);
  }).catch(function(e){
    alert('Error generando DOCX: '+e.message);
    console.error(e);
  });
}

// ─── PASO 12: TODOS ───────────────────────────────────────────────────────
function poblarTodos(){
  var tbody=document.getElementById('tbodyTodos');
  tbody.innerHTML='';
  if(!_MUN_CARGADA||!Object.keys(CANDIDATOS).length){
    tbody.innerHTML='<tr><td colspan="14" class="text-center text-muted py-3">Seleccione Corporación + Departamento + Municipio en el Paso 1 para ver candidatos</td></tr>';
    return;
  }
  Object.values(CANDIDATOS).forEach(function(c){
    var obs={}, fin={}, est={};
    var al=c.alertas||0;
    var chips=[];
    if(c.renuncio) chips.push('Renunció');
    if(c.no_presento) chips.push('No Presentó');
    if(c.extemporaneo) chips.push('Extemporáneo');
    if(c.revocado) chips.push('Revocado');
    var tr=document.createElement('tr'); tr.style.cursor='pointer';
    tr.onclick=(function(id){return function(){seleccionarCandidato(id);};})(c.id);
    tr.innerHTML='<td>'+esc(c.nombre)+'</td><td>'+esc(c.id)+'</td>'+
      '<td class="small">'+esc(titleCase(c.partido))+'</td>'+
      '<td>'+badgeElegido(c.elegido)+'</td>'+
      '<td class="text-center">'+(al?'<span class="badge bg-danger">'+al+'</span>':'')+'</td>'+
      '<td>'+(c.advertencias?'<span class="badge bg-warning text-dark">'+c.advertencias+'</span>':'')+'</td>'+
      '<td class="small">'+chips.join(', ')+'</td>';
    tbody.appendChild(tr);
  });
  if(dtTodos) dtTodos.destroy();
  dtTodos=$('#tblTodos').DataTable({
    language:{url:'vendor/js/es-ES.json'},
    pageLength:25, order:[[11,'desc']],
    dom:'Bfrtip',
    buttons:[{extend:'excelHtml5',title:'CNE_Territoriales_2023'},'csv'],
  });
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────
function norm(s){return String(s||'').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function titleCase(s){return String(s||'').toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase();});}
function fmtCOP(n){return '$'+Number(n||0).toLocaleString('es-CO',{maximumFractionDigits:0});}
function fmtNum(n){return Number(n||0).toLocaleString('es-CO');}

function badgeElegido(v){
  var n=norm(v||'');
  if(n==='SI'||n==='S') return '<span class="badge bg-success">Elegido</span>';
  if(n==='NO'||n==='N') return '<span class="badge bg-secondary">No elegido</span>';
  return '<span class="text-muted">—</span>';
}

function badge01(v){
  var n=norm(v||'');
  if(n==='SI') return '<span class="badge bg-success">SI</span>';
  if(n==='NO') return '<span class="badge bg-danger">NO</span>';
  return '<span class="badge bg-secondary">'+esc(v||'—')+'</span>';
}

function badgeCrit(v){
  var map={OK:'success','NO CUMPLE':'danger',PENDIENTE:'secondary','NO APLICA':'light text-dark',EXCEDE_29DIC:'danger','SIN FECHA':'warning'};
  var cls=map[v]||'secondary';
  return '<span class="badge bg-'+cls+'">'+esc(v||'—')+'</span>';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PASO 13: CUENTAS CLARAS — CONSULTA EN LINEA ────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
var _ccIndex = null;      // indice cargado
var _ccCandsMun = [];     // candidatos del municipio actual
var _ccIndexLoaded = false;
var PROCESO_ID_CC = 7;

function _ccInit(){
  _ccCheckStatus();
  if(!_ccIndexLoaded){
    _ccLoadIndex(function(){ _ccSyncFromPaso1(); });
  } else {
    _ccSyncFromPaso1();
  }
}

function _ccCheckStatus(){
  fetch('/api/cne_status').then(function(r){return r.json();}).then(function(d){
    var bar = document.getElementById('ccStatusBar');
    if(d.sesion_activa){
      bar.innerHTML='<span class="badge bg-success"><i class="fa fa-check-circle me-1"></i>Sesión CNE activa ('+Math.round(d.edad_min)+' min)</span>';
    } else {
      bar.innerHTML='<span class="badge bg-warning text-dark"><i class="fa fa-exclamation-triangle me-1"></i>Sin sesión CNE</span> '+
        '<button class="btn btn-sm btn-outline-primary ms-2" onclick="_ccRelogin()">Iniciar sesión</button> '+
        '<small class="text-muted ms-2">O ejecute indexar_cuentas_claras.py para generar cookies</small>';
    }
  }).catch(function(){
    var bar = document.getElementById('ccStatusBar');
    bar.innerHTML='<span class="badge bg-secondary">No se pudo verificar sesión CNE</span>';
  });
}
