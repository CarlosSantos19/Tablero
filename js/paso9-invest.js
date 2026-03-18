// ─── PASO 9: INVESTIGACIONES ─────────────────────────────────────────────
function _detectCausales(cx){
  var obs=cx.observaciones||{}, art=obs.articulos||{}, est=obs.estado||{};
  if(!est.renuncio&&cx.renuncio!==undefined) est={renuncio:cx.renuncio,no_presento:cx.no_presento,extemporaneo:cx.extemporaneo,revocado:cx.revocado};
  var gas=cx.total_gastos_rep||(obs.financiero||{}).total_gastos||cx.total_gastos_cand||0;
  var nP=_contarCandPartidoCC(cx.cargo, cx.partido);
  var topeTot=buscarTopeTotal(cx.cargo,cx.poblacion||0);
  var tope=(topeTot?Math.round(topeTot/nP*100)/100:null)||cx.tope_legal||0;
  var art23max=art.art23_max_donacion||0;
  var art27anon=art.art27_ingresos_anonimos||0;
  var art24gas=art.art24_gastos_201_209||0;
  var causales=[];
  if(est.no_presento||cx.no_presento)
    causales.push({key:'NO_PRES',art:'No Presentación',color:'danger',desc:'No presentó informe de ingresos y gastos',file:'plantillas/investigaciones/Investigacion_NO_PRESENTACION.docx'});
  if(tope>0&&art23max>(tope*0.10))
    causales.push({key:'ART23',art:'Art. 23',color:'danger',desc:'Donación individual ('+fmtCOP(art23max)+') supera 10% del tope ('+fmtCOP(Math.round(tope*0.10))+')',file:'plantillas/investigaciones/Investigacion_ART_23.docx'});
  if(art.art25_obligado||(tope>0&&tope>=(art.art25_umbral||232000000)))
    causales.push({key:'ART25',art:'Art. 25',color:'warning',desc:'Obligado gerente/cuenta bancaria — Tope '+fmtCOP(tope)+' >= '+fmtCOP(art.art25_umbral||232000000),file:'plantillas/investigaciones/Investigacion_ART_25.docx'});
  if(art27anon>0)
    causales.push({key:'ART27',art:'Art. 27',color:'danger',desc:'Ingresos anónimos: '+fmtCOP(art27anon),file:'plantillas/investigaciones/Investigacion_ART_27.docx'});
  if(tope>0&&gas>tope)
    causales.push({key:'TOPE',art:'Art. 24/27',color:'danger',desc:'Gastos '+fmtCOP(gas)+' superan tope '+fmtCOP(tope)+' (exceso: '+fmtCOP(gas-tope)+')',file:'plantillas/investigaciones/Investigacion_ART_27.docx'});
  return {causales:causales,tope:tope,gas:gas};
}

