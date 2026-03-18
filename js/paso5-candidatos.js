// ─── PASO 5: FORMATO 8B ───────────────────────────────────────────────────
function renderPaso5(){
  var c=CAND_SELEC;
  // Re-filtrar CANDIDATOS con filtros actuales y actualizar _CAND_LIST_5
  if(CANDIDATOS&&Object.keys(CANDIDATOS).length){
    var _p5fP=norm(document.getElementById('selPartido')?document.getElementById('selPartido').value:'');
    var _p5fC=document.getElementById('selCorp')?document.getElementById('selCorp').value:'';
    var _p5l=Object.values(CANDIDATOS);
    if(_p5fP) _p5l=_p5l.filter(function(x){return norm(x.partido)===_p5fP;});
    if(_p5fC){
      var _p5cN=norm(_p5fC);
      var _p5cf=_p5cN.indexOf('ALCALD')!==-1?'ALCALDIA':_p5cN.indexOf('CONCEJ')!==-1?'CONCEJO':
               _p5cN.indexOf('ASAMBLEA')!==-1||_p5cN.indexOf('DIPUTA')!==-1?'ASAMBLEA':
               _p5cN.indexOf('JAL')!==-1||_p5cN.indexOf('JUNTA')!==-1?'JAL':'GOBERNACION';
      _p5l=_p5l.filter(function(x){return norm(x.cargo||'').indexOf(_p5cf)!==-1;});
    }
    _p5l.sort(function(a,b){return (a.nombre||'').localeCompare(b.nombre||'');});
    _CAND_LIST_5=_p5l.map(function(x){return x.id;});
    if(_CAND_LIST_5.length&&(!c||_CAND_LIST_5.indexOf(c.id)===-1)){
      var _p5fId=_CAND_LIST_5[0];
      if(CANDIDATOS[_p5fId]) c=CANDIDATOS[_p5fId];
    }
  }
  document.getElementById('panel8B').innerHTML=
    '<div class="text-center p-4"><div class="spinner-border text-primary"></div><p class="mt-2">Cargando datos 8B...</p></div>';
  // Buscar candidato CC por cédula/nombre
  var _p5ccMatch=null;
  var _p5cedula=String(c.id||'').replace(/\./g,'').trim();
  var _p5nombre=_alphaKey(c.nombre||'');
  (_ccCandsMun||[]).forEach(function(cc){
    if(_p5ccMatch) return;
    var ccCed=String(cc.cedula||'').replace(/\./g,'').trim();
    if(_p5cedula&&ccCed&&_p5cedula===ccCed){_p5ccMatch=cc; return;}
    if(_p5nombre&&_alphaKey(cc.nombre||'')===_p5nombre){_p5ccMatch=cc;}
  });
  // Fetch Consolidados 8B desde CC API
  var _p5consolPromise;
  if(_p5ccMatch){
    _p5consolPromise=_ccFetchJSON('/api/cne/consultaConsolidado?idCandidato='+_p5ccMatch.cand_id+'&id_proceso='+PROCESO_ID_CC)
      .then(function(r){ return Array.isArray(r)?r:[]; }).catch(function(){ return []; });
  } else { _p5consolPromise=Promise.resolve([]); }
  _p5consolPromise.then(function(consolidadosCC){
    window._p5ccMatch=_p5ccMatch;
    window._p5consolidadosCC=consolidadosCC;
    // Leer primer consolidado 8B (PDF) para extraer gerente/contador/banco
    var _p5c100Promise;
    if(consolidadosCC.length&&_p5ccMatch){
      var dpto=window._ccDptoEntry, mun=window._ccMunEntry;
      var _p5p={cand_id:_p5ccMatch.cand_id, corp_id:_p5ccMatch.corp_id, circ_id:_p5ccMatch.circ_id,
        tipo_id:_p5ccMatch.tipo_id, org_id:_p5ccMatch.org_id, dpto_id:dpto?dpto.id:'', mun_id:mun?mun.id:''};
      var c100url='/api/cne/descargar-consolidado?id='+consolidadosCC[0].id+'&rol=contador&tipoOrganizacion='+_p5p.tipo_id+
        '&idOrganizacion='+_p5p.org_id+'&idCandidato='+_p5p.cand_id+'&idCorporacion='+_p5p.corp_id+
        '&idCircunscripcion='+_p5p.circ_id+'&idDepartamento='+_p5p.dpto_id+
        '&idMunicipio='+_p5p.mun_id+'&id_proceso='+PROCESO_ID_CC;
      _p5c100Promise=new Promise(function(resolve){
        _leerC100PdfCC(c100url, c.id, function(data){ resolve(data); });
      });
    } else { _p5c100Promise=Promise.resolve(null); }
    _p5c100Promise.then(function(c100data){
      window._p5c100data=c100data;
  _cargarContadorCamp(function(){
  _cargarR8BIndex(function(){
    // Pre-cargar transacciones para comparación 8B vs Módulo 6
    if(!TX_CACHE[c.id]){
      var txUrl=txUrlFor(c);
      if(txUrl){
        fetch(txUrl).then(function(r){ if(!r.ok) throw new Error(); return r.json(); })
          .then(function(data){ TX_CACHE[c.id]=data; _renderPaso5Inner(c); })
          .catch(function(){ _renderPaso5Inner(c); });
        return;
      }
    }
    _renderPaso5Inner(c);
  }); }); }); }); // close R8B + ContadorCamp + c100data + consolidadosCC
}

// Nombres descriptivos de los códigos 8B (mismos que 9B)
var _CODIGOS_8B=_CODIGOS_9B;

