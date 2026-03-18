// ─── PASO 2: DICTAMEN ────────────────────────────────────────────────────
function _selectCrit(bloque,key,val){
  var estados=['PENDIENTE','OK','NO CUMPLE','NO APLICA'];
  return '<select class="form-select form-select-sm w-auto" onchange="updateCrit(\''+bloque+'\',\''+key+'\',this.value)">'+
    estados.map(function(e){return '<option value="'+e+'"'+(val===e?' selected':'')+'>'+e+'</option>';}).join('')+
    '</select>';
}
function _selectCritCoal(coalKey,field,val){
  var opts=['','CUMPLE','NO CUMPLE','NO APLICA'];
  var labels=['Pendiente','CUMPLE','NO CUMPLE','NO APLICA'];
  return '<select class="form-select form-select-sm w-auto d-inline-block" style="width:130px!important" onchange="_saveCoalField(\''+coalKey+'\',\''+field+'\',this.value)">'+
    opts.map(function(o,i){return '<option value="'+o+'"'+(val===o?' selected':'')+'>'+labels[i]+'</option>';}).join('')+'</select>';
}
function _saveCoalField(coalKey,field,val){
  var ls={};try{ls=JSON.parse(localStorage.getItem(coalKey)||'{}');}catch(e){}
  ls[field]=val;
  try{localStorage.setItem(coalKey,JSON.stringify(ls));}catch(e){}
}
// Leer acuerdo de coalición PDF
function _leerAcuerdoCoalicion(coalKey,file){
  var statusEl=document.getElementById('coalAcuerdoStatus');
  var resultEl=document.getElementById('coalAcuerdoResult');
  if(statusEl) statusEl.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Leyendo PDF...';
  if(resultEl) resultEl.innerHTML='';
  var reader=new FileReader();
  reader.onload=function(ev){
    var arr=new Uint8Array(ev.target.result);
    if(typeof pdfjsLib==='undefined'){
      if(statusEl) statusEl.innerHTML='<span class="text-danger">PDF.js no disponible</span>';
      return;
    }
    pdfjsLib.getDocument({data:arr}).promise.then(function(pdf){
      var pageTexts=[],n=pdf.numPages,loaded=0;
      for(var i=1;i<=n;i++){
        (function(pn){
          pdf.getPage(pn).then(function(page){
            page.getTextContent().then(function(tc){
              pageTexts[pn-1]=tc.items.map(function(it){return it.str;}).join(' ');
              loaded++;
              if(loaded===n){
                var fullTxt=pageTexts.join('\n');
                _analizarAcuerdoCoalicion(coalKey,fullTxt);
              }
            });
          });
        })(i);
      }
    }).catch(function(err){
      if(statusEl) statusEl.innerHTML='<span class="text-danger">Error: '+esc(err.message)+'</span>';
    });
  };
  reader.readAsArrayBuffer(file);
}
// Analizar texto extraído del acuerdo
function _analizarAcuerdoCoalicion(coalKey,txt){
  var statusEl=document.getElementById('coalAcuerdoStatus');
  var resultEl=document.getElementById('coalAcuerdoResult');
  var ls={};try{ls=JSON.parse(localStorage.getItem(coalKey)||'{}');}catch(e){}
  var res={fecha:'',candidatos:[],distribucion:'',partido_resp:'',texto_completo:txt};

  // 1. Extraer FECHA — buscar patrones de fecha
  var fechaPatterns=[
    /(?:fecha|suscri[a-z]*|firm[a-z]*)\s*[:.]?\s*(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de(?:l)?\s+)?(\d{4})/i,
    /(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de(?:l)?\s+)?(\d{4})/i,
    /(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/
  ];
  var meses={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
  for(var fp=0;fp<fechaPatterns.length;fp++){
    var fm=txt.match(fechaPatterns[fp]);
    if(fm){
      if(fm[2]&&meses[fm[2].toLowerCase()]){
        var d=('0'+fm[1]).slice(-2);
        var m=meses[fm[2].toLowerCase()];
        res.fecha=fm[3]+'-'+m+'-'+d;
      } else if(fm[1]&&fm[2]&&fm[3]&&!meses[fm[2]]){
        res.fecha=fm[3]+'-'+('0'+fm[2]).slice(-2)+'-'+('0'+fm[1]).slice(-2);
      }
      if(res.fecha) break;
    }
  }

  // 2. Extraer CANDIDATOS — buscar cédulas (números de 6-10 dígitos cerca de nombres)
  var ccPattern=/(?:C\.?\s*C\.?|[Cc][eé]dula)\s*(?:N[oº°]?\.?)?\s*[:.]?\s*([\d.,]+)/g;
  var ccMatch;
  var ccFound=[];
  while((ccMatch=ccPattern.exec(txt))!==null){
    var ccNum=ccMatch[1].replace(/[.,]/g,'').trim();
    if(ccNum.length>=6&&ccNum.length<=12) ccFound.push(ccNum);
  }
  // También buscar números largos que parecen cédulas
  var numPattern=/\b(\d{6,10})\b/g;
  var numMatch;
  while((numMatch=numPattern.exec(txt))!==null){
    var n=numMatch[1];
    if(n.length>=7&&ccFound.indexOf(n)===-1) ccFound.push(n);
  }
  // Cruzar con CANDIDATOS conocidos
  if(CANDIDATOS){
    for(var _ck in CANDIDATOS){
      var cx=CANDIDATOS[_ck];
      var cid=String(cx.id||'').replace(/[.,]/g,'');
      for(var _ci=0;_ci<ccFound.length;_ci++){
        if(ccFound[_ci]===cid){ res.candidatos.push({nombre:cx.nombre||'',id:cx.id}); break; }
      }
    }
  }

  // 3. Extraer CLÁUSULA DE DISTRIBUCIÓN
  var distPatterns=[
    /(?:distribuci[oó]n|reparto|asignaci[oó]n)\s+(?:de\s+)?(?:los\s+)?(?:recursos|gastos|financiaci[oó]n|aportes)[^.]*(?:\.[^.]*){0,5}/i,
    /(?:cl[aá]usula|art[ií]culo|numeral)\s*[^.]*distribuci[oó]n[^.]*(?:\.[^.]*){0,3}/i,
    /(?:recursos|gastos|financiaci[oó]n)[^.]*(?:por\s+partes\s+iguales|proporcional|porcentaje|(?:\d+\s*%))[^.]*\./i,
    /(?:cada\s+(?:partido|organizaci[oó]n|movimiento))[^.]*(?:asum|respons|encarg)[^.]*\./i
  ];
  for(var dp=0;dp<distPatterns.length;dp++){
    var dm=txt.match(distPatterns[dp]);
    if(dm){ res.distribucion=dm[0].trim(); break; }
  }
  // Si no encontró con patrones, buscar párrafo con palabra 'distribución'
  if(!res.distribucion){
    var distIdx=txt.toLowerCase().indexOf('distribuci');
    if(distIdx===-1) distIdx=txt.toLowerCase().indexOf('reparto');
    if(distIdx>=0){
      var parStart=Math.max(0,txt.lastIndexOf('.',distIdx-1)+1);
      var parEnd=txt.indexOf('.',distIdx+50);
      if(parEnd===-1) parEnd=Math.min(txt.length,distIdx+500);
      res.distribucion=txt.substring(parStart,parEnd+1).trim();
    }
  }

  // 4. Extraer PARTIDO RESPONSABLE de rendición
  var respPatterns=[
    /(?:responsable|encargad[oa]|a\s+cargo)\s+(?:de\s+)?(?:la\s+)?(?:rendici[oó]n|presentaci[oó]n|informe)[^.]*(?:ser[aá]|recae|corresponde)[^.]*\b([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)\b/i,
    /(?:rendici[oó]n|informe)[^.]*(?:responsab|cargo|encarg)[^.]*\b(PARTIDO[A-ZÁÉÍÓÚÑ\s]+|MOVIMIENTO[A-ZÁÉÍÓÚÑ\s]+)/i,
    /(?:PARTIDO|MOVIMIENTO)\s+[A-ZÁÉÍÓÚÑ\s]+(?:ser[aá]|asumir[aá]|tendr[aá])\s+(?:la\s+)?responsab/i
  ];
  for(var rp=0;rp<respPatterns.length;rp++){
    var rm=txt.match(respPatterns[rp]);
    if(rm){
      res.partido_resp=rm[1]?(rm[1].trim()):(rm[0].trim());
      break;
    }
  }
  // Buscar patrón más simple: partido + responsable/rendición
  if(!res.partido_resp){
    var respSimple=txt.match(/(?:PARTIDO|MOVIMIENTO)\s+[A-ZÁÉÍÓÚÑ\s]{5,50}(?=.*(?:responsabl|rendici|present|informe))/i);
    if(respSimple) res.partido_resp=respSimple[0].trim();
  }

  // Guardar resultados
  if(res.fecha){
    ls.fecha_acuerdo=res.fecha;
    var fechaInput=document.querySelector('[onchange*="fecha_acuerdo"]');
    if(fechaInput) fechaInput.value=res.fecha;
  }
  if(res.distribucion) ls.clausula_distribucion=res.distribucion;
  if(res.partido_resp) ls.partido_responsable=res.partido_resp;
  ls.acuerdo_texto=txt.substring(0,5000);
  try{localStorage.setItem(coalKey,JSON.stringify(ls));}catch(e){}

  // Mostrar resultados
  if(statusEl) statusEl.innerHTML='<span class="text-success"><i class="fa fa-check-circle me-1"></i>PDF leído correctamente</span>';
  var rhtml='<div class="small mt-2">';

  // Fecha
  rhtml+='<div class="mb-2"><strong><i class="fa fa-calendar me-1"></i>Fecha del acuerdo:</strong> ';
  if(res.fecha) rhtml+='<span class="badge bg-success">'+esc(res.fecha)+'</span>';
  else rhtml+='<span class="badge bg-secondary">No encontrada</span>';
  rhtml+='</div>';

  // Candidatos encontrados
  rhtml+='<div class="mb-2"><strong><i class="fa fa-users me-1"></i>Candidatos en acuerdo:</strong> ';
  if(res.candidatos.length){
    rhtml+='<span class="badge bg-info">'+res.candidatos.length+' encontrado(s)</span><ul class="mb-0 mt-1">';
    res.candidatos.forEach(function(cx){rhtml+='<li>'+esc(cx.nombre)+' ('+esc(cx.id)+')</li>';});
    rhtml+='</ul>';
  } else rhtml+='<span class="badge bg-secondary">No identificados automáticamente</span>';
  rhtml+='</div>';

  // Partido responsable
  rhtml+='<div class="mb-2"><strong><i class="fa fa-building me-1"></i>Partido responsable rendición:</strong> ';
  if(res.partido_resp) rhtml+='<span class="badge bg-warning text-dark">'+esc(res.partido_resp)+'</span>';
  else rhtml+='<span class="badge bg-secondary">No identificado</span>';
  rhtml+='</div>';

  // Cláusula de distribución
  rhtml+='<div class="mb-2"><strong><i class="fa fa-balance-scale me-1"></i>Cláusula de distribución:</strong>';
  if(res.distribucion){
    rhtml+='<div class="border rounded p-2 mt-1 bg-light" style="max-height:200px;overflow-y:auto;white-space:pre-wrap;font-size:0.8rem">';
    rhtml+=esc(res.distribucion);
    rhtml+='</div>';
  } else rhtml+=' <span class="badge bg-secondary">No encontrada</span>';
  rhtml+='</div>';

  rhtml+='</div>';
  if(resultEl) resultEl.innerHTML=rhtml;
}
function _selectCritDic(bloque,key,val){
  var estados=['PENDIENTE','CUMPLE','NO CUMPLE','NO APLICA'];
  return '<select class="form-select form-select-sm w-auto" onchange="updateCrit(\''+bloque+'\',\''+key+'\',this.value)">'+
    estados.map(function(e){return '<option value="'+e+'"'+(val===e?' selected':'')+'>'+e+'</option>';}).join('')+
    '</select>';
}

// ── Loader: R8B_INDEX ──
function _cargarR8BIndex(cb){
  if(R8B_INDEX!==null) return cb();
  fetch('data/r8b_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ R8B_INDEX=d; cb(); })
    .catch(function(){ R8B_INDEX={}; cb(); });
}
// ── Loader: R9B_INDEX ──
function _cargarR9BIndex(cb){
  if(R9B_INDEX!==null) return cb();
  fetch('data/r9b_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ R9B_INDEX=d; cb(); })
    .catch(function(){ R9B_INDEX={}; cb(); });
}
// ── Loader: IG_DOCS_INDEX ──
function _cargarIGDocsIndex(cb){
  if(IG_DOCS_INDEX!==null) return cb();
  fetch('data/ig_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ IG_DOCS_INDEX=d; cb(); })
    .catch(function(){ IG_DOCS_INDEX={}; cb(); });
}
// ── Browse dictamenes por Corp/Dpto/Mun (Paso 2) ──
function _renderDictBrowse(){
  var elBrowse=document.getElementById('panelDictBrowse');
  if(!elBrowse) return;
  var corp=document.getElementById('selCorp').value;
  var dpto=document.getElementById('selDpto').value;
  var mun =document.getElementById('selMun').value;
  var selPart=document.getElementById('selPartido');
  var partido=selPart?selPart.value:'';
  if(!corp||!dpto){ elBrowse.innerHTML=''; return; }
  elBrowse.innerHTML='<span class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Cargando dictamenes...</span>';
  // Cargar datos CC de dictamen si no están disponibles
  if(!window._ccGestionMunData||!window._ccGestionMunData.dictamen||!window._ccGestionMunData.dictamen.length){
    var _dbUrl='/api/cne_dictamen_filtrado?dpto='+encodeURIComponent(dpto)+'&mun='+encodeURIComponent(mun||'');
    fetch(_dbUrl).then(function(r){return r.ok?r.json():{};}).then(function(data){
      if(data.dictamen&&data.dictamen.length){
        window._ccGestionMunData=window._ccGestionMunData||{};
        window._ccGestionMunData.dictamen=data.dictamen;
        console.log('[DictBrowse] Cargados '+data.dictamen.length+' dictamenes CC');
        _renderDictBrowseInner(elBrowse,corp,dpto,mun,partido);
      } else {
        console.log('[DictBrowse] Sin dictamenes CC, usando local');
        _renderDictBrowseInner(elBrowse,corp,dpto,mun,partido);
      }
    }).catch(function(e){console.warn('[DictBrowse] Error cargando CC:',e);_renderDictBrowseInner(elBrowse,corp,dpto,mun,partido);});
    return;
  }
  _renderDictBrowseInner(elBrowse,corp,dpto,mun,partido);
}
function _renderDictBrowseInner(elBrowse,corp,dpto,mun,partido){
  _cargarDictIndex(function(){
    var cargoKey=_normCargoDict(corp);
    var dN=_normFNFP(dpto), mN=_normFNFP(mun);
    var esDpto=(cargoKey==='ASAMBLEA'||cargoKey==='GOBERNACION'||cargoKey==='JUNTA_ADMINISTRADORAS_LOCALES');
    var mF=esDpto?'SIN_MUN':mN;
    var dEntry=DICT_INDEX[dN];
    if(!dEntry){ elBrowse.innerHTML='<div class="alert alert-secondary py-2 small">Sin dictamenes indexados para <b>'+esc(dpto)+'</b></div>'; return; }
    // Recolectar entradas de municipio
    var mEntries={};
    if(mF&&dEntry[mF]){ mEntries[mF]=dEntry[mF]; }
    else if(!mun||esDpto){
      // Sin municipio seleccionado o cargo departamental: mostrar todos los municipios
      Object.keys(dEntry).forEach(function(mk){ mEntries[mk]=dEntry[mk]; });
    } else {
      // Fuzzy match de municipio
      var kk=Object.keys(dEntry);
      var found=false;
      for(var i=0;i<kk.length;i++){
        if(_alphaKey(kk[i]).indexOf(_alphaKey(mF))!==-1||_alphaKey(mF).indexOf(_alphaKey(kk[i]))!==-1){
          mEntries[kk[i]]=dEntry[kk[i]]; found=true; break;
        }
      }
      if(!found) Object.keys(dEntry).forEach(function(mk){ mEntries[mk]=dEntry[mk]; });
    }
    // Contar partidos con dictamen (para el badge)
    var total=0, munKeys=Object.keys(mEntries).sort();
    munKeys.forEach(function(mk){
      var partidos=mEntries[mk];
      var pAK=partido?_alphaKey(partido):'';
      Object.keys(partidos).sort().forEach(function(pk){
        if(pAK){var pkAK=_alphaKey(pk);if(pkAK!==pAK&&pkAK.indexOf(pAK)===-1&&pAK.indexOf(pkAK)===-1)return;}
        var paths=(partidos[pk]||{})[cargoKey];
        if(!paths) return;
        total++;
      });
    });
    // Renderizar
    var h;
    if(total>0){
      // Cargar análisis + auditores, luego renderizar completo (sin requerir CAND_SELEC)
      _cargarDictAnalisis(function(){ _cargarAuditorDB(function(){
        var _CRITS=[
          ['fundamento_juridico_res3569','Fundamento jurídico integral y vigente (Res.3569/2023 — Res.3476/2005 derogada)','Res.3569/2023'],
          ['descripcion_origen_recursos','Descripción del origen y uso de los recursos','Art.20 L1475/11 y Art.21 L130/94'],
          ['art_23_cumple','Cumplimiento Art. 23 de la Ley 1475/2011 — Financiación de campañas','Art. 23'],
          ['art_24_cumple','Cumplimiento Art. 24 de la Ley 1475/2011 — Fuentes de financiación','Art. 24'],
          ['art_25_cumple','Cumplimiento Art. 25 de la Ley 1475/2011 — Obligaciones gerente de campaña','Art. 25'],
          ['art_34_cumple','Cumplimiento Art. 34 de la Ley 1475/2011 — Rendición de cuentas','Art. 34'],
          ['art_27_financiacion_prohibida','Concepto sobre financiación prohibida (Art.27 L1475/2011)','Art. 27'],
          ['candidato_correcto','El dictamen es del candidato','Verificación'],
          ['suscrito_auditor','Suscrito por el Auditor Interno o quien delegó','Verificación'],
          ['revela_otros_hechos','Auditor revela otros hechos relevantes','L1475/2011'],
          ['abstencion_opinion_renuentes','Abstención de opinión por renuentes (no presentación / no corrección)','Verificación'],
        ];
        h='<div class="card border-success mb-3"><div class="card-header py-2 d-flex align-items-center gap-2">'+
          '<i class="fa fa-book-open text-success"></i>'+
          '<span class="fw-semibold">Dictamenes &mdash; '+esc(corp)+' / '+esc(dpto)+(mun?' / '+esc(mun):'')+'</span>'+
          '<span class="badge bg-success ms-auto">'+total+' partido'+(total!==1?'s':'')+'</span>'+
          '</div></div>';
        var _bIdx=0;
        munKeys.forEach(function(mk){
          var partidos=mEntries[mk];
          var pAK=partido?_alphaKey(partido):'';
          Object.keys(partidos).sort().forEach(function(pk){
            if(pAK){var pkAK=_alphaKey(pk);if(pkAK!==pAK&&pkAK.indexOf(pAK)===-1&&pAK.indexOf(pkAK)===-1)return;}
            var paths=(partidos[pk]||{})[cargoKey];
            if(!paths) return;
            if(!Array.isArray(paths)) paths=[paths];
            var lsKey='cne_dict_browse_'+cargoKey+'_'+dN+'_'+mF+'_'+pk;
            var criSaved={};try{criSaved=JSON.parse(localStorage.getItem(lsKey)||'{}');}catch(e){}
            var obsSaved='';try{obsSaved=localStorage.getItem(lsKey+'_obs')||'';}catch(e){}
            var taId='_dbObs'+(_bIdx++);
            // PDFs — Prioridad: CC > local
            var hPdf='';
            var _ccDictBrowse=[];
            if(window._ccGestionMunData&&window._ccGestionMunData.dictamen){
              var _dbCorpN=_normNoTilde(corp).replace(/[_\s]+/g,'');
              var _dbPkN=_alphaKey(pk);
              var _dbMN=_normNoTilde(mun||mk);
              window._ccGestionMunData.dictamen.forEach(function(item){
                var corpCC=_normNoTilde(item.corporacionNombre||'').replace(/[_\s]+/g,'');
                if(corpCC.indexOf(_dbCorpN)===-1&&_dbCorpN.indexOf(corpCC)===-1) return;
                var munCC=_normNoTilde(item.munipioNombre||item.municipioNombre||'');
                if(munCC!==_dbMN&&_dbMN!=='SIN_MUN'&&munCC!=='') return;
                var orgCC=_alphaKey(item.agrupacionPoliticaNombre||item.coalicionPoliticaNombre||'');
                if(orgCC!==_dbPkN&&orgCC.indexOf(_dbPkN)===-1&&_dbPkN.indexOf(orgCC)===-1) return;
                var arch=item.dictamen_auditoria||item.archivo||'';
                if(arch){
                  var fn=arch.split('/').pop();
                  var pdfUrl=arch.indexOf('/')!==-1?'/api/cne/storage/app/'+encodeURI(arch):'/api/cne/storage/app/archivos/dictamen_auditoria/'+encodeURIComponent(fn);
                  console.log('[Dictamen P1] arch="'+arch+'" → url="'+pdfUrl+'"');
                  _ccDictBrowse.push({url:pdfUrl,nombre:fn,fecha:item.created_at||''});
                }
              });
            }
            if(_ccDictBrowse.length){
              hPdf='<div class="card mb-2 border-success"><div class="card-body py-2">';
              hPdf+='<div class="mb-1"><small class="text-success"><i class="fa fa-cloud me-1"></i>Fuente: Cuentas Claras CNE</small></div>';
              _ccDictBrowse.forEach(function(d){
                hPdf+='<a href="'+d.url+'" target="_blank" class="btn btn-sm btn-outline-danger w-100 mb-1">'+
                  '<i class="fa fa-file-pdf me-2"></i>'+esc(d.nombre)+'</a>';
                if(d.fecha) hPdf+='<br><small class="text-muted ms-2">Radicado: '+esc(d.fecha.substring(0,10))+'</small>';
              });
              hPdf+='</div></div>';
            } else {
              hPdf='<div class="card mb-2 border-warning"><div class="card-body py-2">';
              hPdf+='<div class="mb-1"><small class="text-muted"><i class="fa fa-folder me-1"></i>Fuente: Archivo local</small></div>';
              paths.forEach(function(p){
                var fname=p.substring(p.lastIndexOf('/')+1);
                hPdf+='<a href="'+_encodePath(p)+'" target="_blank" class="btn btn-sm btn-outline-danger w-100 mb-1">'+
                  '<i class="fa fa-file-pdf me-2"></i>'+esc(fname)+'</a>';
              });
              hPdf+='</div></div>';
            }
            // Análisis automático
            var an=null;
            if(DICT_ANALISIS){
              var _dkA=_normNoTilde(dpto),_mkA=esDpto?'SIN_MUN':_normNoTilde(mun||mk),_pkA=_alphaKey(pk);
              var _aks=Object.keys(DICT_ANALISIS);
              for(var _ai=0;_ai<_aks.length;_ai++){var _ap=_aks[_ai].split('/');if(_ap[0]===_dkA&&_ap[1]===_mkA&&_alphaKey(_ap[2])===_pkA&&_ap[3]===cargoKey){an=DICT_ANALISIS[_aks[_ai]];break;}}
              if(!an){for(var _aj=0;_aj<_aks.length;_aj++){var _ap2=_aks[_aj].split('/');if(_ap2[0]===_dkA&&_ap2[1]===_mkA&&_ap2[3]===cargoKey){var _kn=_alphaKey(_ap2[2]);if(_kn.indexOf(_pkA)!==-1||_pkA.indexOf(_kn)!==-1){an=DICT_ANALISIS[_aks[_aj]];break;}}}}
            }
            var hAnal='';
            if(an){
              var _opC={FAVORABLE:'success',DESFAVORABLE:'danger',ABSTENCION:'warning'};
              var _op=an.opinion_tipo||'',_ocl=_opC[_op]||'secondary';
              hAnal='<div class="card mb-2 border-info"><div class="card-header fw-semibold py-2 bg-light">'+
                '<i class="fa fa-robot me-2 text-info"></i>Análisis Automático del Dictamen</div>'+
                '<div class="card-body py-2"><div class="d-flex gap-2 align-items-center flex-wrap mb-1">'+
                '<span class="badge bg-'+_ocl+' fs-6">'+esc(_op||'—')+'</span>';
              if(an.fecha_dictamen||an.fecha) hAnal+='<span class="badge bg-info"><i class="fa fa-calendar me-1"></i>Fecha: '+esc(an.fecha_dictamen||an.fecha)+'</span>';
              if(an.auditor_nombre) hAnal+='<span class="small">Auditor: <b>'+esc(an.auditor_nombre)+'</b></span>';
              if(an.auditor_tp) hAnal+='<span class="badge bg-info text-dark">T.P. '+esc(an.auditor_tp)+'</span>';
              if(an.auditor_cc) hAnal+='<span class="small">CC: '+esc(an.auditor_cc)+'</span>';
              hAnal+='</div>';
              if(an.observaciones&&an.observaciones.length){hAnal+='<ul class="small mb-0 mt-1">';an.observaciones.forEach(function(o){hAnal+='<li>'+esc(o)+'</li>';});hAnal+='</ul>';}
              hAnal+='</div></div>';
            }
            // Observaciones Iniciales
            var hObs='<div class="card mb-2 border-secondary"><div class="card-header fw-semibold py-2 bg-light">'+
              '<i class="fa fa-pen me-2 text-secondary"></i>Observaciones Iniciales <small class="text-muted">(después de leer el PDF del dictamen)</small></div>'+
              '<div class="card-body py-2">'+
              '<textarea id="'+taId+'" class="form-control form-control-sm" rows="5" placeholder="Escriba sus observaciones sobre el dictamen...">'+esc(obsSaved)+'</textarea>'+
              '<div class="text-end mt-1"><button class="btn btn-sm btn-outline-primary" onclick="_saveDictObsBrowse(\''+lsKey+'\',\''+taId+'\')">'+
              '<i class="fa fa-save me-1"></i>Guardar</button></div></div></div>';
            // Criterios
            var _aCrit=(an&&an.criterios)?an.criterios:{};
            var hCri='<div class="card mb-2"><div class="card-header fw-semibold py-2 bg-light">Criterios del Dictamen <small class="text-muted">(CUMPLE / NO CUMPLE)</small></div>'+
              '<div class="card-body p-0"><table class="table table-sm mb-0 tabla-obs"><tbody>';
            _CRITS.forEach(function(cr){
              var uv=criSaved[cr[0]]||'',av=_aCrit[cr[0]]||'';
              var v=(uv&&uv!=='PENDIENTE')?uv:((av&&av!=='PENDIENTE')?av:'PENDIENTE');
              hCri+='<tr><td class="small">'+esc(cr[1])+' <span class="text-muted" style="font-size:.7rem">'+esc(cr[2])+'</span></td>'+
                '<td>'+_selectCritBrowse(lsKey,cr[0],v)+'</td></tr>';
            });
            hCri+='</tbody></table></div></div>';
            // Auditores
            var pReal=pk;
            Object.keys(partidos).forEach(function(k){if(_alphaKey(k)===_alphaKey(pk))pReal=k;});
            var auds=_findAuditores(pReal);
            var _dACC=an?((an.auditor_cc||'').replace(/\./g,'')):'',_dATP=an?(an.auditor_tp||''):'';
            var hAud='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">'+
              '<i class="fa fa-id-card me-2 text-info"></i>Auditor(es) del Partido — '+esc(pReal)+'</div><div class="card-body">';
            if(auds.length){
              hAud+='<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead><tr>'+
                '<th class="small" style="width:30px"></th><th class="small">Nombre</th><th class="small">Cédula</th><th class="small">T.P.</th><th class="small">Estado JCC</th></tr></thead><tbody>';
              auds.forEach(function(a){
                var jR=JCC_RESULTADOS[a.c]||{},est=jR.tp_estado||'PENDIENTE';
                var cols={VIGENTE:'success',ACTIVO:'success','NO ENCONTRADO':'danger','SUSPENDIDA/INHABILITADA':'danger',PENDIENTE:'secondary',ERROR:'warning'};
                var bdg='<span class="badge bg-'+(cols[est]||'secondary')+'">'+esc(est)+'</span>';
                var nJcc=jR.nombre_jcc?(' <small class="text-muted">('+esc(jR.nombre_jcc)+')</small>'):'';
                var tp=jR.tarjeta||'—';
                var ef=(_dACC&&a.c&&a.c.replace(/\./g,'')===_dACC)||(_dATP&&tp&&tp.replace(/[\-\s]/g,'').indexOf(_dATP.replace(/[\-\s]/g,''))!==-1);
                var rc=ef?' class="table-success"':'';
                hAud+='<tr'+rc+'><td class="text-center">'+(ef?'<i class="fa fa-check-circle text-success"></i>':'')+'</td>'+
                  '<td class="small">'+esc(a.n)+nJcc+'</td><td class="small">'+esc(a.c)+'</td><td class="small">'+esc(tp)+'</td><td>'+bdg+'</td></tr>';
              });
              hAud+='</tbody></table></div>';
            } else { hAud+='<div class="text-muted small">No se encontraron auditores registrados para este partido</div>'; }
            hAud+='</div></div>';
            // Dictamen Definitivo — subir y leer con JS puro
            var _defId=taId;
            var _defMetaStr=JSON.stringify({cargo:corp,dpto:dpto,municipio:mun,partido:pk}).replace(/"/g,'&quot;');
            var hDef='<div class="card mb-3 border-primary"><div class="card-header fw-semibold py-2 bg-light">'+
              '<i class="fa fa-upload me-2 text-primary"></i>Dictamen Definitivo &mdash; '+esc(pk)+'</div>'+
              '<div class="card-body py-2">'+
              '<div class="d-flex gap-2 mb-2 align-items-center flex-wrap">'+
              '<label class="btn btn-sm btn-outline-primary mb-0" for="dictDefInput_'+_defId+'" title="Seleccionar PDF del dictamen definitivo">'+
                '<i class="fa fa-upload me-1"></i>Subir dictamen definitivo</label>'+
              '<input type="file" id="dictDefInput_'+_defId+'" accept=".pdf" class="d-none" onchange="_onDictDefUpload(this,\''+_defId+'\')">'+
              '<button class="btn btn-sm btn-success" onclick="_leerDictDef(\''+_defId+'\',\''+_defMetaStr+'\')">'+
                '<i class="fa fa-search me-1"></i>Leer</button>'+
              '<span id="dictDefName_'+_defId+'" class="text-muted small fst-italic"></span>'+
              '</div>'+
              '<div id="dictDefResult_'+_defId+'"></div>'+
              '</div></div>';
            h+=hPdf+hAnal+hObs+hCri+hAud+hDef;
          });
        });
        elBrowse.innerHTML=h;
      }); });
    } else {
      // Sin dictamen en índice: mostrar botones para subir y leer manualmente
      var _metaStr=JSON.stringify({cargo:corp,dpto:dpto,municipio:mun}).replace(/"/g,'&quot;');
      h='<div class="card border-warning mb-2"><div class="card-header py-2 d-flex align-items-center gap-2">'+
        '<i class="fa fa-book-open text-warning"></i>'+
        '<span class="fw-semibold">Dictamenes &mdash; '+esc(corp)+' / '+esc(dpto)+(mun?' / '+esc(mun):'')+'</span>'+
        '<span class="badge bg-secondary ms-auto">Sin dictamen en índice</span>'+
        '</div><div class="card-body py-2">'+
        '<div class="d-flex gap-2 mb-2 align-items-center flex-wrap">'+
        '<label class="btn btn-sm btn-outline-primary mb-0" for="dictUploadInput" title="Seleccionar PDF del dictamen">'+
          '<i class="fa fa-upload me-1"></i>Subir Dictamen</label>'+
        '<input type="file" id="dictUploadInput" accept=".pdf" class="d-none" onchange="_onDictUpload(this)">'+
        '<button class="btn btn-sm btn-success" onclick="_leerDictamen(\''+_metaStr+'\')">'+
          '<i class="fa fa-search me-1"></i>Leer</button>'+
        '<span id="dictUploadName" class="text-muted small fst-italic"></span>'+
        '</div>'+
        '<div id="dictLectorResult"></div>'+
        '</div></div>';
      elBrowse.innerHTML=h;
    }
  });
}

// ── Helpers browse dictamen (sin CAND_SELEC) ──────────────────────────
function _selectCritBrowse(lsKey,key,val){
  var estados=['PENDIENTE','CUMPLE','NO CUMPLE','NO APLICA'];
  return '<select class="form-select form-select-sm w-auto" onchange="_updateCritBrowse(\''+lsKey+'\',\''+key+'\',this.value)">'+
    estados.map(function(e){return '<option value="'+e+'"'+(val===e?' selected':'')+'>'+e+'</option>';}).join('')+'</select>';
}
function _updateCritBrowse(lsKey,key,val){
  var ls={};try{ls=JSON.parse(localStorage.getItem(lsKey)||'{}');}catch(e){}
  ls[key]=val;
  try{localStorage.setItem(lsKey,JSON.stringify(ls));}catch(e){}
}
function _saveDictObsBrowse(lsKey,taId){
  var ta=document.getElementById(taId);
  if(ta) try{localStorage.setItem(lsKey+'_obs',ta.value);}catch(e){}
}

// ══════════════════════════════════════════════════════════════════════
// LECTOR DE DICTAMEN — JavaScript puro, sin Python
// Usa PDF.js (cargado desde CDN) para extraer texto del PDF subido
// ══════════════════════════════════════════════════════════════════════
var _dictUploadFile=null;
// Inicializar PDF.js worker
(function(){
  if(typeof pdfjsLib!=='undefined'){
    pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/js/pdf.worker.min.js';
  }
})();

function _onDictUpload(input){
  if(input.files&&input.files[0]){
    _dictUploadFile=input.files[0];
    var span=document.getElementById('dictUploadName');
    if(span) span.textContent=_dictUploadFile.name;
    var lbl=document.querySelector('label[for="dictUploadInput"]');
    if(lbl) lbl.innerHTML='<i class="fa fa-file-pdf me-1 text-danger"></i>'+esc(_dictUploadFile.name.substring(0,35));
  }
}

function _leerDictamen(metaStr){
  if(!_dictUploadFile){alert('Primero seleccione el PDF del dictamen con el botón "Subir Dictamen".');return;}
  var el=document.getElementById('dictLectorResult');
  if(el) el.innerHTML='<span class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Leyendo PDF...</span>';
  var meta={};
  try{if(metaStr) meta=JSON.parse(metaStr);}catch(e){}
  var reader=new FileReader();
  reader.onload=function(ev){
    var arr=new Uint8Array(ev.target.result);
    if(typeof pdfjsLib==='undefined'){
      if(el) el.innerHTML='<div class="alert alert-danger">PDF.js no está disponible. Verifique conexión a internet.</div>';
      return;
    }
    pdfjsLib.getDocument({data:arr}).promise.then(function(pdf){
      var pageTexts=[], n=pdf.numPages, loaded=0;
      for(var i=1;i<=n;i++){
        (function(pn){
          pdf.getPage(pn).then(function(page){
            page.getTextContent().then(function(tc){
              pageTexts[pn-1]=tc.items.map(function(it){return it.str;}).join(' ');
              loaded++;
              if(loaded===n){
                var fullTxt=pageTexts.join('\n');
                var result=_analizarDictamenTexto(fullTxt,meta);
                _renderDictLectorResult(result,el);
              }
            });
          });
        })(i);
      }
    }).catch(function(err){
      if(el) el.innerHTML='<div class="alert alert-danger"><i class="fa fa-exclamation-triangle me-1"></i>Error leyendo PDF: '+esc(err.message)+'</div>';
    });
  };
  reader.readAsArrayBuffer(_dictUploadFile);
}

// ── Dictamen Definitivo (caso total>0: ya existe dictamen en índice) ──────────
var _dictDefFiles={};

function _onDictDefUpload(input, idx){
  if(input.files&&input.files[0]){
    _dictDefFiles[idx]=input.files[0];
    var span=document.getElementById('dictDefName_'+idx);
    if(span) span.textContent=_dictDefFiles[idx].name;
    var lbl=document.querySelector('label[for="dictDefInput_'+idx+'"]');
    if(lbl) lbl.innerHTML='<i class="fa fa-file-pdf me-1 text-danger"></i>'+esc(_dictDefFiles[idx].name.substring(0,35));
  }
}

function _leerDictDef(idx, metaStr){
  var f=_dictDefFiles[idx];
  if(!f){alert('Primero seleccione el PDF del dictamen definitivo con el botón "Subir dictamen definitivo".');return;}
  var el=document.getElementById('dictDefResult_'+idx);
  if(el) el.innerHTML='<span class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Leyendo PDF...</span>';
  var meta={};
  try{if(metaStr) meta=JSON.parse(metaStr);}catch(e){}
  var reader=new FileReader();
  reader.onload=function(ev){
    var arr=new Uint8Array(ev.target.result);
    if(typeof pdfjsLib==='undefined'){
      if(el) el.innerHTML='<div class="alert alert-danger">PDF.js no está disponible. Verifique conexión a internet.</div>';
      return;
    }
    pdfjsLib.getDocument({data:arr}).promise.then(function(pdf){
      var pageTexts=[], n=pdf.numPages, loaded=0;
      for(var i=1;i<=n;i++){
        (function(pn){
          pdf.getPage(pn).then(function(page){
            page.getTextContent().then(function(tc){
              pageTexts[pn-1]=tc.items.map(function(it){return it.str;}).join(' ');
              loaded++;
              if(loaded===n){
                var fullTxt=pageTexts.join('\n');
                var result=_analizarDictamenTexto(fullTxt,meta);
                _renderDictLectorResult(result,el);
              }
            });
          });
        })(i);
      }
    }).catch(function(err){
      if(el) el.innerHTML='<div class="alert alert-danger"><i class="fa fa-exclamation-triangle me-1"></i>Error leyendo PDF: '+esc(err.message)+'</div>';
    });
  };
  reader.readAsArrayBuffer(f);
}

function _analizarDictamenTexto(txt, meta){
  meta=meta||{};
  function na(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  var TU=na(txt).toUpperCase(), TL=na(txt).toLowerCase();
  var r={auditor_nombre:'',auditor_cc:'',auditor_tp:'',fecha_dictamen:'',criterios:{},observaciones:[],opinion_tipo:''};

  // Tarjeta Profesional
  var tpM=txt.match(/[Tt]arjeta\s+[Pp]rofesional\s+(?:No?\.?[°]?\s*)?(\d+[\-]?T?)|T\.?P\.?\s*(?:No?\.?[°]?\s*)?(\d+[\-]?T?)/);
  if(tpM) r.auditor_tp=((tpM[1]||tpM[2])||'').trim();

  // Nombre auditor
  var nmPats=[
    /Nombre\s+(?:del?\s+)?Auditor(?:a)?[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\.]+(?:[ \t]+[A-ZÁÉÍÓÚÑa-záéíóúñ\.]+){1,5})/,
    /(?:Atentamente|Cordialmente)[,.]?\s*\n\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\.]+(?:[ \t]+[A-ZÁÉÍÓÚÑa-záéíóúñ\.]+){1,5})/,
    /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\.]+(?:[ \t]+[A-ZÁÉÍÓÚÑa-záéíóúñ\.]+){1,5})\s*\n\s*(?:Auditor(?:a)?\s+Intern)/
  ];
  for(var ni=0;ni<nmPats.length;ni++){var nm=txt.match(nmPats[ni]);if(nm){r.auditor_nombre=nm[1].trim().replace(/\s*(C[eé]dula|C\.?C\.?|Tarjeta|T\.P).*/i,'').trim();break;}}

  // Fecha
  var fM=txt.toLowerCase().match(/(?:bogot[aá]|d\.?\s*c\.?|ciudad|municipio)[,.\s]+(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de|del)\s+(20\d{2})/);
  if(fM){var mMap={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};r.fecha_dictamen=('0'+fM[1]).slice(-2)+'/'+(mMap[fM[2]]||'??')+'/'+fM[3];}

  // C1: Res 3569
  var h3569=/3569/.test(txt), h3476=/3476/.test(txt);
  if(h3569){r.criterios.fundamento_juridico_res3569='CUMPLE';}
  else if(h3476){r.criterios.fundamento_juridico_res3569='NO CUMPLE';r.observaciones.push('Cita Res.3476/2005 (derogada) pero NO cita Res.3569/2023 vigente');}
  else{r.criterios.fundamento_juridico_res3569='NO CUMPLE';r.observaciones.push('No se encontró referencia a la Res.3569/2023 (fundamento jurídico)');}

  // C2: origen recursos
  var hA20=/art[ií]culo\s+20|art\.?\s*20/.test(TL);
  var hIng=/(?:origen|fuente|procedencia).*(?:recursos|ingresos|fondos)/.test(TL);
  r.criterios.descripcion_origen_recursos=(hA20||hIng)?'CUMPLE':'NO CUMPLE';
  if(r.criterios.descripcion_origen_recursos==='NO CUMPLE') r.observaciones.push('No describe el origen y uso de los recursos (Art.20 L1475/2011)');

  // C3: arts 23 24 25 34
  var hA23=/art[ií]culo\s+23|art\.?\s*23/.test(TL);
  var hA24=/art[ií]culo\s+24|art\.?\s*24/.test(TL);
  var hA25=/art[ií]culo\s+25|art\.?\s*25/.test(TL);
  var hA34=/art[ií]culo\s+34|art\.?\s*34/.test(TL);
  r.criterios.art_23_cumple=hA23?'CUMPLE':'NO CUMPLE';
  r.criterios.art_24_cumple=hA24?'CUMPLE':'NO CUMPLE';
  r.criterios.art_25_cumple=hA25?'CUMPLE':'NO CUMPLE';
  r.criterios.art_34_cumple=hA34?'CUMPLE':'NO CUMPLE';
  var miss=[];if(!hA23)miss.push('23');if(!hA24)miss.push('24');if(!hA25)miss.push('25');if(!hA34)miss.push('34');
  if(miss.length) r.observaciones.push('No menciona Art(s). '+miss.join(', ')+' de la Ley 1475/2011');

  // C4: art 27
  var hA27=/art[ií]culo\s+27|art\.?\s*27/.test(TL);
  r.criterios.art_27_financiacion_prohibida=hA27?'CUMPLE':'NO CUMPLE';
  if(!hA27) r.observaciones.push('No emite concepto sobre financiación prohibida (Art.27 L1475/2011)');

  // C5: candidato correcto
  var kws={ALCALDIA_FUN:['ALCALDIA','ALCALDE'],ALCALDIA:['ALCALDIA','ALCALDE'],CONCEJO:['CONCEJO','CONCEJAL'],ASAMBLEA:['ASAMBLEA','DIPUTADO'],GOBERNACION:['GOBERNACION','GOBERNADOR']};
  var mc=na(meta.cargo||'').toUpperCase(), mm=na(meta.municipio||'').toUpperCase().replace(/_/g,' '), md=na(meta.dpto||'').toUpperCase();
  var cfound=false;(kws[mc]||[mc]).forEach(function(k){if(k&&TU.indexOf(k)!==-1)cfound=true;});
  var cref=/candidat[oa]|campa[nñ]a\s+electoral|informe\s+(?:integral|de\s+ingresos)/.test(TL);
  r.criterios.candidato_correcto=(cfound||(mm&&TU.indexOf(mm)!==-1)||(md&&TU.indexOf(md)!==-1)||cref)?'CUMPLE':'PENDIENTE';

  // C6: suscrito auditor TP
  r.criterios.suscrito_auditor=r.auditor_tp?'CUMPLE':'NO CUMPLE';
  if(!r.auditor_tp) r.observaciones.push('No se identificó Tarjeta Profesional (T.P.) del auditor firmante');

  // C7: otros hechos
  var hOtros=/(?:otros?\s+hechos?\s+relevantes|hallazgo|irregularidad|incumplimiento|alerta|salvedad)/.test(TL);
  var hRen=/renuen/.test(TL);
  var hNoPres=/no\s+present[oó]|sin\s+presentar|no\s+cumpl/.test(TL);
  r.criterios.revela_otros_hechos=(hOtros||hRen||hNoPres)?'CUMPLE':'PENDIENTE';

  // C8: abstencion renuentes
  var hAbst=/abstenci[oó]n|me\s+abstengo|se\s+abstiene/.test(TL);
  if(hAbst&&hRen){r.criterios.abstencion_opinion_renuentes='CUMPLE';r.observaciones.push('Auditor declara abstención de opinión por candidatos renuentes');}
  else if(hRen){r.criterios.abstencion_opinion_renuentes='NO CUMPLE';r.observaciones.push('Menciona renuencia pero no declara abstención de opinión');}
  else r.criterios.abstencion_opinion_renuentes='NO APLICA';

  // Observaciones adicionales
  if(/no\s+design[oó].*gerente|sin\s+gerente/.test(TL)) r.observaciones.push('Candidato(s) sin designación de Gerente de Campaña');
  if(/no\s+abri[oó].*cuenta|sin\s+cuenta\s+bancaria/.test(TL)) r.observaciones.push('Candidato(s) sin apertura de cuenta bancaria');
  if(/extemporane|fuera\s+de\s+plazo/.test(TL)) r.observaciones.push('Presentación extemporánea de informes');
  if(/falencias?\s+en\s+(?:el\s+)?soporte|sin\s+soporte/.test(TL)) r.observaciones.push('Falencias en soportes documentales');
  if(h3476&&h3569) r.observaciones.push('Cita tanto Res.3476/2005 (derogada) como Res.3569/2023 (vigente)');

  // Opinión
  var nc=Object.keys(r.criterios).filter(function(k){return r.criterios[k]==='NO CUMPLE';}).length;
  if(hAbst) r.opinion_tipo='ABSTENCION';
  else if(nc>0||/no\s+cumpl|adverso|negativ/.test(TL)) r.opinion_tipo='DESFAVORABLE';
  else r.opinion_tipo='FAVORABLE';

  return r;
}

function _renderDictLectorResult(r, el){
  if(!el) return;
  var opCls={FAVORABLE:'success',DESFAVORABLE:'danger',ABSTENCION:'warning',PENDIENTE:'secondary'};
  var cls=opCls[r.opinion_tipo]||'secondary';
  var h='<div class="border rounded p-2 mt-2 bg-light">';
  // Encabezado opinión
  h+='<div class="d-flex align-items-center gap-2 mb-2 flex-wrap">';
  h+='<span class="badge bg-'+cls+' fs-6">'+esc(r.opinion_tipo||'—')+'</span>';
  if(r.fecha_dictamen) h+='<span class="small text-muted">Fecha: <b>'+esc(r.fecha_dictamen)+'</b></span>';
  if(r.auditor_nombre) h+='<span class="small">Auditor: <b>'+esc(r.auditor_nombre)+'</b></span>';
  if(r.auditor_tp) h+='<span class="badge bg-info text-dark">T.P. '+esc(r.auditor_tp)+'</span>';
  h+='</div>';
  // Criterios
  var critLabels={
    fundamento_juridico_res3569:'Res.3569/2023',
    descripcion_origen_recursos:'Origen recursos',
    art_23_cumple:'Art.23',art_24_cumple:'Art.24',art_25_cumple:'Art.25',art_34_cumple:'Art.34',
    art_27_financiacion_prohibida:'Art.27 Financ.prohibida',
    candidato_correcto:'Candidato correcto',
    suscrito_auditor:'Suscrito c/ T.P.',
    revela_otros_hechos:'Revela otros hechos',
    abstencion_opinion_renuentes:'Abstención renuentes'
  };
  h+='<div class="row g-1 mb-2">';
  Object.keys(r.criterios).forEach(function(k){
    var v=r.criterios[k];
    var bc=v==='CUMPLE'?'success':v==='NO CUMPLE'?'danger':v==='NO APLICA'?'secondary':'warning';
    var lbl=critLabels[k]||k;
    h+='<div class="col-auto"><span class="badge bg-'+bc+' small" title="'+esc(k)+'">'+esc(lbl)+': '+esc(v)+'</span></div>';
  });
  h+='</div>';
  // Observaciones
  if(r.observaciones&&r.observaciones.length){
    h+='<div class="small"><b><i class="fa fa-exclamation-circle me-1 text-warning"></i>Hallazgos:</b><ul class="mb-0 mt-1">';
    r.observaciones.forEach(function(o){h+='<li>'+esc(o)+'</li>';});
    h+='</ul></div>';
  }
  h+='</div>';
  el.innerHTML=h;
}

// ── Loaders: DICT_INDEX + AUDITOR_DB ──
function _cargarDictIndex(cb){
  if(DICT_INDEX!==null) return cb();
  fetch('data/fnfp/dictamen_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ DICT_INDEX=d; cb(); })
    .catch(function(){ DICT_INDEX={}; cb(); });
}
function _cargarDictAnalisis(cb){
  if(DICT_ANALISIS!==null) return cb();
  fetch('data/fnfp/dictamen_analisis.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ DICT_ANALISIS=d; cb(); })
    .catch(function(){ DICT_ANALISIS={}; cb(); });
}
function _cargarCoalicionMeta(cb){
  if(COALICION_META!==null) return cb();
  fetch('data/fnfp/coalicion/coalicion_metadata.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ COALICION_META=d; cb(); })
    .catch(function(){ COALICION_META=[]; cb(); });
}
function _loadCoalAcuerdosIndex(cb){
  if(COAL_ACUERDOS_INDEX!==null) return cb();
  fetch('data/coalicion_acuerdos_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ COAL_ACUERDOS_INDEX=d; cb(); })
    .catch(function(){ COAL_ACUERDOS_INDEX={}; cb(); });
}
// Auto-buscar acuerdo de coalición en carpetas locales
function _buscarAcuerdoAuto(coalKey){
  if(!COAL_ACUERDOS_INDEX){ _loadCoalAcuerdosIndex(function(){ _buscarAcuerdoAuto(coalKey); }); return; }
  var dptEl=document.getElementById('selDpto');
  var munEl=document.getElementById('selMun');
  var corpEl=document.getElementById('selCorp');
  if(!dptEl||!corpEl) return;
  var dN=norm(dptEl.value), mN=norm(munEl?munEl.value:''), cN=corpEl.value;
  if(!dN||!cN) return;
  var acKey=dN+'/'+(mN||'_DPTO_')+'/'+cN;
  var entries=COAL_ACUERDOS_INDEX[acKey];
  if(!entries||!entries.length){
    var stEl=document.getElementById('coalAcuerdoStatus');
    if(stEl) stEl.innerHTML='<span class="text-muted small"><i class="fa fa-info-circle"></i> Sin acuerdo en índice visor</span>';
    return;
  }
  // Buscar la coalición correcta: match por nombre
  var pEl=document.getElementById('selPartido');
  var pName=norm(pEl?pEl.value:'');
  var match=null;
  if(entries.length===1){ match=entries[0]; }
  else {
    for(var i=0;i<entries.length;i++){
      if(norm(entries[i].coalicion)===pName){ match=entries[i]; break; }
    }
    if(!match){
      for(var i=0;i<entries.length;i++){
        if(pName.indexOf(norm(entries[i].coalicion))>=0||norm(entries[i].coalicion).indexOf(pName)>=0){ match=entries[i]; break; }
      }
    }
    if(!match) match=entries[0]; // fallback: primer entry
  }
  var stEl=document.getElementById('coalAcuerdoStatus');
  var docName=match.docs&&match.docs[0]?match.docs[0].name:'Acuerdo.pdf';
  // Intentar cargar PDF local
  var localPath='data/fnfp/coalicion/acuerdos/'+match.groupId+'.pdf';
  if(stEl) stEl.innerHTML='<span class="text-info small"><i class="fa fa-spinner fa-spin"></i> Buscando '+esc(docName).substring(0,50)+'...</span>';
  fetch(localPath).then(function(r){
    if(!r.ok) throw new Error('no local');
    return r.blob();
  }).then(function(blob){
    var file=new File([blob],docName,{type:'application/pdf'});
    if(stEl) stEl.innerHTML='<span class="text-success small"><i class="fa fa-check-circle"></i> Auto: '+esc(docName).substring(0,60)+'</span>';
    _leerAcuerdoCoalicion(coalKey,file);
  }).catch(function(){
    if(stEl) stEl.innerHTML='<span class="text-warning small"><i class="fa fa-exclamation-triangle"></i> '+esc(docName).substring(0,50)+' (no descargado, subir PDF)</span>';
  });
}
function _buscarRepLegal(partido){
  if(!COALICION_META||!COALICION_META.length) return null;
  var pN=_alphaKey(partido);
  // Solo match exacto
  for(var i=0;i<COALICION_META.length;i++){
    var e=COALICION_META[i];
    if(_alphaKey(e.nombre_coalicion||'')===pN) return e;
  }
  return null;
}
function _cargarAuditorDB(cb){
  if(AUDITOR_DB!==null) return cb();
  fetch('data/fnfp/auditores_portal.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ AUDITOR_DB=d; cb(); })
    .catch(function(){ AUDITOR_DB={orgs:{},auditores:{}}; cb(); });
}
function _cargarPartidosDB(cb){
  if(PARTIDOS_DB!==null) return cb();
  fetch('data/partidos_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ PARTIDOS_DB=d; cb(); })
    .catch(function(){ PARTIDOS_DB={}; cb(); });
}
function _buscarPartidoDB(partido){
  if(!PARTIDOS_DB) return null;
  var pU=(partido||'').toUpperCase().trim();
  if(PARTIDOS_DB[pU]) return PARTIDOS_DB[pU];
  // Fuzzy: buscar por contenido parcial
  var keys=Object.keys(PARTIDOS_DB);
  for(var i=0;i<keys.length;i++){
    if(keys[i].indexOf(pU)!==-1||pU.indexOf(keys[i])!==-1) return PARTIDOS_DB[keys[i]];
  }
  // Más flexible: comparar sin caracteres especiales
  var pA=_alphaKey(partido);
  for(var j=0;j<keys.length;j++){
    var kA=_alphaKey(keys[j]);
    if(kA.indexOf(pA)!==-1||pA.indexOf(kA)!==-1) return PARTIDOS_DB[keys[j]];
  }
  return null;
}
function _cargarConsolidado44(cb){
  if(CONSOLIDADO44_INDEX!==null) return cb();
  fetch('data/fnfp/consolidado44_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ CONSOLIDADO44_INDEX=d; cb(); })
    .catch(function(){ CONSOLIDADO44_INDEX={}; cb(); });
}
function _cargarConsolidado100(cb){
  if(CONSOLIDADO100_INDEX!==null) return cb();
  fetch('data/fnfp/consolidado100_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ CONSOLIDADO100_INDEX=d; cb(); })
    .catch(function(){ CONSOLIDADO100_INDEX={}; cb(); });
}
function _cargarContadorCamp(cb){
  if(CONTADOR_CAMP_IDX!==null) return cb();
  fetch('data/fnfp/contador_campana_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ CONTADOR_CAMP_IDX=d; cb(); })
    .catch(function(){ CONTADOR_CAMP_IDX={}; cb(); });
}
function _findConsolidado100(c){
  if(!CONSOLIDADO100_INDEX) return null;
  var _rd=c.departamento||'', _rm=c.municipio||'';
  if(!_rd){try{_rd=document.getElementById('selDpto').value||'';_rm=document.getElementById('selMun').value||'';}catch(e){}}
  var dN=_normFNFP(_rd), mN=_normFNFP(_rm);
  var key=dN+'/'+mN+'/'+c.id;
  if(CONSOLIDADO100_INDEX[key]) return CONSOLIDADO100_INDEX[key];
  // Fuzzy by candidate ID only
  var keys=Object.keys(CONSOLIDADO100_INDEX);
  for(var i=0;i<keys.length;i++){
    var parts=keys[i].split('/');
    if(parts[0]===dN && parts[1]===mN && parts[2]===String(c.id)) return CONSOLIDADO100_INDEX[keys[i]];
  }
  return null;
}
function _cargarANI(cb){
  if(ANI_INDEX!==null) return cb();
  fetch('data/ani_index.json').then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ ANI_INDEX=d; cb(); })
    .catch(function(){ ANI_INDEX={}; cb(); });
}
function _aniBadge(cedula, aniPreIndexado){
  if(!cedula) return '';
  var r=aniPreIndexado||null;
  if(!r&&ANI_INDEX) r=ANI_INDEX[String(cedula).trim()];
  if(!r) return '<span class="badge bg-secondary" style="font-size:.6rem" title="Sin consulta ANI">ANI ?</span>';
  var v=(r.v||'').toLowerCase();
  var nov=r.n?'<span class="badge bg-danger" style="font-size:.6rem;margin-left:2px" title="'+esc(r.n)+'">⚠ '+esc(r.n)+'</span>':'';
  if(v.indexOf('vigente')!==-1&&v.indexOf('no vigente')===-1)
    return '<span class="badge bg-success" style="font-size:.6rem" title="'+esc(r.v)+'">ANI OK</span>'+nov;
  if(v.indexOf('no vigente')!==-1)
    return '<span class="badge bg-danger" style="font-size:.6rem" title="'+esc(r.v)+'">NO VIG.</span>'+nov;
  if(v==='sin registro'||v==='no encontrada')
    return '<span class="badge bg-warning text-dark" style="font-size:.6rem" title="Sin registro en ANI">SIN REGISTRO</span>';
  if(v.indexOf('error')!==-1)
    return '<span class="badge bg-dark" style="font-size:.6rem" title="Error consultando ANI">ANI ERR</span>';
  return '<span class="badge bg-info" style="font-size:.6rem" title="'+esc(r.v)+'">ANI</span>'+nov;
}
function _findConsolidado44(c){
  if(!CONSOLIDADO44_INDEX) return null;
  var dN=_normFNFP(c.departamento), mN=_normFNFP(c.municipio), pN=_normFNFP(c.partido);
  // Exact match
  var key=dN+'/'+mN+'/'+pN;
  if(CONSOLIDADO44_INDEX[key]) return CONSOLIDADO44_INDEX[key];
  // Fuzzy: alphaKey match
  var pA=_alphaKey(c.partido);
  var keys=Object.keys(CONSOLIDADO44_INDEX);
  for(var i=0;i<keys.length;i++){
    var parts=keys[i].split('/');
    if(parts[0]===dN && parts[1]===mN && _alphaKey(parts[2])===pA) return CONSOLIDADO44_INDEX[keys[i]];
  }
  // Fuzzy: contains
  for(var j=0;j<keys.length;j++){
    var p2=keys[j].split('/');
    if(p2[0]===dN && p2[1]===mN){
      var kA=_alphaKey(p2[2]);
      if(kA.indexOf(pA)!==-1||pA.indexOf(kA)!==-1) return CONSOLIDADO44_INDEX[keys[j]];
    }
  }
  return null;
}
function _alphaKey(s){ return (s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function _encodePath(p){return p.split('/').map(function(s){return encodeURIComponent(s);}).join('/');}
function _normNoTilde(s){ return norm(_normFNFP(s||'')); }
function _findDictPdfs(c){
  if(!DICT_INDEX) return [];
  // Normalizar sin tildes: _normFNFP + norm() para quitar Ñ→N, etc.
  var dN=_normNoTilde(c.departamento), mN=_normNoTilde(c.municipio);
  var cargoD=_normCargoDict(c.cargo);
  var _esDpto=(cargoD==='ASAMBLEA'||cargoD==='GOBERNACION'||cargoD==='JUNTA_ADMINISTRADORAS_LOCALES');
  var mF=_esDpto?'SIN_MUN':mN;
  // Buscar dpto con fallback sin tildes
  var dEntry=DICT_INDEX[dN];
  if(!dEntry){var _dk=Object.keys(DICT_INDEX);for(var _di=0;_di<_dk.length;_di++){if(_normNoTilde(_dk[_di])===dN){dEntry=DICT_INDEX[_dk[_di]];break;}}}
  if(!dEntry) return [];
  var mEntry=dEntry[mF];
  if(!mEntry&&!_esDpto){
    // fuzzy mun: comparar sin tildes
    var _mk=Object.keys(dEntry);
    for(var _mi=0;_mi<_mk.length;_mi++){
      var _mkN=_normNoTilde(_mk[_mi]);
      if(_mkN===mF||_alphaKey(_mkN).indexOf(_alphaKey(mF))!==-1||_alphaKey(mF).indexOf(_alphaKey(_mkN))!==-1){mEntry=dEntry[_mk[_mi]];break;}
    }
  }
  if(!mEntry) return [];
  var pN=_alphaKey(c.partido);
  var keys=Object.keys(mEntry), found=null;
  for(var i=0;i<keys.length;i++){
    if(_alphaKey(keys[i])===pN){ found=mEntry[keys[i]]; break; }
  }
  if(!found){
    for(var j=0;j<keys.length;j++){
      var kN=_alphaKey(keys[j]);
      if(kN.indexOf(pN)!==-1||pN.indexOf(kN)!==-1){ found=mEntry[keys[j]]; break; }
    }
  }
  if(!found) return [];
  var val=found[cargoD];
  if(!val) return [];
  return Array.isArray(val)?val:[val];
}
function _findAuditores(partido){
  if(!AUDITOR_DB||!AUDITOR_DB.orgs) return [];
  var pN=_alphaKey(partido);
  if(AUDITOR_DB.orgs[pN]) return AUDITOR_DB.orgs[pN];
  // Fuzzy
  var keys=Object.keys(AUDITOR_DB.orgs);
  for(var i=0;i<keys.length;i++){
    if(keys[i].indexOf(pN)!==-1||pN.indexOf(keys[i])!==-1) return AUDITOR_DB.orgs[keys[i]];
  }
  return [];
}
function _findDictAnalisis(c){
  if(!DICT_ANALISIS) return null;
  var dN=_normNoTilde(c.departamento), mN=_normNoTilde(c.municipio);
  var cargoD=_normCargoDict(c.cargo);
  var mF=(cargoD==='ASAMBLEA'||cargoD==='GOBERNACION'||cargoD==='JUNTA_ADMINISTRADORAS_LOCALES')?'SIN_MUN':mN;
  var pN=_alphaKey(c.partido);
  // Try exact then fuzzy key match
  var keys=Object.keys(DICT_ANALISIS);
  for(var i=0;i<keys.length;i++){
    var parts=keys[i].split('/');
    if(parts[0]===dN && parts[1]===mF && _alphaKey(parts[2])===pN && parts[3]===cargoD) return DICT_ANALISIS[keys[i]];
  }
  // Fuzzy: contains
  for(var j=0;j<keys.length;j++){
    var p2=keys[j].split('/');
    if(p2[0]===dN && p2[1]===mF && p2[3]===cargoD){
      var kN=_alphaKey(p2[2]);
      if(kN.indexOf(pN)!==-1||pN.indexOf(kN)!==-1) return DICT_ANALISIS[keys[j]];
    }
  }
  return null;
}

function renderDictamen(){
  var c=CAND_SELEC;
  // PDFs ahora vienen de CC (Paso 1 soportes) — solo cargamos auditorDB y análisis locales
  _cargarAuditorDB(function(){ _cargarDictAnalisis(function(){ _renderDictamenInner(c); }); });
}

// Buscar dictamen en datos de Cuentas Claras (window._ccGestionMunData.dictamen)
function _findDictPdfsCC(c){
  var items=(window._ccGestionMunData&&window._ccGestionMunData.dictamen)?window._ccGestionMunData.dictamen:[];
  if(!items.length) return [];
  // Usar filtro del Paso 1 (selCorp) como prioridad
  var _corpSel='';
  try{_corpSel=(document.getElementById('selCorp').value||'').toUpperCase().trim();}catch(e){}
  var corpN=_normNoTilde(_corpSel||c.cargo).replace(/[_\s]+/g,'');
  var esDpto=(_corpSel==='ASAMBLEA'||_corpSel==='GOBERNACION'||
    (c.cargo||'').toUpperCase().indexOf('ASAMBLEA')!==-1||
    (c.cargo||'').toUpperCase().indexOf('GOBERN')!==-1);
  var mN=_normNoTilde(c.municipio);
  var dN=_normNoTilde(c.departamento);
  var pN=_alphaKey(c.partido);
  var results=[];
  items.forEach(function(item){
    // Filtrar por corporación
    var corpCC=_normNoTilde(item.corporacionNombre||'').replace(/[_\s]+/g,'');
    if(corpN&&corpCC.indexOf(corpN)===-1&&corpN.indexOf(corpCC)===-1) return;
    // Para departamentales (ASAMBLEA/GOBERNACION): filtrar por departamento, no municipio
    if(esDpto){
      var dptoCC=_normNoTilde(item.departamentoNombre||item.nom_departamento||'');
      if(dN&&dptoCC&&dptoCC!==dN&&dptoCC.indexOf(dN)===-1&&dN.indexOf(dptoCC)===-1) return;
    } else {
      var munCC=_normNoTilde(item.munipioNombre||item.municipioNombre||'');
      if(munCC!==mN) return;
    }
    // Filtrar por partido
    var orgCC=_alphaKey(item.agrupacionPoliticaNombre||item.coalicionPoliticaNombre||'');
    if(orgCC!==pN && orgCC.indexOf(pN)===-1 && pN.indexOf(orgCC)===-1) return;
    var arch=item.dictamen_auditoria||item.archivo||'';
    if(arch){
      var fname=arch.split('/').pop();
      var pdfUrl=arch.indexOf('/')!==-1?'/api/cne/storage/app/'+encodeURI(arch):'/api/cne/storage/app/archivos/dictamen_auditoria/'+encodeURIComponent(fname);
      results.push({url:pdfUrl,nombre:fname,item:item});
    }
  });
  return results;
}

function _renderDictamenInner(c){
  // Guard: si el candidato cambió mientras cargaban los índices, no sobreescribir
  if(!CAND_SELEC||CAND_SELEC.id!==c.id) return;
  var obs=c.observaciones||{}, dic=obs.dictamen||{};

  // ── Buscar análisis automático del dictamen ────────────────────────────
  var analisis=_findDictAnalisis(c);

  // ── 1. PDFs del Dictamen (CC) ──────
  var cargoD=_normCargoDict(c.cargo);
  var ccDicts=_findDictPdfsCC(c);
  var panelPdf='';
  if(ccDicts.length>0){
    panelPdf='<div class="card mb-3 border-warning"><div class="card-body py-2">';
    panelPdf+='<div class="mb-1"><small class="text-muted"><i class="fa fa-cloud me-1"></i>Fuente: Cuentas Claras CNE</small></div>';
    ccDicts.forEach(function(d){
      panelPdf+='<a href="'+d.url+'" target="_blank" class="btn btn-sm btn-outline-danger w-100 mb-1">'+
        '<i class="fa fa-file-pdf me-2"></i>'+esc(d.nombre)+'</a>';
      if(d.item.created_at){
        panelPdf+='<br><small class="text-muted ms-2">Radicado: '+esc(d.item.created_at.substring(0,10))+'</small>';
      }
    });
    panelPdf+='</div></div>';
  } else {
    var noMsg=window._ccGestionMunData?'No se encontró dictamen en Cuentas Claras':'Primero cargue los soportes en Paso 1';
    panelPdf='<div class="card mb-3 border-secondary"><div class="card-body py-2 text-center text-muted">'+
      '<i class="fa fa-exclamation-triangle me-2"></i>'+esc(noMsg)+' para '+esc(c.partido)+' / '+esc(cargoD)+
      '</div></div>';
  }

  // ── Resumen del análisis automático ─────────────────────────────────────
  var panelAnalisis='';
  if(analisis){
    var opBadge='secondary'; var opTxt=analisis.opinion_tipo||'?';
    if(opTxt==='FAVORABLE') opBadge='success';
    else if(opTxt==='DESFAVORABLE') opBadge='danger';
    else if(opTxt==='ABSTENCION') opBadge='danger';
    else if(opTxt==='PENDIENTE') opBadge='secondary';
    panelAnalisis='<div class="card mb-3 border-info"><div class="card-header fw-semibold py-2 bg-light">'+
      '<i class="fa fa-robot me-2 text-info"></i>Análisis Automático del Dictamen</div>'+
      '<div class="card-body py-2"><div class="row g-2">';
    panelAnalisis+='<div class="col-auto"><span class="badge bg-'+opBadge+' fs-6">'+esc(opTxt)+'</span></div>';
    var _fd=_validarFecha(analisis.fecha_dictamen||analisis.fecha||'');
    if(_fd) panelAnalisis+='<div class="col-auto"><span class="badge bg-info fs-6"><i class="fa fa-calendar me-1"></i>Fecha: '+esc(_fd)+'</span></div>';
    if(analisis.auditor_nombre) panelAnalisis+='<div class="col-auto small"><b>Auditor:</b> '+esc(analisis.auditor_nombre)+'</div>';
    if(analisis.auditor_tp) panelAnalisis+='<div class="col-auto small"><b>T.P.:</b> '+esc(analisis.auditor_tp)+'</div>';
    if(analisis.auditor_cc) panelAnalisis+='<div class="col-auto small"><b>CC:</b> '+esc(analisis.auditor_cc)+'</div>';
    panelAnalisis+='</div>';
    if(analisis.observaciones && analisis.observaciones.length){
      panelAnalisis+='<ul class="mb-0 mt-2 small">';
      analisis.observaciones.forEach(function(o){ panelAnalisis+='<li>'+esc(o)+'</li>'; });
      panelAnalisis+='</ul>';
    }
    panelAnalisis+='</div></div>';
  }

  // ── 2. Observaciones iniciales (textarea) ────────────────────────────────
  var obsKey='cne_dict_obs_'+c.id;
  var obsGuardada='';
  try{obsGuardada=localStorage.getItem(obsKey)||'';}catch(e){}
  // Si no hay observación guardada pero hay análisis, sugerir
  var obsSugerida=(analisis&&analisis.obs_sugerida)?analisis.obs_sugerida:'';
  var obsTexto=obsGuardada||obsSugerida;
  var panelObs='<div class="card mb-3 border-secondary"><div class="card-header fw-semibold py-2 bg-light">'+
    '<i class="fa fa-pen me-2 text-secondary"></i>Observaciones Iniciales <small class="text-muted">(después de leer el PDF del dictamen)</small></div>'+
    '<div class="card-body py-2">'+
    '<textarea id="dictObsTA" class="form-control form-control-sm" rows="5" placeholder="Escriba aquí sus observaciones sobre el dictamen...">'+esc(obsTexto)+'</textarea>'+
    '<div class="text-end mt-1"><button class="btn btn-sm btn-outline-primary" onclick="guardarDictObs()"><i class="fa fa-save me-1"></i>Guardar</button></div>'+
    '</div></div>';

  // ── 3. Criterios CUMPLE / NO CUMPLE ──────────────────────────────────────
  // Auto-fill from analysis if user hasn't set values yet
  var aCrit=(analisis&&analisis.criterios)?Object.assign({},analisis.criterios):{};
  // Backward compat: map old combined art_34_24_25 to individual articles
  if(aCrit.art_34_24_25_cumple && !aCrit.art_23_cumple){
    var combined=aCrit.art_34_24_25_cumple;
    // If combined=CUMPLE, all individual articles were found → CUMPLE each
    if(combined==='CUMPLE'){
      if(!aCrit.art_23_cumple) aCrit.art_23_cumple='CUMPLE';
      if(!aCrit.art_24_cumple) aCrit.art_24_cumple='CUMPLE';
      if(!aCrit.art_25_cumple) aCrit.art_25_cumple='CUMPLE';
      if(!aCrit.art_34_cumple) aCrit.art_34_cumple='CUMPLE';
    }
    // If NO CUMPLE, check observations for which articles are missing
    if(combined==='NO CUMPLE' && analisis.observaciones){
      var obsJoin=analisis.observaciones.join(' ').toUpperCase();
      aCrit.art_23_cumple=obsJoin.indexOf('23')!==-1?'NO CUMPLE':'PENDIENTE';
      aCrit.art_24_cumple=obsJoin.indexOf('ART. 24')!==-1||obsJoin.indexOf('ART.24')!==-1||obsJoin.indexOf('ARTICULO 24')!==-1?'NO CUMPLE':'CUMPLE';
      aCrit.art_25_cumple=obsJoin.indexOf('ART. 25')!==-1||obsJoin.indexOf('ART.25')!==-1||obsJoin.indexOf('ARTICULO 25')!==-1?'NO CUMPLE':'CUMPLE';
      aCrit.art_34_cumple=obsJoin.indexOf('ART. 34')!==-1||obsJoin.indexOf('ART.34')!==-1||obsJoin.indexOf('ARTICULO 34')!==-1?'NO CUMPLE':'CUMPLE';
      // Fallback: if "no menciona" + artículo, mark as NO CUMPLE
      if(obsJoin.indexOf('NO MENCIONA')!==-1){
        if(obsJoin.indexOf('34')!==-1 && aCrit.art_34_cumple==='CUMPLE') aCrit.art_34_cumple='NO CUMPLE';
        if(obsJoin.indexOf('24')!==-1 && aCrit.art_24_cumple==='CUMPLE') aCrit.art_24_cumple='NO CUMPLE';
        if(obsJoin.indexOf('25')!==-1 && aCrit.art_25_cumple==='CUMPLE') aCrit.art_25_cumple='NO CUMPLE';
      }
    }
  }
  var criteriosDic=[
    ['fundamento_juridico_res3569','Fundamento jurídico integral y vigente (Res.3569/2023 — Res.3476/2005 derogada)','Res.3569/2023'],
    ['descripcion_origen_recursos','Descripción del origen y uso de los recursos','Art.20 L1475/11 y Art.21 L130/94'],
    ['art_23_cumple','Cumplimiento Art. 23 de la Ley 1475/2011 — Financiación de campañas','Art. 23'],
    ['art_24_cumple','Cumplimiento Art. 24 de la Ley 1475/2011 — Fuentes de financiación','Art. 24'],
    ['art_25_cumple','Cumplimiento Art. 25 de la Ley 1475/2011 — Obligaciones gerente de campaña','Art. 25'],
    ['art_34_cumple','Cumplimiento Art. 34 de la Ley 1475/2011 — Rendición de cuentas','Art. 34'],
    ['art_27_financiacion_prohibida','Concepto sobre financiación prohibida (Art.27 L1475/2011)','Art. 27'],
    ['candidato_correcto','El dictamen es del candidato','Verificación'],
    ['suscrito_auditor','Suscrito por el Auditor Interno o quien delegó','Verificación'],
    ['revela_otros_hechos','Auditor revela otros hechos relevantes','L1475/2011'],
    ['abstencion_opinion_renuentes','Abstención de opinión por renuentes (no presentación / no corrección)','Verificación'],
  ];
  var rowsDic=criteriosDic.map(function(cr){
    // User-set value takes priority (if not PENDIENTE), then auto-analysis, then PENDIENTE
    var userVal=dic[cr[0]]||'';
    var autoVal=aCrit[cr[0]]||'';
    var val=(userVal&&userVal!=='PENDIENTE')?userVal:((autoVal&&autoVal!=='PENDIENTE')?autoVal:'PENDIENTE');
    return '<tr><td class="small">'+esc(cr[1])+' <span class="text-muted" style="font-size:.7rem">'+esc(cr[2])+'</span></td>'+
      '<td>'+_selectCritDic('dic',cr[0],val)+'</td></tr>';
  }).join('');

  // ── 4. Auditor(es) del partido — auto-poblado ───────────────────────────
  var auditores=_findAuditores(c.partido);
  var panelAuditor='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">'+
    '<i class="fa fa-id-card me-2 text-info"></i>Auditor(es) del Partido — '+esc(c.partido)+'</div>'+
    '<div class="card-body">';
  // Detect which auditor signed this dictamen (from analysis)
  var dictAudCC=analisis?((analisis.auditor_cc||'').replace(/\./g,'')):'';
  var dictAudTP=analisis?(analisis.auditor_tp||''):'';
  if(auditores.length){
    panelAuditor+='<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead><tr>'+
      '<th class="small" style="width:30px"></th><th class="small">Nombre</th><th class="small">Cédula</th><th class="small">T.P.</th><th class="small">Estado JCC</th></tr></thead><tbody>';
    auditores.forEach(function(a){
      var jccR=JCC_RESULTADOS[a.c]||{};
      var estado=jccR.tp_estado||'PENDIENTE';
      var cols={VIGENTE:'success',ACTIVO:'success','NO ENCONTRADO':'danger','SUSPENDIDA/INHABILITADA':'danger',PENDIENTE:'secondary',ERROR:'warning'};
      var badge='<span class="badge bg-'+(cols[estado]||'secondary')+'">'+esc(estado)+'</span>';
      var nombreJcc=jccR.nombre_jcc?(' <small class="text-muted">('+esc(jccR.nombre_jcc)+')</small>'):'';
      var tp=jccR.tarjeta||'—';
      // Check if this auditor matches the one who signed the dictamen
      var esFirmante=false;
      if(dictAudCC&&a.c&&a.c.replace(/\./g,'')===dictAudCC) esFirmante=true;
      if(!esFirmante&&dictAudTP&&tp&&tp.replace(/[\-\s]/g,'').indexOf(dictAudTP.replace(/[\-\s]/g,''))!==-1) esFirmante=true;
      var chk=esFirmante?'<i class="fa fa-check-circle text-success" title="Firma el dictamen"></i>':'';
      var rowCls=esFirmante?' class="table-success"':'';
      panelAuditor+='<tr'+rowCls+'><td class="text-center">'+chk+'</td><td class="small">'+esc(a.n)+nombreJcc+'</td><td class="small">'+esc(a.c)+'</td><td class="small">'+esc(tp)+'</td><td>'+badge+'</td></tr>';
    });
    panelAuditor+='</tbody></table></div>';
  } else {
    panelAuditor+='<div class="text-muted small">No se encontraron auditores registrados para este partido</div>';
  }
  panelAuditor+='</div></div>';

  // ── Ensamblar ────────────────────────────────────────────────────────────
  var html=panelPdf+panelAnalisis+panelObs+
    '<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-light">Criterios del Dictamen <small class="text-muted">(CUMPLE / NO CUMPLE)</small></div>'+
    '<div class="card-body p-0"><table class="table table-sm mb-0 tabla-obs"><tbody>'+rowsDic+'</tbody></table></div></div>'+
    panelAuditor;

  html+='<div class="text-end mt-3"><button class="btn btn-primary" onclick="irPaso(3)">Siguiente: 9B y Anexos <i class="fa fa-arrow-right ms-1"></i></button></div>';
  document.getElementById('panelDictamen').innerHTML=html;
}

