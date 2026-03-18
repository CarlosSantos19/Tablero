// ─── PASO 8: RESPUESTA AL OFICIO ──────────────────────────────────────────
function renderPaso8(){
  var el=document.getElementById('panelRespOficio');
  // Leer filtro Paso 1
  var _corp8=document.getElementById('selCorp')?document.getElementById('selCorp').value:'';
  var _dpto8=document.getElementById('selDpto')?document.getElementById('selDpto').value:'';
  var _mun8 =document.getElementById('selMun') ?document.getElementById('selMun').value:'';
  var _part8=document.getElementById('selPartido')?document.getElementById('selPartido').value:'';
  if(!_dpto8||!_mun8||!_part8){
    el.innerHTML='<div class="alert alert-warning"><i class="fa fa-filter me-2"></i>Configure el filtro en Paso 1 (Departamento, Municipio y Partido).</div>';
    return;
  }
  var c=CAND_SELEC;
  var _isDpto8=_mun8==='_DPTO_'||typeof _esDepartamental==='function'&&_esDepartamental(_corp8);
  var _d8=_normFNFP(_dpto8), _m8=_isDpto8?'':_normFNFP(_mun8), _p8=_normFNFP(_part8);
  var _cargo8=_normCargoDict(_corp8||(_part8&&c?c.cargo:''));
  // Clave general partido
  var _pKey8=_cargo8+'_'+_d8+'_'+_m8+'_'+_p8;

  // ── Observaciones del Paso 7 (lo que se pidió) ──
  var dictObs='';try{dictObs=localStorage.getItem('cne_p7_dict_'+_pKey8)||'';}catch(e){}
  var r9bObs='';try{r9bObs=localStorage.getItem('cne_p7_9b_'+_d8+'_'+_m8+'_'+_p8)||'';}catch(e){}
  // Obs por candidato
  var candObs=[];
  if(CANDIDATOS){
    var _lista8=Object.values(CANDIDATOS);
    if(_corp8){
      var _cN8=norm(_corp8);
      var _cf8=_cN8.indexOf('ALCALD')!==-1?'ALCALDIA':
               _cN8.indexOf('CONCEJ')!==-1?'CONCEJO':
               _cN8.indexOf('ASAMBLEA')!==-1||_cN8.indexOf('DIPUTA')!==-1?'ASAMBLEA':
               _cN8.indexOf('JAL')!==-1||_cN8.indexOf('JUNTA ADMIN')!==-1?'JAL':'GOBERNACION';
      _lista8=_lista8.filter(function(x){return norm(x.cargo||'').indexOf(_cf8)!==-1;});
    }
    if(_dpto8) _lista8=_lista8.filter(function(x){return norm(x.departamento||'')===norm(_dpto8);});
    if(_mun8)  _lista8=_lista8.filter(function(x){return norm(x.municipio||'')===norm(_mun8);});
    if(_part8) _lista8=_lista8.filter(function(x){return norm(x.partido||'')===norm(_part8);});
    _lista8.forEach(function(cx){
      var txData=TX_CACHE[cx.id]||[];
      var obs=[];
      var ingArr8=txData.filter(function(t){return t.concepto==='INGRESO';});
      var gasArr8=txData.filter(function(t){return t.concepto==='GASTO';});
      ingArr8.forEach(function(t,idx){
        var k='cne_obs_'+cx.id+'_I_'+idx;
        var v='';try{v=localStorage.getItem(k)||'';}catch(e){}
        if(v) obs.push({tipo:'I',comp:t.comprobante||t.nro_comprobante||'\u2014',obs:v,valor:parseFloat(t.valor||0)});
      });
      gasArr8.forEach(function(t,idx){
        var k='cne_obs_'+cx.id+'_G_'+idx;
        var v='';try{v=localStorage.getItem(k)||'';}catch(e){}
        if(v) obs.push({tipo:'G',comp:t.comprobante||t.nro_comprobante||'\u2014',obs:v,valor:parseFloat(t.valor||0)});
      });
      if(obs.length) candObs.push({nombre:cx.nombre,id:cx.id,obs:obs});
    });
  }
  var tieneObs=dictObs||r9bObs||candObs.length;

  // ── Card: resumen observaciones enviadas ──
  var hObs='<div class="card mb-3 border-secondary">'+
    '<div class="card-header fw-semibold py-2 bg-secondary text-white">'+
    '<i class="fa fa-paper-plane me-2"></i>Resumen de Observaciones Enviadas (Paso 7)</div>'+
    '<div class="card-body py-2">';
  if(!tieneObs){
    hObs+='<div class="text-muted small"><i class="fa fa-info-circle me-1"></i>No hay observaciones guardadas en el Paso 7 para este partido.</div>';
  } else {
    if(dictObs){
      hObs+='<div class="small fw-semibold text-danger mb-1"><i class="fa fa-book-open me-1"></i>Obs. Dictamen:</div>'+
        '<pre class="bg-light p-2 rounded small mb-2" style="white-space:pre-wrap;max-height:150px;overflow-y:auto">'+esc(dictObs)+'</pre>';
    }
    if(r9bObs){
      hObs+='<div class="small fw-semibold text-warning mb-1"><i class="fa fa-file-invoice me-1"></i>Obs. Reporte 9B:</div>'+
        '<pre class="bg-light p-2 rounded small mb-2" style="white-space:pre-wrap;max-height:150px;overflow-y:auto">'+esc(r9bObs)+'</pre>';
    }
    if(candObs.length){
      hObs+='<div class="small fw-semibold text-info mb-1"><i class="fa fa-users me-1"></i>Obs. por Candidato ('+candObs.length+'):</div>';
      candObs.forEach(function(co){
        hObs+='<div class="ms-2 mb-1"><strong class="small">'+esc(co.nombre)+'</strong>';
        co.obs.forEach(function(r){
          var bg=r.tipo==='I'?'bg-success':'bg-danger';
          hObs+='<div class="ms-3 small text-muted"><span class="badge '+bg+' me-1">'+r.tipo+'</span>'+esc(r.comp)+' — '+esc(r.obs)+'</div>';
        });
        hObs+='</div>';
      });
    }
  }
  hObs+='</div></div>';

  // ── Card: subir respuesta ──
  var hUpload='<div class="card mb-3 border-primary">'+
    '<div class="card-header fw-semibold py-2 bg-primary text-white">'+
    '<i class="fa fa-upload me-2"></i>Cargar Respuesta del Partido</div>'+
    '<div class="card-body py-2">'+
    '<p class="small text-muted mb-2">Carpeta destino: <code>data/respuestas/'+_cargo8+'/'+_d8+'/'+_m8+'/'+_p8+'/</code></p>'+
    '<div class="row g-2 align-items-end mb-2">'+
    '<div class="col-md-7"><label class="small fw-semibold mb-1">Archivo de respuesta (PDF / Word / Imagen)</label>'+
    '<input type="file" class="form-control form-control-sm" id="inputRespP8" accept=".pdf,.doc,.docx,.jpg,.png,.jpeg"></div>'+
    '<div class="col-md-3"><label class="small fw-semibold mb-1">Fecha de respuesta</label>'+
    '<input type="date" class="form-control form-control-sm" id="fechaRespP8"></div>'+
    '<div class="col-md-2 d-flex flex-column justify-content-end">'+
    '<button class="btn btn-primary w-100" onclick="_subirRespuesta()"><i class="fa fa-cloud-upload-alt me-1"></i>Subir</button></div>'+
    '</div>'+
    '<div id="respUploadStatus"></div>'+
    '</div></div>';

  // ── Card: archivos guardados ──
  var hFiles='<div class="card mb-3 border-success" id="cardRespArchivos">'+
    '<div class="card-header fw-semibold py-2 bg-success text-white d-flex justify-content-between">'+
    '<span><i class="fa fa-folder-open me-2"></i>Archivos de Respuesta Guardados</span>'+
    '<button class="btn btn-sm btn-outline-light" onclick="_listarRespuestas()"><i class="fa fa-sync-alt me-1"></i>Actualizar</button>'+
    '</div>'+
    '<div class="card-body py-2" id="respFilesList">'+
    '<div class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Cargando...</div>'+
    '</div></div>';

  // ── Card: lector PDF (se llena al hacer "Leer") ──
  var hReader='<div class="card mb-3 border-warning" id="cardRespLector" style="display:none">'+
    '<div class="card-header fw-semibold py-2 bg-warning text-dark">'+
    '<i class="fa fa-book-reader me-2"></i>Texto Extraído de la Respuesta</div>'+
    '<div class="card-body py-2">'+
    '<div id="respPdfTexto" class="small bg-light p-2 rounded" style="max-height:300px;overflow-y:auto;white-space:pre-wrap;font-family:monospace"></div>'+
    '<hr>'+
    '<div class="fw-semibold small mb-2"><i class="fa fa-balance-scale me-1 text-warning"></i>Comparación vs Observaciones Enviadas</div>'+
    '<div id="respComparacion" class="small"></div>'+
    '</div></div>';

  el.innerHTML=hObs+hUpload+hFiles+hReader;
  // Guardar parámetros para uso en funciones helper
  el.dataset.cargo=_cargo8; el.dataset.dpto=_d8; el.dataset.mun=_m8; el.dataset.partido=_p8;
  // Cargar lista de archivos automáticamente
  _listarRespuestas();
}


