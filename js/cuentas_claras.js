
function _ccRelogin(){
  var bar = document.getElementById('ccStatusBar');
  bar.innerHTML='<span class="badge bg-info"><i class="fa fa-spinner fa-spin me-1"></i>Iniciando sesión CNE (puede tardar 30s)...</span>';
  fetch('/api/cne_login').then(function(r){return r.json();}).then(function(d){
    if(d.ok) bar.innerHTML='<span class="badge bg-success"><i class="fa fa-check-circle me-1"></i>Sesión CNE activa</span>';
    else bar.innerHTML='<span class="badge bg-danger">Login fallido: '+(d.mensaje||'error')+'</span>';
  }).catch(function(e){ bar.innerHTML='<span class="badge bg-danger">Error: '+e+'</span>'; });
}

function _ccLoadIndex(cb){
  fetch('data/cuentas_claras_index.json?t='+Date.now())
    .then(function(r){ if(!r.ok) throw new Error('No encontrado'); return r.json(); })
    .then(function(idx){
      _ccIndex = idx;
      _ccIndexLoaded = true;
      if(cb) cb();
    })
    .catch(function(e){
      document.getElementById('ccResultados').innerHTML =
        '<div class="alert alert-warning"><i class="fa fa-exclamation-triangle me-1"></i>'+
        'Índice no disponible. Ejecute <code>python indexar_cuentas_claras.py</code> primero.<br><small>'+e+'</small></div>';
    });
}

