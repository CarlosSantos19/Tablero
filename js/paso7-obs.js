// ─── PASO 7: OBSERVACIONES — helpers de estado ───────────────────────────
var _obsState={};
function _lsKey(id){return 'cne_cand_'+id;}
function cargarEstado(id){
  try{var s=localStorage.getItem(_lsKey(id));return s?JSON.parse(s):{items:{},descuentos:[],estado_cert:'pendiente',texto_manual:''};}
  catch(e){return {items:{},descuentos:[],estado_cert:'pendiente',texto_manual:''};}}

function guardarEstado(){
  if(!CAND_SELEC) return;
  var ta=document.getElementById('textoObsFinal');
  if(ta) _obsState.texto_manual=ta.value;
  _obsState.descuentos=[];
  document.querySelectorAll('.desc-row').forEach(function(row){
    var cat=row.dataset.cat;
    var mEl=row.querySelector('.inp-monto');
    if(cat&&mEl) _obsState.descuentos.push({cat:cat,monto:parseFloat(mEl.value)||0});
  });
  _obsState.ts=new Date().toISOString();
  try{localStorage.setItem(_lsKey(CAND_SELEC.id),JSON.stringify(_obsState));}catch(e){}
  var btn=document.getElementById('btnGuardarObs');
  if(btn){btn.textContent='Guardado';btn.classList.replace('btn-primary','btn-success');
    setTimeout(function(){btn.innerHTML='<i class="fa fa-save me-1"></i>Guardar';btn.classList.replace('btn-success','btn-primary');},2000);}
}

function setCertEstado(val){
  _obsState.estado_cert=val;
  var cols={certificado:'success',pendiente:'secondary',parcial:'warning'};
  var lbs={certificado:'Certificado',pendiente:'Pendiente',parcial:'Parcialmente cert.'};
  Object.keys(cols).forEach(function(k){
    var b=document.getElementById('btnCert_'+k);
    if(!b) return;
    b.classList.toggle('btn-'+cols[k],k===val);
    b.classList.toggle('btn-outline-'+cols[k],k!==val);
  });
  var badge=document.getElementById('badgeCert');
  if(badge){badge.className='badge bg-'+cols[val]+' ms-2';badge.textContent=lbs[val];}
}

function toggleItem(key,accion){
  if(!_obsState.items) _obsState.items={};
  _obsState.items[key]=(_obsState.items[key]===accion)?'':accion;
  var row=document.getElementById('item_'+key);
  if(!row) return;
  var ea=_obsState.items[key]==='aceptado', er=_obsState.items[key]==='rechazado';
  var ba=row.querySelector('.btn-aceptar'), br=row.querySelector('.btn-rechazar'), tx=row.querySelector('.texto-item');
  if(ba){ba.classList.toggle('btn-success',ea);ba.classList.toggle('btn-outline-success',!ea);}
  if(br){br.classList.toggle('btn-danger',er);br.classList.toggle('btn-outline-danger',!er);}
  if(tx){tx.classList.toggle('text-decoration-line-through',er);tx.classList.toggle('text-muted',er);}
}

function formatPeso(v){return '$'+(v||0).toLocaleString('es-CO',{minimumFractionDigits:0,maximumFractionDigits:0});}

function recalcularNeto(){
  var fin=(CAND_SELEC.observaciones||{}).financiero||{};
  var base=parseFloat(fin.total_gastos)||0, desc=0;
  document.querySelectorAll('.inp-monto').forEach(function(el){desc+=parseFloat(el.value)||0;});
  var neto=base-desc;
  var el=document.getElementById('gastoNeto'); if(el) el.textContent=formatPeso(neto);
  var el2=document.getElementById('totalDescAcum'); if(el2) el2.textContent=formatPeso(desc);
}

function agregarDescuento(){
  var sel=document.getElementById('selDescCat'), cat=sel.value; if(!cat) return;
  var dup=false;
  document.querySelectorAll('.desc-row').forEach(function(r){if(r.dataset.cat===cat) dup=true;});
  if(dup){alert('Esa categoría ya fue agregada');return;}
  var tbody=document.getElementById('tbodyDesc');
  var tr=document.createElement('tr'); tr.className='desc-row'; tr.dataset.cat=cat;
  tr.innerHTML='<td class="small text-danger">'+esc(cat)+'</td>'+
    '<td><input type="number" class="form-control form-control-sm inp-monto text-end" style="max-width:130px;margin-left:auto" value="0" min="0" oninput="recalcularNeto()"></td>'+
    '<td class="text-center"><button class="btn btn-sm btn-outline-danger py-0" onclick="this.closest(\'tr\').remove();recalcularNeto()"><i class="fa fa-times"></i></button></td>';
  tbody.appendChild(tr); sel.value=''; recalcularNeto();
}

var _OPTS_GASTOS='<option>(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 34</option>'+
  '<option>(-) TRANSFERENCIAS</option>'+
  '<option>(-) GASTOS CANDIDATOS NO PRESENTARON EN DEBIDA FORMA</option>'+
  '<option>(-) GASTOS CANDIDATOS QUE NO PRESENTARON EL INFORME</option>'+
  '<option>(-) GASTOS SIN RELACIÓN DE CAUSALIDAD</option>'+
  '<option>(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 23</option>'+
  '<option>(-) GASTOS CANDIDATOS EN INVESTIGACIÓN Art. 24</option>'+
  '<option>(-) GASTOS CANDIDATOS RETIRADOS</option>'+
  '<option>(-) GASTOS CANDIDATOS REVOCADOS</option>'+
  '<option>(-) GASTOS QUE NO ESTÁN DEBIDAMENTE SOPORTADOS</option>'+
  '<option>(-) GASTOS CON POSTERIORIDAD A LA FECHA DEL DEBATE</option>';
var _OPTS_VOTOS='<option>VOTOS CANDIDATOS EN INVESTIGACIÓN Art. 25</option>'+
  '<option>VOTOS CANDIDATOS EN INVESTIGACIÓN Art. 34</option>'+
  '<option>(-) VOTOS GASTOS EN CEROS</option>'+
  '<option>(-) VOTOS CANDIDATOS NO PRESENTARON EN DEBIDA FORMA</option>'+
  '<option>(-) VOTOS CANDIDATOS NO PRESENTARON INFORME</option>'+
  '<option>(-) VOTOS CANDIDATOS INHABILITADOS</option>'+
  '<option>(-) VOTOS CANDIDATOS EN INVESTIGACIÓN Art. 23</option>'+
  '<option>(-) VOTOS CANDIDATOS EN INVESTIGACIÓN Art. 24</option>'+
  '<option>(-) VOTOS CANDIDATOS RETIRADOS</option>'+
  '<option>(-) VOTOS CANDIDATOS REVOCADOS</option>';