// ─── PASO 8: helpers upload / lista / lectura PDF ────────────────────────
function _getRespEl(){return document.getElementById('panelRespOficio');}
function _respParams(){
  var el=_getRespEl();
  return {cargo:el&&el.dataset.cargo||'',dpto:el&&el.dataset.dpto||'',
          mun:el&&el.dataset.mun||'',partido:el&&el.dataset.partido||''};
}

function _subirRespuesta(){
  var inp=document.getElementById('inputRespP8');
  if(!inp||!inp.files||!inp.files[0]){
    var st=document.getElementById('respUploadStatus');
    if(st) st.innerHTML='<div class="alert alert-warning py-1 small mt-1">Seleccione un archivo primero.</div>';
    return;
  }
  var prm=_respParams();
  var fd=new FormData();
  fd.append('archivo', inp.files[0]);
  fd.append('cargo',   prm.cargo);
  fd.append('dpto',    prm.dpto);
  fd.append('mun',     prm.mun);
  fd.append('partido', prm.partido);
  var st=document.getElementById('respUploadStatus');
  if(st) st.innerHTML='<div class="alert alert-info py-1 small mt-1"><i class="fa fa-spinner fa-spin me-1"></i>Subiendo...</div>';
  fetch('/api/guardar_respuesta',{method:'POST',body:fd})
    .then(function(r){return r.json();})
    .then(function(d){
      if(st){
        if(d.ok){
          st.innerHTML='<div class="alert alert-success py-1 small mt-1"><i class="fa fa-check-circle me-1"></i>Guardado: <strong>'+esc(d.filename)+'</strong> ('+Math.round((d.size||0)/1024)+' KB)</div>';
          inp.value='';
          _listarRespuestas();
        } else {
          st.innerHTML='<div class="alert alert-danger py-1 small mt-1"><i class="fa fa-times-circle me-1"></i>Error: '+esc(d.error||'desconocido')+'</div>';
        }
      }
    })
    .catch(function(e){
      if(st) st.innerHTML='<div class="alert alert-danger py-1 small mt-1"><i class="fa fa-times-circle me-1"></i>Error de conexión: '+esc(String(e))+'</div>';
    });
}