function renderInvestigaciones(){
  var el=document.getElementById('panelInvestigaciones');
  if(!CANDIDATOS||!Object.keys(CANDIDATOS).length){
    el.innerHTML='<div class="alert alert-secondary">Cargue candidatos primero (Paso 1).</div>'; return;
  }
  // Filtrar por partido del Paso 1
  var pSel=document.getElementById('selPartido');
  var pFiltro=pSel&&pSel.value?norm(pSel.value):'';
  var lista=Object.values(CANDIDATOS);
  if(pFiltro) lista=lista.filter(function(x){return norm(x.partido)===pFiltro;});
  // Filtrar por corporación
  var _corpSel=document.getElementById('selCorp');
  if(_corpSel&&_corpSel.value){
    var _cN9=norm(_corpSel.value);
    var _cf9=_cN9.indexOf('ALCALD')!==-1?'ALCALDIA':_cN9.indexOf('CONCEJ')!==-1?'CONCEJO':
             _cN9.indexOf('ASAMBLEA')!==-1||_cN9.indexOf('DIPUTA')!==-1?'ASAMBLEA':
             _cN9.indexOf('JAL')!==-1||_cN9.indexOf('JUNTA')!==-1?'JAL':'GOBERNACION';
    lista=lista.filter(function(x){return norm(x.cargo||'').indexOf(_cf9)!==-1;});
  }
  lista.sort(function(a,b){return (a.nombre||'').localeCompare(b.nombre||'');});

  // Detectar causales por candidato
  var candConCausal=[], candSinCausal=[];
  var porArticulo={}; // {key: [{cand, desc}]}
  lista.forEach(function(cx){
    var r=_detectCausales(cx);
    if(r.causales.length>0){
      candConCausal.push({c:cx,causales:r.causales,tope:r.tope,gas:r.gas});
      r.causales.forEach(function(ca){
        if(!porArticulo[ca.key]) porArticulo[ca.key]={art:ca.art,color:ca.color,file:ca.file,cands:[]};
        porArticulo[ca.key].cands.push({c:cx,desc:ca.desc});
      });
    } else {
      candSinCausal.push(cx);
    }
  });

  var html='';
  // Resumen
  var nInv=candConCausal.length, nOk=candSinCausal.length;
  html+='<div class="row g-2 mb-3">'+
    '<div class="col-auto"><div class="card text-center border-0 bg-light px-3 py-2">'+
      '<div class="fs-5 fw-bold">'+lista.length+'</div><div class="small text-muted">Candidatos</div></div></div>'+
    '<div class="col-auto"><div class="card text-center border-0 '+(nInv?'bg-danger text-white':'bg-light')+' px-3 py-2">'+
      '<div class="fs-5 fw-bold">'+nInv+'</div><div class="small">'+(nInv?'Con causales':'Sin causales')+'</div></div></div>'+
    '<div class="col-auto"><div class="card text-center border-0 bg-success text-white px-3 py-2">'+
      '<div class="fs-5 fw-bold">'+nOk+'</div><div class="small">Sin causales</div></div></div>'+
    '<div class="col-auto"><div class="card text-center border-0 bg-light px-3 py-2">'+
      '<div class="fs-5 fw-bold">'+Object.keys(porArticulo).length+'</div><div class="small text-muted">Artículos</div></div></div>'+
  '</div>';

  // ── Tabla de candidatos ──
  html+='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">'+
    '<i class="fa fa-users me-2"></i>Listado de Candidatos — Causales de Investigación</div>'+
    '<div class="card-body p-0"><div class="table-responsive">'+
    '<table class="table table-hover table-sm mb-0"><thead class="table-dark"><tr>'+
    '<th>Candidato</th><th>Cédula</th><th>Partido</th>'+
    '<th class="text-end">Gastos</th><th class="text-end">Tope</th>'+
    '<th>Estado</th><th>Causales</th>'+
    '</tr></thead><tbody>';
  // Primero los que tienen causales
  candConCausal.forEach(function(item){
    var cx=item.c;
    var badges=item.causales.map(function(ca){
      return '<span class="badge bg-'+ca.color+' me-1" title="'+esc(ca.desc)+'">'+esc(ca.art)+'</span>';
    }).join('');
    html+='<tr class="table-danger" style="cursor:pointer" onclick="_selCandIrPaso(\''+esc(cx.id)+'\',6)">'+
      '<td class="small fw-semibold"><i class="fa fa-exclamation-triangle text-danger me-1"></i>'+esc(cx.nombre)+'</td>'+
      '<td class="small">'+esc(cx.id)+'</td>'+
      '<td class="small">'+esc(cx.partido||'')+'</td>'+
      '<td class="text-end small">'+fmtCOP(item.gas)+'</td>'+
      '<td class="text-end small">'+fmtCOP(item.tope)+'</td>'+
      '<td class="text-center"><span class="badge bg-danger"><i class="fa fa-gavel me-1"></i>INVESTIGAR</span></td>'+
      '<td class="small text-nowrap">'+badges+'</td></tr>';
  });
  // Los que están OK
  candSinCausal.forEach(function(cx){
    html+='<tr style="cursor:pointer" onclick="_selCandIrPaso(\''+esc(cx.id)+'\',6)">'+
      '<td class="small">'+esc(cx.nombre)+'</td>'+
      '<td class="small">'+esc(cx.id)+'</td>'+
      '<td class="small">'+esc(cx.partido||'')+'</td>'+
      '<td class="text-end small">'+fmtCOP(cx.total_gastos_rep||((cx.observaciones||{}).financiero||{}).total_gastos||cx.total_gastos_cand||0)+'</td>'+
      '<td class="text-end small">—</td>'+
      '<td class="text-center"><span class="text-success small"><i class="fa fa-check-circle"></i> OK</span></td>'+
      '<td></td></tr>';
  });
  html+='</tbody></table></div></div></div>';

  // ── Agrupación por artículo (oficios) ──
  if(nInv>0){
    html+='<h6 class="fw-bold mt-4 mb-3"><i class="fa fa-file-alt me-2 text-danger"></i>Oficios por Artículo — Candidatos agrupados</h6>';
    var artKeys=Object.keys(porArticulo).sort();
    artKeys.forEach(function(key){
      var grp=porArticulo[key];
      html+='<div class="card mb-3 border-'+grp.color+'">'+
        '<div class="card-header fw-semibold py-2 bg-'+grp.color+' text-white d-flex justify-content-between align-items-center">'+
          '<span><i class="fa fa-gavel me-2"></i>'+esc(grp.art)+' — '+grp.cands.length+' candidato'+(grp.cands.length>1?'s':'')+'</span>'+
          '<a href="'+esc(grp.file)+'" download class="btn btn-sm btn-light"><i class="fa fa-download me-1"></i>Plantilla</a>'+
        '</div>'+
        '<div class="card-body p-0"><table class="table table-sm mb-0">'+
        '<thead class="table-light"><tr><th>Candidato</th><th>Cédula</th><th>Partido</th><th>Detalle</th></tr></thead><tbody>';
      grp.cands.forEach(function(item){
        html+='<tr><td class="small fw-semibold">'+esc(item.c.nombre)+'</td>'+
          '<td class="small">'+esc(item.c.id)+'</td>'+
          '<td class="small">'+esc(item.c.partido||'')+'</td>'+
          '<td class="small text-muted">'+esc(item.desc)+'</td></tr>';
      });
      html+='</tbody></table></div></div>';
    });
  }

  // ── Plantillas ──
  html+='<div class="card mt-3"><div class="card-header py-2 small fw-semibold bg-light">Todas las plantillas disponibles</div>'+
    '<div class="card-body d-flex gap-2 flex-wrap">'+
      '<a href="plantillas/investigaciones/Investigacion_ART_23.docx" download class="btn btn-sm btn-outline-secondary"><i class="fa fa-download me-1"></i>Art. 23</a>'+
      '<a href="plantillas/investigaciones/Investigacion_ART_25.docx" download class="btn btn-sm btn-outline-secondary"><i class="fa fa-download me-1"></i>Art. 25</a>'+
      '<a href="plantillas/investigaciones/Investigacion_ART_27.docx" download class="btn btn-sm btn-outline-secondary"><i class="fa fa-download me-1"></i>Art. 27</a>'+
      '<a href="plantillas/investigaciones/Investigacion_ART_34.docx" download class="btn btn-sm btn-outline-secondary"><i class="fa fa-download me-1"></i>Art. 34</a>'+
      '<a href="plantillas/investigaciones/Investigacion_NO_PRESENTACION.docx" download class="btn btn-sm btn-outline-secondary"><i class="fa fa-download me-1"></i>No Presentación</a>'+
    '</div></div>';

  el.innerHTML=html;
}