function _ccSyncFromPaso1(){
  // Leer filtros del Paso 1
  var corpVal = (document.getElementById('selCorp').value||'').toUpperCase();
  var dptoVal = norm(document.getElementById('selDpto').value||'');
  var munVal = norm(document.getElementById('selMun').value||'');
  var partidoVal = norm(document.getElementById('selPartido').value||'');

  // Mostrar barra de filtro actual
  var fb = document.getElementById('ccFiltroBar');
  if(!dptoVal || !munVal){
    fb.innerHTML = '<div class="alert alert-info mb-2"><i class="fa fa-arrow-left me-1"></i>Seleccione <strong>Departamento</strong> y <strong>Municipio</strong> en el <strong>Paso 1</strong> y luego regrese aquí.</div>';
    document.getElementById('ccResultados').innerHTML = '';
    document.getElementById('ccDocPanel').style.display = 'none';
    document.getElementById('ccZipMunPanel').style.display = 'none';
    return;
  }
  fb.innerHTML = '<div class="d-flex flex-wrap gap-2 align-items-center mb-1">' +
    '<span class="badge bg-primary fs-6">'+esc(titleCase(corpVal||'Todas'))+'</span>' +
    '<span class="badge bg-dark fs-6">'+esc(titleCase(dptoVal))+'</span>' +
    '<span class="badge bg-info fs-6">'+esc(titleCase(munVal))+'</span>' +
    (partidoVal ? '<span class="badge bg-warning text-dark fs-6">'+esc(titleCase(partidoVal))+'</span>' : '') +
    '<button class="btn btn-sm btn-outline-secondary ms-auto" onclick="irPaso(1)"><i class="fa fa-filter me-1"></i>Cambiar filtros</button>' +
    '</div>';

  // Buscar en índice CC
  if(!_ccIndex){
    document.getElementById('ccResultados').innerHTML = '<div class="alert alert-secondary">Cargando índice...</div>';
    return;
  }

  // Encontrar departamento en el índice (busqueda por nombre normalizado)
  var dptoEntry = null;
  Object.keys(_ccIndex).forEach(function(k){
    if(norm(k) === dptoVal || norm(_ccIndex[k].nombre||'') === dptoVal) dptoEntry = _ccIndex[k];
  });
  if(!dptoEntry){
    document.getElementById('ccResultados').innerHTML = '<div class="alert alert-warning">Departamento <strong>'+esc(dptoVal)+'</strong> no encontrado en índice de Cuentas Claras. Puede que aún no se haya indexado.</div>';
    _ccCandsMun = [];
    return;
  }

  // Encontrar municipio
  var munEntry = null;
  var munValBase = munVal.replace(/\s*\(.*\)\s*/g,'').trim();
  Object.keys(dptoEntry.municipios||{}).forEach(function(k){
    var kN=norm(k), kNom=norm(dptoEntry.municipios[k].nombre||'');
    if(kN===munVal||kNom===munVal||kN===munValBase||kNom===munValBase||munVal.indexOf(kN)===0||munVal.indexOf(kNom)===0) munEntry = dptoEntry.municipios[k];
  });
  // Para departamentales (Asamblea/Gobernación), buscar en _DPTO_ o juntar todos
  if(!munEntry){
    var isDptlCC=(corpVal.indexOf('ASAMBLEA')!==-1||corpVal.indexOf('GOBERN')!==-1||corpVal.indexOf('DIPUTA')!==-1||
      munVal.indexOf('NO APLICA')!==-1||munVal.indexOf('DEPARTAMENTAL')!==-1||munVal==='_DPTO_'||munVal==='');
    if(isDptlCC){
      munEntry=(dptoEntry.municipios||{})['_DPTO_']||null;
      if(!munEntry){
        // Buscar con nombre del departamento como clave
        Object.keys(dptoEntry.municipios||{}).forEach(function(k2){
          if(norm(k2)===dptoVal||norm(dptoEntry.municipios[k2].nombre||'')===dptoVal) munEntry=dptoEntry.municipios[k2];
        });
      }
      if(!munEntry){
        // Juntar candidatos de TODOS los municipios del depto
        var allC=[];
        Object.keys(dptoEntry.municipios||{}).forEach(function(k3){
          (dptoEntry.municipios[k3].candidatos||[]).forEach(function(cc){ allC.push(cc); });
        });
        if(allC.length) munEntry={nombre:dptoVal+' (Departamental)',candidatos:allC};
      }
    }
  }
  if(!munEntry){
    // Para departamentales sin datos en índice, crear entrada sintética y usar API
    var isDptlFallback=(corpVal.indexOf('ASAMBLEA')!==-1||corpVal.indexOf('GOBERN')!==-1||corpVal.indexOf('DIPUTA')!==-1||
      munVal.indexOf('NO APLICA')!==-1||munVal.indexOf('DEPARTAMENTAL')!==-1);
    if(isDptlFallback){
      munEntry={nombre:dptoVal+' (Departamental)',candidatos:[],id:dptoEntry.id||0,_sintetico:true};
    } else {
      document.getElementById('ccResultados').innerHTML = '<div class="alert alert-warning">Municipio <strong>'+esc(munVal)+'</strong> no encontrado en índice de Cuentas Claras. Puede que aún no se haya indexado.</div>';
      _ccCandsMun = [];
      return;
    }
  }

  // Guardar datos de contexto para construir URLs
  window._ccDptoEntry = dptoEntry;
  window._ccMunEntry = munEntry;

  // Candidatos del municipio — filtrar por proceso seleccionado
  var _allCands = (munEntry.candidatos||[]).slice();
  var _procSel = _PROCESO_SELECCIONADO||7;
  _ccCandsMun = _allCands.filter(function(c){
    // Si el candidato no tiene proceso_id, asumir proceso 7 (datos legacy)
    return !c.proceso_id || c.proceso_id === _procSel;
  });

  // Aplicar filtro de corporación del Paso 1
  var corpMap = {'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2};
  var corpId = corpMap[corpVal] || null;

  // Para departamentales sin candidatos locales, buscar vía API del servidor
  if(!_ccCandsMun.length && (corpVal.indexOf('ASAMBLEA')!==-1||corpVal.indexOf('GOBERN')!==-1)){
    var ccRes=document.getElementById('ccResultados');
    ccRes.innerHTML='<div class="text-center py-3"><i class="fa fa-spinner fa-spin me-1"></i>Buscando candidatos de <strong>'+esc(corpVal)+'</strong> en Cuentas Claras...</div>';
    var _dptoR13=document.getElementById('selDpto').value||'';
    var _partR13=document.getElementById('selPartido').value||'';
    fetch('/api/cne_buscar_candidatos?corp='+encodeURIComponent(corpVal)+'&dpto='+encodeURIComponent(_dptoR13)+'&partido='+encodeURIComponent(_partR13))
      .then(function(r){return r.json();})
      .then(function(d){
        if(d.ok&&d.candidatos&&d.candidatos.length){
          _ccCandsMun=d.candidatos;
          window._ccListaFiltrada=d.candidatos;
          _ccFiltrarCandidatos(corpId, partidoVal);
        } else {
          ccRes.innerHTML='<div class="alert alert-warning"><i class="fa fa-exclamation-triangle me-1"></i>No se encontraron candidatos de '+esc(corpVal)+' en CC. '+(d.error||'')+'</div>';
        }
      }).catch(function(e){
        ccRes.innerHTML='<div class="alert alert-danger">Error buscando candidatos: '+e+'</div>';
      });
  } else {
    _ccFiltrarCandidatos(corpId, partidoVal);
  }

  // Cargar módulos de gestión a nivel municipio (Dictamen, Acuerdos, Contador, Gerente, Auditor)
  _ccCargarGestionMunicipio();
}

function _ccFiltrarCandidatos(corpId, partidoFilter){
  // Si se llama sin params, leer del estado actual
  if(corpId === undefined){
    var corpVal = (document.getElementById('selCorp').value||'').toUpperCase();
    var corpMap = {'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2};
    corpId = corpMap[corpVal] || null;
    partidoFilter = norm(document.getElementById('selPartido').value||'');
  }
  var buscar = (document.getElementById('ccBuscar').value||'').toUpperCase().trim();

  var lista = _ccCandsMun.filter(function(c){
    if(corpId && c.corp_id !== corpId) return false;
    if(partidoFilter && norm(c.org||'').indexOf(partidoFilter) < 0) return false;
    if(buscar){
      var txt = ((c.nombre||'')+' '+(c.org||'')+' '+(c.cedula||'')).toUpperCase();
      return txt.indexOf(buscar) >= 0;
    }
    return true;
  });

  if(!_ccCandsMun.length){
    document.getElementById('ccResultados').innerHTML =
      '<div class="alert alert-secondary">No hay candidatos indexados para este municipio.</div>';
    return;
  }
  if(!lista.length && corpId && (corpId===5||corpId===2)){
    // Departamental sin candidatos indexados: esperar gestión CC y extraer de dictamen
    var _corpNom=corpId===5?'Asamblea':'Gobernación';
    var _ccResEl=document.getElementById('ccResultados');
    if(!window._ccGestionMunData||!window._ccGestionMunData.dictamen){
      // Gestión aún no cargada — mostrar spinner y reintentar cuando cargue
      _ccResEl.innerHTML='<div class="text-center py-3"><i class="fa fa-spinner fa-spin me-1"></i>Buscando candidatos de <strong>'+esc(_corpNom)+'</strong> en Cuentas Claras...</div>';
      window._ccDptlPendingCorpId=corpId;
      return;
    }
    var _corpNomF=corpId===5?'ASAMBLEA':'GOBERN';
    var _seen={};
    window._ccGestionMunData.dictamen.forEach(function(it){
      var cn=(it.corporacionNombre||'').toUpperCase();
      if(cn.indexOf(_corpNomF)===-1) return;
      var nombre=it.candidatoNombre||it.nombre||'';
      var org=it.agrupacionPoliticaNombre||it.coalicionPoliticaNombre||'';
      var key=(nombre+'|'+org).toUpperCase();
      if(_seen[key]) return;
      _seen[key]=true;
      lista.push({nombre:nombre,cedula:'—',corp_id:corpId,org:org,corp:it.corporacionNombre||'',_fromDict:true});
    });
    if(!lista.length){
      _ccResEl.innerHTML=
        '<div class="alert alert-warning"><i class="fa fa-exclamation-triangle me-1"></i>'+
        'No hay candidatos de <strong>'+esc(_corpNom)+'</strong> en Cuentas Claras para este departamento.</div>';
      return;
    }
  }

  var corpLabel = {'2':'Gobernación','3':'Alcaldía','5':'Asamblea','6':'Concejo'};
  var html = '<div class="small text-muted mb-2">Mostrando '+lista.length+' de '+_ccCandsMun.length+' candidatos en Cuentas Claras</div>';
  html += '<div class="table-responsive"><table class="table table-sm table-hover table-striped">';
  html += '<thead class="table-dark"><tr><th>Candidato</th><th>Cédula</th><th>Corporación</th><th>Organización</th><th>Documentos</th></tr></thead><tbody>';

  lista.forEach(function(c, i){
    var corp = corpLabel[String(c.corp_id)] || c.corp || '';
    html += '<tr>';
    html += '<td class="fw-semibold">'+esc(c.nombre||'')+'</td>';
    html += '<td>'+esc(c.cedula||'—')+'</td>';
    html += '<td><span class="badge bg-'+(c.corp_id===3?'primary':'success')+'">'+esc(corp)+'</span></td>';
    html += '<td><small>'+esc(c.org||'')+'</small></td>';
    html += '<td><button class="btn btn-sm btn-outline-info" onclick="_ccVerDocs('+i+')"><i class="fa fa-folder-open me-1"></i>Ver</button></td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  document.getElementById('ccResultados').innerHTML = html;
  document.getElementById('ccDocPanel').style.display = 'none';

  // Guardar lista filtrada para acceso por indice
  window._ccListaFiltrada = lista;
}

// ═══ CARGA DE GESTIÓN A NIVEL MUNICIPIO (Dictamen, Acuerdos, Contador, Gerente, Auditor) ═══
function _ccCargarGestionMunicipio(){
  var gPanel = document.getElementById('ccGestionPanel');
  if(!gPanel) return;

  var filtroDpto = norm(document.getElementById('selDpto').value||'');
  var filtroMun = norm(document.getElementById('selMun').value||'');
  var filtroPartido = norm(document.getElementById('selPartido').value||'');
  var filtroCorp = (document.getElementById('selCorp').value||'').toUpperCase();

  gPanel.style.display = 'block';
  gPanel.innerHTML = '<div class="text-center p-3"><i class="fa fa-spinner fa-spin fa-2x"></i><br>Consultando módulos de gestión en el servidor (Dictamen · 9B · Acuerdos · Contador · Gerente · Auditor · Informe Org)...<br><small class="text-muted">El servidor pagina y filtra por departamento/municipio. Puede tardar unos segundos.</small></div>';

  // Extraer organizaciones únicas del municipio para cargar 9B
  var corpMapCC = {'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2};
  var corpIdFiltro = corpMapCC[filtroCorp] || null;
  var orgsUnicas = {};
  (_ccCandsMun||[]).forEach(function(c){
    if(corpIdFiltro && c.corp_id !== corpIdFiltro) return;
    if(filtroPartido && norm(c.org||'').indexOf(filtroPartido) < 0) return;
    var key = c.org_id+'_'+c.corp_id+'_'+c.tipo_id;
    if(!orgsUnicas[key]) orgsUnicas[key] = c;
  });
  var orgsArr = Object.keys(orgsUnicas).map(function(k){ return orgsUnicas[k]; });

  // Gestión: endpoint server-side que pagina TODOS los registros y filtra por dpto/mun
  var dptoValR = document.getElementById('selDpto').value||'';
  var munValR = document.getElementById('selMun').value||'';
  var corpValR = document.getElementById('selCorp').value||'';
  var partidoValR = document.getElementById('selPartido').value||'';
  var gestionUrl = '/api/cne_gestion_filtrado?dpto='+encodeURIComponent(dptoValR)+
    '&mun='+encodeURIComponent(munValR)+
    '&corp='+encodeURIComponent(corpValR)+
    '&partido='+encodeURIComponent(partidoValR);

  // Promesas de 9B: para cada org única (solo si tenemos IDs válidos)
  var dpto = window._ccDptoEntry;
  var mun = window._ccMunEntry;
  var _dptoId = (dpto&&dpto.id)?dpto.id:0;
  var _munId = (mun&&mun.id&&!mun._sintetico)?mun.id:0;
  var org9bPromises = [];
  orgsArr.forEach(function(c){
    if(!_dptoId) return; // Sin ID de dpto, no consultar 9B
    var q = 'idproceso='+PROCESO_ID_CC+'&idtipo_organi='+c.tipo_id+'&id_organizacion='+c.org_id+
      '&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
      '&id_departamento='+_dptoId+'&id_municipio='+_munId;
    org9bPromises.push(_ccFetchJSON('/api/cne/ingresos-partido?page=1&'+q));
    org9bPromises.push(_ccFetchJSON('/api/cne/gastos-partido?page=1&'+q));
    org9bPromises.push(_ccFetchJSON('/api/cne/obligaciones-partido?page=1&'+q));
  });

  // Promesas de Informe Organización Política: envio/devolucion/respuesta por org (SIN id_candidato)
  var orgInfPromises = [];
  orgsArr.forEach(function(c){
    if(!_dptoId) return; // Sin ID de dpto, no consultar InfOrg
    var qInfOrg = 'idtipo_organi='+c.tipo_id+'&id_organizacion='+c.org_id+
      '&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
      '&id_departamento='+_dptoId+'&id_municipio='+_munId+'&id_proceso='+PROCESO_ID_CC;
    orgInfPromises.push(_ccFetchJSON('/api/cne/envio-organizacion?page=1&buscar=&criterio=radicado&'+qInfOrg.replace('id_proceso=','idproceso=')));
    orgInfPromises.push(_ccFetchJSON('/api/cne/devolucionInformes?page=1&'+qInfOrg));
    orgInfPromises.push(_ccFetchJSON('/api/cne/respuestaInformes/cuentas?page=1&'+qInfOrg));
  });

  // [0] = gestión server-side, [1..N] = 9B por org (3 cada una), [N+1..] = InfOrg por org (3 cada una)
  var n9b = org9bPromises.length;
  // Gestión usa timeout largo (primera carga puede tardar ~2min paginando 2400 dictámenes)
  var _gestionPromise = (function(){
    var c=new AbortController(), t=setTimeout(function(){c.abort();},180000);
    return fetch(gestionUrl,{signal:c.signal}).then(function(r){clearTimeout(t);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .catch(function(e){clearTimeout(t);console.warn('[Gestion FAIL]',e);return {};});
  })();
  Promise.all([_gestionPromise].concat(org9bPromises).concat(orgInfPromises)).then(function(results){
    var gestion = (results[0] && !Array.isArray(results[0])) ? results[0] : {};
    console.log('[DIAG] gestion dictamen='+(gestion.dictamen?gestion.dictamen.length:'UNDEF')+' gerente='+(gestion.gerente?gestion.gerente.length:'UNDEF'));
    var html = '';
    window._ccGestionMunData = {
      dictamen: gestion.dictamen || [],
      coalicion: gestion.coalicion || [],
      contador: gestion.contador || [],
      gerente: gestion.gerente || [],
      auditor: gestion.auditor || []
    };

    // ═══ 1. DICTAMEN (filtrar por corporación del Paso 1) ═══
    var dictItemsAll = window._ccGestionMunData.dictamen;
    var dictItems = dictItemsAll;
    if(filtroCorp && filtroCorp!=='TODOS'){
      var _corpKey=filtroCorp.toUpperCase();
      dictItems = dictItemsAll.filter(function(it){
        var cn=(it.corporacionNombre||'').toUpperCase();
        if(_corpKey==='ALCALDIA') return cn.indexOf('ALCALD')!==-1;
        if(_corpKey==='CONCEJO') return cn.indexOf('CONCEJO')!==-1;
        if(_corpKey==='ASAMBLEA') return cn.indexOf('ASAMBLEA')!==-1;
        if(_corpKey==='GOBERNACION') return cn.indexOf('GOBERN')!==-1;
        if(_corpKey==='JAL') return cn.indexOf('JUNTA')!==-1||cn.indexOf('JAL')!==-1;
        return true;
      });
    }
    html += '<div class="card mb-3 border-danger"><div class="card-header bg-danger text-white fw-bold">';
    html += '<i class="fa fa-gavel me-1"></i>Dictamen de Auditoría <span class="badge bg-light text-dark">'+dictItems.length+'</span>';
    html += '</div><div class="card-body">';
    html += _ccRenderGestionItems(dictItems, 'dictamen', 'dictamen_auditoria', 'dictamen_auditoria');
    html += '</div></div>';

    // ═══ 2. 9B Y ANEXOS (por cada organización) ═══
    var CONS_9B = [43,44,45,46,47,48,100];
    window._ccGestionMunData._9b_orgs = [];
    html += '<div class="card mb-3 border-success"><div class="card-header bg-success text-white fw-bold">';
    html += '<i class="fa fa-building me-1"></i>9B y Anexos — Informes de Organizaciones <span class="badge bg-light text-dark">'+orgsArr.length+' org(s)</span>';
    html += '</div><div class="card-body">';

    orgsArr.forEach(function(c, oi){
      var baseIdx = 1 + oi*3; // offset: [0]=gestión, [1..]=9B por org
      var r0 = results[baseIdx];   var ingresos9b = Array.isArray(r0)?r0:(r0&&r0.ingresos?r0.ingresos:[]);
      var r1 = results[baseIdx+1]; var gastos9b = Array.isArray(r1)?r1:(r1&&r1.gastos?r1.gastos:[]);
      var r2 = results[baseIdx+2]; var obligaciones = Array.isArray(r2)?r2:[];

      var q9b = 'idproceso='+PROCESO_ID_CC+'&idtipo_organi='+c.tipo_id+'&id_organizacion='+c.org_id+
        '&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
        '&id_departamento='+dpto.id+'&id_municipio='+mun.id;
      var libroQ = 'idtipo_organi='+c.tipo_id+'&id_organiza='+c.org_id+'&id_organizacion='+c.org_id+
        '&idproceso='+PROCESO_ID_CC+'&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
        '&id_departamento='+dpto.id+'&id_municipio='+mun.id;

      // Guardar para ZIP
      window._ccGestionMunData._9b_orgs.push({
        orgName:c.org, q9b:q9b, libroQ:libroQ, ingresos9b:ingresos9b, gastos9b:gastos9b, obligaciones:obligaciones,
        tipo_id:c.tipo_id, org_id:c.org_id, corp_id:c.corp_id, circ_id:c.circ_id
      });

      var corpLabel = c.corp_id===3?'Alcaldía':c.corp_id===2?'Gobernación':c.corp_id===5?'Asamblea':'Concejo';
      html += '<div class="border rounded p-2 mb-3">';
      html += '<h6 class="fw-bold text-success"><i class="fa fa-building me-1"></i>'+esc(c.org||'Organización')+' <span class="badge bg-secondary">'+corpLabel+'</span></h6>';

      // Libro Contable Partido
      html += '<div class="mb-2">';
      html += '<small class="fw-bold"><i class="fa fa-book me-1"></i>Libro Contable Organización</small> ';
      html += '<a href="/api/cne/libroContablePartido?'+libroQ+'&boton=2" target="_blank" class="btn btn-sm btn-outline-danger py-0"><i class="fa fa-file-pdf me-1"></i>PDF</a> ';
      html += '<a href="/api/cne/libroContablePartido?'+libroQ+'&boton=1" target="_blank" class="btn btn-sm btn-outline-success py-0"><i class="fa fa-file-excel me-1"></i>Excel</a>';
      html += '</div>';

      // Consolidados 9B
      var CONS_9B_LABELS = {
        43:'Ingresos',44:'Gastos',45:'Obligaciones',
        46:'Resumen',47:'Esp. Especie',48:'Créditos',100:'Consolidado'
      };
      var CONS_9B_COLORS = {
        43:'#198754',44:'#dc3545',45:'#fd7e14',
        46:'#0d6efd',47:'#6f42c1',48:'#20c997',100:'#212529'
      };
      html += '<div class="mb-2">';
      html += '<small class="fw-bold text-muted d-block mb-2"><i class="fa fa-layer-group me-1"></i>Consolidados 9B</small>';
      html += '<div class="d-flex flex-wrap gap-2">';
      CONS_9B.forEach(function(fid){
        var url = '/api/cne/descargar-consolidado?id='+fid+'&rol=contador&idproceso='+PROCESO_ID_CC+
          '&idFormato='+fid+'&tipoOrganizacion='+c.tipo_id+'&idOrganizacion='+c.org_id+
          '&idCandidato=&idCorporacion='+c.corp_id+'&idCircunscripcion='+c.circ_id+
          '&idDepartamento='+dpto.id+'&idMunicipio='+mun.id;
        var color = CONS_9B_COLORS[fid]||'#6c757d';
        var label = CONS_9B_LABELS[fid]||('F'+fid);
        html += '<a href="'+url+'" target="_blank" style="text-decoration:none">'
          + '<div style="display:flex;align-items:center;gap:6px;background:'+color+';color:#fff;'
          + 'border-radius:10px;padding:5px 12px;font-size:0.78rem;font-weight:600;'
          + 'box-shadow:0 2px 6px rgba(0,0,0,.18);transition:opacity .15s" '
          + 'onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">'
          + '<i class="fa fa-file-pdf" style="font-size:.9rem"></i>'
          + '<span>F'+fid+'</span>'
          + '<span style="opacity:.8;font-weight:400;font-size:.72rem">'+label+'</span>'
          + '</div></a>';
      });
      html += '</div></div>';

      // Ingresos, Gastos, Obligaciones
      html += _ccRenderList('Ingresos Organización', 'fa-arrow-circle-down text-success', ingresos9b, function(f){
        return '/api/cne/descargar-archivo-ingreso-partido?id='+f.id+'&'+q9b;
      });
      html += _ccRenderList('Gastos Organización', 'fa-arrow-circle-up text-danger', gastos9b, function(f){
        return '/api/cne/descargar-archivo-gasto-partido?id='+f.id+'&'+q9b;
      });
      html += _ccRenderList('Obligaciones', 'fa-balance-scale text-warning', obligaciones, function(f){
        return '/api/cne/obligacionPartido/descargar?id='+f.id+'&'+q9b;
      });

      html += '</div>'; // cierra borde org
    });

    if(!orgsArr.length) html += '<div class="text-muted small">Sin organizaciones en este filtro</div>';
    html += '</div></div>'; // cierra card 9B

    // ═══ 3. ACUERDOS (removido) ═══

    // ═══ 4. CONTADOR (búsqueda dinámica) ═══
    html += '<div class="card mb-3 border-success"><div class="card-header bg-success text-white fw-bold">';
    html += '<i class="fa fa-calculator me-1"></i>Contador de Campaña';
    html += '</div><div class="card-body" id="ccContadorDinamico">';
    html += '<span class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Buscando contadores...</span>';
    html += '</div></div>';
    setTimeout(function(){ _buscarContadoresPorCandidatos((_ccCandsMun||[]).slice(), 'ccContadorDinamico'); },100);

    // ═══ 5. GERENTE (removido) ═══

    // ═══ 6. AUDITOR (removido) ═══

    // ═══ 7. INFORME ORGANIZACIÓN POLÍTICA ═══
    html += '<div class="card mb-3 border-dark"><div class="card-header bg-dark text-white fw-bold">';
    html += '<i class="fa fa-file-alt me-1"></i>Informe Organización Política — Envío / Devolución / Respuesta <span class="badge bg-light text-dark">'+orgsArr.length+' org(s)</span>';
    html += '</div><div class="card-body">';

    window._ccGestionMunData._infOrg = [];
    orgsArr.forEach(function(c, oi){
      var infBaseIdx = 1 + n9b + oi*3;
      var rEnv = results[infBaseIdx];
      var rDev = results[infBaseIdx+1];
      var rResp = results[infBaseIdx+2];

      var envios = []; if(rEnv){ var ei=rEnv.envioInforme; envios = ei?(ei.data||ei):[]; if(!Array.isArray(envios)) envios=[]; }
      var devoluciones = rDev&&rDev.cuenta?rDev.cuenta:(Array.isArray(rDev)?rDev:[]);
      var respuestas = rResp&&rResp.cuenta?rResp.cuenta:(Array.isArray(rResp)?rResp:[]);
      window._ccGestionMunData._infOrg.push({orgName:c.org, envios:envios, devoluciones:devoluciones, respuestas:respuestas,
        tipo_id:c.tipo_id, org_id:c.org_id, corp_id:c.corp_id, circ_id:c.circ_id});

      var corpLabel = c.corp_id===3?'Alcaldía':c.corp_id===2?'Gobernación':c.corp_id===5?'Asamblea':'Concejo';
      html += '<div class="border rounded p-2 mb-3">';
      html += '<h6 class="fw-bold text-dark"><i class="fa fa-building me-1"></i>'+esc(c.org||'Organización')+' <span class="badge bg-secondary">'+corpLabel+'</span></h6>';

      // Envíos
      html += '<div class="mb-2"><small class="fw-bold"><i class="fa fa-paper-plane me-1 text-primary"></i>Envíos <span class="badge bg-secondary">'+envios.length+'</span></small>';
      if(envios.length){
        html += '<div class="list-group list-group-flush mt-1">';
        envios.forEach(function(e){
          var eid = e.id||e.informe_id||'';
          var radicado = e.radicado||e.radicado_final||e.numero_radicado||'';
          var fecha = e.fecha_final||e.created_at||e.fecha||'';
          var histId = e.historico||'';
          var _urlFmt = '/api/cne/imprimirFormato?id='+eid+'&id_proceso='+PROCESO_ID_CC;
          var _urlRad = '/api/cne/descargarFormatoRadicacion?id='+eid+'&id_proceso='+PROCESO_ID_CC;
          html += '<div class="list-group-item py-1">';
          html += '<div class="d-flex justify-content-between align-items-center">';
          html += '<span><small>Rad: '+esc(radicado)+' <span class="text-muted">'+esc(fecha)+'</span></small></span>';
          html += '<div class="d-flex gap-1">';
          html += '<a href="'+_urlFmt+'" target="_blank" onclick="_ccOpenDoc(\''+_urlFmt+'\',\'Formato\');return false" class="btn btn-sm btn-outline-primary py-0"><i class="fa fa-file-alt me-1"></i>Formato</a>';
          html += '<a href="'+_urlRad+'" target="_blank" onclick="_ccOpenDoc(\''+_urlRad+'\',\'Radicación\');return false" class="btn btn-sm btn-outline-info py-0"><i class="fa fa-stamp me-1"></i>Radicación</a>';
          if(histId) html += '<button class="btn btn-sm btn-outline-warning py-0" onclick="_ccVerHistoricoOrg('+histId+',this)"><i class="fa fa-history me-1"></i>Histórico</button>';
          html += '</div></div>';
          if(histId) html += '<div id="ccHistOrg13_'+histId+'" style="display:none" class="mt-2"></div>';
          html += '</div>';
        });
        html += '</div>';
      } else { html += '<div class="text-muted small">Sin envíos</div>'; }
      html += '</div>';

      // Devoluciones
      html += '<div class="mb-2"><small class="fw-bold"><i class="fa fa-undo me-1 text-danger"></i>Devoluciones <span class="badge bg-secondary">'+devoluciones.length+'</span></small>';
      if(devoluciones.length){
        html += '<div class="table-responsive mt-1"><table class="table table-sm table-striped mb-0"><thead><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
        devoluciones.forEach(function(d){ html += '<tr><td><small>'+esc(d.created_at||d.fecha||'')+'</small></td><td><small>'+esc(d.observacion||d.motivo||'—')+'</small></td></tr>'; });
        html += '</tbody></table></div>';
      } else { html += '<div class="text-muted small">Sin devoluciones</div>'; }
      html += '</div>';

      // Respuestas
      html += '<div class="mb-2"><small class="fw-bold"><i class="fa fa-reply me-1 text-success"></i>Respuestas <span class="badge bg-secondary">'+respuestas.length+'</span></small>';
      if(respuestas.length){
        html += '<div class="table-responsive mt-1"><table class="table table-sm table-striped mb-0"><thead><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
        respuestas.forEach(function(r){ html += '<tr><td><small>'+esc(r.created_at||r.fecha||'')+'</small></td><td><small>'+esc(r.observacion||r.respuesta||'—')+'</small></td></tr>'; });
        html += '</tbody></table></div>';
      } else { html += '<div class="text-muted small">Sin respuestas</div>'; }
      html += '</div>';

      html += '</div>'; // cierra borde org
    });

    if(!orgsArr.length) html += '<div class="text-muted small">Sin organizaciones en este filtro</div>';
    html += '</div></div>'; // cierra card Informe Org

    gPanel.innerHTML = html;
    document.getElementById('ccZipMunPanel').style.display = 'block';
    // Si hay candidatos departamentales pendientes, re-filtrar ahora que gestión cargó
    if(window._ccDptlPendingCorpId){
      var _pendCorp=window._ccDptlPendingCorpId;
      delete window._ccDptlPendingCorpId;
      _ccFiltrarCandidatos(_pendCorp, norm(document.getElementById('selPartido').value||''));
    }
    // Re-renderizar candidatos CC departamentales si estaban esperando gestión
    if(window._ccDptlPendingEl){
      var _pEl=window._ccDptlPendingEl, _pC=window._ccDptlPendingCands, _pD=window._ccDptlPendingDpto, _pM=window._ccDptlPendingMun;
      delete window._ccDptlPendingEl; delete window._ccDptlPendingCands; delete window._ccDptlPendingDpto; delete window._ccDptlPendingMun;
      _cargarSoportesCCEnLinea(_pEl, _pC, _pD, _pM);
    }
  }).catch(function(e){
    gPanel.innerHTML = '<div class="alert alert-warning">Error cargando módulos de gestión: '+e+
      '<br><button class="btn btn-sm btn-outline-primary mt-2" onclick="_ccCargarGestionMunicipio()">Reintentar</button></div>';
  });
}

function _ccVerDocs(idx){ _ccVerDocsV2(idx); }
function _ccVerDocsV2(idx){
  var c = window._ccListaFiltrada[idx];
  if(!c) return;
  var dpto = window._ccDptoEntry;
  var mun = window._ccMunEntry;
  if(!dpto || !mun) return;

  var panel = document.getElementById('ccDocPanel');
  var title = document.getElementById('ccDocTitle');
  var body = document.getElementById('ccDocBody');

  title.innerHTML = '<i class="fa fa-user me-1"></i>' + esc(c.nombre) + ' — ' + esc(c.org);
  body.innerHTML = '<div class="text-center p-3"><i class="fa fa-spinner fa-spin fa-2x"></i><br>Consultando 8B + Historiales del candidato...</div>';
  panel.style.display = 'block';
  panel.scrollIntoView({behavior:'smooth'});

  var p = {
    cand_id: c.cand_id, corp_id: c.corp_id, circ_id: c.circ_id,
    tipo_id: c.tipo_id, org_id: c.org_id,
    dpto_id: dpto.id, mun_id: mun.id
  };

  var qHist = 'idtipo_organi='+p.tipo_id+'&id_organizacion='+p.org_id+
    '&id_corporacion='+p.corp_id+'&id_circunscripcion='+p.circ_id+
    '&id_departamento='+p.dpto_id+'&id_municipio='+p.mun_id+
    '&id_proceso='+PROCESO_ID_CC+'&id_candidato='+p.cand_id;

  var qIG = 'id_candi='+p.cand_id+'&id_corporacion='+p.corp_id+'&id_circunscripcion='+p.circ_id+
    '&id_departamento='+p.dpto_id+'&id_municipio='+p.mun_id+'&id_proceso='+PROCESO_ID_CC;

  Promise.all([
    // [0-2] 8B Candidato
    _ccFetchJSON('/api/cne/consultaConsolidado?idCandidato='+p.cand_id+'&id_proceso='+PROCESO_ID_CC),
    _ccFetchJSON('/api/cne/ingresos-campana?id_candi='+p.cand_id+
      '&id_corporacion='+p.corp_id+'&id_circunscripcion='+p.circ_id+
      '&id_departamento='+p.dpto_id+'&id_municipio='+p.mun_id+'&id_proceso='+PROCESO_ID_CC),
    _ccFetchJSON('/api/cne/gastos-campana?id_candi='+p.cand_id+
      '&id_corporacion='+p.corp_id+'&id_circunscripcion='+p.circ_id+
      '&id_departamento='+p.dpto_id+'&id_municipio='+p.mun_id+'&id_proceso='+PROCESO_ID_CC),
    // [3-5] Historiales
    _ccFetchJSON('/api/cne/envio?page=1&buscar=&criterio=radicado&'+qHist),
    _ccFetchJSON('/api/cne/devolucionInformes?page=1&'+qHist),
    _ccFetchJSON('/api/cne/respuestaInformes/cuentas?page=1&'+qHist),
    // [6-7] Gestionar Ingresos y Gastos de Campaña
    _ccFetchJSON('/api/cne/ingreso/listarIngresos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG),
    _ccFetchJSON('/api/cne/gasto/listarGastos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG)
  ]).then(function(results){
    // 8B
    var consolidados = Array.isArray(results[0]) ? results[0] : [];
    var ingresos8b = Array.isArray(results[1]) ? results[1] : [];
    var gastos8b = Array.isArray(results[2]) ? results[2] : [];
    // Historiales
    var r3 = results[3]; var envios = [];
    if(r3){ var ei=r3.envioInforme; envios = ei?(ei.data||ei):[]; if(!Array.isArray(envios)) envios=[]; }
    var r4 = results[4]; var devoluciones = r4&&r4.cuenta?r4.cuenta:(Array.isArray(r4)?r4:[]);
    var r5 = results[5]; var respuestas = r5&&r5.cuenta?r5.cuenta:(Array.isArray(r5)?r5:[]);
    // Gestionar Ingresos/Gastos — page 1
    var r6 = results[6]; var gIngItems = (r6&&r6.ingreso&&r6.ingreso.data)?r6.ingreso.data:(Array.isArray(r6)?r6:[]);
    var r7 = results[7]; var gGasItems = (r7&&r7.gasto&&r7.gasto.data)?r7.gasto.data:(Array.isArray(r7)?r7:[]);
    var gIngLastPage = (r6&&r6.pagination)?r6.pagination.last_page:1;
    var gGasLastPage = (r7&&r7.pagination)?r7.pagination.last_page:1;

    // Paginar resto de páginas si hay más de 1
    var extraPromises = [];
    var extraMeta = [];
    for(var pg=2; pg<=gIngLastPage && pg<=20; pg++){
      extraMeta.push('ing');
      extraPromises.push(_ccFetchJSON('/api/cne/ingreso/listarIngresos?page='+pg+'&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG));
    }
    for(var pg=2; pg<=gGasLastPage && pg<=20; pg++){
      extraMeta.push('gas');
      extraPromises.push(_ccFetchJSON('/api/cne/gasto/listarGastos?page='+pg+'&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG));
    }

    return Promise.all(extraPromises).then(function(extraResults){
    extraMeta.forEach(function(t, i){
      var er = extraResults[i];
      if(t==='ing' && er && er.ingreso && er.ingreso.data) gIngItems = gIngItems.concat(er.ingreso.data);
      if(t==='gas' && er && er.gasto && er.gasto.data) gGasItems = gGasItems.concat(er.gasto.data);
    });

    var html = '';

    // Info candidato
    html += '<div class="mb-3 p-2 bg-light rounded">';
    html += '<strong>'+esc(c.nombre)+'</strong> — '+esc(c.org)+'<br>';
    html += '<small class="text-muted">Corp: '+esc(c.corp)+' | Cédula: '+esc(c.cedula||'N/D')+'</small>';
    html += '</div>';

    // ═══ CANDIDATO (8B + Anexos Ingresos y Gastos) ═══
    html += '<div class="card mb-3" style="border-color:#0d6efd"><div class="card-header text-white fw-bold" style="background:#0d6efd">';
    html += '<i class="fa fa-user me-1"></i>Candidato — 8B, Anexos Ingresos y Gastos</div><div class="card-body">';

    html += '<div class="mb-3">';
    html += '<h6 class="fw-bold"><i class="fa fa-book me-1 text-primary"></i>Libro Contable Campaña</h6>';
    html += '<div class="d-flex gap-2">';
    html += '<a href="/api/cne/libroContableCampana?id_candi='+p.cand_id+'&id_proceso='+PROCESO_ID_CC+'&boton=2" target="_blank" class="btn btn-sm btn-outline-danger"><i class="fa fa-file-pdf me-1"></i>PDF</a>';
    html += '<a href="/api/cne/libroContableCampana?id_candi='+p.cand_id+'&id_proceso='+PROCESO_ID_CC+'&boton=1" target="_blank" class="btn btn-sm btn-outline-success"><i class="fa fa-file-excel me-1"></i>Excel</a>';
    html += '</div></div>';

    html += _ccRenderList('Consolidados 8B', 'fa-file-alt text-info', consolidados, function(f){
      return '/api/cne/descargar-consolidado?id='+f.id+'&rol=contador'+
        '&tipoOrganizacion='+p.tipo_id+'&idOrganizacion='+p.org_id+
        '&idCandidato='+p.cand_id+'&idCorporacion='+p.corp_id+
        '&idCircunscripcion='+p.circ_id+'&idDepartamento='+p.dpto_id+
        '&idMunicipio='+p.mun_id+'&id_proceso='+PROCESO_ID_CC;
    });
    html += _ccRenderList('Anexos Ingresos', 'fa-arrow-circle-down text-success', ingresos8b, function(f){
      return '/api/cne/descargar-archivo-ingreso?id='+f.id+'&id_candi='+p.cand_id+'&id_proceso='+PROCESO_ID_CC;
    });
    html += _ccRenderList('Anexos Gastos', 'fa-arrow-circle-up text-danger', gastos8b, function(f){
      return '/api/cne/descargar-archivo-gasto?id='+f.id+'&id_candi='+p.cand_id+'&id_proceso='+PROCESO_ID_CC;
    });

    html += '</div></div>'; // cierra card 8B

    // ═══ GESTIONAR INGRESOS DE CAMPAÑA ═══
    html += '<div class="card mb-3 border-success"><div class="card-header bg-success text-white fw-bold">';
    html += '<i class="fa fa-arrow-circle-down me-1"></i>Gestionar Ingresos De Campaña <span class="badge bg-light text-dark">'+gIngItems.length+'</span>';
    html += '</div><div class="card-body">';
    if(gIngItems.length){
      html += '<div class="list-group list-group-flush">';
      gIngItems.forEach(function(it){
        var nombre = it.nom_formato||it.nom_ingreso||it.nombre||'Ingreso';
        var codigo = it.codigo||'';
        var archivo = it.archivo||'';
        html += '<div class="list-group-item d-flex justify-content-between align-items-center">';
        html += '<span><i class="fa fa-file-alt text-success me-2"></i>'+esc(codigo)+' — '+esc(nombre)+'</span>';
        if(archivo){
          html += '<a href="#" onclick="_ccOpenDoc(\'/api/cne/storage/app/\'+encodeURI(archivo),\'Soporte PDF\');return false" class="btn btn-sm btn-outline-danger"><i class="fa fa-file-pdf me-1"></i>PDF</a>';
        }
        html += '</div>';
      });
      html += '</div>';
    } else { html += '<div class="text-muted small">Sin ingresos registrados</div>'; }
    html += '</div></div>';

    // ═══ GESTIONAR GASTOS DE CAMPAÑA ═══
    html += '<div class="card mb-3 border-danger"><div class="card-header bg-danger text-white fw-bold">';
    html += '<i class="fa fa-arrow-circle-up me-1"></i>Gestionar Gastos De Campaña <span class="badge bg-light text-dark">'+gGasItems.length+'</span>';
    html += '</div><div class="card-body">';
    if(gGasItems.length){
      html += '<div class="list-group list-group-flush">';
      gGasItems.forEach(function(it){
        var nombre = it.nom_formato||it.nom_gasto||it.nombre||'Gasto';
        var codigo = it.codigo||'';
        var archivo = it.archivo||'';
        html += '<div class="list-group-item d-flex justify-content-between align-items-center">';
        html += '<span><i class="fa fa-file-alt text-danger me-2"></i>'+esc(codigo)+' — '+esc(nombre)+'</span>';
        if(archivo){
          html += '<a href="#" onclick="_ccOpenDoc(\'/api/cne/storage/app/\'+encodeURI(archivo),\'Soporte PDF\');return false" class="btn btn-sm btn-outline-danger"><i class="fa fa-file-pdf me-1"></i>PDF</a>';
        }
        html += '</div>';
      });
      html += '</div>';
    } else { html += '<div class="text-muted small">Sin gastos registrados</div>'; }
    html += '</div></div>';

    // ═══ INFORME DE CAMPAÑA ═══
    html += '<div class="card mb-3 border-secondary"><div class="card-header bg-secondary text-white fw-bold">';
    html += '<i class="fa fa-file-alt me-1"></i>Informe De Campaña — Envío / Devolución / Respuesta</div><div class="card-body">';

    html += '<div class="mb-3">';
    html += '<h6 class="fw-bold"><i class="fa fa-paper-plane me-1 text-primary"></i>Envíos <span class="badge bg-secondary">'+envios.length+'</span></h6>';
    if(envios.length){
      html += '<div class="list-group list-group-flush">';
      envios.forEach(function(e,ei){
        var eid = e.id||e.informe_id||'';
        var radicado = e.radicado||e.radicado_final||e.numero_radicado||'';
        var fecha = e.fecha_final||e.created_at||e.fecha||'';
        var histId = e.historico||'';
        var _urlFmt2 = '/api/cne/imprimirFormato?id='+eid+'&id_proceso='+PROCESO_ID_CC;
        var _urlRad2 = '/api/cne/descargarFormatoRadicacion?id='+eid+'&id_proceso='+PROCESO_ID_CC;
        html += '<div class="list-group-item">';
        html += '<div class="d-flex justify-content-between align-items-center">';
        html += '<span><i class="fa fa-file-alt text-primary me-2"></i>Rad: '+esc(radicado)+' <small class="text-muted">'+esc(fecha)+'</small></span>';
        html += '<div class="d-flex gap-1">';
        html += '<a href="'+_urlFmt2+'" target="_blank" onclick="_ccOpenDoc(\''+_urlFmt2+'\',\'Formato\');return false" class="btn btn-sm btn-outline-primary"><i class="fa fa-file-alt me-1"></i>Formato</a>';
        html += '<a href="'+_urlRad2+'" target="_blank" onclick="_ccOpenDoc(\''+_urlRad2+'\',\'Radicación\');return false" class="btn btn-sm btn-outline-info"><i class="fa fa-stamp me-1"></i>Radicación</a>';
        if(histId) html += '<button class="btn btn-sm btn-outline-warning" onclick="_ccVerHistorico('+histId+',this,'+p.cand_id+')"><i class="fa fa-history me-1"></i>Histórico</button>';
        html += '</div></div>';
        if(histId) html += '<div id="ccHist13_'+histId+'" style="display:none" class="mt-2"></div>';
        html += '</div>';
      });
      html += '</div>';
    } else { html += '<div class="text-muted small">Sin envíos registrados</div>'; }
    html += '</div>';

    html += '<div class="mb-3">';
    html += '<h6 class="fw-bold"><i class="fa fa-undo me-1 text-danger"></i>Devoluciones <span class="badge bg-secondary">'+devoluciones.length+'</span></h6>';
    if(devoluciones.length){
      html += '<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
      devoluciones.forEach(function(d){
        html += '<tr><td><small>'+esc(d.created_at||d.fecha||'')+'</small></td>';
        html += '<td><small>'+esc(d.observacion||d.motivo||'—')+'</small></td></tr>';
      });
      html += '</tbody></table></div>';
    } else { html += '<div class="text-muted small">Sin devoluciones</div>'; }
    html += '</div>';

    html += '<div class="mb-3">';
    html += '<h6 class="fw-bold"><i class="fa fa-reply me-1 text-success"></i>Respuestas <span class="badge bg-secondary">'+respuestas.length+'</span></h6>';
    if(respuestas.length){
      html += '<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
      respuestas.forEach(function(r){
        html += '<tr><td><small>'+esc(r.created_at||r.fecha||'')+'</small></td>';
        html += '<td><small>'+esc(r.observacion||r.respuesta||'—')+'</small></td></tr>';
      });
      html += '</tbody></table></div>';
    } else { html += '<div class="text-muted small">Sin respuestas</div>'; }
    html += '</div>';

    html += '</div></div>'; // cierra card Historiales

    body.innerHTML = html;

  }); // cierra .then de paginación extra
  }).catch(function(e){
    body.innerHTML = '<div class="alert alert-danger"><i class="fa fa-times-circle me-1"></i>Error consultando CNE: '+e+
      '<br><button class="btn btn-sm btn-outline-primary mt-2" onclick="_ccRelogin()">Reiniciar sesión CNE</button></div>';
  });
}

// Renderiza items de un modulo de gestion (dictamen, gerente, contador, auditor, coalicion)
function _ccRenderGestionItems(items, modKey, archField, storageDir){
  var html = '';
  if(!items || !items.length){
    return '<div class="text-muted small">Sin registros</div>';
  }
  html += '<div class="list-group list-group-flush">';
  items.forEach(function(item){
    var nombre = item.candidatoNombre||item.nombre||item.nombre_coalicion||item.nom_candidato||'';
    var dptoN = item.departamentoNombre||item.nom_departamento||'';
    var munN = item.munipioNombre||item.municipioNombre||item.nom_ciudad||'';
    var org = item.agrupacionPoliticaNombre||item.grupoSignificativoNombre||item.coalicionPoliticaNombre||item.organizacion||item.nombre_coalicion||'';
    var corp = item.corporacionNombre||'';
    var archivo = item[archField]||item.dictamen_auditoria||item.archivo||'';
    var archNombre = archivo ? archivo.split('/').pop() : '';

    html += '<div class="list-group-item">';
    html += '<div class="d-flex justify-content-between align-items-start">';
    html += '<div><strong>'+esc(nombre)+'</strong>';
    if(corp) html += ' <span class="badge bg-light text-dark">'+esc(corp)+'</span>';
    html += '<br><small class="text-muted">'+esc(dptoN)+' / '+esc(munN)+' — '+esc(org)+'</small>';

    if(modKey==='dictamen'){
      var fecha = item.created_at||'';
      if(fecha) {
        var fd = fecha.substring(0,10);
        html += '<br><small><b>Radicado:</b> '+esc(fd)+'</small>';
      }
    }
    if(modKey==='gerente'){
      var gerente = item.nombre_gerente||item.gerente||'';
      var cuenta = item.numero_cuenta||item.cuenta_bancaria||'';
      var banco = item.banco_nombre||item.banco||'';
      if(gerente) html += '<br><small><b>Gerente:</b> '+esc(gerente)+'</small>';
      if(cuenta) html += '<br><small><b>Cuenta:</b> '+esc(cuenta)+' ('+esc(banco)+')</small>';
    }
    if(modKey==='contador'){
      var contador = item.nombre_contador||item.contador||'';
      var tp = item.tarjeta_profesional||'';
      if(contador) html += '<br><small><b>Contador:</b> '+esc(contador)+'</small>';
      if(tp) html += '<br><small><b>T.P.:</b> '+esc(tp)+'</small>';
    }
    if(modKey==='auditor'){
      var auditor = item.nombre_auditor||item.auditor||item.nombre||'';
      if(auditor) html += '<br><small><b>Auditor:</b> '+esc(auditor)+'</small>';
    }

    html += '</div>';
    if(archNombre){
      var pdfUrl = '/api/cne/storage/app/archivos/'+storageDir+'/'+encodeURIComponent(archNombre);
      html += '<a href="'+pdfUrl+'" target="_blank" class="btn btn-sm btn-outline-danger ms-2"><i class="fa fa-file-pdf me-1"></i>PDF</a>';
    }
    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

function _ccRenderList(titulo, icono, items, urlFn){
  var html = '<div class="mb-3">';
  html += '<h6 class="fw-bold"><i class="fa '+icono+' me-1"></i>'+titulo+' <span class="badge bg-secondary">'+items.length+'</span></h6>';
  if(items.length){
    html += '<div class="list-group list-group-flush">';
    items.forEach(function(f){
      var url = urlFn(f);
      html += '<a href="'+url+'" target="_blank" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">';
      html += '<span><i class="fa fa-file-pdf text-danger me-2"></i>'+esc(f.codigo||'')+' — '+esc(f.nombre||'Documento')+'</span>';
      html += '<span class="badge bg-info">PDF</span></a>';
    });
    html += '</div>';
  } else { html += '<div class="text-muted small">Sin documentos</div>'; }
  html += '</div>';
  return html;
}

function _ccFetchJSON(url){
  return fetch(url).then(function(r){
    if(r.status===401||r.status===419||r.status===503){
      if(typeof _cneRequireLogin==='function') _cneRequireLogin();
      throw new Error('Sesión expirada');
    }
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }).catch(function(err){ console.warn('[_ccFetchJSON FAIL] '+url.substring(0,80)+' → '+err); return []; });
}

// Abre una URL de descarga CNE; muestra alerta si el servidor devuelve 404/403
function _ccOpenDoc(url, label){
  var win = window.open('', '_blank');
  fetch(url, {method:'HEAD'}).then(function(r){
    if(r.ok || r.status===200){
      win.location.href = url;
    } else if(r.status===404){
      win.close();
      alert('Documento no disponible en el servidor CNE (404).\n\nEl CNE puede haber cambiado la ruta de este archivo.\nDocumento: '+(label||url));
    } else if(r.status===403){
      win.close();
      alert('Acceso denegado por el CNE (403).\n\nEste archivo requiere acceso directo al portal de Cuentas Claras.\nDocumento: '+(label||url));
    } else if(r.status===401){
      win.close();
      if(typeof _cneRequireLogin==='function') _cneRequireLogin();
    } else {
      win.location.href = url;
    }
  }).catch(function(){
    // Si HEAD falla, intentar abrir directamente
    win.location.href = url;
  });
}


// (auth.js extraido como modulo separado)


// ═══ Soportes CC en línea para Paso 1 (misma presentación módulo 13) ═══
function _cargarSoportesCCEnLinea(el, cands, dptoVal, munVal){
  if(!cands||!cands.length){ el.innerHTML='<span class="text-muted small">Sin candidatos</span>'; return; }
  var ccIdx = window._ccIndex;
  if(!ccIdx){
    el.innerHTML='<span class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Cargando índice CC...</span>';
    fetch('data/cuentas_claras_index.json').then(function(r){return r.json();}).then(function(idx){
      window._ccIndex=idx;
      _cargarSoportesCCEnLinea(el, cands, dptoVal, munVal);
    }).catch(function(){ el.innerHTML='<span class="text-muted small text-danger">Sin índice CC</span>'; });
    return;
  }
  var dN=norm(dptoVal), mN=norm(munVal);
  var dptoCC=null;
  for(var dk in ccIdx){
    if(norm(dk)===dN||norm(ccIdx[dk].nombre||'')===dN){ dptoCC=ccIdx[dk]; break; }
  }
  if(!dptoCC){ el.innerHTML='<span class="text-muted small">Depto no indexado en CC</span>'; return; }
  var munCC=null;
  var muns=dptoCC.municipios||{};
  // mN puede tener paréntesis como "TESALIA (CARNICERIAS)" — extraer parte antes del paréntesis
  var mNbase=mN.replace(/\s*\(.*\)\s*/g,'').trim();
  for(var mk in muns){
    var mkN=norm(mk), mkNom=norm(muns[mk].nombre||'');
    if(mkN===mN||mkNom===mN||mkN===mNbase||mkNom===mNbase||mN.indexOf(mkN)===0||mN.indexOf(mkNom)===0){ munCC=muns[mk]; break; }
  }
  // Para departamentales (Asamblea/Gobernación), buscar en _DPTO_ o con nombre del dpto
  if(!munCC){
    var corpSel=(document.getElementById('selCorp').value||'').toUpperCase();
    var isDptl=(corpSel.indexOf('ASAMBLEA')!==-1||corpSel.indexOf('GOBERN')!==-1||corpSel.indexOf('DIPUTA')!==-1||
      mN.indexOf('NO APLICA')!==-1||mN.indexOf('DEPARTAMENTAL')!==-1||mN==='_DPTO_'||mN==='');
    if(isDptl){
      // 1) Buscar clave _DPTO_ explícita
      munCC=muns['_DPTO_']||null;
      // 2) Buscar con nombre del departamento como clave de municipio
      if(!munCC){
        for(var mk2 in muns){
          if(norm(mk2)===dN||norm(muns[mk2].nombre||'')===dN){
            munCC=muns[mk2]; break;
          }
        }
      }
      // 3) Si no hay clave departamental, juntar candidatos de TODOS los municipios
      if(!munCC){
        var allCands=[];
        for(var mk3 in muns){
          var mc=muns[mk3].candidatos||[];
          mc.forEach(function(cc){ allCands.push(cc); });
        }
        if(allCands.length){
          munCC={nombre:dN+' (Departamental)',candidatos:allCands};
        }
      }
    }
  }
  if(!munCC){ el.innerHTML='<span class="text-muted small">Municipio no indexado en CC</span>'; return; }
  // Buscar candidatos CC que coincidan
  var ccCands=munCC.candidatos||[];

  // Setear variables globales para que _ccVerDocsV2 funcione desde Paso 1
  window._ccDptoEntry=dptoCC;
  window._ccMunEntry=munCC;
  _ccCandsMun=ccCands.slice();

  // Filtrar candidatos CC por los del Paso 1 (match por cédula o nombre)
  var lista=[];
  cands.forEach(function(cx){
    for(var i=0;i<ccCands.length;i++){
      if(cx.id && ccCands[i].cedula && cx.id===ccCands[i].cedula){ lista.push(ccCands[i]); return; }
    }
    var nCx=norm(cx.nombre);
    for(var j=0;j<ccCands.length;j++){
      if(norm(ccCands[j].nombre)===nCx){ lista.push(ccCands[j]); return; }
    }
  });

  // Si departamental y lista vacía, buscar en CC API directamente
  if(!lista.length){
    var _cSel=(document.getElementById('selCorp').value||'').toUpperCase();
    var _isDptl2=(_cSel.indexOf('ASAMBLEA')!==-1||_cSel.indexOf('GOBERN')!==-1);
    if(_isDptl2){
      var _dptoR=document.getElementById('selDpto').value||'';
      var _partR=document.getElementById('selPartido').value||'';
      el.innerHTML='<div class="text-center py-2"><i class="fa fa-spinner fa-spin me-1"></i>Buscando candidatos de <strong>'+esc(_cSel)+'</strong> en Cuentas Claras...</div>';
      fetch('/api/cne_buscar_candidatos?corp='+encodeURIComponent(_cSel)+'&dpto='+encodeURIComponent(_dptoR)+'&partido='+encodeURIComponent(_partR))
        .then(function(r){return r.json();})
        .then(function(d){
          if(d.ok&&d.candidatos&&d.candidatos.length){
            _ccCandsMun=d.candidatos;
            window._ccListaFiltrada=d.candidatos;
            var corpLabel2={'2':'Gobernación','3':'Alcaldía','5':'Asamblea','6':'Concejo'};
            var h2='<div class="small text-muted mb-2">'+d.candidatos.length+' candidatos en Cuentas Claras ('+d.orgs+' org)</div>';
            h2+='<div class="table-responsive"><table class="table table-sm table-hover table-striped">';
            h2+='<thead class="table-dark"><tr><th>Candidato</th><th>Cédula</th><th>Corporación</th><th>Organización</th><th>Documentos</th></tr></thead><tbody>';
            d.candidatos.forEach(function(c,i){
              var corp=corpLabel2[String(c.corp_id)]||c.corp||'';
              h2+='<tr><td class="fw-semibold">'+esc(c.nombre||'')+'</td>';
              h2+='<td>'+esc(c.cedula||'—')+'</td>';
              h2+='<td><span class="badge bg-success">'+esc(corp)+'</span></td>';
              h2+='<td><small>'+esc(c.org||'')+'</small></td>';
              h2+='<td><button class="btn btn-sm btn-outline-info" onclick="_ccVerDocsP1('+i+')"><i class="fa fa-folder-open me-1"></i>Ver</button></td></tr>';
            });
            h2+='</tbody></table></div>';
            h2+='<div id="ccDocPanelP1" class="card mt-3" style="display:none"><div class="card-header bg-info text-white fw-bold" id="ccDocTitleP1"></div><div class="card-body" id="ccDocBodyP1"></div></div>';
            el.innerHTML=h2;
          } else {
            el.innerHTML='<div class="alert alert-warning"><i class="fa fa-exclamation-triangle me-1"></i>No se encontraron candidatos de '+esc(_cSel)+' en CC. '+(d.error||'')+'</div>';
          }
        }).catch(function(e){
          el.innerHTML='<div class="alert alert-danger">Error buscando candidatos: '+e+'</div>';
        });
      return;
    }
  }

  // Guardar lista filtrada (la misma variable que usa _ccVerDocsV2)
  window._ccListaFiltrada=lista;

  // Tabla de candidatos (misma presentación módulo 13)
  var corpLabel={'2':'Gobernación','3':'Alcaldía','5':'Asamblea','6':'Concejo'};
  var html='<div class="small text-muted mb-2">'+lista.length+' candidatos en Cuentas Claras</div>';
  html+='<div class="table-responsive"><table class="table table-sm table-hover table-striped">';
  html+='<thead class="table-dark"><tr><th>Candidato</th><th>Cédula</th><th>Corporación</th><th>Organización</th><th>Documentos</th></tr></thead><tbody>';
  lista.forEach(function(c,i){
    var corp=corpLabel[String(c.corp_id)]||c.corp||'';
    html+='<tr>';
    html+='<td class="fw-semibold">'+esc(c.nombre||'')+'</td>';
    html+='<td>'+esc(c.cedula||'—')+'</td>';
    html+='<td><span class="badge bg-'+(c.corp_id===3?'primary':'success')+'">'+esc(corp)+'</span></td>';
    html+='<td><small>'+esc(c.org||'')+'</small></td>';
    html+='<td><button class="btn btn-sm btn-outline-info" onclick="_ccVerDocsP1('+i+')"><i class="fa fa-folder-open me-1"></i>Ver</button></td>';
    html+='</tr>';
  });
  html+='</tbody></table></div>';
  // Panel expandible para docs del candidato seleccionado
  html+='<div id="ccDocPanelP1" class="card mt-3" style="display:none">';
  html+='<div class="card-header bg-info text-white fw-bold" id="ccDocTitleP1"></div>';
  html+='<div class="card-body" id="ccDocBodyP1"></div></div>';
  el.innerHTML=html;
}

// Ver docs de un candidato en Paso 1 (reutiliza la lógica de _ccVerDocsV2)
function _ccVerDocsP1(idx){
  var c=window._ccListaFiltrada[idx];
  if(!c) return;
  var dpto=window._ccDptoEntry, mun=window._ccMunEntry;
  if(!dpto||!mun) return;

  var panel=document.getElementById('ccDocPanelP1');
  var title=document.getElementById('ccDocTitleP1');
  var body=document.getElementById('ccDocBodyP1');

  title.innerHTML='<i class="fa fa-user me-1"></i>'+esc(c.nombre)+' — '+esc(c.org);
  body.innerHTML='<div class="text-center p-3"><i class="fa fa-spinner fa-spin fa-2x"></i><br>Consultando 8B + Historiales + Ingresos + Gastos...</div>';
  panel.style.display='block';
  panel.scrollIntoView({behavior:'smooth'});

  var p={cand_id:c.cand_id, corp_id:c.corp_id, circ_id:c.circ_id,
    tipo_id:c.tipo_id, org_id:c.org_id, dpto_id:dpto.id, mun_id:mun.id};

  var qHist='idtipo_organi='+p.tipo_id+'&id_organizacion='+p.org_id+
    '&id_corporacion='+p.corp_id+'&id_circunscripcion='+p.circ_id+
    '&id_departamento='+p.dpto_id+'&id_municipio='+p.mun_id+
    '&id_proceso='+PROCESO_ID_CC+'&id_candidato='+p.cand_id;

  var qIG='id_candi='+p.cand_id+'&id_corporacion='+p.corp_id+'&id_circunscripcion='+p.circ_id+
    '&id_departamento='+p.dpto_id+'&id_municipio='+p.mun_id+'&id_proceso='+PROCESO_ID_CC;

  Promise.all([
    _ccFetchJSON('/api/cne/consultaConsolidado?idCandidato='+p.cand_id+'&id_proceso='+PROCESO_ID_CC),
    _ccFetchJSON('/api/cne/ingresos-campana?id_candi='+p.cand_id+'&id_corporacion='+p.corp_id+'&id_circunscripcion='+p.circ_id+'&id_departamento='+p.dpto_id+'&id_municipio='+p.mun_id+'&id_proceso='+PROCESO_ID_CC),
    _ccFetchJSON('/api/cne/gastos-campana?id_candi='+p.cand_id+'&id_corporacion='+p.corp_id+'&id_circunscripcion='+p.circ_id+'&id_departamento='+p.dpto_id+'&id_municipio='+p.mun_id+'&id_proceso='+PROCESO_ID_CC),
    _ccFetchJSON('/api/cne/envio?page=1&buscar=&criterio=radicado&'+qHist),
    _ccFetchJSON('/api/cne/devolucionInformes?page=1&'+qHist),
    _ccFetchJSON('/api/cne/respuestaInformes/cuentas?page=1&'+qHist),
    _ccFetchJSON('/api/cne/ingreso/listarIngresos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG),
    _ccFetchJSON('/api/cne/gasto/listarGastos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG)
  ]).then(function(results){
    var consolidados=Array.isArray(results[0])?results[0]:[];
    var ingresos8b=Array.isArray(results[1])?results[1]:[];
    var gastos8b=Array.isArray(results[2])?results[2]:[];
    var r3=results[3]; var envios=[];
    if(r3){var ei=r3.envioInforme; envios=ei?(ei.data||ei):[]; if(!Array.isArray(envios)) envios=[];}
    var r4=results[4]; var devoluciones=r4&&r4.cuenta?r4.cuenta:(Array.isArray(r4)?r4:[]);
    var r5=results[5]; var respuestas=r5&&r5.cuenta?r5.cuenta:(Array.isArray(r5)?r5:[]);
    var r6=results[6]; var gIngItems=(r6&&r6.ingreso&&r6.ingreso.data)?r6.ingreso.data:(Array.isArray(r6)?r6:[]);
    var r7=results[7]; var gGasItems=(r7&&r7.gasto&&r7.gasto.data)?r7.gasto.data:(Array.isArray(r7)?r7:[]);

    // Paginar resto
    var extraPromises=[], extraMeta=[];
    var gIngLP=(r6&&r6.ingreso&&r6.ingreso.last_page)?r6.ingreso.last_page:1;
    var gGasLP=(r7&&r7.gasto&&r7.gasto.last_page)?r7.gasto.last_page:1;
    for(var pg=2;pg<=gIngLP&&pg<=20;pg++){extraMeta.push('ing');extraPromises.push(_ccFetchJSON('/api/cne/ingreso/listarIngresos?page='+pg+'&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG));}
    for(var pg2=2;pg2<=gGasLP&&pg2<=20;pg2++){extraMeta.push('gas');extraPromises.push(_ccFetchJSON('/api/cne/gasto/listarGastos?page='+pg2+'&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG));}

    return Promise.all(extraPromises).then(function(extraResults){
    extraMeta.forEach(function(t,i){
      var er=extraResults[i];
      if(t==='ing'&&er&&er.ingreso&&er.ingreso.data) gIngItems=gIngItems.concat(er.ingreso.data);
      if(t==='gas'&&er&&er.gasto&&er.gasto.data) gGasItems=gGasItems.concat(er.gasto.data);
    });

    var html='';
    html+='<div class="mb-3 p-2 bg-light rounded"><strong>'+esc(c.nombre)+'</strong> — '+esc(c.org)+'<br>';
    html+='<small class="text-muted">Corp: '+esc(c.corp)+' | Cédula: '+esc(c.cedula||'N/D')+'</small></div>';

    // CANDIDATO 8B
    html+='<div class="card mb-3" style="border-color:#0d6efd"><div class="card-header text-white fw-bold" style="background:#0d6efd">';
    html+='<i class="fa fa-user me-1"></i>Candidato — 8B, Anexos Ingresos y Gastos</div><div class="card-body">';
    html+='<div class="mb-3"><h6 class="fw-bold"><i class="fa fa-book me-1 text-primary"></i>Libro Contable Campaña</h6>';
    html+='<div class="d-flex gap-2">';
    html+='<a href="/api/cne/libroContableCampana?id_candi='+p.cand_id+'&id_proceso='+PROCESO_ID_CC+'&boton=2" target="_blank" class="btn btn-sm btn-outline-danger"><i class="fa fa-file-pdf me-1"></i>PDF</a>';
    html+='<a href="/api/cne/libroContableCampana?id_candi='+p.cand_id+'&id_proceso='+PROCESO_ID_CC+'&boton=1" target="_blank" class="btn btn-sm btn-outline-success"><i class="fa fa-file-excel me-1"></i>Excel</a>';
    html+='</div></div>';
    html+=_ccRenderList('Consolidados 8B','fa-file-alt text-info',consolidados,function(f){
      return '/api/cne/descargar-consolidado?id='+f.id+'&rol=contador&tipoOrganizacion='+p.tipo_id+'&idOrganizacion='+p.org_id+'&idCandidato='+p.cand_id+'&idCorporacion='+p.corp_id+'&idCircunscripcion='+p.circ_id+'&idDepartamento='+p.dpto_id+'&idMunicipio='+p.mun_id+'&id_proceso='+PROCESO_ID_CC;
    });
    html+=_ccRenderList('Anexos Ingresos','fa-arrow-circle-down text-success',ingresos8b,function(f){
      return '/api/cne/descargar-archivo-ingreso?id='+f.id+'&id_candi='+p.cand_id+'&id_proceso='+PROCESO_ID_CC;
    });
    html+=_ccRenderList('Anexos Gastos','fa-arrow-circle-up text-danger',gastos8b,function(f){
      return '/api/cne/descargar-archivo-gasto?id='+f.id+'&id_candi='+p.cand_id+'&id_proceso='+PROCESO_ID_CC;
    });
    html+='</div></div>';

    // GESTIONAR INGRESOS
    html+='<div class="card mb-3 border-success"><div class="card-header bg-success text-white fw-bold">';
    html+='<i class="fa fa-arrow-circle-down me-1"></i>Gestionar Ingresos De Campaña <span class="badge bg-light text-dark">'+gIngItems.length+'</span>';
    html+='</div><div class="card-body">';
    if(gIngItems.length){
      html+='<div class="list-group list-group-flush">';
      gIngItems.forEach(function(it){
        var nombre=it.nom_formato||it.nom_ingreso||it.nombre||'Ingreso';
        var archivo=it.archivo||'';
        html+='<div class="list-group-item d-flex justify-content-between align-items-center">';
        html+='<span><i class="fa fa-file-alt text-success me-2"></i>'+esc(it.codigo||'')+' — '+esc(nombre)+'</span>';
        if(archivo) html+='<a href="#" onclick="_ccOpenDoc(\'/api/cne/storage/app/\'+encodeURI(archivo),\'Soporte PDF\');return false" class="btn btn-sm btn-outline-danger"><i class="fa fa-file-pdf me-1"></i>PDF</a>';
        html+='</div>';
      });
      html+='</div>';
    } else { html+='<div class="text-muted small">Sin ingresos registrados</div>'; }
    html+='</div></div>';

    // GESTIONAR GASTOS
    html+='<div class="card mb-3 border-danger"><div class="card-header bg-danger text-white fw-bold">';
    html+='<i class="fa fa-arrow-circle-up me-1"></i>Gestionar Gastos De Campaña <span class="badge bg-light text-dark">'+gGasItems.length+'</span>';
    html+='</div><div class="card-body">';
    if(gGasItems.length){
      html+='<div class="list-group list-group-flush">';
      gGasItems.forEach(function(it){
        var nombre=it.nom_formato||it.nom_gasto||it.nombre||'Gasto';
        var archivo=it.archivo||'';
        html+='<div class="list-group-item d-flex justify-content-between align-items-center">';
        html+='<span><i class="fa fa-file-alt text-danger me-2"></i>'+esc(it.codigo||'')+' — '+esc(nombre)+'</span>';
        if(archivo) html+='<a href="#" onclick="_ccOpenDoc(\'/api/cne/storage/app/\'+encodeURI(archivo),\'Soporte PDF\');return false" class="btn btn-sm btn-outline-danger"><i class="fa fa-file-pdf me-1"></i>PDF</a>';
        html+='</div>';
      });
      html+='</div>';
    } else { html+='<div class="text-muted small">Sin gastos registrados</div>'; }
    html+='</div></div>';

    // INFORME DE CAMPAÑA
    html+='<div class="card mb-3 border-secondary"><div class="card-header bg-secondary text-white fw-bold">';
    html+='<i class="fa fa-file-alt me-1"></i>Informe De Campaña — Envío / Devolución / Respuesta</div><div class="card-body">';
    html+='<div class="mb-3"><h6 class="fw-bold"><i class="fa fa-paper-plane me-1 text-primary"></i>Envíos <span class="badge bg-secondary">'+envios.length+'</span></h6>';
    if(envios.length){
      html+='<div class="list-group list-group-flush">';
      envios.forEach(function(e,ei){
        var eid=e.id||e.informe_id||'';
        var radicado=e.radicado||e.radicado_final||e.numero_radicado||'';
        var fecha=e.fecha_final||e.created_at||e.fecha||'';
        var histId=e.historico||'';
        var _urlFmt3='/api/cne/imprimirFormato?id='+eid+'&id_proceso='+PROCESO_ID_CC;
        var _urlRad3='/api/cne/descargarFormatoRadicacion?id='+eid+'&id_proceso='+PROCESO_ID_CC;
        html+='<div class="list-group-item">';
        html+='<div class="d-flex justify-content-between align-items-center">';
        html+='<span><i class="fa fa-file-alt text-primary me-2"></i>Rad: '+esc(radicado)+' <small class="text-muted">'+esc(fecha)+'</small></span>';
        html+='<div class="d-flex gap-1">';
        html+='<a href="'+_urlFmt3+'" target="_blank" onclick="_ccOpenDoc(\''+_urlFmt3+'\',\'Formato\');return false" class="btn btn-sm btn-outline-primary"><i class="fa fa-file-alt me-1"></i>Formato</a>';
        html+='<a href="'+_urlRad3+'" target="_blank" onclick="_ccOpenDoc(\''+_urlRad3+'\',\'Radicación\');return false" class="btn btn-sm btn-outline-info"><i class="fa fa-stamp me-1"></i>Radicación</a>';
        if(histId) html+='<button class="btn btn-sm btn-outline-warning" onclick="_ccVerHistorico('+histId+',this)"><i class="fa fa-history me-1"></i>Histórico</button>';
        html+='</div></div>';
        if(histId) html+='<div id="ccHistP1_'+histId+'" style="display:none" class="mt-2"></div>';
        html+='</div>';
      });
      html+='</div>';
    } else { html+='<div class="text-muted small">Sin envíos registrados</div>'; }
    html+='</div>';
    html+='<div class="mb-3"><h6 class="fw-bold"><i class="fa fa-undo me-1 text-danger"></i>Devoluciones <span class="badge bg-secondary">'+devoluciones.length+'</span></h6>';
    if(devoluciones.length){
      html+='<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
      devoluciones.forEach(function(d){html+='<tr><td><small>'+esc(d.created_at||d.fecha||'')+'</small></td><td><small>'+esc(d.observacion||d.motivo||'—')+'</small></td></tr>';});
      html+='</tbody></table></div>';
    } else { html+='<div class="text-muted small">Sin devoluciones</div>'; }
    html+='</div>';
    html+='<div class="mb-3"><h6 class="fw-bold"><i class="fa fa-reply me-1 text-success"></i>Respuestas <span class="badge bg-secondary">'+respuestas.length+'</span></h6>';
    if(respuestas.length){
      html+='<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
      respuestas.forEach(function(r2){html+='<tr><td><small>'+esc(r2.created_at||r2.fecha||'')+'</small></td><td><small>'+esc(r2.observacion||r2.respuesta||'—')+'</small></td></tr>';});
      html+='</tbody></table></div>';
    } else { html+='<div class="text-muted small">Sin respuestas</div>'; }
    html+='</div>';
    html+='</div></div>';

    body.innerHTML=html;
    }); // cierra .then paginación extra
  }).catch(function(e){
    body.innerHTML='<div class="alert alert-danger"><i class="fa fa-times-circle me-1"></i>Error: '+e+'</div>';
  });
}

// ── Histórico de un envío (Ingresos, Gastos, Consolidado, Obligaciones) ──
function _ccVerHistorico(historicoId, btnEl, candId){
  // Buscar el div contenedor del histórico (puede ser ccHist13_ o ccHistP1_)
  var panel = document.getElementById('ccHist13_'+historicoId) || document.getElementById('ccHistP1_'+historicoId);
  if(!panel) return;
  if(panel.style.display !== 'none'){ panel.style.display='none'; return; }
  panel.style.display='block';
  panel.innerHTML='<div class="text-center p-2"><i class="fa fa-spinner fa-spin"></i> Cargando histórico...</div>';
  _ccFetchJSON('/api/cne/getHistoricoIngresosGastosCandidatos?informe='+historicoId).then(function(data){
    if(!data || data.ok===false){
      panel.innerHTML='<div class="alert alert-warning py-1 small">No se pudo cargar el histórico</div>';
      return;
    }
    var h='', tid='ht'+historicoId;
    h+='<ul class="nav nav-tabs nav-fill small" role="tablist">';
    h+='<li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#'+tid+'_ing">Ingresos</a></li>';
    h+='<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#'+tid+'_gas">Gastos</a></li>';
    h+='<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#'+tid+'_con">Consolidado</a></li>';
    h+='<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#'+tid+'_obl">Obligaciones</a></li>';
    h+='</ul>';
    h+='<div class="tab-content border border-top-0 p-2">';

    function renderFormatos(seccion, tabId, label, printEndpoint){
      var items=[], keys=[];
      if(Array.isArray(seccion)){
        seccion.forEach(function(it,i){ items.push(it); keys.push(i); });
      } else if(seccion && typeof seccion==='object'){
        for(var k in seccion){ items.push(seccion[k]); keys.push(k); }
      }
      var isFirst=(label==='Ingresos');
      var out='<div class="tab-pane'+(isFirst?' show active':'')+'" id="'+tabId+'">';
      if(!items.length){
        out+='<div class="text-muted small py-2">Sin '+label.toLowerCase()+'</div>';
      } else {
        out+='<div class="table-responsive"><table class="table table-sm table-striped mb-0">';
        out+='<thead class="table-light"><tr><th style="width:50px">Ver</th><th>Código</th><th>Formato</th><th>Nombre del Formato</th></tr></thead><tbody>';
        items.forEach(function(it,i){
          var det=it.detalle||{};
          var datos=(it.impresion||{}).datos||{};
          var codigo=det.codigo||datos.codigo||'';
          var formato=det.formato||datos.no_formato||'';
          var nombre=det.nombre_formato||datos.nombre||'';
          var idFormato=det.id_formato||datos.id||keys[i]||'';
          var pdfUrl='';
          if(printEndpoint==='consolidado'){
            pdfUrl='/api/cne/imprimirFormatoConsolidadoCandidato?id_informe='+historicoId+(candId?'&id_candidato='+candId:'');
          } else {
            pdfUrl='/api/cne/'+printEndpoint+'?id_informe='+historicoId+(candId?'&id_candidato='+candId:'')+'&id_formato='+idFormato;
          }
          out+='<tr>';
          out+='<td><a href="'+pdfUrl+'" target="_blank" class="btn btn-sm btn-outline-danger p-0 px-1"><i class="fa fa-file-pdf"></i></a></td>';
          out+='<td class="small">'+esc(codigo)+'</td>';
          out+='<td class="small">'+esc(formato)+'</td>';
          out+='<td class="small">'+esc(nombre)+'</td>';
          out+='</tr>';
        });
        out+='</tbody></table></div>';
      }
      out+='</div>';
      return out;
    }
    h+=renderFormatos(data.ingresos, tid+'_ing', 'Ingresos', 'imprimirFormatoIngresoCandidato');
    h+=renderFormatos(data.gastos, tid+'_gas', 'Gastos', 'imprimirFormatoGastoCandidato');
    h+=renderFormatos(data.consolidado, tid+'_con', 'Consolidado', 'consolidado');
    h+=renderFormatos(data.obligaciones, tid+'_obl', 'Obligaciones', 'imprimirFormatoObligacionCandidato');
    h+='</div>';
    panel.innerHTML=h;
  }).catch(function(e){
    panel.innerHTML='<div class="alert alert-danger py-1 small">Error: '+e+'</div>';
  });
}

// ── Histórico de un envío de ORGANIZACIÓN (9B: Ingresos, Gastos, Consolidado, Obligaciones) ──
function _ccVerHistoricoOrg(historicoId, btnEl){
  var panel = document.getElementById('ccHistOrg13_'+historicoId) || document.getElementById('ccHistOrgP1_'+historicoId);
  if(!panel) return;
  if(panel.style.display !== 'none'){ panel.style.display='none'; return; }
  panel.style.display='block';
  panel.innerHTML='<div class="text-center p-2"><i class="fa fa-spinner fa-spin"></i> Cargando histórico organización...</div>';
  _ccFetchJSON('/api/cne/getHistoricoIngresosGastosOrganizaciones?informe='+historicoId).then(function(data){
    if(!data || data.ok===false){
      panel.innerHTML='<div class="alert alert-warning py-1 small">No se pudo cargar el histórico</div>';
      return;
    }
    var h='', tid='hto'+historicoId;
    h+='<ul class="nav nav-tabs nav-fill small" role="tablist">';
    h+='<li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#'+tid+'_ing">Ingresos</a></li>';
    h+='<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#'+tid+'_gas">Gastos</a></li>';
    h+='<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#'+tid+'_con">Consolidado</a></li>';
    h+='<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#'+tid+'_obl">Obligaciones</a></li>';
    h+='</ul>';
    h+='<div class="tab-content border border-top-0 p-2">';

    function renderFormatos(seccion, tabId, label, printEndpoint){
      var items=[], keys=[];
      if(Array.isArray(seccion)){
        seccion.forEach(function(it,i){ items.push(it); keys.push(i); });
      } else if(seccion && typeof seccion==='object'){
        for(var k in seccion){ items.push(seccion[k]); keys.push(k); }
      }
      var isFirst=(label==='Ingresos');
      var out='<div class="tab-pane'+(isFirst?' show active':'')+'" id="'+tabId+'">';
      if(!items.length){
        out+='<div class="text-muted small py-2">Sin '+label.toLowerCase()+'</div>';
      } else {
        out+='<div class="table-responsive"><table class="table table-sm table-striped mb-0">';
        out+='<thead class="table-light"><tr><th style="width:50px">Ver</th><th>Código</th><th>Formato</th><th>Nombre del Formato</th></tr></thead><tbody>';
        items.forEach(function(it,i){
          var det=it.detalle||{};
          var datos=(it.impresion||{}).datos||{};
          var codigo=det.codigo||datos.codigo||'';
          var formato=det.formato||datos.no_formato||'';
          var nombre=det.nombre_formato||det.nombre||datos.nombre||'';
          var idFormato=det.id_formato||datos.id||keys[i]||'';
          var pdfUrl='';
          if(printEndpoint==='consolidado'){
            pdfUrl='/api/cne/imprimirFormatoConsolidadoOrganizacion?id_informe='+historicoId+'&id_formato='+idFormato;
          } else {
            pdfUrl='/api/cne/'+printEndpoint+'?id_informe='+historicoId+'&id_formato='+idFormato;
          }
          out+='<tr>';
          out+='<td><a href="'+pdfUrl+'" target="_blank" class="btn btn-sm btn-outline-danger p-0 px-1"><i class="fa fa-file-pdf"></i></a></td>';
          out+='<td class="small">'+esc(codigo)+'</td>';
          out+='<td class="small">'+esc(formato)+'</td>';
          out+='<td class="small">'+esc(nombre)+'</td>';
          out+='</tr>';
        });
        out+='</tbody></table></div>';
      }
      out+='</div>';
      return out;
    }
    h+=renderFormatos(data.ingresosO, tid+'_ing', 'Ingresos', 'imprimirFormatoIngresoOrganizacion');
    h+=renderFormatos(data.gastosO, tid+'_gas', 'Gastos', 'imprimirFormatoGastoOrganizacion');
    h+=renderFormatos(data.consolidadosO, tid+'_con', 'Consolidado', 'consolidado');
    h+=renderFormatos(data.obligacionesO, tid+'_obl', 'Obligaciones', 'imprimirFormatoObligacionesOrganizacion');
    h+='</div>';
    panel.innerHTML=h;
  }).catch(function(e){
    panel.innerHTML='<div class="alert alert-danger py-1 small">Error: '+e+'</div>';
  });
}

function _cargarGestionMunEnPaso1(){
  var panel=document.getElementById('resGestionMunP1');
  if(!panel) return;

  var dptoVal=norm(document.getElementById('selDpto').value||'');
  var munVal=norm(document.getElementById('selMun').value||'');
  if(!dptoVal||!munVal){ panel.style.display='none'; return; }

  // Asegurar índice CC cargado
  if(!_ccIndex){
    panel.style.display='block';
    panel.innerHTML='<div class="text-center p-2"><i class="fa fa-spinner fa-spin me-1"></i>Cargando índice CC...</div>';
    fetch('data/cuentas_claras_index.json').then(function(r){return r.json();}).then(function(idx){
      _ccIndex=idx;
      _cargarGestionMunEnPaso1();
    }).catch(function(){ panel.innerHTML='<div class="text-muted small">Sin índice CC</div>'; });
    return;
  }

  // Resolver dpto y mun en el índice CC
  var dptoEntry=null;
  Object.keys(_ccIndex).forEach(function(k){
    if(norm(k)===dptoVal||norm(_ccIndex[k].nombre||'')===dptoVal) dptoEntry=_ccIndex[k];
  });
  if(!dptoEntry){ panel.style.display='none'; return; }

  var munEntry=null;
  var munValBase=munVal.replace(/\s*\(.*\)\s*/g,'').trim();
  Object.keys(dptoEntry.municipios||{}).forEach(function(k){
    var kN=norm(k), kNom=norm(dptoEntry.municipios[k].nombre||'');
    if(kN===munVal||kNom===munVal||kN===munValBase||kNom===munValBase||munVal.indexOf(kN)===0||munVal.indexOf(kNom)===0) munEntry=dptoEntry.municipios[k];
  });
  // Para departamentales (Asamblea/Gobernación), buscar en _DPTO_
  if(!munEntry){
    var corpSelG=(document.getElementById('selCorp').value||'').toUpperCase();
    var isDptlG=(corpSelG.indexOf('ASAMBLEA')!==-1||corpSelG.indexOf('GOBERN')!==-1||corpSelG.indexOf('DIPUTA')!==-1||
      munVal.indexOf('NO APLICA')!==-1||munVal.indexOf('DEPARTAMENTAL')!==-1||munVal==='');
    if(isDptlG){
      munEntry=(dptoEntry.municipios||{})['_DPTO_']||null;
      // Si no hay _DPTO_, crear entrada sintética para que la gestión municipal funcione con el API
      if(!munEntry){
        munEntry={nombre:dptoVal+' (Departamental)',candidatos:[],id:dptoEntry.id||0,_sintetico:true};
      }
    }
  }
  if(!munEntry){ panel.style.display='none'; return; }

  // Setear variables globales que usa _ccCargarGestionMunicipio
  window._ccDptoEntry=dptoEntry;
  window._ccMunEntry=munEntry;
  _ccCandsMun=(munEntry.candidatos||[]).slice();

  // Mostrar panel y llamar la misma función del módulo 13 pero redirigida a este panel
  panel.style.display='block';
  // Temporalmente redirigir ccGestionPanel a nuestro panel
  var realPanel=document.getElementById('ccGestionPanel');
  var tempDiv=document.createElement('div');
  tempDiv.id='ccGestionPanel';
  panel.innerHTML='';
  panel.appendChild(tempDiv);
  // Crear ccZipMunPanel temporal si no existe dentro
  var tempZip=document.createElement('div');
  tempZip.id='ccZipMunPanel_p1';
  tempZip.style.display='none';
  panel.appendChild(tempZip);

  // Llamar la función original del módulo 13
  _ccCargarGestionMunicipio_p1(tempDiv);
}

function _ccCargarGestionMunicipio_p1(gPanel){
  if(!gPanel) return;

  var filtroPartido=norm(document.getElementById('selPartido').value||'');
  var filtroCorp=(document.getElementById('selCorp').value||'').toUpperCase();

  gPanel.style.display='block';
  gPanel.innerHTML='<div class="text-center p-3"><i class="fa fa-spinner fa-spin fa-2x"></i><br>Consultando módulos de gestión (Dictamen · 9B · Acuerdos · Contador · Gerente · Auditor · Informe Org)...<br><small class="text-muted">El servidor pagina y filtra. Puede tardar unos segundos.</small></div>';

  var corpMapCC={'ALCALDIA':3,'CONCEJO':6,'ASAMBLEA':5,'GOBERNACION':2};
  var corpIdFiltro=corpMapCC[filtroCorp]||null;
  var orgsUnicas={};
  (_ccCandsMun||[]).forEach(function(c){
    if(corpIdFiltro&&c.corp_id!==corpIdFiltro) return;
    if(filtroPartido&&norm(c.org||'').indexOf(filtroPartido)<0) return;
    var key=c.org_id+'_'+c.corp_id+'_'+c.tipo_id;
    if(!orgsUnicas[key]) orgsUnicas[key]=c;
  });
  var orgsArr=Object.keys(orgsUnicas).map(function(k){ return orgsUnicas[k]; });

  var dptoValR=document.getElementById('selDpto').value||'';
  var munValR=document.getElementById('selMun').value||'';
  var corpValR=document.getElementById('selCorp').value||'';
  var partidoValR=document.getElementById('selPartido').value||'';
  var gestionUrl='/api/cne_gestion_filtrado?dpto='+encodeURIComponent(dptoValR)+
    '&mun='+encodeURIComponent(munValR)+
    '&corp='+encodeURIComponent(corpValR)+
    '&partido='+encodeURIComponent(partidoValR);

  var dpto=window._ccDptoEntry;
  var mun=window._ccMunEntry;
  var _dptoIdP1=(dpto&&dpto.id)?dpto.id:0;
  var _munIdP1=(mun&&mun.id&&!mun._sintetico)?mun.id:0;
  var org9bPromises=[];
  orgsArr.forEach(function(c){
    if(!_dptoIdP1) return;
    var q='idproceso='+PROCESO_ID_CC+'&idtipo_organi='+c.tipo_id+'&id_organizacion='+c.org_id+
      '&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
      '&id_departamento='+_dptoIdP1+'&id_municipio='+_munIdP1;
    org9bPromises.push(_ccFetchJSON('/api/cne/ingresos-partido?page=1&'+q));
    org9bPromises.push(_ccFetchJSON('/api/cne/gastos-partido?page=1&'+q));
    org9bPromises.push(_ccFetchJSON('/api/cne/obligaciones-partido?page=1&'+q));
  });

  var orgInfPromises=[];
  orgsArr.forEach(function(c){
    if(!_dptoIdP1) return;
    var qInfOrg='idtipo_organi='+c.tipo_id+'&id_organizacion='+c.org_id+
      '&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
      '&id_departamento='+_dptoIdP1+'&id_municipio='+_munIdP1+'&id_proceso='+PROCESO_ID_CC;
    orgInfPromises.push(_ccFetchJSON('/api/cne/envio-organizacion?page=1&buscar=&criterio=radicado&'+qInfOrg.replace('id_proceso=','idproceso=')));
    orgInfPromises.push(_ccFetchJSON('/api/cne/devolucionInformes?page=1&'+qInfOrg));
    orgInfPromises.push(_ccFetchJSON('/api/cne/respuestaInformes/cuentas?page=1&'+qInfOrg));
  });

  var n9b=org9bPromises.length;
  var _gestionPromiseP1=(function(){
    var c=new AbortController(),t=setTimeout(function(){c.abort();},180000);
    return fetch(gestionUrl,{signal:c.signal}).then(function(r){clearTimeout(t);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .catch(function(e){clearTimeout(t);console.warn('[Gestion P1 FAIL]',e);return {};});
  })();
  Promise.all([_gestionPromiseP1].concat(org9bPromises).concat(orgInfPromises)).then(function(results){
    var gestion=(results[0]&&!Array.isArray(results[0]))?results[0]:{};
    var html='';
    window._ccGestionMunData={
      dictamen:gestion.dictamen||[], coalicion:gestion.coalicion||[],
      contador:gestion.contador||[], gerente:gestion.gerente||[], auditor:gestion.auditor||[]
    };

    // 1. DICTAMEN (filtrar por corporación del Paso 1)
    var dictItemsAllP1=window._ccGestionMunData.dictamen;
    var dictItems=dictItemsAllP1;
    if(filtroCorp&&filtroCorp!=='TODOS'){
      var _ck=filtroCorp.toUpperCase();
      dictItems=dictItemsAllP1.filter(function(it){
        var cn=(it.corporacionNombre||'').toUpperCase();
        if(_ck==='ALCALDIA') return cn.indexOf('ALCALD')!==-1;
        if(_ck==='CONCEJO') return cn.indexOf('CONCEJO')!==-1;
        if(_ck==='ASAMBLEA') return cn.indexOf('ASAMBLEA')!==-1;
        if(_ck==='GOBERNACION') return cn.indexOf('GOBERN')!==-1;
        if(_ck==='JAL') return cn.indexOf('JUNTA')!==-1||cn.indexOf('JAL')!==-1;
        return true;
      });
    }
    html+='<div class="card mb-3 border-danger"><div class="card-header bg-danger text-white fw-bold">';
    html+='<i class="fa fa-gavel me-1"></i>Dictamen de Auditoría <span class="badge bg-light text-dark">'+dictItems.length+'</span>';
    html+='</div><div class="card-body">';
    html+=_ccRenderGestionItems(dictItems,'dictamen','dictamen_auditoria','dictamen_auditoria');
    html+='</div></div>';

    // 2. 9B Y ANEXOS
    var CONS_9B=[43,44,45,46,47,48,100];
    window._ccGestionMunData._9b_orgs=[];
    html+='<div class="card mb-3 border-success"><div class="card-header bg-success text-white fw-bold">';
    html+='<i class="fa fa-building me-1"></i>9B y Anexos — Informes de Organizaciones <span class="badge bg-light text-dark">'+orgsArr.length+' org(s)</span>';
    html+='</div><div class="card-body">';
    orgsArr.forEach(function(c,oi){
      var baseIdx=1+oi*3;
      var r0=results[baseIdx]; var ingresos9b=Array.isArray(r0)?r0:(r0&&r0.ingresos?r0.ingresos:[]);
      var r1=results[baseIdx+1]; var gastos9b=Array.isArray(r1)?r1:(r1&&r1.gastos?r1.gastos:[]);
      var r2=results[baseIdx+2]; var obligaciones=Array.isArray(r2)?r2:[];
      var q9b='idproceso='+PROCESO_ID_CC+'&idtipo_organi='+c.tipo_id+'&id_organizacion='+c.org_id+
        '&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
        '&id_departamento='+dpto.id+'&id_municipio='+mun.id;
      var libroQ='idtipo_organi='+c.tipo_id+'&id_organiza='+c.org_id+'&id_organizacion='+c.org_id+
        '&idproceso='+PROCESO_ID_CC+'&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
        '&id_departamento='+dpto.id+'&id_municipio='+mun.id;
      window._ccGestionMunData._9b_orgs.push({
        orgName:c.org,q9b:q9b,libroQ:libroQ,ingresos9b:ingresos9b,gastos9b:gastos9b,obligaciones:obligaciones,
        tipo_id:c.tipo_id,org_id:c.org_id,corp_id:c.corp_id,circ_id:c.circ_id
      });
      var corpLabel=c.corp_id===3?'Alcaldía':c.corp_id===2?'Gobernación':c.corp_id===5?'Asamblea':'Concejo';
      html+='<div class="border rounded p-2 mb-3">';
      html+='<h6 class="fw-bold text-success"><i class="fa fa-building me-1"></i>'+esc(c.org||'Organización')+' <span class="badge bg-secondary">'+corpLabel+'</span></h6>';
      html+='<div class="mb-2"><small class="fw-bold"><i class="fa fa-book me-1"></i>Libro Contable Organización</small> ';
      html+='<a href="/api/cne/libroContablePartido?'+libroQ+'&boton=2" target="_blank" class="btn btn-sm btn-outline-danger py-0"><i class="fa fa-file-pdf me-1"></i>PDF</a> ';
      html+='<a href="/api/cne/libroContablePartido?'+libroQ+'&boton=1" target="_blank" class="btn btn-sm btn-outline-success py-0"><i class="fa fa-file-excel me-1"></i>Excel</a></div>';
      html+='<div class="mb-2"><small class="fw-bold"><i class="fa fa-file-contract me-1"></i>Consolidados 9B</small>';
      html+='<div class="d-flex flex-wrap gap-1 mt-1">';
      CONS_9B.forEach(function(fid){
        var url='/api/cne/descargar-consolidado?id='+fid+'&rol=contador&idproceso='+PROCESO_ID_CC+
          '&idFormato='+fid+'&tipoOrganizacion='+c.tipo_id+'&idOrganizacion='+c.org_id+
          '&idCandidato=&idCorporacion='+c.corp_id+'&idCircunscripcion='+c.circ_id+
          '&idDepartamento='+dpto.id+'&idMunicipio='+mun.id;
        html+='<a href="'+url+'" target="_blank" class="btn btn-sm btn-outline-danger py-0">F'+fid+'</a>';
      });
      html+='</div></div>';
      html+=_ccRenderList('Ingresos Organización','fa-arrow-circle-down text-success',ingresos9b,function(f){
        return '/api/cne/descargar-archivo-ingreso-partido?id='+f.id+'&'+q9b;
      });
      html+=_ccRenderList('Gastos Organización','fa-arrow-circle-up text-danger',gastos9b,function(f){
        return '/api/cne/descargar-archivo-gasto-partido?id='+f.id+'&'+q9b;
      });
      html+=_ccRenderList('Obligaciones','fa-balance-scale text-warning',obligaciones,function(f){
        return '/api/cne/obligacionPartido/descargar?id='+f.id+'&'+q9b;
      });
      html+='</div>';
    });
    if(!orgsArr.length) html+='<div class="text-muted small">Sin organizaciones en este filtro</div>';
    html+='</div></div>';

    // 3. ACUERDOS (removido)

    // 5. GERENTE (removido)

    // 6. AUDITOR (removido)

    // 7. INFORME ORGANIZACIÓN POLÍTICA
    html+='<div class="card mb-3 border-dark"><div class="card-header bg-dark text-white fw-bold">';
    html+='<i class="fa fa-file-alt me-1"></i>Informe Organización Política <span class="badge bg-light text-dark">'+orgsArr.length+' org(s)</span>';
    html+='</div><div class="card-body">';
    window._ccGestionMunData._infOrg=[];
    orgsArr.forEach(function(c,oi){
      var infBaseIdx=1+n9b+oi*3;
      var rEnv=results[infBaseIdx], rDev=results[infBaseIdx+1], rResp=results[infBaseIdx+2];
      var envios=[]; if(rEnv){var ei=rEnv.envioInforme; envios=ei?(ei.data||ei):[]; if(!Array.isArray(envios)) envios=[];}
      var devoluciones=rDev&&rDev.cuenta?rDev.cuenta:(Array.isArray(rDev)?rDev:[]);
      var respuestas=rResp&&rResp.cuenta?rResp.cuenta:(Array.isArray(rResp)?rResp:[]);
      window._ccGestionMunData._infOrg.push({orgName:c.org,envios:envios,devoluciones:devoluciones,respuestas:respuestas,
        tipo_id:c.tipo_id,org_id:c.org_id,corp_id:c.corp_id,circ_id:c.circ_id});
      var corpLabel=c.corp_id===3?'Alcaldía':c.corp_id===2?'Gobernación':c.corp_id===5?'Asamblea':'Concejo';
      html+='<div class="border rounded p-2 mb-3">';
      html+='<h6 class="fw-bold text-dark"><i class="fa fa-building me-1"></i>'+esc(c.org||'Organización')+' <span class="badge bg-secondary">'+corpLabel+'</span></h6>';
      // Envíos
      html+='<div class="mb-2"><small class="fw-bold"><i class="fa fa-paper-plane me-1 text-primary"></i>Envíos <span class="badge bg-secondary">'+envios.length+'</span></small>';
      if(envios.length){
        html+='<div class="list-group list-group-flush mt-1">';
        envios.forEach(function(e){
          var eid=e.id||e.informe_id||'';
          var radicado=e.radicado||e.radicado_final||e.numero_radicado||'';
          var fecha=e.fecha_final||e.created_at||e.fecha||'';
          var histId=e.historico||'';
          var _urlFmt4='/api/cne/imprimirFormato?id='+eid+'&id_proceso='+PROCESO_ID_CC;
          var _urlRad4='/api/cne/descargarFormatoRadicacion?id='+eid+'&id_proceso='+PROCESO_ID_CC;
          html+='<div class="list-group-item py-1">';
          html+='<div class="d-flex justify-content-between align-items-center">';
          html+='<span><small>Rad: '+esc(radicado)+' <span class="text-muted">'+esc(fecha)+'</span></small></span>';
          html+='<div class="d-flex gap-1">';
          html+='<a href="'+_urlFmt4+'" target="_blank" onclick="_ccOpenDoc(\''+_urlFmt4+'\',\'Formato\');return false" class="btn btn-sm btn-outline-primary py-0"><i class="fa fa-file-alt me-1"></i>Formato</a>';
          html+='<a href="'+_urlRad4+'" target="_blank" onclick="_ccOpenDoc(\''+_urlRad4+'\',\'Radicación\');return false" class="btn btn-sm btn-outline-info py-0"><i class="fa fa-stamp me-1"></i>Radicación</a>';
          if(histId) html+='<button class="btn btn-sm btn-outline-warning py-0" onclick="_ccVerHistoricoOrg('+histId+',this)"><i class="fa fa-history me-1"></i>Histórico</button>';
          html+='</div></div>';
          if(histId) html+='<div id="ccHistOrgP1_'+histId+'" style="display:none" class="mt-2"></div>';
          html+='</div>';
        });
        html+='</div>';
      } else { html+='<div class="text-muted small">Sin envíos</div>'; }
      html+='</div>';
      // Devoluciones
      html+='<div class="mb-2"><small class="fw-bold"><i class="fa fa-undo me-1 text-danger"></i>Devoluciones <span class="badge bg-secondary">'+devoluciones.length+'</span></small>';
      if(devoluciones.length){
        html+='<div class="table-responsive mt-1"><table class="table table-sm table-striped mb-0"><thead><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
        devoluciones.forEach(function(d){ html+='<tr><td><small>'+esc(d.created_at||d.fecha||'')+'</small></td><td><small>'+esc(d.observacion||d.motivo||'—')+'</small></td></tr>'; });
        html+='</tbody></table></div>';
      } else { html+='<div class="text-muted small">Sin devoluciones</div>'; }
      html+='</div>';
      // Respuestas
      html+='<div class="mb-2"><small class="fw-bold"><i class="fa fa-reply me-1 text-success"></i>Respuestas <span class="badge bg-secondary">'+respuestas.length+'</span></small>';
      if(respuestas.length){
        html+='<div class="table-responsive mt-1"><table class="table table-sm table-striped mb-0"><thead><tr><th>Fecha</th><th>Observación</th></tr></thead><tbody>';
        respuestas.forEach(function(r){ html+='<tr><td><small>'+esc(r.created_at||r.fecha||'')+'</small></td><td><small>'+esc(r.observacion||r.respuesta||'—')+'</small></td></tr>'; });
        html+='</tbody></table></div>';
      } else { html+='<div class="text-muted small">Sin respuestas</div>'; }
      html+='</div>';
      html+='</div>';
    });
    if(!orgsArr.length) html+='<div class="text-muted small">Sin organizaciones en este filtro</div>';
    html+='</div></div>';

    gPanel.innerHTML=html;
    // Si hay candidatos departamentales pendientes, re-filtrar
    if(window._ccDptlPendingCorpId){
      var _pc=window._ccDptlPendingCorpId;
      delete window._ccDptlPendingCorpId;
      _ccFiltrarCandidatos(_pc, norm(document.getElementById('selPartido').value||''));
    }
    if(window._ccDptlPendingEl){
      var _pEl=window._ccDptlPendingEl, _pC=window._ccDptlPendingCands, _pD=window._ccDptlPendingDpto, _pM=window._ccDptlPendingMun;
      delete window._ccDptlPendingEl; delete window._ccDptlPendingCands; delete window._ccDptlPendingDpto; delete window._ccDptlPendingMun;
      _cargarSoportesCCEnLinea(_pEl, _pC, _pD, _pM);
    }
  }).catch(function(e){
    gPanel.innerHTML='<div class="alert alert-warning">Error cargando módulos: '+e+
      '<br><button class="btn btn-sm btn-outline-primary mt-2" onclick="_cargarGestionMunEnPaso1()">Reintentar</button></div>';
  });
}

function _buscarContadoresPorCandidatos(candsList, panelId){
  var el=document.getElementById(panelId||'ccContadorDinamico_p1');
  if(!el) return;
  if(!candsList||!candsList.length){ el.innerHTML='<span class="text-muted small">Sin candidatos</span>'; return; }
  // Extraer apellidos únicos para buscar
  var apellidos={};
  candsList.forEach(function(c){
    var parts=(c.nombre||'').trim().split(/\s+/);
    if(parts.length>=2){ var ap=parts[parts.length-1]; if(ap.length>=3) apellidos[ap.toUpperCase()]=true; }
    if(parts.length>=3){ var ap2=parts[parts.length-2]; if(ap2.length>=3) apellidos[ap2.toUpperCase()]=true; }
  });
  var apArr=Object.keys(apellidos);
  if(!apArr.length){ el.innerHTML='<span class="text-muted small">Sin apellidos para buscar</span>'; return; }
  // Buscar en lotes
  var allResults=[], idx=0;
  function buscarLote(){
    if(idx>=apArr.length){
      // Filtrar por cédulas de nuestros candidatos
      var cedulas={};
      candsList.forEach(function(c){ if(c.cedula) cedulas[c.cedula.replace(/\./g,'').trim()]=c; });
      var matched=[];
      allResults.forEach(function(ct){
        var docC=(ct.documentoC||'').replace(/\./g,'').trim();
        if(docC&&cedulas[docC]) matched.push(ct);
      });
      // Render
      var h='<span class="badge '+(matched.length?'bg-success':'bg-warning text-dark')+' mb-2">'+matched.length+' contadores encontrados</span>';
      if(matched.length){
        h+='<div class="table-responsive"><table class="table table-sm table-striped mb-0"><thead><tr><th>Candidato</th><th>Contador</th><th>T.P.</th><th>Docs</th></tr></thead><tbody>';
        matched.forEach(function(ct){
          h+='<tr><td class="small">'+esc((ct.nombreC||'')+' '+(ct.apellidosC||''))+'</td>';
          h+='<td class="small">'+esc((ct.nombreP||'')+' '+(ct.apellidosP||''))+'</td>';
          h+='<td class="small">'+esc(ct.num_tarjeta||'—')+'</td><td>';
          if(ct.soporte_acta) h+='<a href="#" onclick="_ccOpenDoc(\'/api/cne/storage/app/\'+encodeURI(ct.soporte_acta),\'Acta\');return false" class="btn btn-sm btn-outline-primary py-0 me-1">Acta</a>';
          if(ct.firma) h+='<a href="#" onclick="_ccOpenDoc(\'/api/cne/storage/app/\'+encodeURI(ct.firma),\'Firma\');return false" class="btn btn-sm btn-outline-secondary py-0">Firma</a>';
          h+='</td></tr>';
        });
        h+='</tbody></table></div>';
      }
      el.innerHTML=h;
      return;
    }
    var lote=apArr.slice(idx,idx+3);
    idx+=3;
    el.innerHTML='<span class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Buscando contadores ('+Math.min(idx,apArr.length)+'/'+apArr.length+' apellidos)...</span>';
    Promise.all(lote.map(function(ap){
      return _ccFetchJSON('/api/cne/contadorElectoral?page=1&buscar='+encodeURIComponent(ap)+'&criterio=nombre');
    })).then(function(results){
      results.forEach(function(r){
        var cands=(r&&r.candidatos&&r.candidatos.data)?r.candidatos.data:[];
        allResults=allResults.concat(cands);
      });
      setTimeout(buscarLote,200);
    }).catch(function(){ setTimeout(buscarLote,200); });
  }
  buscarLote();
}

function _ccDescargarTodoMun(){
  var dpto = window._ccDptoEntry;
  var mun = window._ccMunEntry;
  var cands = window._ccListaFiltrada || [];
  if(!dpto || !mun){ alert('Seleccione departamento y municipio primero.'); return; }
  if(!cands.length){ alert('No hay candidatos cargados. Busque un municipio primero.'); return; }

  var btn = document.getElementById('ccBtnDescargarTodo');
  if(!btn) return;
  btn.disabled = true;

  // Si gestión no se cargó, recargarla primero
  var gm = window._ccGestionMunData || {};
  var needGestion = !(gm.dictamen && gm.dictamen.length) && !(gm._9b_orgs && gm._9b_orgs.length);
  if(needGestion){
    btn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Recargando datos de gestión...';
    var dptoValR = document.getElementById('selDpto').value||'';
    var munValR = document.getElementById('selMun').value||'';
    var corpValR = document.getElementById('selCorp').value||'';
    var partidoValR = document.getElementById('selPartido').value||'';
    var gUrl = '/api/cne_gestion_filtrado?dpto='+encodeURIComponent(dptoValR)+
      '&mun='+encodeURIComponent(munValR)+'&corp='+encodeURIComponent(corpValR)+
      '&partido='+encodeURIComponent(partidoValR);
    var ctrl=new AbortController();
    var toid=setTimeout(function(){ctrl.abort();},120000);
    fetch(gUrl,{signal:ctrl.signal}).then(function(r){clearTimeout(toid);return r.json();}).then(function(g){
      if(g && typeof g==='object' && !Array.isArray(g)){
        window._ccGestionMunData = window._ccGestionMunData || {};
        if(g.dictamen) window._ccGestionMunData.dictamen = g.dictamen;
        if(g.gerente) window._ccGestionMunData.gerente = g.gerente;
        if(g.auditor) window._ccGestionMunData.auditor = g.auditor;
        if(g.coalicion) window._ccGestionMunData.coalicion = g.coalicion;
        console.log('[ZIP] Gestión recargada: dictamen='+((g.dictamen||[]).length)+' gerente='+((g.gerente||[]).length));
      }
      btn.disabled=false;
      _ccDescargarTodoMun();
    }).catch(function(e){
      clearTimeout(toid);
      console.warn('[ZIP] No se pudo recargar gestión:',e);
      btn.disabled=false;
      _ccDescargarTodoMunReal();
    });
    return;
  }
  // Cargar índices del Visor si no están cargados
  if(VISOR_INDEX===null || VISOR_MAPEO===null){
    btn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Cargando índices del visor...';
    var _vPending=2, _vDone=function(){
      _vPending--;
      if(_vPending<=0){ btn.innerHTML='<i class="fa fa-download me-1"></i>Descargar ZIP (Cuentas Claras)'; _ccDescargarTodoMunReal(); }
    };
    _cargarVisorIndex(_vDone);
    _cargarVisorMapeo(_vDone);
    return;
  }
  _ccDescargarTodoMunReal();
}

function _ccDescargarTodoMunReal(){
  var gm = window._ccGestionMunData || {};
  var dpto = window._ccDptoEntry;
  var mun = window._ccMunEntry;
  var cands = window._ccListaFiltrada || [];
  if(!dpto || !mun) return;

  var files = [];
  var munName = (mun.nombre||'MUN').replace(/[^a-zA-Z0-9]/g,'_').substring(0,25);
  var dptoVal = document.getElementById('selDpto').value||'';
  var munVal = document.getElementById('selMun').value||'';
  var corpVal = document.getElementById('selCorp').value||'';

  // ═══ NIVEL MUNICIPAL ═══

  // 0. Certificado Electoral (local)
  (function(){
    var cargoN = corpVal.toUpperCase().indexOf('ALCALD')!==-1?'ALCALDIA':
                 corpVal.toUpperCase().indexOf('CONCEJO')!==-1?'CONCEJO':'ALCALDIA';
    var certPath = _findCertPath(dptoVal, munVal, cargoN);
    if(certPath){
      var fname=decodeURIComponent(certPath.split('/').pop());
      files.push({url:'data/'+certPath, folder:'00_Certificado_Electoral', name:fname});
    }
  })();

  // 0b. Documentos del Visor (E6/E7/E8 locales)
  (function(){
    if(!VISOR_INDEX||!Object.keys(VISOR_INDEX).length) return;
    var dNorm=(dptoVal||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var visorDept=_VISOR_DEPT[dNorm]||'';
    if(!visorDept){ for(var vk in _VISOR_DEPT){ if(dNorm.indexOf(vk)!==-1||vk.indexOf(dNorm)!==-1){visorDept=_VISOR_DEPT[vk];break;} } }
    var deptData=visorDept?VISOR_INDEX[visorDept]:null;
    if(!deptData) return;
    var corpNorm=corpVal.toUpperCase().replace(/[^A-Z]/g,'');
    var cargoCodes=[];
    for(var ck in _VISOR_CARGO){ if(corpNorm.indexOf(ck)!==-1||ck.indexOf(corpNorm)!==-1) cargoCodes=_VISOR_CARGO[ck]; }
    var munNorm=(munVal||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,'').trim();
    var filteredMuns=null;
    if(munNorm && VISOR_MAPEO && VISOR_MAPEO[visorDept]){
      var mapDept=VISOR_MAPEO[visorDept]; filteredMuns=[];
      for(var mc in mapDept){ if(mc==='_dept_nombre') continue;
        var mnV=(mapDept[mc]||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,'').trim();
        if(mnV.indexOf(munNorm)!==-1||munNorm.indexOf(mnV)!==-1) filteredMuns.push(mc);
      }
    }
    var _vGroups=VISOR_INDEX._groups||{};
    var allowedGids=[];
    (cands||[]).forEach(function(cx){
      var p=norm(cx.partido||cx.org||'');
      if(p){ for(var gk in _vGroups){ if(norm(_vGroups[gk])===p){allowedGids.push(parseInt(gk));break;} } }
    });
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
              var isMatch=!allowedGids.length||allowedGids.indexOf(ar.g)!==-1;
              if(isMatch){
                files.push({url:'vsr/'+visorDept+'/'+munCode+'/'+parCode+'/'+carCode+'/'+encodeURIComponent(ar.f),
                  folder:'00_Visor_'+ar.e, name:ar.f});
              }
            }
          }
        }
      }
    }
  })();

  // 1. Dictamen
  (gm.dictamen||[]).forEach(function(item){
    var archivo = item.dictamen_auditoria||item.archivo||'';
    var archNombre = archivo ? archivo.split('/').pop() : '';
    if(archNombre){
      var dictUrl=archivo.indexOf('/')!==-1?'/api/cne/storage/app/'+encodeURI(archivo):'/api/cne/storage/app/archivos/dictamen_auditoria/'+encodeURIComponent(archNombre);
      files.push({url:dictUrl, folder:'01_Dictamen', name:archNombre});
    }
  });

  // 2. 9B y Anexos
  var CONS_9B_ZIP = [43,44,45,46,47,48,100];
  (gm._9b_orgs||[]).forEach(function(org){
    var of2 = '02_9B_'+esc(org.orgName||'Org').replace(/[^a-zA-Z0-9]/g,'_').substring(0,30);
    files.push({url:'/api/cne/libroContablePartido?'+org.libroQ+'&boton=2', folder:of2, name:'Libro_Contable_Partido.pdf'});
    files.push({url:'/api/cne/libroContablePartido?'+org.libroQ+'&boton=1', folder:of2, name:'Libro_Contable_Partido.xlsx'});
    CONS_9B_ZIP.forEach(function(fid){
      files.push({url:'/api/cne/descargar-consolidado?id='+fid+'&rol=contador&idproceso='+PROCESO_ID_CC+
        '&idFormato='+fid+'&tipoOrganizacion='+org.tipo_id+'&idOrganizacion='+org.org_id+
        '&idCandidato=&idCorporacion='+org.corp_id+'&idCircunscripcion='+org.circ_id+
        '&idDepartamento='+dpto.id+'&idMunicipio='+mun.id,
        folder:of2+'/Consolidados', name:'CONSOLIDADO_9B_'+fid+'.pdf'});
    });
    (org.ingresos9b||[]).forEach(function(f){ files.push({url:'/api/cne/descargar-archivo-ingreso-partido?id='+f.id+'&'+org.q9b, folder:of2+'/Ingresos', name:'ING_'+(f.codigo||f.id)+'.pdf'}); });
    (org.gastos9b||[]).forEach(function(f){ files.push({url:'/api/cne/descargar-archivo-gasto-partido?id='+f.id+'&'+org.q9b, folder:of2+'/Gastos', name:'GAS_'+(f.codigo||f.id)+'.pdf'}); });
    (org.obligaciones||[]).forEach(function(f){ files.push({url:'/api/cne/obligacionPartido/descargar?id='+f.id+'&'+org.q9b, folder:of2+'/Obligaciones', name:'OBL_'+(f.codigo||f.id)+'.pdf'}); });
  });

  // 3. Acuerdos Coalición
  (gm.coalicion||[]).forEach(function(item){
    var archivo = item.archivo||''; var archN = archivo ? archivo.split('/').pop() : '';
    if(archN) files.push({url:'/api/cne/storage/app/archivos/coalicion_politica/'+encodeURIComponent(archN), folder:'03_Acuerdos_Coalicion', name:archN});
  });

  // 4. Contador
  (gm.contador||[]).forEach(function(item){
    var archivo = item.archivo||''; var archN = archivo ? archivo.split('/').pop() : '';
    if(archN) files.push({url:'/api/cne/storage/app/archivos/contador_electoral/'+encodeURIComponent(archN), folder:'04_Contador', name:archN});
  });

  // 5. Gerente
  (gm.gerente||[]).forEach(function(item){
    var archivo = item.archivo||''; var archN = archivo ? archivo.split('/').pop() : '';
    if(archN) files.push({url:'/api/cne/storage/app/archivos/gerente_campana/'+encodeURIComponent(archN), folder:'05_Gerente', name:archN});
  });

  // 6. Auditor
  (gm.auditor||[]).forEach(function(item){
    var archivo = item.archivo||''; var archN = archivo ? archivo.split('/').pop() : '';
    if(archN) files.push({url:'/api/cne/storage/app/archivos/auditor/'+encodeURIComponent(archN), folder:'06_Auditor', name:archN});
  });

  // 7. Informe Organización Política
  (gm._infOrg||[]).forEach(function(org){
    var of7 = '07_InformeOrg_'+esc(org.orgName||'Org').replace(/[^a-zA-Z0-9]/g,'_').substring(0,30);
    (org.envios||[]).forEach(function(e){
      var eid = e.id||e.informe_id||'';
      if(eid){
        files.push({url:'/api/cne/imprimirFormato?id='+eid+'&id_proceso='+PROCESO_ID_CC, folder:of7+'/Envios', name:'Formato_'+eid+'.pdf'});
        files.push({url:'/api/cne/descargarFormatoRadicacion?id='+eid+'&id_proceso='+PROCESO_ID_CC, folder:of7+'/Envios', name:'Radicacion_'+eid+'.pdf'});
      }
    });
  });

  // ═══ NIVEL CANDIDATO — para TODOS los candidatos del municipio ═══
  var candPromises = [];
  cands.forEach(function(c, ci){
    var qIG = 'id_candi='+c.cand_id+'&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
      '&id_departamento='+dpto.id+'&id_municipio='+mun.id+'&id_proceso='+PROCESO_ID_CC;
    var qHist = 'idtipo_organi='+c.tipo_id+'&id_organizacion='+c.org_id+
      '&id_corporacion='+c.corp_id+'&id_circunscripcion='+c.circ_id+
      '&id_departamento='+dpto.id+'&id_municipio='+mun.id+
      '&id_proceso='+PROCESO_ID_CC+'&id_candidato='+c.cand_id;
    candPromises.push({c:c, ci:ci, qIG:qIG, qHist:qHist,
      promise: Promise.all([
        _ccFetchJSON('/api/cne/consultaConsolidado?idCandidato='+c.cand_id+'&id_proceso='+PROCESO_ID_CC),
        _ccFetchJSON('/api/cne/ingresos-campana?id_candi='+c.cand_id+'&'+qIG.replace('id_candi='+c.cand_id+'&','')),
        _ccFetchJSON('/api/cne/gastos-campana?id_candi='+c.cand_id+'&'+qIG.replace('id_candi='+c.cand_id+'&','')),
        _ccFetchJSON('/api/cne/envio?page=1&buscar=&criterio=radicado&'+qHist),
        _ccFetchJSON('/api/cne/ingreso/listarIngresos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG),
        _ccFetchJSON('/api/cne/gasto/listarGastos?page=1&buscar=&criterio=formato_ingresos_gastos.nombre&'+qIG)
      ])
    });
  });

  var btn = document.getElementById('ccBtnDescargarTodo');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Consultando datos de '+cands.length+' candidatos...';

  // Consultar candidatos en lotes de 3 para no saturar
  var candIdx = 0;
  var candResults = [];
  function procesarLoteCands(){
    if(candIdx >= candPromises.length){
      _finalizarZipMun(files, candResults, btn, munName);
      return;
    }
    var lote = candPromises.slice(candIdx, candIdx+3);
    candIdx += 3;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Consultando candidato '+(Math.min(candIdx,candPromises.length))+'/'+candPromises.length+'...';
    Promise.all(lote.map(function(l){return l.promise;})).then(function(results){
      results.forEach(function(r, ri){
        candResults.push({c: lote[ri].c, data: r});
      });
      setTimeout(procesarLoteCands, 300);
    }).catch(function(){
      lote.forEach(function(l){ candResults.push({c:l.c, data:[[],[],[],null,[],[]]}); });
      setTimeout(procesarLoteCands, 300);
    });
  }
  procesarLoteCands();
}

function _finalizarZipMun(files, candResults, btn, munName){
  // Agregar archivos de cada candidato
  candResults.forEach(function(cr){
    var c = cr.c; var r = cr.data;
    var safe = (c.nombre||'').replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_').substring(0,35);
    var cf = '08_Candidatos/'+safe+'_'+c.cand_id;

    // 8B Consolidados
    var consolidados = Array.isArray(r[0]) ? r[0] : [];
    var ingresos8b = Array.isArray(r[1]) ? r[1] : [];
    var gastos8b = Array.isArray(r[2]) ? r[2] : [];

    files.push({url:'/api/cne/libroContableCampana?id_candi='+c.cand_id+'&id_proceso='+PROCESO_ID_CC+'&boton=2', folder:cf, name:'Libro_Contable.pdf'});
    files.push({url:'/api/cne/libroContableCampana?id_candi='+c.cand_id+'&id_proceso='+PROCESO_ID_CC+'&boton=1', folder:cf, name:'Libro_Contable.xlsx'});
    consolidados.forEach(function(f){
      files.push({url:'/api/cne/descargar-consolidado?id='+f.id+'&rol=contador&tipoOrganizacion='+c.tipo_id+
        '&idOrganizacion='+c.org_id+'&idCandidato='+c.cand_id+'&idCorporacion='+c.corp_id+
        '&idCircunscripcion='+c.circ_id+'&idDepartamento='+window._ccDptoEntry.id+
        '&idMunicipio='+window._ccMunEntry.id+'&id_proceso='+PROCESO_ID_CC,
        folder:cf+'/Consolidados', name:'CONS_'+(f.codigo||f.id)+'.pdf'});
    });
    ingresos8b.forEach(function(f){
      files.push({url:'/api/cne/descargar-archivo-ingreso?id='+f.id+'&id_candi='+c.cand_id+'&id_proceso='+PROCESO_ID_CC,
        folder:cf+'/Anexos_Ingresos', name:'ING_'+(f.codigo||f.id)+'.pdf'});
    });
    gastos8b.forEach(function(f){
      files.push({url:'/api/cne/descargar-archivo-gasto?id='+f.id+'&id_candi='+c.cand_id+'&id_proceso='+PROCESO_ID_CC,
        folder:cf+'/Anexos_Gastos', name:'GAS_'+(f.codigo||f.id)+'.pdf'});
    });

    // Informe Campaña (envíos)
    var r3 = r[3]; var envios = [];
    if(r3){ var ei=r3.envioInforme; envios = ei?(ei.data||ei):[]; if(!Array.isArray(envios)) envios=[]; }
    envios.forEach(function(e){
      var eid = e.id||e.informe_id||'';
      if(eid){
        files.push({url:'/api/cne/imprimirFormato?id='+eid+'&id_proceso='+PROCESO_ID_CC, folder:cf+'/Informe_Campana', name:'Formato_'+eid+'.pdf'});
        files.push({url:'/api/cne/descargarFormatoRadicacion?id='+eid+'&id_proceso='+PROCESO_ID_CC, folder:cf+'/Informe_Campana', name:'Radicacion_'+eid+'.pdf'});
      }
    });

    // Gestionar Ingresos
    var r4 = r[4]; var gIng = (r4&&r4.ingreso&&r4.ingreso.data)?r4.ingreso.data:[];
    gIng.forEach(function(it){
      var archivo = it.archivo||'';
      if(archivo) files.push({url:'/api/cne/storage/app/'+encodeURI(archivo), folder:cf+'/Gestionar_Ingresos', name:'ING_'+(it.codigo||it.id_ingreso||'')+'_'+archivo.split('/').pop()});
    });

    // Gestionar Gastos
    var r5 = r[5]; var gGas = (r5&&r5.gasto&&r5.gasto.data)?r5.gasto.data:[];
    gGas.forEach(function(it){
      var archivo = it.archivo||'';
      if(archivo) files.push({url:'/api/cne/storage/app/'+encodeURI(archivo), folder:cf+'/Gestionar_Gastos', name:'GAS_'+(it.codigo||it.id_gasto||'')+'_'+archivo.split('/').pop()});
    });
  });

  // ═══ DESCARGAR Y EMPAQUETAR ZIP ═══
  var total = files.length;
  var descargados = 0;
  var errores = 0;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Descargando 0/'+total+' archivos...';

  var zip = new JSZip();

  function descargarSiguiente(idx){
    if(idx >= files.length){
      btn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Generando ZIP ('+descargados+' archivos)...';
      zip.generateAsync({type:'blob'}).then(function(blob){
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'CuentasClaras_'+munName+'.zip';
        a.click();
        URL.revokeObjectURL(a.href);
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-check me-1"></i>ZIP descargado ('+descargados+' archivos'+(errores?', '+errores+' errores':'')+')';
      });
      return;
    }

    var f = files[idx];
    btn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Descargando '+(idx+1)+'/'+total+': '+f.name;

    fetch(f.url).then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.blob();
    }).then(function(blob){
      if(blob.size > 100){ zip.file(f.folder+'/'+f.name, blob); descargados++; }
      else { errores++; }
    }).catch(function(){ errores++; }).finally(function(){
      setTimeout(function(){ descargarSiguiente(idx+1); }, 400);
    });
  }

  descargarSiguiente(0);
}