function _listarRespuestas(){
  var prm=_respParams();
  if(!prm.cargo&&!prm.dpto) return;
  var url='/api/lista_respuestas?cargo='+encodeURIComponent(prm.cargo)+'&dpto='+encodeURIComponent(prm.dpto)+'&mun='+encodeURIComponent(prm.mun)+'&partido='+encodeURIComponent(prm.partido);
  var div=document.getElementById('respFilesList');
  if(!div) return;
  fetch(url)
    .then(function(r){return r.json();})
    .then(function(d){
      if(!d.ok){div.innerHTML='<div class="text-danger small">'+esc(d.error)+'</div>';return;}
      if(!d.files||!d.files.length){
        div.innerHTML='<div class="text-muted small"><i class="fa fa-inbox me-1"></i>Carpeta vacía — aún no hay archivos subidos.</div>';
        return;
      }
      var h='<div class="d-flex flex-wrap gap-2">';
      d.files.forEach(function(fn){
        var url2=d.path+encodeURIComponent(fn);
        var isPdf=fn.toLowerCase().endsWith('.pdf');
        h+='<div class="d-flex align-items-center gap-1 border rounded px-2 py-1 bg-light">'+
          '<i class="fa fa-'+(isPdf?'file-pdf text-danger':'file text-secondary')+' me-1"></i>'+
          '<a href="'+url2+'" target="_blank" class="small text-decoration-none">'+esc(fn)+'</a>'+
          (isPdf?'<button class="btn btn-sm btn-outline-warning py-0 ms-1" onclick="_leerRespPdf(\''+url2+'\')">'+
          '<i class="fa fa-book-reader me-1"></i>Leer</button>':'')+
          '</div>';
      });
      h+='</div>';
      div.innerHTML=h;
    })
    .catch(function(e){
      if(div) div.innerHTML='<div class="text-muted small"><i class="fa fa-exclamation-circle me-1"></i>No se pudo conectar al servidor ('+esc(String(e))+').</div>';
    });
}