// ── Extraer datos del CONSOLIDADO_100 PDF (CC) ──
function _extraerC100Data(txt){
  var r={gerente_nombre:'',gerente_cc:'',banco:'',cuenta:'',sucursal:'',
    contador_nombre:'',contador_cc:'',contador_tp:'',
    candidato_nombre:'',candidato_cc:'',radicacion:'',fecha_radicacion:'',
    codigos:{},total_ingresos:0,total_gastos:0,donacion_especie_8_2:false};
  // Gerente
  var m=txt.match(/Nombre del Gerente de la Campa.a:\s*(.+?)(?:\n|C\.?C\.?)/);
  if(m){var n=m[1].trim(); if(n&&n.length>1&&n!=='C.C.'&&n!=='C.C') r.gerente_nombre=n;}
  m=txt.match(/Gerente de la Campa.a:\s*.*?C\.?C\.?\s*(\d[\d.]*)/);
  if(m) r.gerente_cc=m[1].replace(/\./g,'');
  // Banco / Cuenta
  m=txt.match(/Cuenta\s+.nica\s+No\.?:?\s*(\S.*?)(?:\n|Banco)/);
  if(m){var v=m[1].trim(); if(v&&v.length>1&&!/^Banco/.test(v)) r.cuenta=v;}
  m=txt.match(/Banco:\s*(\S.*?)(?:\n|Sucursal)/);
  if(m){var v2=m[1].trim(); if(v2&&v2.length>1&&!/^Sucursal/.test(v2)) r.banco=v2;}
  m=txt.match(/Sucursal\s+u\s+Oficina.?:\s*(\S.*?)(?:\n|Ciudad)/);
  if(m){var v3=m[1].trim(); if(v3&&v3.length>1&&!/^Ciudad/.test(v3)) r.sucursal=v3;}
  // Contador
  m=txt.match(/Nombre del Contador:\s*(.+?)(?:\n|C\.?C\.?)/);
  if(m){var cn=m[1].trim(); if(cn&&cn.length>1&&cn!=='C.C.'&&cn!=='C.C') r.contador_nombre=cn;}
  m=txt.match(/Nombre del Contador:\s*.*?C\.?C\.?\s*(\d[\d.]*)/);
  if(m) r.contador_cc=m[1].replace(/\./g,'');
  m=txt.match(/T\.?P\.?\s*([\d]+-?T?)/);
  if(m) r.contador_tp=m[1];
  // Candidato
  m=txt.match(/Nombre del Candidato:\s*(.+?)(?:\n|C\.?C\.?)/);
  if(m) r.candidato_nombre=m[1].trim();
  m=txt.match(/Nombre del Candidato:\s*.*?C\.?C\.?\s*(\d[\d.]*)/);
  if(m) r.candidato_cc=m[1].replace(/\./g,'');
  // Radicación
  m=txt.match(/Radicaci.n\s+Cuentas\s+Claras:\s*(\S+)/);
  if(m) r.radicacion=m[1];
  m=txt.match(/Fecha:\s*(\d{4}-\d{2}-\d{2})/);
  if(m) r.fecha_radicacion=m[1];
  // Códigos financieros
  function _pm(s){if(!s)return 0;s=s.replace(/\$/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.');return parseFloat(s)||0;}
  var codPat=/^\s*(10[0-7]|20\d|21[0-2])\s+.*?\$\s*([\d\.,]+)/gm;
  var cm2;
  while((cm2=codPat.exec(txt))!==null){
    r.codigos[cm2[1]]=_pm(cm2[2]);
  }
  if(!Object.keys(r.codigos).length){
    var codPat2=/\b(10[0-7]|20\d|21[0-2])\b[^$]*?\$\s*([\d\.,]+)/g;
    while((cm2=codPat2.exec(txt))!==null){
      if(!r.codigos[cm2[1]]) r.codigos[cm2[1]]=_pm(cm2[2]);
    }
  }
  if(r.codigos['100']) r.total_ingresos=r.codigos['100'];
  if(r.codigos['200']) r.total_gastos=r.codigos['200'];
  // Donación en especie 8.2
  if(/8\.2|donaci.n\s+en\s+especie/i.test(txt)&&(r.codigos['102']||0)>0) r.donacion_especie_8_2=true;
  console.log('[C100] Extraído:', JSON.stringify({ger:r.gerente_nombre,ger_cc:r.gerente_cc,banco:r.banco,cuenta:r.cuenta,cont:r.contador_nombre,cont_cc:r.contador_cc,cods:Object.keys(r.codigos).length}));
  return r;
}

function _leerC100PdfCC(url, candId, cb){
  var lsKey='cne_c100_'+candId;
  // Cache en localStorage
  try{var cached=JSON.parse(localStorage.getItem(lsKey)||'null');
    if(cached&&(cached.gerente_nombre||cached.contador_nombre||Object.keys(cached.codigos||{}).length)){cb(cached);return;}
  }catch(e){}
  if(typeof pdfjsLib==='undefined'){cb(null);return;}
  fetch(url).then(function(r){
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.arrayBuffer();
  }).then(function(buf){
    pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise.then(function(pdf){
      var pageTexts=[], n=pdf.numPages, loaded=0;
      for(var i=1;i<=n;i++){
        (function(pn){
          pdf.getPage(pn).then(function(page){
            page.getTextContent().then(function(tc){
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
                var result=_extraerC100Data(fullTxt);
                try{localStorage.setItem(lsKey, JSON.stringify(result));}catch(e){}
                cb(result);
              }
            });
          });
        })(i);
      }
    }).catch(function(err){ console.log('[C100] PDF parse error:', err); cb(null); });
  }).catch(function(err){ console.log('[C100] Fetch error:', err); cb(null); });
}

function _renderPaso5Inner(c){
  var obs=c.observaciones||{};
  var _p5cc=window._p5ccMatch||null;
  var _p5consols=window._p5consolidadosCC||[];
  var c100=window._p5c100data||null; // Datos extraídos del CONSOLIDADO_100 PDF (CC)

  // Paths - usar selectores del Paso 1
  var _rd8=c.departamento||'', _rm8=c.municipio||'', _rp8=c.partido||'';
  if(!_rd8){try{_rd8=document.getElementById('selDpto').value||'';_rm8=document.getElementById('selMun').value||'';_rp8=_rp8||document.getElementById('selPartido').value||'';}catch(e){}}
  var d8=_normFNFP(_rd8), m8=_normFNFP(_rm8), p8=_normFNFP(_rp8);
  // Buscar carpeta real del candidato en R8B_INDEX
  var _r8bObj=null, _r8bCand=null;
  if(R8B_INDEX){
    var _r8bExact=d8+'/'+m8+'/'+p8;
    if(R8B_INDEX[_r8bExact]) _r8bObj=R8B_INDEX[_r8bExact];
    else { var _kn8=function(s){return s.replace(/_+/g,'_').replace(/_$/,'');}; var _kn8p=_kn8(p8); for(var _k8 in R8B_INDEX){ if(_k8.indexOf(d8+'/'+m8+'/')!==0) continue; var _kP8=_k8.substring(_k8.lastIndexOf('/')+1); if(_kn8(_kP8)===_kn8p||_kn8(_kP8).indexOf(_kn8p)!==-1||_kn8p.indexOf(_kn8(_kP8))!==-1){_r8bObj=R8B_INDEX[_k8];break;} } }
    if(_r8bObj&&_r8bObj.e){
      var _kn8c=function(s){return s.replace(/_+/g,'_').replace(/_$/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');};
      var _cxN8=_kn8c(_normFNFP(c.nombre||''));
      // Buscar por nombre (como Paso 1)
      for(var _i8=0;_i8<_r8bObj.e.length;_i8++){
        if(_kn8c(_r8bObj.e[_i8].n||'')===_cxN8){ _r8bCand=_r8bObj.e[_i8]; break; }
      }
      // Fallback: fuzzy nombre
      if(!_r8bCand){
        for(var _j8=0;_j8<_r8bObj.e.length;_j8++){
          var _en8=_kn8c(_r8bObj.e[_j8].n||'');
          if(_en8.indexOf(_cxN8)!==-1||_cxN8.indexOf(_en8)!==-1){ _r8bCand=_r8bObj.e[_j8]; break; }
        }
      }
      // Fallback: por cedula en carpeta
      if(!_r8bCand){
        for(var _k8c=0;_k8c<_r8bObj.e.length;_k8c++){
          if(_r8bObj.e[_k8c].f.indexOf(c.id)===0||_r8bObj.e[_k8c].f.indexOf(c.id+'_')!==-1){ _r8bCand=_r8bObj.e[_k8c]; break; }
        }
      }
    }
  }
  var rep8bBase=_r8bObj&&_r8bCand?'r8b/'+encodeURIComponent(_r8bObj.d||d8)+'/'+encodeURIComponent(_r8bObj.mu||m8)+'/'+encodeURIComponent(_r8bObj.p)+'/'+encodeURIComponent(_r8bCand.f)+'/':'';
  var infCampPath='icamp/'+d8+'/'+m8+'/'+esc(c.id)+'/';
  var rep8bPath=rep8bBase||'r8b/'+d8+'/'+m8+'/'+esc(c.id)+'/';

  // Informes
  var informes=c.informes||[];
  if(!informes.length){var inf0=obs.informe||{}; if(inf0.fecha||inf0.numero||inf0.enviado) informes=[inf0];}

  var art=(obs.articulos||{});
  var art25umb=art.art25_umbral||232000000;
  var topeInd5=_topeInd6();
  var art25ob=topeInd5&&topeInd5>=art25umb;

  var ls8b={};
  try{ls8b=JSON.parse(localStorage.getItem('cne_8b_'+c.id)||'{}');}catch(e){}
  var est8b=['PENDIENTE','OK','NO CUMPLE','NO APLICA'];
  function sel8b(k,lbl){
    var v=ls8b[k]||'PENDIENTE';
    return '<tr><td class="small">'+esc(lbl)+'</td><td>'+
      '<select class="form-select form-select-sm w-auto" onchange="guardar8BField(\''+k+'\',this.value)">'+
      est8b.map(function(e){return '<option'+(v===e?' selected':'')+'>'+e+'</option>';}).join('')+
      '</select></td></tr>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  8B INICIAL
  // ═══════════════════════════════════════════════════════════════════════
  // Posición del candidato en la lista (si viene de Paso 5)
  var _8bPos='';
  if(_PASO_ACTUAL===6&&_CAND_LIST_5.length){
    var _8bIdx=_CAND_LIST_5.indexOf(c.id);
    if(_8bIdx>=0) _8bPos=' <span class="badge bg-dark ms-2">'+(_8bIdx+1)+'/'+_CAND_LIST_5.length+'</span>';
  }
  var html='<h5 class="fw-bold text-primary mb-3 border-bottom pb-2"><i class="fa fa-file-invoice me-2"></i>8B INICIAL — Informe Individual de Ingresos y Gastos'+_8bPos+'</h5>';


  // ── Consolidados 8B desde Cuentas Claras ──
  var dpto=window._ccDptoEntry, mun=window._ccMunEntry;
  if(_p5cc){
    html+='<div class="card mb-3 border-info"><div class="card-header fw-semibold py-2 bg-info bg-opacity-10">'+
      '<i class="fa fa-cloud me-2"></i>Consolidados 8B — Cuentas Claras'+
      ' <span class="badge bg-info ms-2">'+esc(_p5cc.nombre||'')+'</span>'+
      '</div><div class="card-body">';
    // Libro Contable Campaña
    html+='<div class="mb-3"><h6 class="fw-bold"><i class="fa fa-book me-1 text-primary"></i>Libro Contable Campaña</h6>';
    html+='<div class="d-flex gap-2">';
    html+='<a href="/api/cne/libroContableCampana?id_candi='+_p5cc.cand_id+'&id_proceso='+PROCESO_ID_CC+'&boton=2" target="_blank" class="btn btn-sm btn-outline-danger"><i class="fa fa-file-pdf me-1"></i>PDF</a>';
    html+='<a href="/api/cne/libroContableCampana?id_candi='+_p5cc.cand_id+'&id_proceso='+PROCESO_ID_CC+'&boton=1" target="_blank" class="btn btn-sm btn-outline-success"><i class="fa fa-file-excel me-1"></i>Excel</a>';
    html+='</div></div>';
    // Consolidados 8B
    if(_p5consols.length){
      html+='<h6 class="fw-bold"><i class="fa fa-file-alt me-1 text-info"></i>Consolidados 8B <span class="badge bg-info">'+_p5consols.length+'</span></h6>';
      html+='<div class="list-group list-group-flush">';
      var _p5p={cand_id:_p5cc.cand_id, corp_id:_p5cc.corp_id, circ_id:_p5cc.circ_id,
        tipo_id:_p5cc.tipo_id, org_id:_p5cc.org_id, dpto_id:dpto?dpto.id:'', mun_id:mun?mun.id:''};
      _p5consols.forEach(function(f){
        var url='/api/cne/descargar-consolidado?id='+f.id+'&rol=contador&tipoOrganizacion='+_p5p.tipo_id+
          '&idOrganizacion='+_p5p.org_id+'&idCandidato='+_p5p.cand_id+'&idCorporacion='+_p5p.corp_id+
          '&idCircunscripcion='+_p5p.circ_id+'&idDepartamento='+_p5p.dpto_id+
          '&idMunicipio='+_p5p.mun_id+'&id_proceso='+PROCESO_ID_CC;
        var nombre=f.nombre||f.nom_formato||f.descripcion||'Consolidado 8B';
        html+='<div class="list-group-item d-flex justify-content-between align-items-center">'+
          '<span><i class="fa fa-file-alt text-info me-2"></i>'+esc(nombre)+'</span>'+
          '<a href="'+url+'" target="_blank" class="btn btn-sm btn-outline-danger"><i class="fa fa-file-pdf me-1"></i>PDF</a></div>';
      });
      html+='</div>';
    } else {
      html+='<div class="text-muted small mt-2"><i class="fa fa-info-circle me-1"></i>Sin consolidados 8B en Cuentas Claras para este candidato.</div>';
    }
    html+='</div></div>';
  } else {
    html+='<div class="card mb-3 border-warning"><div class="card-body text-center py-3">'+
      '<i class="fa fa-exclamation-triangle me-2 text-warning"></i>No se encontró candidato en Cuentas Claras ('+esc(c.nombre||'')+' — C.C. '+esc(c.id||'')+').'+
      '<br><small class="text-muted">Verifique que el municipio esté seleccionado y que Cuentas Claras tenga candidatos cargados.</small>'+
      '</div></div>';
  }

  // ── Datos extraídos del CONSOLIDADO_100 PDF (CC) ──
  if(c100&&(c100.gerente_nombre||c100.contador_nombre||c100.banco||Object.keys(c100.codigos||{}).length)){
    html+='<div class="card mb-3 border-success"><div class="card-header fw-semibold py-2 bg-success bg-opacity-10">'+
      '<i class="fa fa-chart-bar me-2"></i>Datos extraídos del 8B (Cuentas Claras)'+
      (c100.donacion_especie_8_2?' <span class="badge bg-danger ms-2">DONACIÓN EN ESPECIE 8.2</span>':'')+
      '</div><div class="card-body"><div class="row g-3">';
    // Candidato
    html+='<div class="col-md-4"><h6 class="fw-semibold">Candidato</h6>'+
      '<table class="table table-sm mb-0"><tbody>'+
      '<tr><td class="text-muted">Nombre:</td><td class="fw-bold">'+esc(c100.candidato_nombre||c.nombre)+'</td></tr>'+
      '<tr><td class="text-muted">C.C.:</td><td>'+esc(c100.candidato_cc||c.id)+'</td></tr>'+
      '</tbody></table></div>';
    // Gerente
    html+='<div class="col-md-4"><h6 class="fw-semibold">Gerente de Campaña</h6>'+
      '<table class="table table-sm mb-0"><tbody>'+
      '<tr><td class="text-muted">Nombre:</td><td class="fw-bold '+(c100.gerente_nombre?'text-success':'text-danger')+'">'+esc(c100.gerente_nombre||'(no detectado)')+'</td></tr>'+
      '<tr><td class="text-muted">C.C.:</td><td>'+esc(c100.gerente_cc||'—')+'</td></tr>'+
      '</tbody></table></div>';
    // Contador
    html+='<div class="col-md-4"><h6 class="fw-semibold">Contador</h6>'+
      '<table class="table table-sm mb-0"><tbody>'+
      '<tr><td class="text-muted">Nombre:</td><td class="fw-bold '+(c100.contador_nombre?'text-success':'text-danger')+'">'+esc(c100.contador_nombre||'(no detectado)')+'</td></tr>'+
      '<tr><td class="text-muted">C.C.:</td><td>'+esc(c100.contador_cc||'—')+'</td></tr>'+
      '<tr><td class="text-muted">T.P.:</td><td>'+esc(c100.contador_tp||'—')+'</td></tr>'+
      '</tbody></table></div>';
    // Banco
    if(c100.banco||c100.cuenta){
      html+='<div class="col-12"><h6 class="fw-semibold">Cuenta Bancaria</h6>'+
        '<table class="table table-sm mb-0"><tbody>'+
        '<tr><td class="text-muted" style="width:100px">Banco:</td><td class="fw-bold">'+esc(c100.banco||'—')+'</td>'+
        '<td class="text-muted" style="width:100px">Cuenta:</td><td class="fw-bold">'+esc(c100.cuenta||'—')+'</td>'+
        '<td class="text-muted" style="width:100px">Sucursal:</td><td>'+esc(c100.sucursal||'—')+'</td></tr>'+
        '</tbody></table></div>';
    }
    html+='</div></div></div>';

    // Tabla de Códigos 8B
    if(c100.codigos&&Object.keys(c100.codigos).length){
      var codigos=c100.codigos;
      html+='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">'+
        '<i class="fa fa-table me-2"></i>Resumen por Códigos — 8B (Candidato)</div>'+
        '<div class="card-body p-0"><table class="table table-sm table-hover mb-0">'+
        '<thead class="table-light"><tr><th>Cód.</th><th>Concepto</th><th class="text-end">Valor</th></tr></thead><tbody>';
      ['100','101','102','103','104','105','106','107'].forEach(function(cod){
        if(!codigos[cod]) return;
        var val=codigos[cod];
        var isTot=cod==='100';
        html+='<tr'+(isTot?' class="table-primary fw-bold"':'')+'><td>'+cod+'</td><td class="small">'+esc(_CODIGOS_8B[cod]||'Código '+cod)+'</td>'+
          '<td class="text-end fw-semibold">'+fmtCOP(val)+'</td></tr>';
      });
      html+='<tr><td colspan="3" class="py-0"></td></tr>';
      ['200','201','202','203','204','205','206','207','208','209','210','211','212'].forEach(function(cod){
        if(!codigos[cod]) return;
        var val=codigos[cod];
        var isTot=cod==='200';
        html+='<tr'+(isTot?' class="table-warning fw-bold"':'')+'><td>'+cod+'</td><td class="small">'+esc(_CODIGOS_8B[cod]||'Código '+cod)+'</td>'+
          '<td class="text-end fw-semibold">'+fmtCOP(val)+'</td></tr>';
      });
      html+='</tbody></table></div></div>';

      // Comparación 8B vs Módulo 6 (Transacciones)
      var txData=TX_CACHE[c.id]||[];
      if(txData.length){
        var txIng=txData.filter(function(t){return t.concepto==='INGRESO';});
        var txGas=txData.filter(function(t){return t.concepto==='GASTO';});
        var txTotalIng=txIng.reduce(function(s,t){return s+parseFloat(t.valor||0);},0);
        var txTotalGas=txGas.reduce(function(s,t){return s+parseFloat(t.valor||0);},0);
        var c100TotalIng=c100.total_ingresos||0;
        var c100TotalGas=c100.total_gastos||0;
        var diffIng=Math.abs(c100TotalIng-txTotalIng);
        var diffGas=Math.abs(c100TotalGas-txTotalGas);
        var hayDiff=diffIng>1||diffGas>1;
        var txPorCodigo={};
        txData.forEach(function(t){
          var cod=(t.cco_id||'').toString().replace(/\.0$/,'').trim();
          if(!cod) return;
          if(!txPorCodigo[cod]) txPorCodigo[cod]=0;
          txPorCodigo[cod]+=parseFloat(t.valor||0);
        });
        html+='<div class="card mb-3 '+(hayDiff?'border-danger':'border-success')+'">'+
          '<div class="card-header fw-semibold py-2 '+(hayDiff?'bg-danger bg-opacity-10':'bg-success bg-opacity-10')+'">'+
          '<i class="fa fa-balance-scale me-2"></i>Comparación: 8B vs Módulo 5/6 (Transacciones)'+
          (hayDiff?' <span class="badge bg-danger ms-2">DIFERENCIAS</span>':' <span class="badge bg-success ms-2">COINCIDE</span>')+
          '</div><div class="card-body p-0"><table class="table table-sm mb-0">'+
          '<thead class="table-light"><tr><th>Concepto</th><th class="text-end">8B (CC)</th>'+
          '<th class="text-end">Módulo 5/6</th><th class="text-end">Diferencia</th><th>Estado</th></tr></thead><tbody>';
        var ingOk=diffIng<=1;
        html+='<tr'+(ingOk?'':' class="table-danger"')+'><td class="fw-bold">TOTAL INGRESOS (100)</td>'+
          '<td class="text-end">'+fmtCOP(c100TotalIng)+'</td><td class="text-end">'+fmtCOP(txTotalIng)+'</td>'+
          '<td class="text-end">'+(ingOk?'—':fmtCOP(diffIng))+'</td>'+
          '<td>'+(ingOk?'<span class="badge bg-success">OK</span>':'<span class="badge bg-danger">DIF</span>')+'</td></tr>';
        var gasOk=diffGas<=1;
        html+='<tr'+(gasOk?'':' class="table-danger"')+'><td class="fw-bold">TOTAL GASTOS (200)</td>'+
          '<td class="text-end">'+fmtCOP(c100TotalGas)+'</td><td class="text-end">'+fmtCOP(txTotalGas)+'</td>'+
          '<td class="text-end">'+(gasOk?'—':fmtCOP(diffGas))+'</td>'+
          '<td>'+(gasOk?'<span class="badge bg-success">OK</span>':'<span class="badge bg-danger">DIF</span>')+'</td></tr>';
        html+='</tbody></table></div></div>';
      }
    }
  }

  // ── Informes presentados ──
  var htmlInf='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">'+
    '<i class="fa fa-file-alt me-2"></i>Informes presentados'+
    (informes.length>1?' <span class="badge bg-primary ms-1">'+informes.length+' registros</span>':'')+
    '</div><div class="card-body"><table class="table table-sm mb-0">'+
    '<thead class="table-light"><tr><th>Enviado</th><th>N° Radicado</th><th>Fecha Informe</th></tr></thead><tbody>';
  if(informes.length){
    informes.forEach(function(inf){
      htmlInf+='<tr><td>'+badge01(inf.enviado)+'</td>'+
        '<td><strong>'+esc(inf.numero||'—')+'</strong></td>'+
        '<td>'+esc(inf.fecha||'—')+'</td></tr>';
    });
  } else {
    htmlInf+='<tr><td colspan="3" class="text-muted">Sin registros de informe</td></tr>';
  }
  htmlInf+='</tbody></table></div></div>';
  html+=htmlInf;

  // ── Contador Campaña (PDFs desde data/fnfp/contador_campana) ──
  // Índice: {dpto/mun: [{file, partido, candidato}, ...]}
  var ccIdx=CONTADOR_CAMP_IDX||{};
  var ccDpto=_normFNFP(c.departamento), ccMun=_normFNFP(c.municipio);
  var ccKey=ccDpto+'/'+ccMun;
  var ccAll=ccIdx[ccKey]||[];
  // Filtrar por cédula o nombre del candidato actual
  var _ccCandCC=(c.id||'').replace(/\./g,'').trim();
  var _ccCandName=_normFNFP(c.nombre||'');
  function _ccMatchEntry(e){
    if(_ccCandCC&&e.cc&&e.cc===_ccCandCC) return true;
    var pn=_normFNFP(e.candidato||'');
    if(!pn||!_ccCandName) return false;
    if(pn===_ccCandName) return true;
    if(pn.indexOf(_ccCandName)!==-1||_ccCandName.indexOf(pn)!==-1) return true;
    var pa=pn.split('_'), pb=_ccCandName.split('_');
    if(pa.length>=2&&pb.length>=2){
      var la=pa.slice(-2).join('_'), lb=pb.slice(-2).join('_');
      if(la===lb) return true;
    }
    return false;
  }
  var ccFiltered=ccAll.filter(function(e){ return _ccMatchEntry(e); });
  var ccShow=ccFiltered.length?ccFiltered:ccAll;
  var ccIsFiltered=ccFiltered.length>0;
  var htmlCC='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">'+
    '<i class="fa fa-user-tie me-2 text-info"></i>Contador Campaña — '+esc(ccMun)+', '+esc(ccDpto)+
    (ccIsFiltered?' · <strong>'+esc(c.nombre||'')+'</strong>':'')+
    (ccShow.length?' <span class="badge '+(ccIsFiltered?'bg-success':'bg-warning text-dark')+' ms-1">'+ccShow.length+' PDFs</span>':' <span class="badge bg-secondary ms-1">Sin archivos</span>')+
    (ccIsFiltered?'':ccAll.length?' <span class="text-muted small ms-2">(sin match por nombre — todos del municipio)</span>':'')+
    '</div>';
  if(ccShow.length){
    htmlCC+='<div class="card-body p-2" style="max-height:250px;overflow-y:auto"><table class="table table-sm table-hover mb-0"><thead class="table-light"><tr>'+
      '<th class="small">PDF</th><th class="small">Candidato</th><th class="small">Partido</th></tr></thead><tbody>';
    ccShow.forEach(function(e){
      var fname=(e.file||'').split('/').pop();
      var url='data/fnfp/contador_campana/'+e.file;
      var hi=_ccMatchEntry(e);
      htmlCC+='<tr'+(hi?' class="table-success"':'')+'><td><a href="'+url+'" target="_blank" class="text-decoration-none">'+
        '<i class="fa fa-file-pdf me-1 text-danger"></i>'+esc(fname.replace('.pdf',''))+'</a></td>'+
        '<td class="small">'+esc(e.candidato||'—')+'</td>'+
        '<td class="small">'+esc(e.partido||'—')+'</td></tr>';
    });
    htmlCC+='</tbody></table></div>';
  } else {
    htmlCC+='<div class="card-body py-2"><span class="text-muted small">No se encontraron PDFs para '+esc(ccDpto)+' / '+esc(ccMun)+'</span></div>';
  }
  htmlCC+='</div>';
  html+=htmlCC;

  // ── Criterios 8B — Administración de Recursos ──
  html+='<div class="card mb-3">'+
    '<div class="card-header fw-semibold py-2 '+(art25ob?'bg-warning':'bg-light')+'">'+
    '<i class="fa fa-building me-2 text-warning"></i>Formato 8B — Administración de Recursos'+
    '<span class="badge ms-2 '+(art25ob?'bg-danger':'bg-success')+'">'+
    (art25ob?'OBLIGADO A TENER GERENTE Y CUENTA':'NO OBLIGADO — Gastos &lt; '+fmtCOP(art25umb))+
    '</span></div>'+
    '<div class="card-body">';
  if(art25ob){
    // Auto-fill from 8B CC PDF if available
    var gerNom=c100?(c100.gerente_nombre||''):(ls8b.ger_nombre||'');
    var gerCC=c100?(c100.gerente_cc||''):(ls8b.ger_cc||'');
    var banco=c100?(c100.banco||''):(ls8b.banco||'');
    var cuenta=c100?(c100.cuenta||''):(ls8b.cuenta||'');
    var fuente8b=c100?'<span class="badge bg-success ms-2">Datos del 8B (CC)</span>':'<span class="badge bg-secondary ms-2">Manual — sin 8B CC</span>';
    html+=fuente8b+'<div class="row g-2 mb-3 mt-2">'+
      '<div class="col-md-6"><label class="small fw-semibold">Nombre Gerente de Campaña</label>'+
      '<input type="text" class="form-control form-control-sm'+(gerNom?' border-success':'border-warning')+'" value="'+esc(gerNom)+'" onchange="guardar8BField(\'ger_nombre\',this.value)"></div>'+
      '<div class="col-md-6"><label class="small fw-semibold">Cédula Gerente de Campaña</label>'+
      '<input type="text" class="form-control form-control-sm'+(gerCC?' border-success':'border-warning')+'" value="'+esc(gerCC)+'" onchange="guardar8BField(\'ger_cc\',this.value)"></div>'+
      '<div class="col-md-5"><label class="small fw-semibold">Banco</label>'+
      '<input type="text" class="form-control form-control-sm'+(banco?' border-success':'border-warning')+'" value="'+esc(banco)+'" onchange="guardar8BField(\'banco\',this.value)"></div>'+
      '<div class="col-md-4"><label class="small fw-semibold">Número de Cuenta</label>'+
      '<input type="text" class="form-control form-control-sm'+(cuenta?' border-success':'border-warning')+'" value="'+esc(cuenta)+'" onchange="guardar8BField(\'cuenta\',this.value)"></div>'+
      '<div class="col-md-3"><label class="small fw-semibold">Tipo</label>'+
      '<select class="form-select form-select-sm" onchange="guardar8BField(\'tipo\',this.value)">'+
      ['','Ahorros','Corriente'].map(function(t){return '<option'+(ls8b.tipo===t?' selected':'')+'>'+t+'</option>';}).join('')+
      '</select></div></div>';

    // Auto-evaluate criteria from data
    var autoPresento8b=c100?'OK':(informes.length&&informes[0].numero?'OK':null);
    var autoGerenteFnfp=(gerNom&&gerCC)?'OK':null;
    var autoCuentaFnfp=(banco&&cuenta)?'OK':null;
    // Apply auto-eval if no manual override
    if(autoPresento8b&&!ls8b.presento_8b) ls8b.presento_8b=autoPresento8b;
    if(autoGerenteFnfp&&!ls8b.gerente_fnfp) ls8b.gerente_fnfp=autoGerenteFnfp;
    if(autoCuentaFnfp&&!ls8b.cuenta_fnfp) ls8b.cuenta_fnfp=autoCuentaFnfp;

    html+='<table class="table table-sm mb-0 tabla-obs"><tbody>'+
      sel8b('presento_8b','Presentó el Formato 8B'+(autoPresento8b?' <span class=&quot;badge bg-info&quot;>Auto</span>':''))+
      sel8b('gerente_fnfp','Gerente de campaña registrado en FNFP'+(autoGerenteFnfp?' <span class=&quot;badge bg-info&quot;>Auto</span>':''))+
      sel8b('cuenta_fnfp','Cuenta bancaria exclusiva acreditada en FNFP'+(autoCuentaFnfp?' <span class=&quot;badge bg-info&quot;>Auto</span>':''))+
      sel8b('gerente_firma_8b','Firma del gerente coincide en 8B y dictamen');
    // Donación en especie criterion
    if(c100&&c100.donacion_especie_8_2){
      html+=sel8b('donacion_especie_8_2','DONACIÓN EN ESPECIE (Sección 8.2) — Verificar Cód. 102 en Módulo 6');
    }
    html+='</tbody></table>';
  } else {
    html+='<div class="alert alert-success py-2 mb-2 small"><strong>Art.25</strong> — Obligación gerente/cuenta bancaria — Tope candidato: <strong>'+(topeInd5?fmtCOP(topeInd5):'N/D')+'</strong> — NO OBLIGADO — Tope &lt; '+fmtCOP(art25umb)+'</div>'+
      '<table class="table table-sm mb-0 tabla-obs"><tbody>'+
      sel8b('presento_8b','Presentó Formato 8B de todas formas (verificar)')+
      '</tbody></table>';
  }
  html+='</div></div>';

  document.getElementById('panel8B').innerHTML=html;
}

function guardarAuditor(){
  if(!CAND_SELEC) return;
  var tp=document.getElementById('jccTP');
  var obs=CAND_SELEC.observaciones||{};
  if(!obs.dictamen) obs.dictamen={};
  if(tp) obs.dictamen.auditor_tarjeta_profesional=tp.value.trim();
  // Agregar tarjeta a pendientes de verificar JCC
  var pend={};
  try{pend=JSON.parse(localStorage.getItem('cne_jcc_pending')||'{}');}catch(e){}
  if(tp&&tp.value.trim()) pend[tp.value.trim()]=CAND_SELEC.id;
  localStorage.setItem('cne_jcc_pending', JSON.stringify(pend));
  alert('Tarjeta profesional guardada.\nPara verificar en JCC, ejecute:\npython verificar_jcc.py --tarjeta '+((tp&&tp.value.trim())||'[tarjeta]'));
}

function guardarDictObs(){
  if(!CAND_SELEC) return;
  var ta=document.getElementById('dictObsTA');
  if(!ta) return;
  var val=ta.value;
  // Guardar por cédula (Paso 2)
  localStorage.setItem('cne_dict_obs_'+CAND_SELEC.id, val);
  // Guardar por partido (Paso 7 / oficio)
  var _corpV=document.getElementById('selCorp')?document.getElementById('selCorp').value:'';
  var _dptoV=document.getElementById('selDpto')?document.getElementById('selDpto').value:'';
  var _munV=document.getElementById('selMun')?document.getElementById('selMun').value:'';
  var _partV=document.getElementById('selPartido')?document.getElementById('selPartido').value:'';
  if(_dptoV&&_partV){
    var _dk=_normCargoDict(_corpV)+'_'+_normFNFP(_dptoV)+'_'+_normFNFP(_munV==='_DPTO_'?_dptoV:_munV)+'_'+_normFNFP(_partV);
    localStorage.setItem('cne_p7_dict_'+_dk, val);
    console.log('[guardarDictObs] Guardado en cne_p7_dict_'+_dk+' = '+val.substring(0,50));
  }
  // También guardar con clave genérica por partido (sin cargo) como respaldo
  if(_partV){
    var _dpN=_normFNFP(_dptoV), _muN=_normFNFP(_munV==='_DPTO_'?_dptoV:_munV), _paN=_normFNFP(_partV);
    localStorage.setItem('cne_dict_partido_'+_dpN+'_'+_muN+'_'+_paN, val);
  }
  alert('Observaciones guardadas');
}

function guardar8BField(key,val){
  if(!CAND_SELEC) return;
  var ls={};
  try{ls=JSON.parse(localStorage.getItem('cne_8b_'+CAND_SELEC.id)||'{}');}catch(e){}
  ls[key]=val;
  localStorage.setItem('cne_8b_'+CAND_SELEC.id, JSON.stringify(ls));
}

function updateCrit(bloque,key,val){
  if(!CAND_SELEC) return;
  var obs=CAND_SELEC.observaciones;
  if(bloque==='dic') obs.dictamen[key]=val;
  else obs.formato_9b[key]=val;
}

function descargarTxExcel(){
  if(!CAND_SELEC) return;
  var c=CAND_SELEC, obs=c.observaciones||{}, art=obs.articulos||{}, fin=obs.financiero||{};
  var txData=TX_CACHE[c.id]||[];
  if(!txData.length){alert('Cargue primero el Módulo 6 (Transacciones) para tener los datos disponibles.');return;}

  // Hoja 1: transacciones
  var txRows=[['Concepto','Tipo','Cédula Candidato','Candidato','Código','Comprobante','Tercero','NIT/CC','Fecha','Valor','Descripción','URL Vista Previa']];
  txData.forEach(function(r){
    txRows.push([r.concepto||'',r.tipo||'',r.candidato_id||'',r.candidato||'',r.cco_id||'',r.comprobante||'',r.tercero||'',r.nit_cc||'',r.fecha||'',r.valor||0,r.descripcion||'',r.url_preview||'']);
  });
  // Hoja 2: análisis artículos
  var artRows=[['Artículo','Descripción','Valor','Estado']];
  artRows.push(['Art.23','Mayor donación individual',art.art23_max_donacion||0,art.art23_alerta?'ALERTA':'OK']);
  artRows.push(['Art.24','Gastos campaña (Cód.201-209)',art.art24_gastos_201_209||0,art.art24_supera_tope?'ALERTA':'OK']);
  artRows.push(['Art.25','Obligación gerente/cuenta',fin.total_gastos||0,art.art25_obligado?'OBLIGADO':'NO OBLIGADO']);
  artRows.push(['Art.27','Ingresos anónimos',art.art27_ingresos_anonimos||0,art.art27_alerta?'ALERTA':'OK']);
  artRows.push(['Cód.103','Pignoración/Crédito/Anticipo',art.cod103_valor||0,art.cod103_valor>0?'VERIFICAR':'']);
  artRows.push([]);
  artRows.push(['Total Ingresos','',fin.total_ingresos||0,'']);
  artRows.push(['Total Gastos','',fin.total_gastos||0,'']);
  var topeXLS=calcTopeLegal(c.cargo,c.poblacion||0,c.n_inscritos||1)||fin.tope_legal||c.tope_legal||0;
  artRows.push(['Tope Legal','',topeXLS,'']);
  artRows.push(['Supera Tope','','',(topeXLS>0&&(fin.total_gastos||0)>topeXLS)?'SÍ':'NO']);
  // Hoja 3: observaciones
  var obsRows=[['Tipo','Observación']];
  (obs.alertas||[]).forEach(function(a){obsRows.push(['ALERTA',a]);});
  (obs.advertencias||[]).forEach(function(a){obsRows.push(['ADVERTENCIA',a]);});
  (obs.informativas||[]).forEach(function(a){obsRows.push(['INFO',a]);});
  var textoFinal=document.getElementById('textoObsFinal');
  if(textoFinal&&textoFinal.value) obsRows.push(['TEXTO FINAL',textoFinal.value]);

  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txRows), 'Transacciones');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(artRows), 'Analisis Articulos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(obsRows), 'Observaciones');
  XLSX.writeFile(wb, 'TX_'+c.id+'_'+c.nombre.replace(/\s+/g,'_')+'.xlsx');
}

function verificarFechas(){
  var fd=document.getElementById('inpFechaDic').value;
  var f9=document.getElementById('inpFecha9B').value;
  var msg=[];
  if(f9){
    var d9=new Date(f9);
    if(d9>new Date('2023-12-29')) msg.push('<span class="text-danger">Fecha 9B excede 29/12/2023</span>');
    else msg.push('<span class="text-success">Fecha 9B válida</span>');
    if(fd&&fd!==f9) msg.push('<span class="text-warning">Fecha dictamen difiere de fecha 9B — cambio requerido</span>');
    else if(fd&&fd===f9) msg.push('<span class="text-success">Fechas coinciden</span>');
  }
  document.getElementById('msgFechas').innerHTML=msg.join(' | ');
}

