// ─── PASO 1: FILTROS ──────────────────────────────────────────────────────
var _PROCESO_SELECCIONADO=7; // default: Territoriales 2023

function _poblarProcesos(){
  var sel=document.getElementById('selProceso');
  if(!sel) return;
  var procs=window._CC_PROCESOS||[];
  if(!procs.length) return; // mantener el default hardcoded
  sel.innerHTML='';
  procs.forEach(function(p){
    var opt=document.createElement('option');
    opt.value=p.id;
    opt.textContent=p.nombre+(p.fecha?' ('+p.fecha+')':'');
    if(p.id===7) opt.selected=true;
    sel.appendChild(opt);
  });
}

function cambiarProceso(){
  var sel=document.getElementById('selProceso');
  _PROCESO_SELECCIONADO=parseInt(sel.value)||7;
  PROCESO_ID_CC=_PROCESO_SELECCIONADO;
  // Reset cascada completa
  _resetModulos();
  document.getElementById('selCorp').innerHTML='<option value="">-- Seleccione --</option>';
  document.getElementById('selDpto').innerHTML='<option value="">-- Seleccione --</option>';
  document.getElementById('selMun').innerHTML='<option value="">-- Seleccione --</option>';
  document.getElementById('selPartido').innerHTML='<option value="">-- Todos --</option>';
  document.getElementById('tbodyResultados').innerHTML='';
  _ocultarPaneles();
  CANDIDATOS={}; _MUN_CARGADA=null;

  if(_PROCESO_SELECCIONADO===7){
    // Territoriales 2023: usar busqueda.json original
    fetch('data/busqueda.json').then(function(r){
      if(!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function(data){
      BUSQUEDA=data;
      poblarCorps();
    }).catch(function(e){
      BUSQUEDA={};
      document.getElementById('selCorp').innerHTML='<option value="">-- Sin datos para este proceso --</option>';
    });
  } else {
    // Otros procesos: construir BUSQUEDA desde _ccIndex filtrando por proceso_id
    _construirBusquedaDesdeCC(_PROCESO_SELECCIONADO);
  }
}

function _construirBusquedaDesdeCC(procId){
  var corpNames={2:'GOBERNACION',3:'ALCALDIA',5:'ASAMBLEA',6:'CONCEJO'};
  function doIt(idx){
    var busq={};
    Object.keys(idx).forEach(function(dptoKey){
      var dptoObj=idx[dptoKey];
      var dptoNombre=dptoObj.nombre||dptoKey;
      Object.keys(dptoObj.municipios||{}).forEach(function(munKey){
        var munObj=dptoObj.municipios[munKey];
        var cands=(munObj.candidatos||[]).filter(function(c){
          return c.proceso_id===procId;
        });
        if(!cands.length) return;
        cands.forEach(function(c){
          var corpName=corpNames[c.corp_id]||(c.corp||'OTRO');
          if(!busq[corpName]) busq[corpName]={};
          if(!busq[corpName][dptoNombre]) busq[corpName][dptoNombre]={};
          var munNom=munObj.nombre||munKey;
          if(munKey==='_DPTO_') munNom=dptoNombre;
          if(!busq[corpName][dptoNombre][munNom]) busq[corpName][dptoNombre][munNom]=[];
          var org=c.org||'';
          if(busq[corpName][dptoNombre][munNom].indexOf(org)===-1) busq[corpName][dptoNombre][munNom].push(org);
        });
      });
    });
    BUSQUEDA=busq;
    if(!Object.keys(busq).length){
      document.getElementById('selCorp').innerHTML='<option value="">-- Sin datos para este proceso --</option>';
    } else {
      poblarCorps();
    }
  }
  if(_ccIndex){
    doIt(_ccIndex);
  } else {
    fetch('data/cuentas_claras_index.json?t='+Date.now()).then(function(r){return r.json();}).then(function(idx){
      _ccIndex=idx; _ccIndexLoaded=true;
      doIt(idx);
    }).catch(function(e){
      BUSQUEDA={};
      document.getElementById('selCorp').innerHTML='<option value="">-- Error cargando índice CC --</option>';
    });
  }
}

function poblarCorps(){
  var sel=document.getElementById('selCorp');
  sel.innerHTML='<option value="">-- Seleccione --</option>';
  Object.keys(BUSQUEDA).sort().forEach(function(c){
    var opt=document.createElement('option'); opt.value=c; opt.textContent=titleCase(c); sel.appendChild(opt);
  });
}

function _ocultarPaneles(){
  document.getElementById('panelResumen').style.display='none';
  var dv=document.getElementById('resDocVisor'); if(dv) dv.style.display='none';
  var cw=document.getElementById('resCertificadoWrap'); if(cw) cw.innerHTML='';
}

// Reset completo de módulos cuando cambian filtros del paso 1
function _resetModulos(){
  CAND_SELEC=null;
  CAND_DETALLE={};
  TX_CACHE={};
  TX_GLOBAL_9B=null;
  LIBROS_CC_CACHE={};
  LIBROS_CC_GLOBAL=[];
  // Resetear pasos completados en sidebar
  document.querySelectorAll('.paso').forEach(function(p){ p.classList.remove('completado'); });
  _PASO_ACTUAL=1;
  // Limpiar paneles de Paso 4 (Financiero + Estado) para que no queden datos viejos
  var _pe=document.getElementById('panelEstado'); if(_pe) _pe.innerHTML='';
  var _pf=document.getElementById('panelFinanciero'); if(_pf) _pf.innerHTML='';
  // Limpiar panel de Paso 11 (Liquidación)
  var _pl=document.getElementById('panelLiquidacion'); if(_pl) _pl.innerHTML='<div class="alert alert-secondary">Seleccione un candidato primero.</div>';
}

// ── _mkBtn: genera botón de soporte con link + vista inline para PDFs ──
var _sopId=0;
function _mkBtn(lbl,icon,path,cls,extra){
  var ep=_encodePath(path);
  var isPdf=path.toLowerCase().match(/\.pdf$/);
  var id='_sop_'+(_sopId++);
  var btn='<a href="'+ep+'" target="_blank" class="btn btn-sm '+(cls||'btn-outline-primary')+' _sop_link" '+(extra||'')+' data-sop-url="'+ep+'">'+
    '<i class="fa '+icon+' me-1"></i>'+lbl+'</a>';
  if(isPdf){
    btn+=' <button class="btn btn-sm btn-outline-dark _sop_toggle" onclick="var e=document.getElementById(\''+id+'\');if(e.style.display===\'none\'){e.src=\''+ep+'\';e.style.display=\'block\';this.innerHTML=\'<i class=\\\'fa fa-eye-slash me-1\\\'></i>Ocultar\';}else{e.style.display=\'none\';e.src=\'\';this.innerHTML=\'<i class=\\\'fa fa-eye me-1\\\'></i>Ver inline\';}" style="font-size:.65rem;padding:1px 4px">'+
      '<i class="fa fa-eye me-1"></i>Ver inline</button>'+
      '<embed id="'+id+'" src="" type="application/pdf" style="width:100%;height:400px;border:1px solid #dee2e6;border-radius:4px;display:none;margin-top:4px">';
  }
  return btn;
}
// Verifica disponibilidad de links de soportes (HEAD request)
function _verificarSoportes(){
  var links=document.querySelectorAll('a._sop_link[data-sop-url]');
  links.forEach(function(a){
    var url=a.getAttribute('data-sop-url');
    if(!url) return;
    fetch(url,{method:'HEAD'}).then(function(r){
      if(!r.ok){
        a.classList.remove('btn-outline-primary','btn-outline-success','btn-outline-info','btn-outline-warning','btn-outline-dark');
        a.classList.add('btn-outline-secondary','opacity-50');
        a.title='No disponible ('+r.status+')';
      }
    }).catch(function(){
      a.classList.add('opacity-50');
    });
  });
}
function filtrarDpto(){
  _resetModulos();
  var corp=document.getElementById('selCorp').value;
  var sel=document.getElementById('selDpto');
  sel.innerHTML='<option value="">-- Seleccione --</option>';
  var selMun=document.getElementById('selMun');
  selMun.innerHTML='<option value="">-- Seleccione --</option>';
  selMun.disabled=false;
  document.getElementById('selPartido').innerHTML='<option value="">-- Todos --</option>';
  document.getElementById('tbodyResultados').innerHTML='';
  document.getElementById('contResultados').textContent=0;
  _ocultarPaneles();
  CANDIDATOS={}; _MUN_CARGADA=null;
  if(!corp||!BUSQUEDA[corp]) return;
  // Corporaciones nacionales (Senado): auto-seleccionar NACIONAL y saltar a partidos
  if(_esNacional(corp)){
    sel.innerHTML='<option value="NACIONAL">— Nacional —</option>';
    sel.disabled=true;
    selMun.innerHTML='<option value="NACIONAL">— Nacional —</option>';
    selMun.disabled=true;
    filtrarPartido();
    return;
  }
  sel.disabled=false;
  Object.keys(BUSQUEDA[corp]).sort().forEach(function(d){
    var opt=document.createElement('option'); opt.value=d; opt.textContent=titleCase(d); sel.appendChild(opt);
  });
}

var _CORPS_DPTO=['ASAMBLEA','GOBERNACION','CAMARA DE REPRESENTANTES']; // cargos departamentales (sin municipio)
var _CORPS_NAC=['SENADO DE LA REPUBLICA']; // cargos nacionales (sin dpto ni municipio)
function _esDepartamental(corp){ return _CORPS_DPTO.indexOf(corp.toUpperCase())!==-1; }
function _esNacional(corp){ return _CORPS_NAC.indexOf(corp.toUpperCase())!==-1; }

function filtrarMun(){
  _resetModulos();
  var corp=document.getElementById('selCorp').value;
  var dpto=document.getElementById('selDpto').value;
  var sel=document.getElementById('selMun');
  sel.innerHTML='<option value="">-- Seleccione --</option>';
  document.getElementById('selPartido').innerHTML='<option value="">-- Todos --</option>';
  document.getElementById('tbodyResultados').innerHTML='';
  document.getElementById('contResultados').textContent=0;
  _ocultarPaneles();
  CANDIDATOS={}; _MUN_CARGADA=null;
  if(!corp||!dpto||!BUSQUEDA[corp]||!BUSQUEDA[corp][dpto]) return;

  // Cargos departamentales (ASAMBLEA, GOBERNACION): no requieren municipio
  if(_esDepartamental(corp)){
    sel.innerHTML='<option value="_DPTO_">— No aplica (Departamental) —</option>';
    sel.disabled=true;
    filtrarPartido();
    return;
  }

  sel.disabled=false;
  Object.keys(BUSQUEDA[corp][dpto]).sort().forEach(function(m){
    if(!m) return;
    var opt=document.createElement('option'); opt.value=m; opt.textContent=titleCase(m); sel.appendChild(opt);
  });
}

function filtrarPartido(){
  _resetModulos();
  var corp=document.getElementById('selCorp').value;
  var dpto=document.getElementById('selDpto').value;
  var munRaw=document.getElementById('selMun').value;
  var isDpto=_esDepartamental(corp);
  var isNac=_esNacional(corp);
  // Para departamentales, la clave en busqueda.json es el nombre del dpto (no "_DPTO_")
  // Para nacionales (Senado), la clave es NACIONAL
  var mun=isNac?'NACIONAL':isDpto?dpto:munRaw;
  var sel=document.getElementById('selPartido');
  sel.innerHTML='<option value="">-- Todos --</option>';
  if(!corp||(!dpto&&!isNac)||(!mun&&!isDpto&&!isNac)){ document.getElementById('contResultados').textContent=0; document.getElementById('tbodyResultados').innerHTML=''; return; }
  if(isNac) dpto='NACIONAL';
  var parts=(BUSQUEDA[corp]&&BUSQUEDA[corp][dpto]&&BUSQUEDA[corp][dpto][mun])||[];
  parts.sort().forEach(function(p){
    var opt=document.createElement('option'); opt.value=p; opt.textContent=titleCase(p); sel.appendChild(opt);
  });
  // Carga lazy: archivo slim por municipio (o departamento)
  var corp_safe=corp.replace(/[^\w]/g,'_');
  var mun_safe=mun.replace(/[^\w]/g,'_');
  var munKey=corp+'||'+mun;
  if(_MUN_CARGADA===munKey){ buscarCandidatos(); return; }
  var selP=document.getElementById('selPartido');
  selP.disabled=true;
  CANDIDATOS={}; _MUN_CARGADA=null;
  var tbody=document.getElementById('tbodyResultados');
  var loadLabel=isNac?'Nacional':isDpto?titleCase(dpto):titleCase(mun);
  tbody.innerHTML='<tr><td colspan="8" class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm me-2"></div>Cargando candidatos de <strong>'+esc(loadLabel)+'</strong>...</td></tr>';
  document.getElementById('contResultados').textContent='…';
  var _munDir=(_PROCESO_SELECCIONADO===7)?'candidatos_mun':'candidatos_mun_'+_PROCESO_SELECCIONADO;
  fetch('data/'+_munDir+'/'+corp_safe+'/'+mun_safe+'.json')
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status+' — '+mun_safe+'.json'); return r.json(); })
    .then(function(lista){
      CANDIDATOS={};
      lista.forEach(function(c){ CANDIDATOS[c.id]=c; });
      _aplicarVotosCert();
      _aplicarEstadoCand();
      _MUN_CARGADA=munKey;
      selP.disabled=false;
      buscarCandidatos();
    })
    .catch(function(e){
      selP.disabled=false;
      tbody.innerHTML='<tr><td colspan="8" class="text-center text-danger py-3"><i class="fa fa-exclamation-triangle me-2"></i>Error cargando: '+esc(e.message||mun)+'</td></tr>';
      document.getElementById('contResultados').textContent=0;
    });
}