// ─── PASO 7: OBSERVACIONES ────────────────────────────────────────────────
function renderPaso7(){
  var c=CAND_SELEC;
  var _p7=6;
  function _done(){if(--_p7===0)_renderPaso7Inner(c);}
  _cargarCoalicionMeta(_done);
  _cargarDictAnalisis(_done);
  _cargarPartidosDB(_done);
  _cargarR8BIndex(_done);
  _cargarR9BIndex(_done);
  _cargarIGDocsIndex(_done);
}
function _renderPaso7Inner(c){
  // Paso 7 es nivel PARTIDO — leer filtro Paso 1 como fuente principal (no CAND_SELEC)
  var _p7Fc=document.getElementById('selCorp')?document.getElementById('selCorp').value:'';
  var _p7Fd=document.getElementById('selDpto')?document.getElementById('selDpto').value:'';
  var _p7Fm=document.getElementById('selMun') ?document.getElementById('selMun').value:'';
  var _p7Fp=document.getElementById('selPartido')?document.getElementById('selPartido').value:'';
  if(_p7Fd&&_p7Fp){
    var _p7isDptoF=_p7Fm==='_DPTO_';
    // Para departamentales: usar dpto como municipio (R9B_INDEX usa dpto/dpto/partido)
    c={departamento:_p7Fd,municipio:_p7isDptoF?_p7Fd:(_p7Fm||''),cargo:_p7Fc||(c?c.cargo:''),partido:_p7Fp,observaciones:{},nombre:''};
  }
  if(!c) return;

  // ── Helpers de búsqueda 8B / IG ──────────────────────────────────────────
  function _k7(s){return s.replace(/_+/g,'_').replace(/_$/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function _kig7(s){return s.replace(/_+/g,'_').replace(/_$/,'');}
  function _findR8B7(d,m,partido){
    if(!R8B_INDEX) return null;
    var cxP=_normFNFP(partido), exact=d+'/'+m+'/'+cxP;
    if(R8B_INDEX[exact]) return {key:exact};
    var kNorm=_k7(cxP);
    for(var k in R8B_INDEX){
      if(k.indexOf(d+'/'+m+'/')!==0) continue;
      var kP=k.substring(k.lastIndexOf('/')+1);
      if(_k7(kP)===kNorm) return {key:k};
    }
    for(var k2 in R8B_INDEX){
      if(k2.indexOf(d+'/'+m+'/')!==0) continue;
      var kP2=k2.substring(k2.lastIndexOf('/')+1);
      if(_k7(kP2).indexOf(kNorm)!==-1||kNorm.indexOf(_k7(kP2))!==-1) return {key:k2};
    }
    return null;
  }
  function _findIG7(d,m,partido,cedula){
    if(!IG_DOCS_INDEX) return null;
    var dN=norm(d), mN2=norm(m), pk=_normFNFP(partido);
    var exact=dN+'/'+mN2+'/'+pk, obj=IG_DOCS_INDEX[exact];
    if(!obj){
      var kN=_kig7(pk);
      for(var k in IG_DOCS_INDEX){
        var kParts=k.split('/');
        if(norm(kParts[0])!==dN||norm(kParts[1])!==mN2) continue;
        if(_kig7(kParts[2])===kN){obj=IG_DOCS_INDEX[k];break;}
      }
    }
    if(!obj){
      var kNa=_alphaKey(pk);
      for(var k2 in IG_DOCS_INDEX){
        var kP2=k2.split('/');
        if(norm(kP2[0])!==dN||norm(kP2[1])!==mN2) continue;
        var kPa=_alphaKey(kP2[2]);
        if(kPa===kNa||kPa.indexOf(kNa)!==-1||kNa.indexOf(kPa)!==-1){obj=IG_DOCS_INDEX[k2];break;}
      }
    }
    if(!obj) return null;
    for(var i=0;i<obj.e.length;i++){
      if(obj.e[i].id===cedula||obj.e[i].id===String(cedula))
        return {p:obj.p,pf:obj.pf||obj.p,d:obj.d||d,mu:obj.mu||m,e:obj.e[i]};
    }
    var cAK=_alphaKey(cedula||'');
    for(var j=0;j<obj.e.length;j++){
      var fv=obj.e[j].f||'', fPrefix=fv.replace(/_.*$/,'');
      if(fPrefix&&fPrefix===cedula) return {p:obj.p,pf:obj.pf||obj.p,d:obj.d||d,mu:obj.mu||m,e:obj.e[j]};
      if(cAK&&_alphaKey(fv).indexOf(cAK)===0) return {p:obj.p,pf:obj.pf||obj.p,d:obj.d||d,mu:obj.mu||m,e:obj.e[j]};
    }
    return {p:obj.p,pf:obj.pf||obj.p,d:obj.d||d,mu:obj.mu||m,e:null};
  }

  var d0=_normFNFP(c.departamento), m0=_normFNFP(c.municipio);
  var cargoKey7=_normCargoDict(c.cargo);
  // Clave general por partido/cargo (no por candidato) para secciones 1 y 2
  var _pKey=cargoKey7+'_'+d0+'_'+m0+'_'+_normFNFP(c.partido);

  // ── SECCIÓN 1: DICTAMEN Y OBSERVACIONES ──────────────────────────────────
  var dictPdfs=_findDictPdfs(c);
  var dictObsKey='cne_p7_dict_'+_pKey;
  var dictObsSaved='';try{dictObsSaved=localStorage.getItem(dictObsKey)||'';}catch(e){}
  // Fallback 1: clave genérica por partido (sin cargo)
  if(!dictObsSaved){
    try{dictObsSaved=localStorage.getItem('cne_dict_partido_'+d0+'_'+m0+'_'+_normFNFP(c.partido))||'';}catch(e){}
  }
  // Fallback 2: traer del Paso 2 (guardadas por candidato del mismo partido)
  if(!dictObsSaved){
    for(var _cid in CANDIDATOS){
      var _cx=CANDIDATOS[_cid];
      if(norm(_cx.partido||'')===norm(c.partido||'')){
        try{var _p2v=localStorage.getItem('cne_dict_obs_'+_cx.id)||'';if(_p2v){dictObsSaved=_p2v;break;}}catch(e){}
      }
    }
  }
  console.log('[Paso7] dictObsKey='+dictObsKey+', found='+!!dictObsSaved);
  var hDict='<div class="card mb-3 border-danger">'+
    '<div class="card-header fw-semibold py-2 bg-danger text-white">'+
    '<i class="fa fa-book-open me-2"></i>1. Dictamen y Observaciones</div>'+
    '<div class="card-body py-2">';
  if(dictPdfs.length){
    hDict+='<div class="d-flex gap-1 flex-wrap mb-2">';
    dictPdfs.forEach(function(p){
      var fname=p.substring(p.lastIndexOf('/')+1);
      hDict+='<a href="'+_encodePath(p)+'" target="_blank" class="btn btn-sm btn-outline-danger">'+
        '<i class="fa fa-file-pdf me-1"></i>'+esc(fname)+'</a>';
    });
    hDict+='</div>';
  } else {
    hDict+='<div class="text-muted small mb-2"><i class="fa fa-exclamation-circle me-1 text-warning"></i>Sin dictamen indexado para este partido/cargo</div>';
  }
  hDict+='<label class="form-label small fw-semibold mb-1"><i class="fa fa-pen me-1 text-secondary"></i>Observaciones del Dictamen '+
    '<small class="text-muted fw-normal">(después de leer el PDF)</small></label>'+
    '<textarea class="form-control form-control-sm mb-2" id="p7DictObsTA" rows="5" placeholder="Observaciones sobre el dictamen del partido...">'+esc(dictObsSaved)+'</textarea>'+
    '<div class="text-end"><button class="btn btn-sm btn-primary" onclick="_saveP7Obs(\''+dictObsKey+'\',\'p7DictObsTA\')">'+
    '<i class="fa fa-save me-1"></i>Guardar</button></div>'+
    '</div></div>';

  // ── SECCIÓN 2: 9B Y ANEXOS ───────────────────────────────────────────────
  var d9=d0, m9=m0, p9=_normFNFP(c.partido);
  var _r9bE=R9B_INDEX?R9B_INDEX[d9+'/'+m9+'/'+p9]:null;
  if(!_r9bE&&R9B_INDEX){
    for(var _k9 in R9B_INDEX){
      if(_k9.indexOf(d9+'/'+m9+'/')===0&&_k9.substring(_k9.lastIndexOf('/')+1)===p9){_r9bE=R9B_INDEX[_k9];break;}
    }
  }
  var _r9bD=_r9bE?_r9bE.d:d9, _r9bM=_r9bE?_r9bE.mu:m9, _r9bPF=_r9bE?_r9bE.pf:p9;
  var r9bBase='data/fnfp/reporte_9b/'+_r9bD+'/'+_r9bM+'/'+encodeURIComponent(_r9bPF)+'/';
  var r9bObsKey='cne_p7_9b_'+d0+'_'+m0+'_'+_normFNFP(c.partido);
  var r9bObsSaved='';try{r9bObsSaved=localStorage.getItem(r9bObsKey)||'';}catch(e){}
  var h9b='<div class="card mb-3 border-warning">'+
    '<div class="card-header fw-semibold py-2 bg-warning text-dark">'+
    '<i class="fa fa-file-invoice me-2"></i>2. Reporte 9B y Anexos del Partido</div>'+
    '<div class="card-body py-2">'+
    '<div class="d-flex gap-1 flex-wrap mb-2">';
  if(_r9bE){
    h9b+='<a href="'+r9bBase+encodeURIComponent('CONSOLIDADO_44')+'.pdf" target="_blank" class="btn btn-sm btn-outline-danger">'+
      '<i class="fa fa-file-pdf me-1"></i>CONSOLIDADO_44</a>'+
      '<a href="'+r9bBase+encodeURIComponent('libro_contable_partido')+'.pdf" target="_blank" class="btn btn-sm btn-outline-secondary">'+
      '<i class="fa fa-book me-1"></i>Libro PDF</a>'+
      '<a href="'+r9bBase+encodeURIComponent('libro_contable_partido')+'.xlsx" target="_blank" class="btn btn-sm btn-outline-success">'+
      '<i class="fa fa-file-excel me-1"></i>Libro Excel</a>';
  } else {
    h9b+='<span class="text-muted small"><i class="fa fa-exclamation-circle me-1 text-warning"></i>Sin Reporte 9B indexado para este partido</span>';
  }
  h9b+='</div>'+
    '<label class="form-label small fw-semibold mb-1"><i class="fa fa-pen me-1 text-secondary"></i>Observaciones 9B y Libro Contable del Partido</label>'+
    '<textarea class="form-control form-control-sm mb-2" id="p7R9BObsTA" rows="4" placeholder="Observaciones sobre el Reporte 9B y Libro Contable del Partido...">'+esc(r9bObsSaved)+'</textarea>'+
    '<div class="text-end"><button class="btn btn-sm btn-primary" onclick="_saveP7Obs(\''+r9bObsKey+'\',\'p7R9BObsTA\')">'+
    '<i class="fa fa-save me-1"></i>Guardar</button></div>'+
    '</div></div>';

  // ── SECCIÓN 3: 8B + LIBRO + ANEXOS + OBS INGRESOS/GASTOS (todos los candidatos del filtro Paso 1) ─
  var _filtCorp7=document.getElementById('selCorp')?document.getElementById('selCorp').value:'';
  var _filtDpto7=document.getElementById('selDpto')?document.getElementById('selDpto').value:'';
  var _filtMun7=document.getElementById('selMun')?document.getElementById('selMun').value:'';
  var _filtPart7=document.getElementById('selPartido')?document.getElementById('selPartido').value:'';
  // Para Asamblea/Gobernación selMun='_DPTO_' y candidatos tienen municipio='' — saltar filtro mun
  var _isDpto7=_filtMun7==='_DPTO_'||typeof _esDepartamental==='function'&&_esDepartamental(_filtCorp7);
  var _p7Lista=Object.values(CANDIDATOS||{});
  if(_filtCorp7){
    var _cN7=norm(_filtCorp7);
    var _cf7=_cN7.indexOf('ALCALD')!==-1?'ALCALDIA':
             _cN7.indexOf('CONCEJ')!==-1?'CONCEJO':
             _cN7.indexOf('ASAMBLEA')!==-1||_cN7.indexOf('DIPUTA')!==-1?'ASAMBLEA':
             _cN7.indexOf('JAL')!==-1||_cN7.indexOf('JUNTA ADMIN')!==-1?'JAL':'GOBERNACION';
    _p7Lista=_p7Lista.filter(function(x){return norm(x.cargo||'').indexOf(_cf7)!==-1;});
  }
  if(_filtDpto7) _p7Lista=_p7Lista.filter(function(x){return norm(x.departamento||'')===norm(_filtDpto7);});
  if(_filtMun7&&!_isDpto7) _p7Lista=_p7Lista.filter(function(x){return norm(x.municipio||'')===norm(_filtMun7);});
  if(_filtPart7) _p7Lista=_p7Lista.filter(function(x){return norm(x.partido||'')===norm(_filtPart7);});
  _p7Lista.sort(function(a,b){return (a.nombre||'').localeCompare(b.nombre||'');});
  var h8b='<div class="card mb-3 border-info">'+
    '<div class="card-header fw-semibold py-2 bg-info text-white d-flex justify-content-between align-items-center">'+
    '<span><i class="fa fa-users me-2"></i>3. Formato 8B, Libro, Anexos y Observaciones</span>'+
    '<span class="badge bg-white text-info">'+_p7Lista.length+' candidatos</span>'+
    '</div><div class="card-body py-2">';
  if(!_p7Lista.length){
    h8b+='<div class="text-muted small py-2"><i class="fa fa-info-circle me-1"></i>No hay candidatos para el filtro actual. Configure el filtro en Paso 1.</div>';
  }
  _p7Lista.forEach(function(cx){
    var r8bMatchX=_findR8B7(d0,m0,cx.partido);
    var r8bObjX=r8bMatchX?R8B_INDEX[r8bMatchX.key]:null;
    var entries8bX=r8bObjX?r8bObjX.e:[];
    var cxNX=_k7(_normFNFP(cx.nombre||''));
    var match8bX=null;
    for(var _bix=0;_bix<entries8bX.length;_bix++){if(_k7(entries8bX[_bix].n)===cxNX){match8bX=entries8bX[_bix];break;}}
    if(!match8bX){for(var _bjx=0;_bjx<entries8bX.length;_bjx++){if(_k7(entries8bX[_bjx].n).indexOf(cxNX)!==-1||cxNX.indexOf(_k7(entries8bX[_bjx].n))!==-1){match8bX=entries8bX[_bjx];break;}}}
    var realP8bX=r8bObjX?r8bObjX.p:_normFNFP(cx.partido);
    var realD8bX=r8bObjX&&r8bObjX.d?r8bObjX.d:d0;
    var realM8bX=r8bObjX&&r8bObjX.mu?r8bObjX.mu:m0;
    var base8bX=match8bX?'r8b/'+encodeURIComponent(realD8bX)+'/'+encodeURIComponent(realM8bX)+'/'+encodeURIComponent(realP8bX)+'/'+encodeURIComponent(match8bX.f)+'/':'';
    var igMatchX=_findIG7(d0,m0,cx.partido,cx.id);
    var realPIGX=igMatchX?(igMatchX.pf||igMatchX.p):_normFNFP(cx.partido);
    var igEntryX=igMatchX?igMatchX.e:null;
    var pdfsIngX=igEntryX&&igEntryX.ig?igEntryX.ig:[];
    var pdfsGasX=igEntryX&&igEntryX.gg?igEntryX.gg:[];
    var igFolderX=igEntryX?(igEntryX.f||cx.id):cx.id;
    var _igDX=igMatchX?(igMatchX.d||d0):d0, _igMX=igMatchX?(igMatchX.mu||m0):m0;
    var baseIngX='ig/'+_igDX+'/'+_igMX+'/'+encodeURIComponent(realPIGX)+'/'+igFolderX+'/ingresos/';
    var baseGasX='ig/'+_igDX+'/'+_igMX+'/'+encodeURIComponent(realPIGX)+'/'+igFolderX+'/gastos/';
    var txDataX=TX_CACHE[cx.id]||[];
    var txObsRowsX=[];
    var ingArrX=txDataX.filter(function(t){return t.concepto==='INGRESO';});
    var gasArrX=txDataX.filter(function(t){return t.concepto==='GASTO';});
    ingArrX.forEach(function(t,tIdx){
      var obsKey='cne_obs_'+cx.id+'_I_'+tIdx;
      var obsVal='';try{obsVal=localStorage.getItem(obsKey)||'';}catch(e){}
      if(obsVal) txObsRowsX.push({tipo:'I',cod:t.cco_id||'',comp:t.comprobante||t.nro_comprobante||'\u2014',obs:obsVal,valor:parseFloat(t.valor||0)});
    });
    gasArrX.forEach(function(t,tIdx){
      var obsKey='cne_obs_'+cx.id+'_G_'+tIdx;
      var obsVal='';try{obsVal=localStorage.getItem(obsKey)||'';}catch(e){}
      if(obsVal) txObsRowsX.push({tipo:'G',cod:t.cco_id||'',comp:t.comprobante||t.nro_comprobante||'\u2014',obs:obsVal,valor:parseFloat(t.valor||0)});
    });
    h8b+='<div class="border-bottom mb-3 pb-2">';
    h8b+='<div class="fw-semibold small text-info mb-2 py-1 px-2 bg-light rounded"><i class="fa fa-user-circle me-2"></i>'+esc(cx.nombre)+'</div>';
    h8b+='<div class="small fw-semibold mb-1"><i class="fa fa-clipboard me-1 text-secondary"></i>Observaciones de Ingresos y Gastos</div>';
    if(!txDataX.length){
      h8b+='<div class="text-muted small"><i class="fa fa-info-circle me-1"></i>Transacciones no cargadas (visitar Paso 6).</div>';
    } else if(!txObsRowsX.length){
      h8b+='<div class="text-muted small"><i class="fa fa-check-circle me-1 text-success"></i>Sin observaciones guardadas.</div>';
    } else {
      h8b+='<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="font-size:.78rem">'+
        '<thead class="table-light"><tr><th>Tipo</th><th>C\u00f3d.</th><th>Comprobante</th><th>Valor</th><th>Observaci\u00f3n</th></tr></thead><tbody>';
      txObsRowsX.forEach(function(r){
        var bg=r.tipo==='I'?'bg-success':'bg-danger';
        h8b+='<tr><td><span class="badge '+bg+'">'+r.tipo+'</span></td><td>'+esc(r.cod)+'</td><td>'+esc(r.comp)+'</td><td class="text-end">'+fmtCOP(r.valor)+'</td><td>'+esc(r.obs)+'</td></tr>';
      });
      h8b+='</tbody></table></div>';
    }
    h8b+='</div>';
  });
  h8b+='</div></div>';

  // ── OFICIO DE REQUERIMIENTO (siempre primero) ─────────────────────────────
  var coal7=_findCoalicion(c), pdb=_buscarPartidoDB(c.partido);
  var reqLS={};try{reqLS=JSON.parse(localStorage.getItem('cne_req_'+_alphaKey(c.partido))||'{}');}catch(e){}
  var repNombre=reqLS.rep_nombre||(coal7?coal7.nombre_representante:'')||(pdb?pdb.representante_legal:'')||'';
  var repDir=reqLS.rep_direccion||(pdb?pdb.direccion+', '+(pdb.ciudad||'Bogotá D.C'):'')||'';
  var repEmail=reqLS.rep_email||(pdb?pdb.correo_general:'')||'';
  var repNit=(pdb?pdb.nit:'')||'';
  var repTel=(pdb?pdb.telefono:'')||'';
  var repContactoFin=(pdb?pdb.contacto_financiero:'')||'';
  var repCorreoFin=(pdb?pdb.correos_financiera:'')||'';
  var certNombre='';try{certNombre=localStorage.getItem('cne_certificador')||'';}catch(e){}
  var fechaLimite=reqLS.fecha_limite||'2026-03-31';
  // oninput → guardar automáticamente
  var _oninput='oninput="guardarDatosReq()"';
  var hOficio='<div class="card mb-3 border-primary">'+
    '<div class="card-header fw-semibold py-2 bg-primary text-white">'+
    '<i class="fa fa-file-alt me-2"></i>Oficio de Requerimiento</div>'+
    '<div class="card-body">'+
    (coal7?'<div class="alert alert-warning py-2 mb-2 small"><i class="fa fa-handshake me-1"></i><strong>COALICIÓN: '+esc(coal7.nombre_coalicion)+'</strong> — El oficio se dirige al responsable de la coalición.</div>':'')+
    '<p class="small text-muted mb-2">Datos de <strong>partidos.xlsx</strong>'+(pdb?' <span class="badge bg-success">Encontrado</span>':' <span class="badge bg-warning text-dark">No encontrado</span>')+' <span class="badge bg-light text-secondary border ms-1"><i class="fa fa-sync-alt me-1"></i>Auto-guardado al editar</span></p>'+
    '<div class="row g-2 mb-3">'+
    '<div class="col-md-6"><label class="small fw-semibold">Representante Legal</label>'+
    '<input type="text" class="form-control form-control-sm" id="reqRepNombre" value="'+esc(repNombre)+'" '+_oninput+'></div>'+
    '<div class="col-md-6"><label class="small fw-semibold">Dirección</label>'+
    '<input type="text" class="form-control form-control-sm" id="reqRepDir" value="'+esc(repDir)+'" '+_oninput+'></div>'+
    '<div class="col-md-6"><label class="small fw-semibold">Email del partido</label>'+
    '<input type="text" class="form-control form-control-sm" id="reqRepEmail" value="'+esc(repEmail)+'" '+_oninput+'></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">NIT</label>'+
    '<input type="text" class="form-control form-control-sm" id="reqRepNit" value="'+esc(repNit)+'" readonly></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">Teléfono</label>'+
    '<input type="text" class="form-control form-control-sm" id="reqRepTel" value="'+esc(repTel)+'" readonly></div>'+
    '<div class="col-md-12"><label class="small fw-semibold">Contacto financiero</label>'+
    '<input type="text" class="form-control form-control-sm bg-light" id="reqContactoFin" value="'+esc(repContactoFin)+'" readonly></div>'+
    '<div class="col-md-6"><label class="small fw-semibold">Correos financiera</label>'+
    '<input type="text" class="form-control form-control-sm bg-light" id="reqCorreoFin" value="'+esc(repCorreoFin)+'" readonly></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">Nombre del Certificador</label>'+
    '<input type="text" class="form-control form-control-sm" id="reqCertNombre" value="'+esc(certNombre)+'" placeholder="Su nombre completo" '+_oninput+'></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">Fecha límite respuesta</label>'+
    '<input type="date" class="form-control form-control-sm" id="reqFechaLimite" value="'+fechaLimite+'" '+_oninput+'></div>'+
    '</div>'+
    '<div class="d-flex gap-2">'+
    '<button class="btn btn-primary" onclick="generarRequerimiento()"><i class="fa fa-file-alt me-1"></i>Generar Oficio</button>'+
    '</div></div></div>';

  document.getElementById('panelObservaciones').innerHTML=hOficio+hDict+h9b+h8b;
}

// ── Guardar observaciones generales Paso 7 ────────────────────────────────
function _saveP7Obs(lsKey, taId){
  var ta=document.getElementById(taId);
  if(!ta) return;
  try{localStorage.setItem(lsKey,ta.value);}catch(e){}
  var btn=ta.parentElement&&ta.parentElement.querySelector('button');
  if(btn){var orig=btn.innerHTML;btn.innerHTML='<i class="fa fa-check me-1"></i>Guardado';setTimeout(function(){btn.innerHTML=orig;},1500);}
}

function copiarObs(){
  var ta=document.getElementById('textoObsFinal');
  ta.select(); document.execCommand('copy');
  alert('Texto copiado al portapapeles');
}

function exportarObs(){
  var c=CAND_SELEC;
  var texto=document.getElementById('textoObsFinal').value;
  var blob=new Blob([texto],{type:'text/plain'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='OBSERVACIONES_'+c.id+'_'+c.nombre.replace(/\s+/g,'_')+'.txt';
  a.click();
}

function agregarTipoObs(){
  var sel=document.getElementById('selTipoObs');
  var val=sel.value; if(!val) return;
  var ta=document.getElementById('textoObsFinal');
  var actual=ta.value.trim();
  ta.value=(actual?actual+'\n':'')+val;
  ta.scrollTop=ta.scrollHeight;
  sel.value='';
}

// ─── PASO 7: OFICIO DE REQUERIMIENTO ──────────────────────────────────────
function guardarDatosReq(){
  if(!CAND_SELEC) return;
  var pKey=_alphaKey(CAND_SELEC.partido);
  var obj={
    rep_nombre:(document.getElementById('reqRepNombre')||{}).value||'',
    rep_direccion:(document.getElementById('reqRepDir')||{}).value||'',
    rep_email:(document.getElementById('reqRepEmail')||{}).value||'',
    fecha_limite:(document.getElementById('reqFechaLimite')||{}).value||''
  };
  try{localStorage.setItem('cne_req_'+pKey,JSON.stringify(obj));}catch(e){}
  var cert=(document.getElementById('reqCertNombre')||{}).value||'';
  try{localStorage.setItem('cne_certificador',cert);}catch(e){}
  // Indicador visual silencioso (sin alert)
  var badge=document.querySelector('#panelObservaciones .badge.bg-light');
  if(badge){badge.innerHTML='<i class="fa fa-check me-1 text-success"></i>Auto-guardado';
    setTimeout(function(){badge.innerHTML='<i class="fa fa-sync-alt me-1"></i>Auto-guardado al editar';},1000);}
}

// ─── PASO 7: GENERAR OBSERVACIONES PARA TODOS ─────────────────────────────
function generarObsTodos(){
  if(!CAND_SELEC){alert('Seleccione un candidato primero.');return;}
  var pLow=(CAND_SELEC.partido||'').toLowerCase().trim();
  var todosP=Object.values(CANDIDATOS).filter(function(x){
    return (x.partido||'').toLowerCase().trim()===pLow;
  });
  var generados=0, omitidos=0;
  todosP.forEach(function(cd){
    var st=cargarEstado(cd.id);
    // Skip if already has manual text
    if(st.texto_manual&&st.texto_manual.trim()){ omitidos++; return; }
    var lineas=[];
    if(cd.revocado) lineas.push('CANDIDATO REVOCADO — gastos susceptibles de deducción');
    if(cd.renuncio) lineas.push('CANDIDATO RETIRADO (Renuncia) — gastos susceptibles de deducción');
    if(cd.no_presento) lineas.push('NO PRESENTÓ INFORME — gastos susceptibles de deducción');
    if(cd.extemporaneo) lineas.push('PRESENTÓ EXTEMPORÁNEAMENTE');
    // Alertas
    (cd.alertas||[]).forEach(function(a){
      if(a.indexOf('SUPERA TOPE')===-1) lineas.push('ALERTA: '+a);
    });
    // Recalcular SUPERA TOPE
    var cdGas=parseFloat(cd.total_gastos_rep)||parseFloat(cd.total_gastos_cand)||0;
    var nPartCD=_contarCandPartidoCC(cd.cargo, cd.partido);
    var topeTotCD=buscarTopeTotal(cd.cargo,cd.poblacion||0);
    var topeRTCD=topeTotCD?Math.round(topeTotCD/nPartCD*100)/100:null;
    if(topeRTCD&&topeRTCD>0&&cdGas>topeRTCD){
      lineas.push('SUPERA TOPE LEGAL — Gasto: '+fmtCOP(cdGas)+' / Tope: '+fmtCOP(topeRTCD)+' / Exceso: '+fmtCOP(cdGas-topeRTCD));
    }
    // Advertencias (filtradas)
    (cd.advertencias||[]).filter(function(a){
      return a.indexOf('Art.23')===-1&&a.indexOf('Art.24')===-1
        &&a.indexOf('Art.25')===-1&&a.indexOf('Art.27')===-1
        &&a.indexOf('MAI/SAI')===-1&&a.indexOf('INFORME NO RADICADO')===-1;
    }).forEach(function(a){ lineas.push('ADVERTENCIA: '+a); });
    if(cd.requiere_investigacion) lineas.push('REQUIERE INVESTIGACIÓN');
    var texto=lineas.length?lineas.join('\n'):'Sin observaciones pendientes.';
    // Save
    st.texto_manual=texto;
    if(!st.items) st.items={};
    if(!st.estado_cert) st.estado_cert='pendiente';
    try{localStorage.setItem(_lsKey(cd.id),JSON.stringify(st));}catch(e){}
    generados++;
  });
  alert('Observaciones generadas: '+generados+' candidatos\nOmitidos (ya tenían): '+omitidos);
  renderPaso7(); // Re-render to update table
}

function exportarObsTodos(){
  if(!CAND_SELEC){alert('Seleccione un candidato primero.');return;}
  var pLow=(CAND_SELEC.partido||'').toLowerCase().trim();
  var todosP=Object.values(CANDIDATOS).filter(function(x){
    return (x.partido||'').toLowerCase().trim()===pLow;
  }).sort(function(a,b){ return (a.nombre||'').localeCompare(b.nombre||''); });
  var lineas=[];
  lineas.push('OBSERVACIONES — '+CAND_SELEC.partido);
  lineas.push(CAND_SELEC.departamento+' / '+CAND_SELEC.municipio);
  lineas.push('Fecha: '+new Date().toLocaleDateString('es-CO'));
  lineas.push('='.repeat(70));
  todosP.forEach(function(cd,idx){
    var st=cargarEstado(cd.id);
    var certLbl={certificado:'CERTIFICADO',pendiente:'PENDIENTE',parcial:'PARCIAL'};
    lineas.push('\n'+(idx+1)+'. '+cd.nombre+' ('+cd.cargo+') — '+(certLbl[st.estado_cert||'pendiente']||'PENDIENTE'));
    lineas.push('   Gastos: '+formatPeso(parseFloat(cd.total_gastos_rep)||parseFloat(cd.total_gastos_cand)||0));
    if(cd.renuncio) lineas.push('   ** RENUNCIÓ');
    if(cd.revocado) lineas.push('   ** REVOCADO');
    if(cd.no_presento) lineas.push('   ** NO PRESENTÓ INFORME');
    var txt=(st.texto_manual||'').trim();
    if(txt){
      txt.split('\n').forEach(function(l){ lineas.push('   '+l); });
    } else {
      lineas.push('   (Sin observaciones registradas)');
    }
  });
  lineas.push('\n'+'='.repeat(70));
  lineas.push('Total candidatos: '+todosP.length);
  var blob=new Blob([lineas.join('\n')],{type:'text/plain;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='OBSERVACIONES_'+_normFNFP(CAND_SELEC.partido)+'_'+_normFNFP(CAND_SELEC.municipio)+'.txt';
  a.click();
}

function _recopilarObsPartido(c){
  // Usar filtro Paso 1 para partido (no el partido del candidato seleccionado)
  var _selP=document.getElementById('selPartido');
  var pLow=(_selP?_selP.value:c.partido||'').toLowerCase().trim();
  var cands=Object.values(CANDIDATOS).filter(function(x){
    return (x.partido||'').toLowerCase().trim()===pLow;
  });
  var result=[];
  cands.forEach(function(cd){
    var filas=[];
    // Transaction observations from localStorage — separar ING y GAS con índices correctos
    var txData=TX_CACHE[cd.id];
    if(txData&&txData.length){
      var ingArr=txData.filter(function(t){return t.concepto==='INGRESO';});
      var gasArr=txData.filter(function(t){return t.concepto==='GASTO';});
      ingArr.forEach(function(t,idx){
        var obsKey='cne_obs_'+cd.id+'_I_'+idx;
        var obs=''; try{obs=localStorage.getItem(obsKey)||'';}catch(e){}
        if(obs){
          filas.push({candidato:cd.nombre, codigo:(t.cco_id||'').toString(),
            comprobante:t.comprobante||t.nro_comprobante||'', obs:obs, valor:parseFloat(t.valor||0)});
        }
      });
      gasArr.forEach(function(t,idx){
        var obsKey='cne_obs_'+cd.id+'_G_'+idx;
        var obs=''; try{obs=localStorage.getItem(obsKey)||'';}catch(e){}
        if(obs){
          filas.push({candidato:cd.nombre, codigo:(t.cco_id||'').toString(),
            comprobante:t.comprobante||t.nro_comprobante||'', obs:obs, valor:parseFloat(t.valor||0)});
        }
      });
    }
    // Re-verificar Art.23 contra transacciones reales (solo código 102 = donaciones)
    var art23Real=false;
    if(txData&&txData.length){
      var cdObs=cd.observaciones||{}, art=cdObs.articulos||{};
      var topeInd=parseFloat(art.tope_individual||cd.tope_individual||0);
      var lim23=topeInd?topeInd*0.10:0;
      if(lim23>0){
        txData.forEach(function(t){
          var cco=(t.cco_id||'').toString().trim();
          if(cco==='102'&&parseFloat(t.valor||0)>lim23) art23Real=true;
        });
      }
    }
    // Alertas del JSON — filtrar falsos positivos y alertas derivadas
    var cdObs2=cd.observaciones||{};
    var alertas=(cdObs2.alertas||[]).filter(function(a){
      if(a.indexOf('ART.23')!==-1||a.indexOf('Art.23')!==-1) return art23Real;
      // "SE REQUIERE ABRIR INVESTIGACIÓN" solo si quedan otras alertas reales
      if(a.indexOf('INVESTIGACI')!==-1) return false; // se re-evalúa abajo
      return true;
    });
    // Re-agregar investigación solo si quedan alertas reales
    if(alertas.length>0&&(cdObs2.alertas||[]).some(function(a){return a.indexOf('INVESTIGACI')!==-1;})){
      alertas.push('SE REQUIERE ABRIR INVESTIGACIÓN');
    }
    alertas=alertas.join('; ');
    var advs=(cdObs2.advertencias||[]).filter(function(a){
      if(a.indexOf('NO RADICADO')!==-1) return false; // 86% de candidatos — no útil
      if(a.indexOf('MAI/SAI')!==-1) return false; // nivel partido, no candidato
      return a.indexOf('Art.23')===-1&&a.indexOf('Art.24')===-1&&a.indexOf('Art.25')===-1&&a.indexOf('Art.27')===-1;
    }).join('; ');
    // Dictamen observations
    var dictObs=''; try{dictObs=localStorage.getItem('cne_dict_obs_'+cd.id)||'';}catch(e){}
    // Paso 7 manual text
    var st=cargarEstado(cd.id);
    var textoManual=st.texto_manual||'';
    // Obs generales siempre (candidato por candidato)
    var obsGeneral=[dictObs,textoManual,alertas,advs].filter(Boolean).join(' | ');
    if(obsGeneral){
      filas.push({candidato:cd.nombre, codigo:'—', comprobante:'—', obs:obsGeneral, valor:0});
    }
    if(filas.length){
      result=result.concat(filas);
    }
  });
  return result;
}

function _fmtFechaOficio(d){
  var meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return d.getDate()+' de '+meses[d.getMonth()]+' de '+d.getFullYear();
}

function _fmtFechaLimite(dateStr){
  if(!dateStr) return '_______________';
  var parts=dateStr.split('-');
  if(parts.length!==3) return dateStr;
  return parts[2]+'/'+parts[1]+'/'+parts[0];
}

function generarRequerimiento(){
  guardarDatosReq();
  var _gCorp=document.getElementById('selCorp')?document.getElementById('selCorp').value:'';
  var _gDpto=document.getElementById('selDpto')?document.getElementById('selDpto').value:'';
  var _gMun=document.getElementById('selMun')?document.getElementById('selMun').value:'';
  var _gPart=document.getElementById('selPartido')?document.getElementById('selPartido').value:'';
  if(!_gDpto||!_gPart){alert('Configure filtro en Paso 1 (Departamento y Partido).');return;}
  var c={id:'_oficio',partido:_gPart,cargo:_gCorp,departamento:_gDpto,municipio:_gMun==='_DPTO_'?_gDpto:_gMun};
  // Pre-cargar transacciones de TODOS los candidatos del partido antes de generar
  var pLow=_gPart.toLowerCase().trim();
  var candsPartido=Object.values(CANDIDATOS).filter(function(x){return (x.partido||'').toLowerCase().trim()===pLow;});
  var pendientes=candsPartido.filter(function(cd){return !TX_CACHE[cd.id];});
  if(pendientes.length>0){
    var btnGen=document.querySelector('[onclick*="generarRequerimiento"]');
    if(btnGen){btnGen.disabled=true;btnGen.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Cargando transacciones...';}
    var loaded=0;
    pendientes.forEach(function(cd){
      var url=txUrlFor(cd);
      if(!url){loaded++;return;}
      fetch(url).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];})
      .then(function(data){TX_CACHE[cd.id]=data;loaded++;
        if(loaded>=pendientes.length){
          if(btnGen){btnGen.disabled=false;btnGen.innerHTML='<i class="fa fa-file-alt me-1"></i>Generar Oficio';}
          _generarRequerimientoInner(c);
        }
      });
    });
    return;
  }
  _generarRequerimientoInner(c);
}
function _generarRequerimientoInner(c){

  var repNombre=(document.getElementById('reqRepNombre')||{}).value||'[REPRESENTANTE LEGAL]';
  var repDir=(document.getElementById('reqRepDir')||{}).value||'[DIRECCIÓN]';
  var repEmail=(document.getElementById('reqRepEmail')||{}).value||'[EMAIL]';
  var certNombre=(document.getElementById('reqCertNombre')||{}).value||'[CERTIFICADOR]';
  var fechaLimite=(document.getElementById('reqFechaLimite')||{}).value||'';

  // Usar filtro Paso 1 (los slim JSON tienen cargo/dpto/mun vacíos)
  var _p7Corp=document.getElementById('selCorp');
  var _p7Dpto=document.getElementById('selDpto');
  var _p7Mun=document.getElementById('selMun');
  var _p7Part=document.getElementById('selPartido');
  var cargoLabel=(_p7Corp?_p7Corp.value:c.cargo||'').toUpperCase();
  var munLabel=(_p7Mun&&_p7Mun.value&&_p7Mun.value!=='_DPTO_'?_p7Mun.value:c.municipio||'').toUpperCase();
  var dptoLabel=(_p7Dpto?_p7Dpto.value:c.departamento||'').toUpperCase();
  var partidoLabel=(_p7Part?_p7Part.value:c.partido)||'';
  var fechaHoy=_fmtFechaOficio(new Date());

  // Section 1: DICTAMEN observations
  // Leer obs del Paso 7 (por partido) + Paso 2 (por candidato) como fallback
  var _p7d0=_normFNFP(dptoLabel), _p7m0=_normFNFP(munLabel);
  var _p7ck=_normCargoDict(cargoLabel);
  var _p7pk=_p7ck+'_'+_p7d0+'_'+_p7m0+'_'+_normFNFP(partidoLabel);
  var dictObs=''; try{dictObs=localStorage.getItem('cne_p7_dict_'+_p7pk)||'';}catch(e){}
  if(!dictObs) try{dictObs=localStorage.getItem('cne_dict_obs_'+c.id)||'';}catch(e){}
  var analisis=_findDictAnalisis?_findDictAnalisis(c):null;
  var dictHtml='';
  if(analisis&&analisis.observaciones&&analisis.observaciones.length){
    dictHtml+='<p>Tipo de opinión del dictamen: <strong>'+_escHtml(analisis.opinion_tipo||'N/D')+'</strong></p>';
    dictHtml+='<ul>';
    analisis.observaciones.forEach(function(o){dictHtml+='<li>'+_escHtml(o)+'</li>';});
    dictHtml+='</ul>';
  }
  if(dictObs){
    dictHtml+='<p>'+_escHtml(dictObs).replace(/\n/g,'<br>')+'</p>';
  }
  if(!dictHtml) dictHtml='<p>Sin observaciones al dictamen.</p>';

  // Section 2: ANEXOS/SOPORTES/LIBRO - candidate observations table
  var filasObs=_recopilarObsPartido(c);
  var tablaHtml='';
  if(filasObs.length){
    tablaHtml='<table style="width:100%;border-collapse:collapse;font-size:11pt;margin-top:10px">'+
      '<thead><tr style="background:#e9ecef">'+
      '<th style="border:1px solid #000;padding:6px;text-align:left">CANDIDATO</th>'+
      '<th style="border:1px solid #000;padding:6px;text-align:center">CÓDIGO GASTO</th>'+
      '<th style="border:1px solid #000;padding:6px;text-align:center">No. COMPROBANTE</th>'+
      '<th style="border:1px solid #000;padding:6px;text-align:left">OBSERVACIÓN</th>'+
      '</tr></thead><tbody>';
    filasObs.forEach(function(f){
      tablaHtml+='<tr>'+
        '<td style="border:1px solid #000;padding:5px">'+_escHtml(f.candidato)+'</td>'+
        '<td style="border:1px solid #000;padding:5px;text-align:center">'+_escHtml(f.codigo)+'</td>'+
        '<td style="border:1px solid #000;padding:5px;text-align:center">'+_escHtml(f.comprobante)+'</td>'+
        '<td style="border:1px solid #000;padding:5px">'+_escHtml(f.obs)+'</td>'+
        '</tr>';
    });
    tablaHtml+='</tbody></table>';
  } else {
    tablaHtml='<p>Sin observaciones específicas en transacciones de candidatos.</p>';
  }

  var docHtml='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Requerimiento - '+_escHtml(partidoLabel)+' - '+_escHtml(munLabel)+'</title>'+
    '<style>'+
    '@page{size:letter;margin:2.5cm}'+
    'body{font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:1.5;color:#000;max-width:21cm;margin:0 auto;padding:2cm}'+
    'h2{font-size:13pt;margin:18pt 0 6pt}'+
    'p{margin:6pt 0;text-align:justify}'+
    'table{page-break-inside:auto}'+
    'tr{page-break-inside:avoid}'+
    '.header-right{text-align:right;margin-bottom:30pt}'+
    '.firma{margin-top:40pt;text-align:left}'+
    '@media print{body{padding:0;max-width:none}}'+
    '</style></head><body>'+

    '<div class="header-right"><strong>Bogotá D.C. '+_escHtml(fechaHoy)+'</strong></div>'+

    '<p><strong>Señores:</strong><br>'+
    '<strong>'+_escHtml(repNombre)+'</strong><br>'+
    'Representante Legal:<br>'+
    _escHtml(repDir)+'<br>'+
    _escHtml(repEmail)+'</p>'+

    '<p><strong>Asunto:</strong> Requerimiento al Informe Integral de Ingresos y Gastos de la campaña '+
    'para la '+_escHtml(cargoLabel)+' de '+_escHtml(munLabel)+'-'+_escHtml(dptoLabel)+' '+
    _escHtml(partidoLabel)+' Elección octubre 29 del año 2023.</p>'+

    '<p>Cordial saludo,</p>'+

    '<p>Una vez revisado los documentos correspondientes al informe de Ingresos y Gastos, '+
    'muy respetuosamente les solicito se sirvan aclarar y/o corregir las siguientes observaciones, '+
    'las cuales son necesarias para continuar el trámite de reposición:</p>'+

    '<h2>1. DICTAMEN.</h2>'+
    dictHtml+

    '<h2>2. ANEXOS/SOPORTES /LIBRO INGRESOS GASTOS.</h2>'+
    '<p>Revisando la cuenta, se evidencia las siguientes inconsistencias a subsanar según la resolución 5383 de 2023:</p>'+
    tablaHtml+

    '<hr style="margin-top:30pt">'+

    '<p>El canal autorizado para dar respuesta al presente requerimiento es el siguiente correo electrónico: '+
    '<strong>informescampanas@cne.gov.co</strong>. Las respuestas que sean enviadas por otros medios de '+
    'radicación se darán por no recibidas y, en consecuencia, no serán tenidas en cuenta para continuar '+
    'con el proceso de revisión.</p>'+

    '<p><strong>FECHA DE RESPUESTA MÁXIMA '+_escHtml(_fmtFechaLimite(fechaLimite))+'</strong></p>'+

    '<p><strong>Nota Importante:</strong> Debe tenerse en cuenta que de no dar cumplimiento al artículo 31 '+
    'de la Resolución 4737 de 2023, el cual fuera modificado mediante Resolución 5383 de 2023, emitidas '+
    'por el C.N.E., se procederá conforme lo establecido en el parágrafo segundo del artículo 3° de la '+
    'Resolución 4737 de 2023.</p>'+

    '<p>Es importante señalar que todas las correcciones de los formularios y anexos deben presentarse a '+
    'través del aplicativo Cuentas Claras, de lo contrario no serán tenidas en cuenta para efectos de la '+
    'revisión, como quiera que no pueda ser visualizado por el contador. Tener presente también, que toda '+
    'corrección o ajuste debe ser informada al correo electrónico autorizado.</p>'+

    '<p>Con el fin de continuar con el trámite correspondiente, se espera la respuesta en los términos '+
    'señalados en el inciso primero del artículo 14 de la Resolución 4737 de 2023 (1 mes), so pena de '+
    'dar aplicación al artículo 15 de la norma en cita (archivo del informe).</p>'+

    '<div class="firma">'+
    '<p>Cordialmente,</p>'+
    '<br><br>'+
    '<p><strong>'+_escHtml(certNombre)+'</strong><br>'+
    'Contadora<br>'+
    'Fondo Nacional de Financiación Política.</p>'+
    '</div>'+

    '</body></html>';

  var w=window.open('','_blank');
  if(w){
    w.document.write(docHtml);
    w.document.close();
  } else {
    alert('No se pudo abrir la ventana. Verifique que el navegador no bloquee ventanas emergentes.');
  }
}

function _escHtml(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