function _leerRespPdf(url){
  if(typeof pdfjsLib==='undefined'){
    alert('pdf.js no disponible');return;
  }
  var card=document.getElementById('cardRespLector');
  var texDiv=document.getElementById('respPdfTexto');
  var cmpDiv=document.getElementById('respComparacion');
  if(card) card.style.display='';
  if(texDiv) texDiv.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Extrayendo texto del PDF...';
  if(cmpDiv) cmpDiv.innerHTML='';
  fetch(url)
    .then(function(r){return r.arrayBuffer();})
    .then(function(buf){
      return pdfjsLib.getDocument({data:buf}).promise;
    })
    .then(function(pdf){
      var pages=[];
      for(var i=1;i<=pdf.numPages;i++) pages.push(pdf.getPage(i));
      return Promise.all(pages);
    })
    .then(function(pagesArr){
      return Promise.all(pagesArr.map(function(pg){return pg.getTextContent();}));
    })
    .then(function(contents){
      var fullText=contents.map(function(c){return c.items.map(function(it){return it.str;}).join(' ');}).join('\n');
      if(texDiv) texDiv.textContent=fullText;
      _compararRespVsObs(fullText, cmpDiv);
    })
    .catch(function(e){
      if(texDiv) texDiv.innerHTML='<span class="text-danger">Error leyendo PDF: '+esc(String(e))+'</span>';
    });
}

function _compararRespVsObs(texto, div){
  if(!div) return;
  // Cargar observaciones del paso 7
  var el=_getRespEl();
  var _pKey8=(el&&el.dataset.cargo||'')+'_'+(el&&el.dataset.dpto||'')+'_'+(el&&el.dataset.mun||'')+'_'+(el&&el.dataset.partido||'');
  var _d8=el&&el.dataset.dpto||'', _m8=el&&el.dataset.mun||'', _p8=el&&el.dataset.partido||'';
  var dictObs='';try{dictObs=localStorage.getItem('cne_p7_dict_'+_pKey8)||'';}catch(e){}
  var r9bObs='';try{r9bObs=localStorage.getItem('cne_p7_9b_'+_d8+'_'+_m8+'_'+_p8)||'';}catch(e){}
  var allObs=(dictObs+'\n'+r9bObs).trim();
  if(!allObs){
    div.innerHTML='<div class="text-muted small"><i class="fa fa-info-circle me-1"></i>Sin observaciones del Paso 7 para comparar.</div>';
    return;
  }
  // Extraer palabras clave de las observaciones (palabras > 4 chars)
  var palabras=allObs.split(/\s+/).filter(function(w){return w.length>4;})
    .map(function(w){return w.toUpperCase().replace(/[^A-Z0-9\u00C0-\u00FF]/g,'');})
    .filter(function(w){return w.length>3;});
  // Deduplicar
  var uniq={};palabras.forEach(function(w){uniq[w]=1;});
  var kws=Object.keys(uniq).slice(0,30);
  var textoUp=texto.toUpperCase();
  var encontradas=[], noEncontradas=[];
  kws.forEach(function(kw){
    if(textoUp.indexOf(kw)!==-1) encontradas.push(kw);
    else noEncontradas.push(kw);
  });
  var pct=kws.length?Math.round(encontradas.length/kws.length*100):0;
  var color=pct>=70?'success':pct>=40?'warning':'danger';
  var h='<div class="mb-2"><span class="badge bg-'+color+' fs-6">'+pct+'% de coincidencia</span>'+
    ' <small class="text-muted">('+encontradas.length+'/'+kws.length+' palabras clave)</small></div>';
  if(encontradas.length){
    h+='<div class="small mb-1"><i class="fa fa-check-circle text-success me-1"></i><strong>Menciona:</strong> ';
    h+=encontradas.map(function(k){return '<span class="badge bg-success me-1">'+esc(k)+'</span>';}).join('');
    h+='</div>';
  }
  if(noEncontradas.length){
    h+='<div class="small mb-1"><i class="fa fa-times-circle text-danger me-1"></i><strong>No menciona:</strong> ';
    h+=noEncontradas.map(function(k){return '<span class="badge bg-danger me-1">'+esc(k)+'</span>';}).join('');
    h+='</div>';
  }
  div.innerHTML=h;
}