function buscarCandidatos(){
  var partido=norm(document.getElementById('selPartido').value);
  var txt=norm(document.getElementById('txtBuscar').value);
  var resultados=[];
  // Recupera info del municipio seleccionado para mostrar en columnas
  var corpVal=document.getElementById('selCorp').value;
  var dptoVal=document.getElementById('selDpto').value;
  var munVal =document.getElementById('selMun').value;
  Object.values(CANDIDATOS).forEach(function(c){
    if(partido && norm(c.partido)!==partido) return;
    if(txt && !norm(c.nombre).includes(txt) && !(c.id||'').includes(txt)) return;
    resultados.push(c);
  });
  document.getElementById('contResultados').textContent=resultados.length;
  var tbody=document.getElementById('tbodyResultados');
  tbody.innerHTML='';
  if(!_MUN_CARGADA){
    return;
  }
  if(!resultados.length){
    tbody.innerHTML='<tr><td colspan="10" class="text-center text-muted py-2">Sin resultados para los filtros aplicados.</td></tr>';
    document.getElementById('panelResumen').style.display='none';
    return;
  }

  // ── Panel resumen ────────────────────────────────────────────────────────
  var sumIng=0, sumGas=0, sumVotos=0, pob0=0;
  resultados.forEach(function(c){
    sumIng   += (c.total_ingresos_rep||0);
    sumGas   += (c.total_gastos_rep||0);
    sumVotos += (c.votos||0);
    if(!pob0 && c.poblacion) pob0=c.poblacion;
  });
  var cargo0 = document.getElementById('selCorp').value;
  var topeGen = buscarTopeTotal(cargo0, pob0);
  document.getElementById('resIngTotal').textContent = fmtCOP(sumIng);
  document.getElementById('resGasTotal').textContent = fmtCOP(sumGas);
  document.getElementById('resVotos').textContent    = fmtNum(sumVotos);
  document.getElementById('resCenso').textContent       = pob0 ? fmtNum(pob0) : '—';
  document.getElementById('resTopeGeneral').textContent = topeGen ? fmtCOP(topeGen) : '—';
  // Vista Global: candidatos, tope por candidato
  // Usar conteo de Cuentas Claras (CC) si disponible, filtrando por corp y partido
  var nCandRes=resultados.length;
  if(_ccCandsMun&&_ccCandsMun.length){
    var corpMapVG={'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2};
    var corpIdVG=corpMapVG[(cargo0||'').toUpperCase()]||null;
    var ccFiltrado=_ccCandsMun.filter(function(cc){
      if(corpIdVG&&cc.corp_id!==corpIdVG) return false;
      if(partido&&norm(cc.org||'').indexOf(partido)<0) return false;
      return true;
    });
    if(ccFiltrado.length) nCandRes=ccFiltrado.length;
  }
  // Tope x Candidato = Tope General / candidatos (CC si disponible)
  var topeCandRes=topeGen&&nCandRes? Math.round(topeGen/nCandRes*100)/100 : 0;
  document.getElementById('resCandCount').textContent = fmtNum(nCandRes);
  document.getElementById('resTopeGeneral2').textContent = topeGen ? fmtCOP(topeGen) : '—';
  document.getElementById('resTopeCand').textContent = topeCandRes ? fmtCOP(topeCandRes) : '—';
  var _vl=titleCase(munVal||'')+', '+titleCase(dptoVal||'')+' · '+titleCase(cargo0||'');
  if(partido) _vl+=' · '+titleCase(document.getElementById('selPartido').value||'');
  document.getElementById('resVistaLabel').textContent = _vl;
  // resVotosPartido se restaura de localStorage más abajo
  document.getElementById('resTotalVotos').textContent = fmtNum(sumVotos);
  // Valor del voto y comparativo
  var _c0v1=norm(cargo0);
  var cargoVV=_c0v1.indexOf('ALCALD')!==-1?'ALCALDIA':
              _c0v1.indexOf('CONCEJ')!==-1?'CONCEJO':
              _c0v1.indexOf('ASAMBLEA')!==-1||_c0v1.indexOf('DIPUTA')!==-1?'ASAMBLEA':
              _c0v1.indexOf('JAL')!==-1||_c0v1.indexOf('JUNTA')!==-1?'JUNTA ADMINISTRADORAS LOCALES':'GOBERNACION';
  var vv=VALOR_DEL_VOTO[cargoVV]||0;
  document.getElementById('resValorVoto').textContent = vv ? fmtCOP(vv) : '—';
  var compWrap=document.getElementById('resComparativoWrap');
  if(vv && sumVotos>0 && sumGas>0){
    var vxv=vv*sumVotos;
    document.getElementById('resCompGastos').textContent=fmtCOP(sumGas);
    document.getElementById('resCompVxV').textContent=fmtCOP(vxv);
    var resEl=document.getElementById('resCompResultado');
    if(sumGas<=vxv){
      resEl.innerHTML='<span class="text-success"><i class="fa fa-check-circle me-1"></i>Pagado por gastos</span>';
    } else {
      resEl.innerHTML='<span class="text-success"><i class="fa fa-check-circle me-1"></i>Pagado por votos</span>';
    }
    compWrap.style.display='block';
  } else {
    compWrap.style.display='none';
  }
  document.getElementById('panelResumen').style.display='block';
  // Verificar derecho a reposición de gastos
  var dNormR=norm(dptoVal), mNormR=norm(munVal);
  var _c0n=norm(cargo0);
  var cargoNormR=_c0n.indexOf('ALCALD')!==-1?'ALCALDIA':
                 _c0n.indexOf('CONCEJ')!==-1?'CONCEJO':
                 _c0n.indexOf('ASAMBLEA')!==-1||_c0n.indexOf('DIPUTA')!==-1?'ASAMBLEA':
                 _c0n.indexOf('JAL')!==-1||_c0n.indexOf('JUNTA')!==-1?'JUNTA ADMINISTRADORAS LOCALES':'GOBERNACION';
  _renderDerechoReposicion(dNormR, mNormR, cargoNormR, partido);
  // Auto-rellenar umbral/votos válidos desde certificados extraídos
  _autoFillUmbral(cargoNormR, dptoVal, munVal);
  // Certificado Electoral — estilo 9B: badge cargo + botón PDF
  var certPathR=_findCertPath(dptoVal, munVal, cargoNormR);
  var wrapR=document.getElementById('resCertificadoWrap');
  if(wrapR){
    var hCert='<div class="d-flex align-items-center gap-1 mb-1">';
    hCert+='<span class="badge bg-success">'+esc(cargoNormR)+'</span>';
    if(certPathR){
      hCert+='<a href="data/'+esc(certPathR)+'" target="_blank" class="btn btn-sm btn-outline-danger" title="Certificado Electoral PDF"><i class="fa fa-file-pdf me-1"></i>PDF</a>';
    } else {
      hCert+='<span class="text-muted small"><i class="fa fa-times-circle me-1 text-danger"></i>Sin certificado</span>';
    }
    hCert+='</div>';
    wrapR.innerHTML=hCert;
  }

  // Votos Partido: auto-fill = votos_partido_total - suma_votos_candidatos
  var vpCorpCode=_VP_CORP_MAP[cargoNormR]||cargoNormR;
  var vpInput=document.getElementById('resVotosPartido');
  if(vpInput){
    var vpTotal=_buscarVotosPartido(dNormR, mNormR, cargoNormR, partido);
    // Restar votos individuales de candidatos para obtener votos de lista/partido
    var sumVotosCand=0;
    resultados.forEach(function(cx){ sumVotosCand+=parseInt(cx.votos)||0; });
    var vpAuto=Math.max(vpTotal-sumVotosCand, 0);
    vpInput.value=vpAuto>0?vpAuto:'';
    vpInput.title=vpAuto>0?'Auto: '+fmtNum(vpAuto)+' votos lista (Total '+fmtNum(vpTotal)+' - Cand. '+fmtNum(sumVotosCand)+')':'Ingrese votos del partido manualmente';
    // Guardar referencia al contexto actual para oninput
    vpInput.dataset.vpdpto=dNormR; vpInput.dataset.vpmun=mNormR;
    vpInput.dataset.vpcorp=vpCorpCode; vpInput.dataset.vppartido=partido||'';
    vpInput.oninput=function(){
      var v=parseInt(this.value)||0;
      if(this.dataset.vppartido) _guardarVotoManual(this.dataset.vpdpto,this.dataset.vpmun,this.dataset.vpcorp,this.dataset.vppartido,v);
      actualizarTotalVotos();
    };
    actualizarTotalVotos();
  }

  // Documentos del visor: links a carpetas filtradas por partido + por candidato
  var docVisor=document.getElementById('resDocVisor');
  if(docVisor&&resultados.length>0){
    var dN0=_normFNFP(dptoVal);
    var mN0=_normFNFP(munVal);
    var pSel=document.getElementById('selPartido');
    var pN0=pSel&&pSel.value?_normFNFP(pSel.value):'';
    var baseFnfp='data/fnfp/';
    var pPath=pN0?'/'+pN0+'/':'/';
    _sopId=0; // reset global counter
    // Candidatos filtrados por partido seleccionado
    var _selPartidoNorm=pSel&&pSel.value?norm(pSel.value):'';
    var candsFiltrados=resultados;
    if(_selPartidoNorm) candsFiltrados=resultados.filter(function(cx){return norm(cx.partido)===_selPartidoNorm;});
    else if(pN0) candsFiltrados=resultados.filter(function(cx){return _normFNFP(cx.partido)===pN0;});

    // ── Por candidato: Cuentas Claras en línea (8B, Ingresos, Gastos, Informe) ──
    var elPorCand=document.getElementById('resDocPorCandidato');
    if(elPorCand){
      elPorCand.style.display='block';
      _cargarSoportesCCEnLinea(elPorCand, candsFiltrados, dptoVal, munVal);
    }

    // ── Gestión municipal CC (Dictamen, 9B, Acuerdos, Contador, Gerente, Auditor) ──
    _cargarGestionMunEnPaso1();

    // ── PDFs inline: Acuerdo + E6/E7/E8 ──
    var elPDFs=document.getElementById('resDocVisorPDFs');
    if(elPDFs){
      elPDFs.innerHTML='<span class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Cargando documentos del visor...</span>';
      (function(el,dv,mv,cv,cf){
        var _pLoads=0, _pTotal=3;
        function _onPdfLoad(){
          _pLoads++; if(_pLoads<_pTotal) return;
          _loadCoalAcuerdosIndex(function(){ _renderVisorPDFsInline(el,dv,mv,cv,cf); });
        }
        _cargarVisorIndex(_onPdfLoad);
        _cargarVisorMapeo(_onPdfLoad);
        _cargarVisorDocSlim(_onPdfLoad);
      })(elPDFs, dptoVal, munVal, corpVal, candsFiltrados);
    }

    // ── Archivos del Visor E6, E7, E8 + Visor 2023 (filtrados por candidatos) ──
    var elE=document.getElementById('resDocVisorE');
    if(elE){
      var _vLoads=0, _vTotal=3;
      function _onVisorLoad(){
        _vLoads++;
        if(_vLoads<_vTotal) return;
        _renderVisorCombined(elE, dptoVal, munVal, corpVal, resultados);
      }
      _cargarVisorIndex(_onVisorLoad);
      _cargarVisorMapeo(_onVisorLoad);
      _cargarVisorDocSlim(_onVisorLoad);
    }

    docVisor.style.display='block';
    // Verificar disponibilidad de links (async, marca los que no existen)
    setTimeout(_verificarSoportes, 200);
  }
  // Pre-calcular tope por partido para la tabla (CC si disponible)
  var _partidoCounts={};
  if(_ccCandsMun&&_ccCandsMun.length){
    var _corpMapT={'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2};
    var _corpIdT=_corpMapT[(cargo0||'').toUpperCase()]||null;
    _ccCandsMun.forEach(function(cc){
      if(_corpIdT&&cc.corp_id!==_corpIdT) return;
      var pn=(cc.org||'').toLowerCase().trim();
      _partidoCounts[pn]=(_partidoCounts[pn]||0)+1;
    });
  }
  if(!Object.keys(_partidoCounts).length){
    resultados.forEach(function(c){
      var pk=(c.partido||'').toLowerCase().trim();
      _partidoCounts[pk]=(_partidoCounts[pk]||0)+1;
    });
  }

  // Slim index usa campos planos (no c.observaciones)
  resultados.sort(function(a,b){return a.nombre.localeCompare(b.nombre);});
  resultados.forEach(function(c){
    var chips=[];
    if(c.renuncio)    chips.push('<span class="estado-chip chip-renuncia">Renunció</span>');
    if(c.no_presento) chips.push('<span class="estado-chip chip-no-presento">No Presentó</span>');
    if(c.extemporaneo)chips.push('<span class="estado-chip chip-extempor">Extemporáneo</span>');
    if(c.revocado)    chips.push('<span class="estado-chip chip-revocado">Revocado</span>');
    var alertas=c.alertas||0, advs=c.advertencias||0;
    var badgeA=alertas?'<span class="badge bg-danger">'+alertas+'</span>':'';
    var badgeD=advs?'<span class="badge bg-warning text-dark ms-1">'+advs+'</span>':'';

    // Financiero por candidato
    var cIng=c.total_ingresos_rep||0;
    var cGas=c.total_gastos_rep||0;
    var nP=_contarCandPartidoCC(c.cargo||corpVal, c.partido);
    var cTopeGen=buscarTopeTotal(c.cargo||corpVal, c.poblacion||pob0);
    var cTopeInd=cTopeGen?Math.round(cTopeGen/nP*100)/100:0;
    var cSupera=cTopeInd>0&&cGas>cTopeInd;

    var tr=document.createElement('tr');
    if(cSupera) tr.className='table-danger';
    tr.style.cursor='pointer';
    tr.onclick=(function(id){return function(){seleccionarCandidato(id);};})(c.id);
    tr.innerHTML='<td><strong>'+esc(c.nombre)+'</strong></td>'+
      '<td class="small">'+esc(c.id)+' '+_aniBadge(c.id)+'</td>'+
      '<td class="small">'+esc(titleCase(c.partido))+'</td>'+
      '<td>'+badgeElegido(c.elegido)+'</td>'+
      '<td>'+(chips.join(' ')||'<span class="text-muted small">—</span>')+'</td>'+
      '<td class="text-end small">'+fmtCOP(cIng)+'</td>'+
      '<td class="text-end small fw-semibold '+(cSupera?'text-danger':'')+'">'+fmtCOP(cGas)+'</td>'+
      '<td class="text-end small">'+fmtCOP(cTopeInd)+'</td>'+
      '<td>'+(cSupera?'<span class="badge bg-danger">EXCEDE</span>':'<span class="badge bg-success">OK</span>')+'</td>'+
      '<td>'+badgeA+badgeD+'</td>';
    tbody.appendChild(tr);
  });
}

function actualizarTotalVotos(){
  var vCand = parseInt(document.getElementById('resVotos').textContent.replace(/\./g,'').replace(/,/g,''))||0;
  var vPart = parseInt(document.getElementById('resVotosPartido').value)||0;
  var totalV = vCand + vPart;
  document.getElementById('resTotalVotos').textContent = fmtNum(totalV);
  // (sync removed — Vista Global bar only shows Candidatos, Partidos, Tope x Cand)
  // Recalcular comparativo
  var cargo0=document.getElementById('selCorp').value;
  var _c0v2=norm(cargo0);
  var cargoVV=_c0v2.indexOf('ALCALD')!==-1?'ALCALDIA':
              _c0v2.indexOf('CONCEJ')!==-1?'CONCEJO':
              _c0v2.indexOf('ASAMBLEA')!==-1||_c0v2.indexOf('DIPUTA')!==-1?'ASAMBLEA':
              _c0v2.indexOf('JAL')!==-1||_c0v2.indexOf('JUNTA')!==-1?'JUNTA ADMINISTRADORAS LOCALES':'GOBERNACION';
  var vv=VALOR_DEL_VOTO[cargoVV]||0;
  var compWrap=document.getElementById('resComparativoWrap');
  var gasText=document.getElementById('resGasTotal').textContent.replace(/[^0-9]/g,'')||'0';
  var sumGas=parseInt(gasText)||0;
  if(vv && totalV>0 && sumGas>0){
    var vxv=vv*totalV;
    document.getElementById('resCompGastos').textContent=fmtCOP(sumGas);
    document.getElementById('resCompVxV').textContent=fmtCOP(vxv);
    var resEl=document.getElementById('resCompResultado');
    if(sumGas<=vxv){
      resEl.innerHTML='<span class="text-success"><i class="fa fa-check-circle me-1"></i>Pagado por gastos</span>';
    } else {
      resEl.innerHTML='<span class="text-success"><i class="fa fa-check-circle me-1"></i>Pagado por votos</span>';
    }
    compWrap.style.display='block';
  } else {
    compWrap.style.display='none';
  }
  // Actualizar derecho a reposición
  var dptoV=document.getElementById('selDpto').value;
  var munV=document.getElementById('selMun').value;
  var partidoV=norm(document.getElementById('selPartido').value);
  if(dptoV&&munV&&cargoVV) _renderDerechoReposicion(norm(dptoV), norm(munV), cargoVV, partidoV);
  // Auto re-render paso actual si filtro cambió
  if(_PASO_ACTUAL===3 && CAND_SELEC) render9BAnexos();
  if(_PASO_ACTUAL===4 && CAND_SELEC){ renderGlobalP3(); renderPaso3(); renderPaso2(); }
  if(_PASO_ACTUAL===7 && CAND_SELEC) renderPaso7();
}

function guardarObsPanel(){ /* removed */ }

function limpiarFiltros(){
  document.getElementById('selCorp').innerHTML='<option value="">-- Seleccione --</option>';
  document.getElementById('selDpto').innerHTML='<option value="">-- Seleccione --</option>';
  document.getElementById('selMun').innerHTML='<option value="">-- Seleccione --</option>';
  document.getElementById('selPartido').innerHTML='<option value="">-- Todos --</option>';
  document.getElementById('txtBuscar').value='';
  poblarCorps();
  CANDIDATOS={}; _MUN_CARGADA=null;
  document.getElementById('contResultados').textContent=0;
  document.getElementById('tbodyResultados').innerHTML='';
  _ocultarPaneles();
}

// ─── SELECCIÓN DE CANDIDATO ───────────────────────────────────────────────
function seleccionarCandidato(cid){
  // Si ya está en cache, usar directo
  if(CAND_DETALLE[cid]){
    _renderCandidato(CAND_DETALLE[cid]);
    return;
  }
  // Mostrar spinner
  if(_PASO_ACTUAL===2||_PASO_ACTUAL<2){
    var pe=document.getElementById('panelDictamen');
    if(pe) pe.innerHTML='<div class="text-center py-5"><div class="spinner-border text-primary me-2"></div>Cargando datos del candidato...</div>';
  }
  // Para procesos distintos a Territoriales 2023: construir candidato desde datos en memoria
  if(_PROCESO_SELECCIONADO!==7){
    var cBasic=CANDIDATOS[cid];
    if(cBasic){
      var candObj={
        id:cBasic.id, nombre:cBasic.nombre, partido:cBasic.partido,
        cargo:cBasic.cargo, departamento:cBasic.departamento, municipio:cBasic.municipio,
        elegido:cBasic.elegido||'-', votos:cBasic.votos||0,
        tope_legal:cBasic.tope_legal||0, poblacion:cBasic.poblacion||0,
        total_ingresos_rep:cBasic.total_ingresos_rep||0, total_gastos_rep:cBasic.total_gastos_rep||0,
        renuncio:cBasic.renuncio||false, no_presento:cBasic.no_presento||false,
        extemporaneo:cBasic.extemporaneo||false, revocado:cBasic.revocado||false,
        alertas:cBasic.alertas||0, advertencias:cBasic.advertencias||0,
        requiere_investigacion:cBasic.requiere_investigacion||false,
        proceso_id:cBasic.proceso_id||_PROCESO_SELECCIONADO,
        observaciones:{}, informes:[], dictamen:null
      };
      CAND_DETALLE[cid]=candObj;
      _renderCandidato(candObj);
    }
    return;
  }
  fetch('data/candidatos/'+cid+'.json')
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(data){
      CAND_DETALLE[cid]=data;
      _renderCandidato(data);
    })
    .catch(function(e){
      var pe2=document.getElementById('panelDictamen');
      if(pe2) pe2.innerHTML='<div class="alert alert-danger">Error cargando candidato '+cid+': '+e.message+'</div>';
    });
}

function _renderCandidato(cand){
  CAND_SELEC=cand;
  // Cargar coalición + partidos antes de renderizar
  _cargarCoalicionMeta(function(){ _cargarPartidosDB(function(){ _renderCandidatoInner(); }); });
}
function _renderCandidatoInner(){
  var cand=CAND_SELEC;
  var errMsg='';
  [['Paso2',renderPaso2],['Paso3',renderPaso3],['Dictamen',renderDictamen],['9BAnexos',render9BAnexos],
   ['Paso5',renderPaso5],['Paso6',renderPaso6],['Paso7',renderPaso7],['AccionesCand',_renderAccionesCand]].forEach(function(fn){
    try{ fn[1](); }
    catch(e){ errMsg+=fn[0]+': '+e.message+' | '; console.error(fn[0],e); }
  });
  if(errMsg){
    var s2=document.getElementById('sec2');
    var warn='<div class="alert alert-warning m-2 small py-2"><strong>Error de visualización:</strong> '+
      errMsg+'<br>Revise la consola (F12) para más detalles.</div>';
    s2.innerHTML=warn+(s2.innerHTML||'');
  }
  [1,2,3,4,5].forEach(function(i){
    var el=document.getElementById('step'+i);
    if(el){el.classList.remove('activo');el.classList.add('completado');}
  });
  irPaso(_PASO_ACTUAL>=2?_PASO_ACTUAL:2);
}

function _renderFiltroBar(targetId){
  var el=document.getElementById(targetId);
  if(!el) return;
  var corp=document.getElementById('selCorp').value;
  var dpto=document.getElementById('selDpto').value;
  var mun=document.getElementById('selMun').value;
  var part=document.getElementById('selPartido').value;
  if(!corp&&!dpto){el.innerHTML='';return;}
  var items=[];
  if(corp) items.push('<span class="fw-semibold small text-muted me-1">Corporación</span><span class="badge bg-dark me-3">'+esc(titleCase(corp))+'</span>');
  if(dpto) items.push('<span class="fw-semibold small text-muted me-1">Departamento</span><span class="badge bg-dark me-3">'+esc(titleCase(dpto))+'</span>');
  if(mun)  items.push('<span class="fw-semibold small text-muted me-1">Municipio</span><span class="badge bg-dark me-3">'+esc(titleCase(mun))+'</span>');
  if(part) items.push('<span class="fw-semibold small text-muted me-1">Partido</span><span class="badge bg-success me-3">'+esc(titleCase(part))+'</span>');
  el.innerHTML='<div class="d-flex align-items-center flex-wrap py-1 px-2 bg-light border rounded small">'+
    '<i class="fa fa-filter text-muted me-2"></i>'+items.join('')+
    '<a href="javascript:irPaso(1)" class="ms-auto small text-decoration-none"><i class="fa fa-edit me-1"></i>Cambiar filtro</a></div>';
}
function _selCandIrPaso(cid,paso){
  if(CAND_DETALLE[cid]){
    _renderCandidato(CAND_DETALLE[cid]);
    _PASO_ACTUAL=paso;
    irPaso(paso);
    return;
  }
  fetch('data/candidatos/'+cid+'.json')
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(data){
      CAND_DETALLE[cid]=data;
      _renderCandidato(data);
      _PASO_ACTUAL=paso;
      irPaso(paso);
    }).catch(function(e){console.error('Error cargando candidato',cid,e);});
}
// ─── VISTA GLOBAL PASO 3: todos los candidatos del municipio ────────
function renderGlobalP3(){
  var c=CAND_SELEC;
  // Leer filtros de Paso 1
  var filtroCorp=document.getElementById('selCorp').value;
  var filtroDpto=document.getElementById('selDpto').value;
  var filtroMun=document.getElementById('selMun').value;
  var filtroPartido=norm(document.getElementById('selPartido').value);
  var todosMun=Object.values(CANDIDATOS);
  if(filtroPartido) todosMun=todosMun.filter(function(x){return norm(x.partido)===filtroPartido;});
  var nCand=todosMun.length;
  // Usar conteo CC si disponible (más preciso que local)
  if(_ccCandsMun&&_ccCandsMun.length){
    var corpMapG3={'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2};
    var corpIdG3=corpMapG3[(filtroCorp||'').toUpperCase()]||null;
    var ccFiltG3=_ccCandsMun.filter(function(cc){
      if(corpIdG3&&cc.corp_id!==corpIdG3) return false;
      if(filtroPartido&&norm(cc.org||'').indexOf(filtroPartido)<0) return false;
      return true;
    });
    if(ccFiltG3.length) nCand=ccFiltG3.length;
  }
  var sumIng=0, sumGas=0, sumVotos=0;
  todosMun.forEach(function(cd){
    sumIng+=parseFloat(cd.total_ingresos_rep)||0;
    sumGas+=parseFloat(cd.total_gastos_rep)||parseFloat(cd.total_gastos_cand)||0;
    sumVotos+=(cd.votos||0);
  });
  // Contar partidos únicos para tope individual
  var partidosUnicos={};
  todosMun.forEach(function(cd){ partidosUnicos[(cd.partido||'').toLowerCase().trim()]=true; });
  var nPartidos=Object.keys(partidosUnicos).length;
  var topeGen=buscarTopeTotal(filtroCorp||c.cargo, c.poblacion||0);

  // Título: Corporación · Municipio, Departamento (o solo Departamento si es departamental)
  var tituloUbic=filtroMun?titleCase(filtroMun)+', '+titleCase(filtroDpto):titleCase(filtroDpto);
  var tituloCargo=titleCase(filtroCorp||c.cargo);
  var html='<div class="card border-primary mb-3"><div class="card-header bg-primary text-white fw-semibold py-2">'+
    '<i class="fa fa-globe me-2"></i>Vista Global — '+esc(tituloUbic)+
    ' · '+esc(tituloCargo)+'</div>'+
    '<div class="card-body py-2">'+
    '<div class="row g-2 text-center">';

  // Leer votos partido de Paso 1
  var vpEl=document.getElementById('resVotosPartido');
  var votosPartido=vpEl?parseInt(vpEl.value)||0:0;
  var totalVotos=sumVotos+votosPartido;

  var censo=c.poblacion||0;
  html+='<div class="col"><div class="fw-bold fs-5">'+fmtNum(censo)+'</div><div class="small text-muted">Censo (hab.)</div></div>';
  html+='<div class="col"><div class="fw-bold fs-5">'+nCand+'</div><div class="small text-muted">Candidatos</div></div>';
  html+='<div class="col"><div class="fw-bold fs-5">'+nPartidos+'</div><div class="small text-muted">Partidos</div></div>';
  html+='<div class="col"><div class="fw-bold fs-5 text-success">'+fmtCOP(sumIng)+'</div><div class="small text-muted">Total Ingresos</div></div>';
  html+='<div class="col"><div class="fw-bold fs-5 text-primary">'+fmtCOP(sumGas)+'</div><div class="small text-muted">Total Gastos</div></div>';
  html+='<div class="col"><div class="fw-bold fs-5">'+fmtNum(sumVotos)+'</div><div class="small text-muted">Votos Candidatos</div></div>';
  html+='<div class="col"><div class="fw-bold fs-5">'+fmtNum(votosPartido)+'</div><div class="small text-muted">Votos Partido</div></div>';
  html+='<div class="col"><div class="fw-bold fs-5 text-dark">'+fmtNum(totalVotos)+'</div><div class="small text-muted">Total Votos</div></div>';
  html+='<div class="col"><div class="fw-bold fs-5 text-info">'+fmtCOP(topeGen||0)+'</div><div class="small text-muted">Tope General</div></div>';
  html+='</div>';
  html+='</div></div>';


  document.getElementById('panelGlobalP3').innerHTML=html;
}

// ─── TARJETA CANDIDATO (compartida en sec2) ────────────────────────────────
function renderCandidatoHeader(){
  var c=CAND_SELEC, obs=c.observaciones||{};
  var mai=(obs.formato_9b||{}).mai_sai_acreditado||'';
  var html='<div class="card"><div class="card-header fw-semibold py-2">Candidato seleccionado</div>'+
    '<div class="card-body"><div class="row">'+
    '<div class="col-md-7">'+
    '<div class="fw-bold fs-5">'+esc(c.nombre)+'</div>'+
    '<div class="text-muted">CC: '+esc(c.id)+'</div>'+
    '<div>'+esc(c.cargo)+' — '+esc(c.municipio)+', '+esc(c.departamento)+'</div>'+
    '<div class="small text-muted">'+esc(c.partido)+'</div></div>'+
    '<div class="col-md-2">'+badgeElegido(c.elegido)+'</div>'+
    '<div class="col-md-3">'+
    (function(){
      var saiData=SAI_INDEX[norm(c.partido)]||null;
      var badge=(mai?'<span class="badge bg-success">'+esc(mai)+'</span>':'<span class="badge bg-danger">Sin MAI/SAI</span>');
      if(saiData&&saiData.url) badge+='<br><a href="data/'+esc(saiData.url)+'" target="_blank" class="small text-decoration-none"><i class="fa fa-file-pdf me-1 text-danger"></i>Ver PDF '+esc(saiData.tipo)+'</a>';
      // Certificado Electoral
      var dNorm=norm(c.departamento), mNorm=norm(c.municipio);
      var cargoNorm=norm(c.cargo).indexOf('ALCALD')!==-1?'ALCALDIA':
                    norm(c.cargo).indexOf('CONCEJO')!==-1?'CONCEJO':
                    norm(c.cargo).indexOf('ASAMBLEA')!==-1?'ASAMBLEA':'GOBERNACION';
      var certPath=_findCertPath(c.departamento, c.municipio, cargoNorm);
      if(certPath) badge+='<br><a href="data/'+esc(certPath)+'" target="_blank" class="small text-decoration-none text-success"><i class="fa fa-certificate me-1"></i>Certificado Electoral</a>';
      return badge;
    })()+
    '</div></div>'+
    '<div class="mt-2 text-end"><button class="btn btn-sm btn-outline-dark" onclick="descargarZipTodos()">'+
    '<i class="fa fa-file-archive me-1"></i>Descargar ZIP con todos los candidatos</button></div>'+
    '</div></div>';
  document.getElementById('panelCandidato').innerHTML=html;
}

// ── ZIP de TODOS los candidatos del municipio ─────────────────────────────
function _archivosParaCandidato(c, opts){
  var soportesOnly=(opts&&opts.soportesOnly)||false;
  var d=_normFNFP(c.departamento), m=_normFNFP(c.municipio);
  var cargoN=norm(c.cargo).indexOf('ALCALD')!==-1?'ALCALDIA':
             norm(c.cargo).indexOf('CONCEJO')!==-1?'CONCEJO':
             norm(c.cargo).indexOf('ASAMBLEA')!==-1?'ASAMBLEA':'GOBERNACION';
  var prefix=c.id+'_'+_normFNFP(c.nombre).substring(0,25);
  var archivos=[];

  // 1. Dictamen
  var pdfs=_findDictPdfs(c);
  pdfs.forEach(function(pp){ archivos.push({url:pp, folder:prefix+'/01_dictamen'}); });

  // 2. SAI — solo modo completo (no aparece en panel SOPORTES)
  if(!soportesOnly){
    var saiData=SAI_INDEX[norm(c.partido)]||null;
    if(saiData&&saiData.url) archivos.push({url:'data/'+saiData.url, folder:prefix+'/02_sai'});
  }

  // 3. Certificado Electoral
  var certPath=_findCertPath(c.departamento, c.municipio, cargoN);
  if(certPath) archivos.push({url:'data/'+certPath, folder:prefix+'/03_certificado'});

  // 4. Reporte 9B (partido) — buscar carpeta real en R9B_INDEX
  (function(){
    var pk=_normFNFP(c.partido);
    var _r9bD=d, _r9bM=m, _r9bPF=pk;
    if(R9B_INDEX){
      var _r9bE=R9B_INDEX[d+'/'+m+'/'+pk];
      if(!_r9bE){ for(var _k in R9B_INDEX){ if(_k.indexOf(d+'/'+m+'/')===0&&_k.substring(_k.lastIndexOf('/')+1)===pk){_r9bE=R9B_INDEX[_k];break;} } }
      if(_r9bE){ _r9bD=_r9bE.d; _r9bM=_r9bE.mu; _r9bPF=_r9bE.pf; }
    }
    var r9bBase='data/fnfp/reporte_9b/'+_r9bD+'/'+_r9bM+'/'+encodeURIComponent(_r9bPF)+'/';
    // Modo soportes: solo CONSOLIDADO_44 (igual que panel SOPORTES)
    // Modo completo: todos los consolidados
    var _9bFiles=soportesOnly
      ? ['CONSOLIDADO_44']
      : ['CONSOLIDADO_43','CONSOLIDADO_44','CONSOLIDADO_45','CONSOLIDADO_46',
         'CONSOLIDADO_47','CONSOLIDADO_48','CONSOLIDADO_100',
         'libro_contable_partido.pdf','libro_contable_partido.xlsx'];
    _9bFiles.forEach(function(f){
      archivos.push({url:r9bBase+f+(f.indexOf('.')===-1?'.pdf':''), folder:prefix+'/04_9b', optional:true});
    });
  })();

  // 5. Reporte 8B + Libro Contable + Anexos — buscar carpeta real en R8B_INDEX
  (function(){
    if(!R8B_INDEX) return;
    function _kn(s){return s.replace(/_+/g,'_').replace(/_$/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
    var pk=_normFNFP(c.partido);
    var r8bObj=null;
    var exact=d+'/'+m+'/'+pk;
    if(R8B_INDEX[exact]) r8bObj=R8B_INDEX[exact];
    else { var kN=_kn(pk); for(var k in R8B_INDEX){ if(k.indexOf(d+'/'+m+'/')!==0) continue; var kP=k.substring(k.lastIndexOf('/')+1); if(_kn(kP)===kN||_kn(kP).indexOf(kN)!==-1||kN.indexOf(_kn(kP))!==-1){r8bObj=R8B_INDEX[k]; break;} } }
    if(!r8bObj) return;
    var entries=r8bObj.e||[];
    var cxN=_kn(_normFNFP(c.nombre));
    var match=null;
    for(var i=0;i<entries.length;i++){ if(_kn(entries[i].n)===cxN){match=entries[i];break;} }
    if(!match){ for(var j=0;j<entries.length;j++){ if(_kn(entries[j].n).indexOf(cxN)!==-1||cxN.indexOf(_kn(entries[j].n))!==-1){match=entries[j];break;} } }
    if(!match) return;
    var _rd8=r8bObj.d?r8bObj.d:d, _rm8=r8bObj.mu?r8bObj.mu:m;
    var base8b='r8b/'+encodeURIComponent(_rd8)+'/'+encodeURIComponent(_rm8)+'/'+encodeURIComponent(r8bObj.p)+'/'+encodeURIComponent(match.f)+'/';
    // 8B
    archivos.push({url:base8b+'CONSOLIDADO_100_INFORME_INDIVIDUAL_DE_INGRESOS_Y_GASTOS_DE_LA_CAMP.pdf', folder:prefix+'/05_8b', optional:true});
    // Libro Contable
    archivos.push({url:base8b+'libro_contable.pdf',  folder:prefix+'/06_libro', optional:true});
    archivos.push({url:base8b+'libro_contable.xlsx', folder:prefix+'/06_libro', optional:true});
    // Anexos ingresos / gastos
    (match.ai||[]).forEach(function(f){ archivos.push({url:base8b+'anexos_ingresos/'+encodeURIComponent(f), folder:prefix+'/07_anexos_ing', optional:true}); });
    (match.ag||[]).forEach(function(f){ archivos.push({url:base8b+'anexos_gastos/' +encodeURIComponent(f), folder:prefix+'/08_anexos_gas', optional:true}); });
  })();

  // 6. Soportes de Ingresos y Gastos — IG_DOCS_INDEX
  (function(){
    if(!IG_DOCS_INDEX) return;
    function _kig(s){return s.replace(/_+/g,'_').replace(/_$/,'');}
    var pk=_normFNFP(c.partido);
    var exact=d+'/'+m+'/'+pk;
    var obj=IG_DOCS_INDEX[exact];
    if(!obj){ var kN=_kig(pk); for(var k in IG_DOCS_INDEX){ if(k.indexOf(d+'/'+m+'/')!==0) continue; if(_kig(k.substring(k.lastIndexOf('/')+1))===kN){obj=IG_DOCS_INDEX[k];break;} } }
    if(!obj) return;
    var entry=null;
    var cid=String(c.id||'');
    for(var i=0;i<obj.e.length;i++){
      if(obj.e[i].id===cid||obj.e[i].id===c.id) {entry=obj.e[i];break;}
    }
    if(!entry){
      // fallback: prefijo numérico del campo f
      for(var j=0;j<obj.e.length;j++){
        var fp=(obj.e[j].f||'').replace(/_.*$/,'');
        if(fp&&fp===cid){entry=obj.e[j];break;}
      }
    }
    if(!entry) return;
    var igF=entry.f||cid;
    var _igD=obj.d||d, _igM=obj.mu||m, _igPf=obj.pf||obj.p;
    var baseIng='ig/'+_igD+'/'+_igM+'/'+encodeURIComponent(_igPf)+'/'+igF+'/ingresos/';
    var baseGas='ig/'+_igD+'/'+_igM+'/'+encodeURIComponent(_igPf)+'/'+igF+'/gastos/';
    (entry.ig||[]).forEach(function(f){ archivos.push({url:baseIng+encodeURIComponent(f), folder:prefix+'/09_sop_ingresos', optional:true}); });
    (entry.gg||[]).forEach(function(f){ archivos.push({url:baseGas+encodeURIComponent(f), folder:prefix+'/10_sop_gastos',   optional:true}); });
  })();

  return {archivos:archivos, prefix:prefix};
}

function descargarZipTodos(){
  // 1. Candidatos filtrados igual que Paso 5 (corp + partido)
  var _filtroPartido=norm(document.getElementById('selPartido').value);
  var _corpVal=document.getElementById('selCorp').value;
  var candidatos=Object.values(CANDIDATOS);
  if(_filtroPartido) candidatos=candidatos.filter(function(x){return norm(x.partido)===_filtroPartido;});
  if(_corpVal){
    var _cN2=norm(_corpVal);
    var _cF2=_cN2.indexOf('ALCALD')!==-1?'ALCALDIA':
              _cN2.indexOf('CONCEJ')!==-1?'CONCEJO':
              _cN2.indexOf('ASAMBLEA')!==-1||_cN2.indexOf('DIPUTA')!==-1?'ASAMBLEA':
              _cN2.indexOf('JAL')!==-1||_cN2.indexOf('JUNTA ADMIN')!==-1?'JAL':'GOBERNACION';
    candidatos=candidatos.filter(function(x){return norm(x.cargo||'').indexOf(_cF2)!==-1;});
  }
  candidatos.sort(function(a,b){return (a.nombre||'').localeCompare(b.nombre||'');});
  if(!candidatos.length){alert('No hay candidatos para el filtro actual.');return;}

  var btn=event.target.closest('button');
  btn.disabled=true;
  var totalCand=candidatos.length;
  btn.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Cargando índices...';

  // Cargar índices R8B, IG y R9B antes de construir el ZIP
  var _idxPending=3;
  function _onIdxReady(){
    _idxPending--;
    if(_idxPending>0) return;
    btn.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Preparando ZIP ('+totalCand+' candidatos)...';

  var zip=new JSZip();
  var allPromises=[];

  // ── DOCS COMPARTIDOS (raíz del ZIP): Certificado, Dictamen, CONSOLIDADO_44 ──
  var _vistosCert=false, _vistosDict={}, _vistos9b={};
  candidatos.forEach(function(c){
    var d=_normFNFP(c.departamento), m=_normFNFP(c.municipio);
    var cargoN=norm(c.cargo).indexOf('ALCALD')!==-1?'ALCALDIA':
               norm(c.cargo).indexOf('CONCEJO')!==-1?'CONCEJO':
               norm(c.cargo).indexOf('ASAMBLEA')!==-1?'ASAMBLEA':'GOBERNACION';
    var pk=_normFNFP(c.partido);

    // Certificado Electoral (una sola vez)
    if(!_vistosCert){
      _vistosCert=true;
      (function(){
        var certPath=_findCertPath(c.departamento, c.municipio, cargoN);
        if(!certPath) return;
        var _url='data/'+certPath, _fname=decodeURIComponent(certPath.split('/').pop());
        allPromises.push(fetch(_encodePath(_url)).then(function(r){
          if(!r.ok) throw new Error(); return r.blob();
        }).then(function(blob){ zip.file('01_certificado/'+_fname, blob); }).catch(function(){}));
      })();
    }

    // Dictamen (una vez por partido)
    if(!_vistosDict[pk]){
      _vistosDict[pk]=true;
      (function(cand){
        var pdfs=_findDictPdfs(cand);
        pdfs.forEach(function(pp){
          var _fname=decodeURIComponent(pp.split('/').pop());
          allPromises.push(fetch(_encodePath(pp)).then(function(r){
            if(!r.ok) throw new Error(); return r.blob();
          }).then(function(blob){ zip.file('02_dictamen/'+_fname, blob); }).catch(function(){}));
        });
      })(c);
    }

    // CONSOLIDADO_44 — 9B (una vez por partido)
    if(!_vistos9b[pk]){
      _vistos9b[pk]=true;
      (function(d0,m0,pk0){
        var _r9bD=d0, _r9bM=m0, _r9bPF=pk0;
        if(R9B_INDEX){
          var _e=R9B_INDEX[d0+'/'+m0+'/'+pk0];
          if(!_e){ for(var _k in R9B_INDEX){ if(_k.indexOf(d0+'/'+m0+'/')===0&&_k.substring(_k.lastIndexOf('/')+1)===pk0){_e=R9B_INDEX[_k];break;} } }
          if(_e){ _r9bD=_e.d; _r9bM=_e.mu; _r9bPF=_e.pf; }
        }
        var _url='data/fnfp/reporte_9b/'+_r9bD+'/'+_r9bM+'/'+encodeURIComponent(_r9bPF)+'/CONSOLIDADO_44.pdf';
        var _fname=_r9bPF+'_CONSOLIDADO_44.pdf';
        allPromises.push(fetch(_encodePath(_url)).then(function(r){
          if(!r.ok) throw new Error(); return r.blob();
        }).then(function(blob){ zip.file('03_9b/'+_fname, blob); }).catch(function(){}));
      })(d, m, pk);
    }
  });

  // ── DOCS POR CANDIDATO: 8B, Libro, Anexos, Ingresos, Gastos ──
  candidatos.forEach(function(c){
    var d=_normFNFP(c.departamento), m=_normFNFP(c.municipio);
    var prefix=c.id+'_'+_normFNFP(c.nombre).substring(0,25);

    // 8B + Libro + Anexos (R8B_INDEX)
    (function(d0,m0,cand,pref){
      if(!R8B_INDEX) return;
      function _kn(s){return s.replace(/_+/g,'_').replace(/_$/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
      var pk=_normFNFP(cand.partido);
      var r8bObj=null;
      if(R8B_INDEX[d0+'/'+m0+'/'+pk]) r8bObj=R8B_INDEX[d0+'/'+m0+'/'+pk];
      else { var kN=_kn(pk); for(var k in R8B_INDEX){ if(k.indexOf(d0+'/'+m0+'/')!==0) continue; var kP=k.substring(k.lastIndexOf('/')+1); if(_kn(kP)===kN||_kn(kP).indexOf(kN)!==-1||kN.indexOf(_kn(kP))!==-1){r8bObj=R8B_INDEX[k];break;} } }
      if(!r8bObj) return;
      var entries=r8bObj.e||[], cxN=_kn(_normFNFP(cand.nombre)), match=null;
      for(var i=0;i<entries.length;i++){ if(_kn(entries[i].n)===cxN){match=entries[i];break;} }
      if(!match){ for(var j=0;j<entries.length;j++){ if(_kn(entries[j].n).indexOf(cxN)!==-1||cxN.indexOf(_kn(entries[j].n))!==-1){match=entries[j];break;} } }
      if(!match) return;
      var _rd=r8bObj.d||d0, _rm=r8bObj.mu||m0;
      var base8b='r8b/'+encodeURIComponent(_rd)+'/'+encodeURIComponent(_rm)+'/'+encodeURIComponent(r8bObj.p)+'/'+encodeURIComponent(match.f)+'/';
      allPromises.push(fetch(_encodePath(base8b+'CONSOLIDADO_100_INFORME_INDIVIDUAL_DE_INGRESOS_Y_GASTOS_DE_LA_CAMP.pdf')).then(function(r){
        if(!r.ok) throw new Error(); return r.blob();
      }).then(function(blob){ zip.file(pref+'/01_8b/8B.pdf',blob); }).catch(function(){}));
      allPromises.push(fetch(_encodePath(base8b+'libro_contable.pdf')).then(function(r){
        if(!r.ok) throw new Error(); return r.blob();
      }).then(function(blob){ zip.file(pref+'/02_libro/libro_contable.pdf',blob); }).catch(function(){}));
      allPromises.push(fetch(_encodePath(base8b+'libro_contable.xlsx')).then(function(r){
        if(!r.ok) throw new Error(); return r.blob();
      }).then(function(blob){ zip.file(pref+'/02_libro/libro_contable.xlsx',blob); }).catch(function(){}));
      (match.ai||[]).forEach(function(f){
        allPromises.push(fetch(_encodePath(base8b+'anexos_ingresos/'+encodeURIComponent(f))).then(function(r){
          if(!r.ok) throw new Error(); return r.blob();
        }).then(function(blob){ zip.file(pref+'/03_anexos_ing/'+f,blob); }).catch(function(){}));
      });
      (match.ag||[]).forEach(function(f){
        allPromises.push(fetch(_encodePath(base8b+'anexos_gastos/'+encodeURIComponent(f))).then(function(r){
          if(!r.ok) throw new Error(); return r.blob();
        }).then(function(blob){ zip.file(pref+'/04_anexos_gas/'+f,blob); }).catch(function(){}));
      });
    })(d, m, c, prefix);

    // Soportes Ingresos y Gastos (IG_DOCS_INDEX)
    (function(d0,m0,cand,pref){
      if(!IG_DOCS_INDEX) return;
      function _kig(s){return s.replace(/_+/g,'_').replace(/_$/,'');}
      var pk=_normFNFP(cand.partido);
      var obj=IG_DOCS_INDEX[d0+'/'+m0+'/'+pk];
      if(!obj){ var kN=_kig(pk); for(var k in IG_DOCS_INDEX){ if(k.indexOf(d0+'/'+m0+'/')!==0) continue; if(_kig(k.substring(k.lastIndexOf('/')+1))===kN){obj=IG_DOCS_INDEX[k];break;} } }
      if(!obj) return;
      var cid=String(cand.id||''), entry=null;
      for(var i=0;i<obj.e.length;i++){ if(obj.e[i].id===cid){entry=obj.e[i];break;} }
      if(!entry){ for(var j=0;j<obj.e.length;j++){ if((obj.e[j].f||'').replace(/_.*$/,'')===cid){entry=obj.e[j];break;} } }
      if(!entry) return;
      var igF=entry.f||cid, _igD=obj.d||d0, _igM=obj.mu||m0, _igPf=obj.pf||obj.p;
      var baseIng='ig/'+_igD+'/'+_igM+'/'+encodeURIComponent(_igPf)+'/'+igF+'/ingresos/';
      var baseGas='ig/'+_igD+'/'+_igM+'/'+encodeURIComponent(_igPf)+'/'+igF+'/gastos/';
      (entry.ig||[]).forEach(function(f){
        allPromises.push(fetch(_encodePath(baseIng+encodeURIComponent(f))).then(function(r){
          if(!r.ok) throw new Error(); return r.blob();
        }).then(function(blob){ zip.file(pref+'/05_sop_ingresos/'+f,blob); }).catch(function(){}));
      });
      (entry.gg||[]).forEach(function(f){
        allPromises.push(fetch(_encodePath(baseGas+encodeURIComponent(f))).then(function(r){
          if(!r.ok) throw new Error(); return r.blob();
        }).then(function(blob){ zip.file(pref+'/06_sop_gastos/'+f,blob); }).catch(function(){}));
      });
    })(d, m, c, prefix);
  });

  btn.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Descargando '+allPromises.length+' archivos...';
  Promise.all(allPromises).then(function(){
    btn.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Comprimiendo ZIP...';
    var c0=candidatos[0];
    var zipName='SOPORTES_'+_normFNFP(c0.departamento)+'_'+_normFNFP(c0.municipio)+'_'+totalCand+'cand.zip';
    zip.generateAsync({type:'blob'}).then(function(blob){
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=zipName;
      a.click();
      btn.disabled=false;
      btn.innerHTML='<i class="fa fa-file-archive me-1"></i>Descargar ZIP (Todos los candidatos)';
    });
  }).catch(function(){
    btn.disabled=false;
    btn.innerHTML='<i class="fa fa-file-archive me-1"></i>Descargar ZIP (Todos los candidatos)';
    alert('Error generando ZIP');
  });
  } // fin _onIdxReady
  _cargarR8BIndex(_onIdxReady);
  _cargarIGDocsIndex(_onIdxReady);
  _cargarR9BIndex(_onIdxReady);
}

