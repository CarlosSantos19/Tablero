// ─── PASO 10: CERTIFICADO ────────────────────────────────────────────────
function renderCertificado(){
  var c=CAND_SELEC;
  var el=document.getElementById('panelCertificado');
  if(!c){ el.innerHTML='<div class="alert alert-secondary">Seleccione un candidato primero.</div>'; return; }
  el.innerHTML='<div class="text-center p-4"><div class="spinner-border text-primary"></div><p class="mt-2">Cargando datos...</p></div>';
  // Cargar dependencias en paralelo con timeout
  var loaded=0, total=4;
  function onLoad(){loaded++;if(loaded>=total)_renderCertificadoInner(c);}
  _cargarConsolidado44(onLoad);
  _cargarDictAnalisis(onLoad);
  _cargarAuditorDB(onLoad);
  _cargarCoalicionMeta(onLoad);
  // Timeout: render even if some fail
  setTimeout(function(){if(loaded<total){loaded=total;_renderCertificadoInner(c);}},5000);
}

function _renderCertificadoInner(c){
  var el=document.getElementById('panelCertificado');
  var obs=c.observaciones||{}, dic=obs.dictamen||{}, est=obs.estado||{};
  var cargo=String(c.cargo||'').toUpperCase();
  var isAlcaldia=cargo.indexOf('ALCALD')>=0;
  var isConcejo=cargo.indexOf('CONCEJO')>=0;
  var isAsamblea=cargo.indexOf('ASAMBLEA')>=0;
  var isGob=cargo.indexOf('GOBERNAC')>=0;
  var esGobAsamblea=isAsamblea||isGob;
  var isJAL=cargo.indexOf('JAL')>=0||cargo.indexOf('JUNTA')>=0;
  var uid='cert_'+c.id;

  // ── Corporación label con artículo ──
  var corpLabel=isAlcaldia?'la Alcaldía':isConcejo?'el Concejo':isAsamblea?'la Asamblea':isGob?'la Gobernación':'la JAL';
  var corpLabelUp=isAlcaldia?'ALCALDÍA':isConcejo?'CONCEJO':isAsamblea?'ASAMBLEA':isGob?'GOBERNACIÓN':'JAL';

  // ── Datos 9B ──
  var c44=typeof _findConsolidado44==='function'?_findConsolidado44(c):null;
  var analisisCert=typeof _findDictAnalisis==='function'?_findDictAnalisis(c):null;
  var auditoresCert=typeof _findAuditores==='function'?_findAuditores(c.partido):[];

  var audNombre=(c44&&c44.auditor_nombre)||
    (analisisCert&&analisisCert.auditor_nombre)||dic.auditor_nombre_jcc||'';
  var audTP=(c44&&c44.auditor_tp)||(analisisCert&&analisisCert.auditor_tp)||dic.auditor_tarjeta_profesional||'';
  var audCC=(c44&&c44.auditor_cc)||(analisisCert&&analisisCert.auditor_cc)||'';
  if(!audNombre&&auditoresCert.length) audNombre=auditoresCert[0].n||'';
  if(!audTP&&auditoresCert.length) audTP=(auditoresCert[0].tp||[]).join(', ');
  if(!audCC&&auditoresCert.length) audCC=auditoresCert[0].c||'';

  var informes9b=c.informes||[];
  if(!informes9b.length){var _i9=obs.informe||{}; if(_i9.fecha||_i9.numero) informes9b=[_i9];}
  var rad9b=(c44&&c44.radicacion)||'';
  var fec9b=(c44&&c44.fecha)||'';
  if(!rad9b&&informes9b.length) rad9b=informes9b[0].numero||'';
  if(!fec9b&&informes9b.length) fec9b=informes9b[0].fecha||'';

  // ── Extemporáneo: 9B presentado después del 29/12/2023 ──
  var esExtemporaneo=!!(est.extemporaneo||c.extemporaneo);
  if(!esExtemporaneo&&fec9b){
    var fp=fec9b.replace(/\//g,'-');
    var parts9=fp.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)||fp.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
    if(parts9){
      var d9=parts9[0].indexOf('-')>2?new Date(parts9[1],parts9[2]-1,parts9[3]):new Date(parts9[3],parts9[2]-1,parts9[1]);
      if(d9>new Date(2023,11,29)) esExtemporaneo=true;
    }
  }

  // ── Coalición ──
  var coal=_findCoalicion(c);
  var isCoalicion=!!coal;
  var coalNombre=isCoalicion?(coal.nombre_coalicion||''):'';
  var coalResponsable=isCoalicion?(coal.responsable||coal.partido_responsable||c.partido):'';
  var coalIntegrantes=isCoalicion&&coal.integrantes?coal.integrantes.join(', '):'';

  // ── Candidatos del partido ──
  var pN=norm(c.partido);
  var candsPartido=Object.values(CANDIDATOS).filter(function(cx){return norm(cx.partido)===pN;});
  if(!candsPartido.length) candsPartido=[c];
  var presentaron=[],noPresentaron=[],noDebidaForma=[],revocados=[];
  candsPartido.forEach(function(cx){
    var o2=cx.observaciones||{},e2=o2.estado||{};
    if(!e2.renuncio&&cx.renuncio!==undefined) e2={renuncio:cx.renuncio,no_presento:cx.no_presento,extemporaneo:cx.extemporaneo,revocado:cx.revocado};
    if(e2.revocado) revocados.push(cx);
    else if(e2.no_presento||cx.no_presento) noPresentaron.push(cx);
    else if(e2.extemporaneo||cx.extemporaneo) noDebidaForma.push(cx);
    else presentaron.push(cx);
  });

  // ── Financiero ──
  var totalGastos=0,totalIngresos=0,totalVotos=0;
  candsPartido.forEach(function(cx){
    totalGastos+=(cx.total_gastos_rep||cx.total_gastos_cand||0);
    totalIngresos+=(cx.total_ingresos_rep||cx.total_ingresos_cand||0);
    totalVotos+=(cx.votos||0);
  });
  var tope=buscarTopeTotal(c.cargo,c.poblacion||0)||0;
  var cargoVV=isAlcaldia?'ALCALDIA':isConcejo?'CONCEJO':isAsamblea?'ASAMBLEA':isGob?'GOBERNACION':'ALCALDIA';
  var valorVoto=VALOR_DEL_VOTO[cargoVV]||0;

  // ── Tipo certificación: ALCALDIA siempre UNICA ──
  var certKey='cne_cert_tipo_'+c.id;
  var certTipo='';try{certTipo=localStorage.getItem(certKey)||'';}catch(e){}
  if(!certTipo) certTipo=isAlcaldia?'UNICA':'PRIMERA';

  // ── Género del contador (heurística: terminación en A = femenina) ──
  var audNomUp=(audNombre||'').toUpperCase().trim();
  var lastWord=audNomUp.split(/\s+/).pop()||'';
  var esFemenino=lastWord&&/A$/.test(lastWord)&&!/[EIOU]A$/.test(lastWord);
  var elLa=esFemenino?'la':'el';
  var suscritoA=esFemenino?'suscrita':'suscrito';
  var contadorA=esFemenino?'Contadora':'Contador';
  var delLa=esFemenino?'de la':'del';

  // ── Plantilla DOCX ──
  var certFile=esGobAsamblea
    ?'plantillas/certificaciones/Certificacion_GOBERNACION_ASAMBLEA.docx'
    :'plantillas/certificaciones/Certificacion_ALCALDIA_CONCEJO.docx';

  // ── Departamento/Municipio desde filtro Paso 1 ──
  var dptoVal=document.getElementById('selDpto').value||c.departamento||'';
  var munVal=document.getElementById('selMun').value||c.municipio||'';
  if(munVal==='_DPTO_') munVal='';
  var dptoTxt=titleCase(dptoVal);
  var munTxt=titleCase(munVal);

  // ══════════════════════════════════════════════════════════════════════
  //  RENDER HTML
  // ══════════════════════════════════════════════════════════════════════
  var html='';

  // ── Tipo certificación ──
  html+='<div class="card mb-3"><div class="card-header fw-semibold py-2 bg-dark text-white">Tipo de Certificación</div>'+
    '<div class="card-body py-2"><div class="btn-group w-100" role="group" id="certTipoGrp">'+
    ['UNICA','PRIMERA','SEGUNDA','TERCERA'].map(function(t){
      var active=certTipo===t?'btn-primary':'btn-outline-primary';
      return '<button type="button" class="btn '+active+'" onclick="document.querySelectorAll(\'#certTipoGrp .btn\').forEach(function(b){b.className=\'btn btn-outline-primary\'});this.className=\'btn btn-primary\';try{localStorage.setItem(\''+certKey+'\',\''+t+'\')}catch(e){};_certRegenText()">'+t+'</button>';
    }).join('')+'</div></div></div>';

  // ── Datos editables ──
  html+='<div class="card mb-3"><div class="card-header fw-semibold py-2">Datos de la certificación</div>'+
    '<div class="card-body"><div class="row g-2">'+
    '<div class="col-md-6"><label class="small fw-semibold">Partido / Movimiento</label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_partido" value="'+esc(isCoalicion?coalResponsable:c.partido||'')+'" oninput="_certRegenText()"></div>'+
    (isCoalicion?
      '<div class="col-md-6"><label class="small fw-semibold">Nombre Coalición</label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_coalicion" value="'+esc(coalNombre||'')+'" placeholder="Nombre del acuerdo o integrantes" oninput="_certRegenText()"></div>':'')+
    '<div class="col-md-'+(esGobAsamblea?'6':'3')+'"><label class="small fw-semibold">Departamento</label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_dpto" value="'+esc(dptoTxt)+'" readonly></div>'+
    (esGobAsamblea?'':
      '<div class="col-md-3"><label class="small fw-semibold">Municipio</label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_municipio" value="'+esc(munTxt)+'" readonly></div>')+
    '<div class="col-md-6"><label class="small fw-semibold">Corporación (Paso 1)</label>'+
      '<input class="form-control form-control-sm" value="'+esc(corpLabelUp)+'" readonly></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">N° Radicado 9B</label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_radicado" value="'+esc(rad9b)+'" oninput="_certRegenText()"></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">Fecha 9B</label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_fecpres" value="'+esc(fec9b)+'" oninput="_certRegenText()"></div>'+
    '<div class="col-md-2"><label class="small fw-semibold">Extemporáneo</label>'+
      '<select class="form-select form-select-sm" id="'+uid+'_extemp" onchange="_certRegenText()">'+
      '<option value="0"'+(esExtemporaneo?'':' selected')+'>No</option>'+
      '<option value="1"'+(esExtemporaneo?' selected':'')+'>Sí</option></select></div>'+
    '<div class="col-md-5"><label class="small fw-semibold">'+contadorA+'(a) Público(a) <span class="text-danger">*</span></label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_audnombre" value="'+esc(audNombre)+'" oninput="_certRegenText()" placeholder="Nombre completo"></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">C.C. Contador(a) <span class="text-danger">*</span></label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_audcc" value="'+esc(audCC)+'" oninput="_certRegenText()" placeholder="Cédula"></div>'+
    '<div class="col-md-2"><label class="small fw-semibold">T.P. <span class="text-danger">*</span></label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_audtp" value="'+esc(audTP)+'" oninput="_certRegenText()" placeholder="XXXXX-T"></div>'+
    '<div class="col-md-2"><label class="small fw-semibold">Género</label>'+
      '<select class="form-select form-select-sm" id="'+uid+'_genero" onchange="_certRegenText()">'+
      '<option value="M"'+(esFemenino?'':' selected')+'>Masculino</option>'+
      '<option value="F"'+(esFemenino?' selected':'')+'>Femenino</option></select></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">Acta N° reparto <span class="text-danger">*</span></label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_acta" oninput="_certRegenText()" placeholder="XX"></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">Día</label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_dia" oninput="_certRegenText()" placeholder="DD"></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">Mes</label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_mes" oninput="_certRegenText()" placeholder="enero"></div>'+
    '<div class="col-md-3"><label class="small fw-semibold">Año</label>'+
      '<input class="form-control form-control-sm" id="'+uid+'_ano" oninput="_certRegenText()" placeholder="2025" value="2025"></div>'+
    '<div class="col-md-6"><label class="small fw-semibold">Jefe de Oficina</label>'+
      '<div class="input-group input-group-sm">'+
        '<select class="form-select form-select-sm" id="'+uid+'_jefe_oficina" onchange="_certRegenText()">'+_opcionesJefeOficina()+'</select>'+
        '<button class="btn btn-outline-success" onclick="agregarJefeOficina(\''+uid+'\')" title="Agregar"><i class="fa fa-plus"></i></button>'+
      '</div></div>'+
  '</div></div></div>';

  // ── Candidatos del partido ──
  html+='<div class="card mb-3"><div class="card-header fw-semibold py-2"><i class="fa fa-users me-2"></i>Candidatos del partido ('+candsPartido.length+')</div>'+
    '<div class="card-body p-0"><table class="table table-sm mb-0"><thead class="table-light"><tr>'+
    '<th>Candidato</th><th>Cédula</th><th class="text-end">Votos</th><th>Estado</th></tr></thead><tbody>';
  candsPartido.forEach(function(cx){
    var o2=cx.observaciones||{},e2=o2.estado||{};
    if(!e2.renuncio&&cx.renuncio!==undefined) e2={renuncio:cx.renuncio,no_presento:cx.no_presento,extemporaneo:cx.extemporaneo,revocado:cx.revocado};
    var st=e2.revocado?'<span class="badge bg-dark">Revocado</span>':
           (e2.no_presento||cx.no_presento)?'<span class="badge bg-danger">No Presentó</span>':
           (e2.extemporaneo||cx.extemporaneo)?'<span class="badge bg-warning text-dark">Extemporáneo</span>':
           '<span class="badge bg-success">Presentó</span>';
    html+='<tr><td class="small">'+esc(cx.nombre)+'</td><td class="small">'+esc(cx.id)+'</td>'+
      '<td class="text-end small">'+fmtNum(cx.votos||0)+'</td><td>'+st+'</td></tr>';
  });
  html+='</tbody></table></div></div>';

  // ── Texto de certificación (auto-generado) ──
  html+='<div class="card"><div class="card-header fw-semibold py-2 d-flex justify-content-between align-items-center">'+
    '<span><i class="fa fa-file-alt me-1"></i>Texto de la Certificación</span>'+
    '<div>'+
      '<button class="btn btn-sm btn-success me-1" onclick="copiarResumenCert(\''+uid+'\')"><i class="fa fa-copy me-1"></i>Copiar</button>'+
      '<button class="btn btn-sm btn-primary" onclick="generarDocxCert(\''+uid+'\')"><i class="fa fa-file-word me-1"></i>DOCX</button>'+
    '</div></div>'+
    '<div class="card-body p-0"><div id="'+uid+'_resumen" contenteditable="true" class="small p-3" style="white-space:pre-wrap;font-size:.82rem;line-height:1.6;min-height:300px">'+
    '</div></div></div>';

  // ── Plantilla descarga ──
  html+='<div class="text-end mt-2"><a href="'+esc(certFile)+'" download class="btn btn-sm btn-outline-secondary"><i class="fa fa-download me-1"></i>Plantilla DOCX original</a></div>';

  el.innerHTML=html;

  // ── Art.25 candidates ──
  var art25Cands=[];
  candsPartido.forEach(function(cx){
    var r=_detectCausales(cx);
    r.causales.forEach(function(ca){ if(ca.key==='ART25') art25Cands.push(cx); });
  });

  // Guardar contexto para regenerar texto
  el._certCtx={c:c,candsPartido:candsPartido,presentaron:presentaron,noPresentaron:noPresentaron,
    noDebidaForma:noDebidaForma,revocados:revocados,totalGastos:totalGastos,totalVotos:totalVotos,
    totalIngresos:totalIngresos,tope:tope,valorVoto:valorVoto,
    isCoalicion:isCoalicion,coal:coal,coalIntegrantes:coalIntegrantes,
    isAlcaldia:isAlcaldia,isConcejo:isConcejo,isAsamblea:isAsamblea,isGob:isGob,esGobAsamblea:esGobAsamblea,
    corpLabel:corpLabel,corpLabelUp:corpLabelUp,uid:uid,art25Cands:art25Cands,
    rad9b:rad9b,fec9b:fec9b,esExtemporaneo:esExtemporaneo,
    audNombre:audNombre,audTP:audTP,audCC:audCC,poblacion:c.poblacion||0};
  _certRegenText();
}

function _certRegenText(){
  var el=document.getElementById('panelCertificado');
  if(!el||!el._certCtx) return;
  var ctx=el._certCtx, c=ctx.c, uid=ctx.uid;
  var g=function(id){var e=document.getElementById(uid+'_'+id);return e?e.value.trim():'';};
  var genero=g('genero');
  var esFem=genero==='F';
  var elLa=esFem?'la':'el';
  var suscritoA=esFem?'la suscrita':'el suscrito';
  var contadorA=esFem?'Contadora':'Contador';
  var contadorAmin=esFem?'contadora':'contador';
  var loLa=esFem?'la':'lo';

  var partido=g('partido')||c.partido||'';
  var coalNombre=g('coalicion')||'';
  var dptoTxt=g('dpto')||titleCase(c.departamento||'');
  var munTxt=g('municipio')||titleCase(c.municipio||'');
  var radicado=g('radicado')||'[radicación]';
  var fecPres=g('fecpres')||'[fecha presentación]';
  var audNom=g('audnombre')||'[NOMBRE CONTADOR(A)]';
  var audTPv=g('audtp')||'[T.P.]';
  var audCCv=g('audcc')||'[C.C.]';
  var acta=g('acta')||'[XX]';
  var dia=g('dia')||'[día]';
  var mes=g('mes')||'[mes]';
  var ano=g('ano')||'[año]';
  var jefe=g('jefe_oficina')||_getJefes()[0]||'[JEFE OFICINA]';
  var esExt=g('extemp')==='1';
  var certTipo='PRIMERA';try{certTipo=localStorage.getItem('cne_cert_tipo_'+c.id)||'PRIMERA';}catch(e){}
  if(certTipo==='UNICA') certTipo='ÚNICA';

  var corpL=ctx.corpLabel;
  var corpUp=ctx.corpLabelUp;
  var esGA=ctx.esGobAsamblea;
  var geoTxt=esGA?('departamento de '+dptoTxt):('municipio de '+munTxt+', departamento de '+dptoTxt);
  var tieneNoPres=ctx.noPresentaron.length>0;
  var tieneNoForma=ctx.noDebidaForma.length>0;
  var tieneRevocados=ctx.revocados.length>0;
  var tieneArt25=ctx.art25Cands&&ctx.art25Cands.length>0;

  // ── Gastos por candidato (para tablas) ──
  function _cxGas(cx){ return cx.total_gastos_rep||((cx.observaciones||{}).financiero||{}).total_gastos||cx.total_gastos_cand||0; }

  // ── Descuentos ──
  var votosDescNoPres=0, votosDescNoForma=0, votosDescRevoc=0, gastosDescRevoc=0, gastosDescNoForma=0;
  ctx.noPresentaron.forEach(function(cx){votosDescNoPres+=(cx.votos||0);});
  ctx.noDebidaForma.forEach(function(cx){votosDescNoForma+=(cx.votos||0);gastosDescNoForma+=_cxGas(cx);});
  ctx.revocados.forEach(function(cx){votosDescRevoc+=(cx.votos||0);gastosDescRevoc+=_cxGas(cx);});
  var votosDesc=votosDescNoPres+votosDescRevoc;
  var gastosDesc=gastosDescRevoc;
  var hayDescuento=votosDesc>0;
  var votosNetos=ctx.totalVotos-votosDesc;

  // ── Valor del voto ──
  var vxv=ctx.valorVoto*votosNetos;
  var gastosNetos=ctx.totalGastos-gastosDesc;
  var esPorGastos=gastosNetos<=vxv;
  var valorBruto=Math.min(gastosNetos,vxv);
  var sinDerecho=votosNetos<=0||valorBruto<=0;

  // ── Resoluciones según corporación ──
  var resTopeCod=ctx.isConcejo||ctx.isAsamblea?'0669':'0670';
  var resTopeFecha='31 de enero de 2023';
  var resVotoCod='0672';

  // ══════════════════════════════════════════════════════════════════
  //  CONSTRUIR TEXTO COMPLETO
  // ══════════════════════════════════════════════════════════════════
  var t='';

  // ── Encabezado ──
  t+='LA JEFE DE OFICINA DEL FONDO NACIONAL DE FINANCIACIÓN DE PARTIDOS Y CAMPAÑAS ELECTORALES\n\n';
  t+='HACE CONSTAR:\n\n';

  // ── P006: Presentación ──
  t+='Que el '+partido;
  if(ctx.isCoalicion){
    t+=' como responsable de la presentación del Informe de Ingresos y Gastos de Campaña de la Coalición Programática y Política denominada "'+(coalNombre||partido)+'"';
    if(ctx.coalIntegrantes) t+=' conformada por el '+ctx.coalIntegrantes;
    t+=',';
  }
  t+=' presentó a través del Software Aplicativo Cuentas Claras '+(esExt?'Extemporáneamente':'oportunamente')+' el día '+fecPres+', el Informe Consolidado de ingresos y gastos de la campaña electoral adelantada en desarrollo de las Elecciones Territoriales celebradas el 29 de octubre de 2023 para '+corpL+' del '+geoTxt+'.\n\n';

  // ── P008: Radicación y asignación ──
  t+='Que la información de ingresos y gastos evidenciada en el Software Aplicativo CUENTAS CLARAS radicado con el Consecutivo '+radicado+', fue asignado – reasignado mediante reparto según Acta No. '+acta+' del '+dia+' de '+mes+' de '+ano+' a '+elLa+' '+contadorA+'(a) Público(a) '+audNom+' con Tarjeta Profesional No. '+audTPv+', identificado(a) con C.C. No. '+audCCv+', perteneciente al grupo de trabajo adscrito al Fondo Nacional de Financiación de Partidos y Campañas Electorales, quien una vez concluido el proceso de revisión y la generación de los requerimientos que fue necesario realizar en desarrollo de este, si a ello hubo lugar, como lo prevén los artículos 12 y 13 de la Resolución No. 4737 de 2023, modificada transitoriamente por la Resolución No. 02240 de 2024, se permite:\n\n';

  // ── P011: CERTIFICAR ──
  t+='CERTIFICAR:\n\n';

  // ── P014: Documentos contentivos ──
  t+='Que hacen parte de los documentos contentivos del informe integral de ingresos y gastos: el formulario 9B y sus respectivos anexos';
  if(tieneNoPres||tieneNoForma){
    t+=', el dictamen de auditoría interna con abstención de opinión por';
    var motivos=[];
    if(tieneNoPres) motivos.push('no presentación');
    if(tieneNoForma) motivos.push('no presentación en debida forma');
    t+=' '+motivos.join(' y/o por ');
  }
  if(ctx.isCoalicion) t+=', el Acuerdo Programático de Coalición';
  t+=', al igual que el/los formularios 8B con sus respectivos anexos';
  if(tieneNoPres||tieneNoForma) t+=', la certificación por '+(tieneNoPres?'no presentación':'')+(tieneNoPres&&tieneNoForma?' y/o por ':'')+(tieneNoForma?'no presentación en debida forma':'');
  t+=' y demás documentos.\n\n';

  // ── P016: Aclaración 9B definitivo ──
  t+='Es importante aclarar, que la organización política generó el Informe Integral de Ingresos y Gastos de la Campaña definitivo – Formulario 9B – con fecha '+fecPres+' y radicado ('+radicado+'), documento que fue el examinado por '+elLa+' '+contadorAmin+' asignado(a) por el Fondo Nacional de Financiación de Partidos y Campañas Electorales.\n\n';

  // ── P018: Auditoría interna ──
  t+='Que el '+partido+', como responsable de la presentación del informe de Ingresos y gastos Consolidado ante el Consejo Nacional Electoral acreditó el sistema de auditoría interna de conformidad con lo indicado por el artículo 18 del Título VI de la Ley 130 de 1994.\n\n';

  // ── P020: Sin observación ──
  t+='Que a la fecha el informe se halla sin observación alguna.\n\n';

  // ══════════════════════════════════════════════════════════════════
  //  CANDIDATOS QUE PRESENTARON — TABLA
  // ══════════════════════════════════════════════════════════════════
  if(ctx.presentaron.length>0){
    t+='Que en el informe se consolidaron los ingresos y gastos de la organización política y de los siguientes candidatos, quienes cumplieron con la obligación de la presentación del informe de ingresos y gastos de campaña ante el '+partido+' acatando las normas electorales vigentes, y obtuvieron la siguiente votación según la certificación expedida por la Comisión Escrutadora:\n\n';
    t+='No.  | CÉDULA           | NOMBRE DEL CANDIDATO                | VOTOS\n';
    t+='──── | ──────────────── | ─────────────────────────────────── | ──────\n';
    var totalVotosPres=0;
    ctx.presentaron.forEach(function(cx,i){
      totalVotosPres+=(cx.votos||0);
      t+=_padR(''+(i+1)+'.',5)+'| '+_padR(cx.id,17)+'| '+_padR(cx.nombre,36)+'| '+fmtNum(cx.votos||0)+'\n';
    });
    t+='     | '+partido+'\n';
    t+='     | TOTAL VOTOS                                           | '+fmtNum(totalVotosPres)+'\n\n';
  }

  // ── P046/P047: Dictamen auditoría interna adjunto ──
  if(tieneNoPres||tieneNoForma){
    t+='Que el '+partido+' adjuntó al informe consolidado de Ingresos y Gastos, dictamen de auditoría interna elaborado en los términos del artículo quinto de la Resolución 4737 de 2023 con abstención por '+(tieneNoPres?'no presentación':'')+(tieneNoPres&&tieneNoForma?' y/o por ':'')+(tieneNoForma?'no presentación en debida forma':'')+'.\n\n';
  }

  // ══════════════════════════════════════════════════════════════════
  //  CENSO Y TOPE
  // ══════════════════════════════════════════════════════════════════
  var pob=ctx.poblacion||0;
  if(esGA){
    t+='Que, el censo electoral del departamento de '+dptoTxt+' vigente para la fecha en que se realizó el debate electoral, según el archivo facilitado por la Dirección de Censo Electoral de la Registraduría Nacional del Estado Civil, es de '+fmtNum(pob)+' ('+_numPalabras(pob)+') ciudadanos aptos para votar.\n\n';
  } else {
    t+='Que, el censo electoral del municipio de '+munTxt+', departamento de '+dptoTxt+' vigente para la fecha en que se realizó el debate electoral, según el archivo facilitado por la Dirección de Censo Electoral de la Registraduría Nacional del Estado Civil, es de '+fmtNum(pob)+' ('+_numPalabras(pob)+') ciudadanos aptos para votar.\n\n';
  }

  // ── Tope por candidato/lista ──
  if(ctx.tope>0){
    var nCands=_contarCandPartidoCC(ctx.c.cargo, ctx.c.partido);
    var topeInd=ctx.isAlcaldia||ctx.isGob?ctx.tope:Math.round(ctx.tope/nCands*100)/100;
    if(ctx.isConcejo||ctx.isAsamblea){
      t+='Que cotejado el censo con la Resolución No. '+resTopeCod+' del '+resTopeFecha+', en el artículo '+(esGA?'primero':'segundo')+', se puede establecer que en la referenciada campaña se podía invertir por cada una de las listas, la suma de hasta '+fmtCOP(ctx.tope)+' ('+_numPalabras(ctx.tope)+' PESOS MONEDA CORRIENTE), y por cada candidato inscrito la suma de '+fmtCOP(topeInd)+' ('+_numPalabras(topeInd)+' PESOS MONEDA CORRIENTE).\n\n';
    } else {
      t+='Que cotejado el censo con la Resolución No. '+resTopeCod+' del '+resTopeFecha+', en el artículo '+(esGA?'primero':'segundo')+', se puede establecer que en la referenciada campaña se podía invertir por cada candidato inscrito, la suma de hasta '+fmtCOP(ctx.tope)+' ('+_numPalabras(ctx.tope)+' PESOS MONEDA CORRIENTE).\n\n';
    }
  }

  // ── Campaña institucional ──
  if(ctx.isConcejo||ctx.isAsamblea){
    t+='Que según la Resolución No. '+resTopeCod+' del '+resTopeFecha+', en el artículo cuarto establece: "Cada partido o movimiento político con personería jurídica podrá invertir en la campaña institucional a favor de sus listas al '+(ctx.isConcejo?'Concejo':'Asamblea')+' una suma que no podrá exceder del 50% de la suma del tope fijado para la lista, con cargo a sus propios recursos. Los Grupos Significativos de Ciudadanos no podrán invertir en campañas institucionales para las listas al '+(ctx.isConcejo?'Concejo':'Asamblea')+'…".\n\n';
  } else {
    t+='Que según la Resolución No. '+resTopeCod+' del '+resTopeFecha+', en el artículo tercero establece: "Cada partido o movimiento político con personería jurídica podrá invertir en la campaña institucional a favor de sus candidatos a '+(ctx.isAlcaldia?'Alcaldía':'Gobernación')+' una suma que no podrá exceder del 50% de la suma del tope fijado para el candidato, con cargo a sus propios recursos…".\n\n';
  }

  // ── Valor del voto ──
  if(esGA){
    t+='Que mediante Resolución No. '+resVotoCod+' del '+resTopeFecha+', en el artículo primero, se estableció: "FÍJASE, el valor de reposición por voto válido obtenido por los candidatos a cargo de gobernador y de las listas de candidatos a diputados a las Asambleas Departamentales, en la suma de CUATRO MIL QUINIENTOS NOVENTA PESOS ($4.590) MONEDA CORRIENTE para las Elecciones Territoriales del 29 de octubre de 2023.".\n\n';
  } else {
    t+='Que mediante Resolución No. '+resVotoCod+' del '+resTopeFecha+', en el artículo segundo, se estableció: "FÍJASE, el valor de reposición por voto válido obtenido por los candidatos a cargo de alcalde y de las listas de candidatos a concejales municipales y distritales y a ediles y a miembros de juntas administradoras locales, en la suma de DOS MIL SETECIENTOS SESENTA Y SEIS PESOS ($2.766) MONEDA CORRIENTE para las Elecciones Territoriales del 29 de octubre de 2023.".\n\n';
  }

  // ══════════════════════════════════════════════════════════════════
  //  CERTIFICADO ELECTORAL — VOTOS VÁLIDOS
  // ══════════════════════════════════════════════════════════════════
  if(!sinDerecho){
    if(ctx.isConcejo||ctx.isAsamblea){
      t+='Que, una vez examinado el contenido del Certificado de Financiación expedido por la Comisión Escrutadora, se señala que la lista optó por VOTO PREFERENTE y que el número de votos válidos obtenidos por la lista suman '+_numPalabras(ctx.totalVotos)+' ('+fmtNum(ctx.totalVotos)+') votos, por lo que le asiste el derecho a la reposición de gastos de campaña de conformidad con lo establecido por el artículo 21 de la Resolución 4737 de 2023.\n\n';
    } else {
      t+='Que, una vez examinado el contenido del Certificado de Financiación expedido por la Comisión Escrutadora, se señala que el número de votos válidos obtenidos por el candidato suman '+_numPalabras(ctx.totalVotos)+' ('+fmtNum(ctx.totalVotos)+') votos, por lo que le asiste el derecho a la reposición de gastos de campaña de conformidad con lo establecido por el artículo 21 de la Resolución 4737 de 2023.\n\n';
    }
  } else {
    if(ctx.isConcejo||ctx.isAsamblea){
      t+='Que, una vez examinado el contenido del Certificado de Financiación expedido por la Comisión Escrutadora, se señala que la lista optó por VOTO PREFERENTE y que el número de votos válidos obtenidos por la lista suman '+_numPalabras(ctx.totalVotos)+' ('+fmtNum(ctx.totalVotos)+') votos, por lo que NO le asiste el derecho a la reposición de gastos de campaña de conformidad con lo establecido por el artículo 21 de la Resolución 4737 de 2023.\n\n';
    } else {
      t+='Que, una vez examinado el contenido del Certificado de Financiación expedido por la Comisión Escrutadora, se señala que el número de votos válidos obtenidos por el candidato suman '+_numPalabras(ctx.totalVotos)+' ('+fmtNum(ctx.totalVotos)+') votos, por lo que NO le asiste el derecho a la reposición de gastos de campaña de conformidad con lo establecido por el artículo 21 de la Resolución 4737 de 2023.\n\n';
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  ANTICIPO
  // ══════════════════════════════════════════════════════════════════
  if(ctx.isCoalicion){
    t+='Que el '+partido+', quienes conformaron la Coalición Programática y Política denominada "'+(coalNombre||partido)+'" NO solicitaron NI se les reconoció Anticipo de la Financiación Estatal, por lo que no hay valor a descontar por este concepto.\n\n';
  }

  // ══════════════════════════════════════════════════════════════════
  //  COALICIÓN — ARTÍCULOS Y ACUERDO
  // ══════════════════════════════════════════════════════════════════
  if(ctx.isCoalicion){
    t+='Que el inciso sexto del artículo 13 de la Ley 130 de 1994 establece: "…Los partidos y movimientos que concurran a las elecciones formando coaliciones determinarán previamente la forma de distribución de la reposición de gastos de campaña entre ellos…".\n\n';
    t+='Que el parágrafo 1º del artículo 29 de la Ley 1475 de 2011 establece: "…Antes de la inscripción del candidato, la coalición debe haber determinado los siguientes aspectos; mecanismo mediante el cual se realizará la designación del candidato; el programa que va a presentar el candidato; la forma de distribución de la financiación Estatal y de los gastos de la campaña entre los miembros de la coalición, incluyendo las pólizas y demás garantías a que haya lugar, y la filiación política del candidato para efectos de su ingreso al Congreso…".\n\n';
    t+='Que el Acuerdo de Coalición suscrito el día [día] de [mes] de [año] entre el '+ctx.coalIntegrantes+', presentado ante la Organización Electoral, se dispuso lo siguiente:\n\n';
    t+='"[CLÁUSULA: Transcribir tal cual aparece en el acuerdo de coalición]"\n\n';
    t+='Que, en virtud de lo anterior, la citada campaña de coalición cumplió con los presupuestos normativos para acceder a la reposición de gastos de campaña.\n\n';
  }

  // ══════════════════════════════════════════════════════════════════
  //  CANDIDATOS QUE NO PRESENTARON — TABLA
  // ══════════════════════════════════════════════════════════════════
  if(tieneNoPres){
    t+='CANDIDATOS QUE NO PRESENTARON INFORME\n';
    t+='(Anteriormente Renuentes por No Presentación)\n\n';
    t+='Que mediante Certificación de fecha [día] de [mes] de [año], allegada por el '+partido+', suscrita por el Representante Legal, manifestó que el/los siguiente(s) candidato(s) inscrito(s) para el cargo de '+corpUp+' del '+geoTxt+' dentro del periodo establecido en la ley, no presentó(aron) el informe individual de ingresos y gastos de campaña ante la organización política. En virtud de lo anterior, se procederá a descontar los votos de el(los) precitado(s) candidato(s) del total de votos obtenidos por la lista:\n\n';
    t+='No.  | CÉDULA           | NOMBRE DEL CANDIDATO                | VOTOS\n';
    t+='──── | ──────────────── | ─────────────────────────────────── | ──────\n';
    ctx.noPresentaron.forEach(function(cx,i){
      t+=_padR(''+(i+1)+'.',5)+'| '+_padR(cx.id,17)+'| '+_padR(cx.nombre,36)+'| '+fmtNum(cx.votos||0)+'\n';
    });
    t+='     | TOTAL VOTOS A DESCONTAR                               | '+fmtNum(votosDescNoPres)+'\n\n';
  }

  // ══════════════════════════════════════════════════════════════════
  //  CANDIDATOS QUE NO PRESENTARON EN DEBIDA FORMA — TABLA
  // ══════════════════════════════════════════════════════════════════
  if(tieneNoForma){
    t+='CANDIDATOS QUE NO PRESENTARON EN DEBIDA FORMA EL INFORME\n';
    t+='(Anteriormente Renuentes por No Corrección)\n\n';
    t+='Que mediante Certificación de fecha [día] de [mes] de [año], allegada por el '+partido+', suscrita por el Representante Legal, manifestó que el/los siguiente(s) candidato(s) inscrito(s) para el cargo de '+corpUp+' del '+geoTxt+', no presentó(aron) en debida forma el informe de ingresos y gastos de campaña ante la organización política:\n\n';
    t+='No.  | CÉDULA           | NOMBRE DEL CANDIDATO                | VOTOS  | GASTOS REPORTADOS\n';
    t+='──── | ──────────────── | ─────────────────────────────────── | ────── | ─────────────────\n';
    var totalVotosNF=0, totalGastosNF=0;
    ctx.noDebidaForma.forEach(function(cx,i){
      var gx=_cxGas(cx);
      totalVotosNF+=(cx.votos||0); totalGastosNF+=gx;
      t+=_padR(''+(i+1)+'.',5)+'| '+_padR(cx.id,17)+'| '+_padR(cx.nombre,36)+'| '+_padR(fmtNum(cx.votos||0),7)+'| '+fmtCOP(gx)+'\n';
    });
    t+='     | TOTAL VOTOS Y GASTOS A DESCONTAR                      | '+_padR(fmtNum(totalVotosNF),7)+'| '+fmtCOP(totalGastosNF)+'\n\n';

    // Dictamen abstención por no debida forma
    t+='Que en relación con los candidatos que no presentaron en debida forma su Informe de Campaña, y teniendo en cuenta que estos reportaron gastos, dentro del formulario 9B y anexo 9.2B se mantienen, sin embargo, en el momento de liquidar la reposición de los gastos de la campaña, se procederá a descontar los votos del total de votos de la lista.\n\n';
  }

  // ── Dictamen abstención conjunto ──
  if(tieneNoPres||tieneNoForma){
    t+='Que, la Auditoría Interna del '+partido+', adjunta dictamen de fecha [día] de [mes] de [año] con abstención, emitido por el/la Contador(a) Público(a) [NOMBRE AUDITOR INTERNO], con Tarjeta Profesional No. [T.P. AUDITOR], los candidatos referidos, para los fines y efectos legales contenidos en la Resolución No. 4737 de 2023.\n\n';
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRESUNTA VULNERACIÓN ART. 25
  // ══════════════════════════════════════════════════════════════════
  if(tieneArt25){
    t+='PRESUNTA VULNERACIÓN ART. 25 – Gerente, Apertura y Manejo de cuenta\n\n';
    t+='Que respecto de los siguientes candidatos se evidenció la presunta vulneración del Artículo 25 de la Ley 1475 de 2011, la cual fue debidamente reportada al Jefe de Oficina del Fondo Nacional de Financiación de Partidos y Campañas Electorales, en los términos establecidos en el numeral 4 del artículo 12 de la Resolución No. 4737 de 2023:\n\n';
    t+='No.  | CÉDULA           | NOMBRE DEL CANDIDATO\n';
    t+='──── | ──────────────── | ───────────────────────────────────\n';
    ctx.art25Cands.forEach(function(cx,i){
      t+=_padR(''+(i+1)+'.',5)+'| '+_padR(cx.id,17)+'| '+cx.nombre+'\n';
    });
    t+='\nQue no obstante lo anterior, los votos y gastos del(los) precitado(s) candidato(s) serán tenidos en cuenta para efectos de la liquidación del derecho de reposición de gastos de campaña electoral en virtud de lo establecido en el parágrafo del artículo 25 de la Ley 1475 de 2011.\n\n';
  }

  // ══════════════════════════════════════════════════════════════════
  //  TRANSFERENCIAS ORGANIZACIONES POLÍTICAS
  // ══════════════════════════════════════════════════════════════════
  // (Se incluye como placeholder — se completa manualmente)
  // t+='CUANDO EXISTEN TRANSFERENCIAS DE LAS ORGANIZACIONES POLÍTICAS\n\n';

  // ══════════════════════════════════════════════════════════════════
  //  GASTOS SIN RELACIÓN DE CAUSALIDAD (placeholder)
  // ══════════════════════════════════════════════════════════════════
  // Nota: Art.34, gastos sin causalidad y no soportados requieren datos manuales
  // Se dejan como secciones editables si aplican

  // ══════════════════════════════════════════════════════════════════
  //  PRESUNTA VULNERACIÓN ART. 34 (placeholder si aplica)
  // ══════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════
  //  CANDIDATOS REVOCADOS — TABLA
  // ══════════════════════════════════════════════════════════════════
  if(tieneRevocados){
    t+='CANDIDATOS REVOCADOS (INHABILITADOS)\n\n';
    t+='Que según Resolución No. [XXXXX] de [día] de [mes] de [año] emitida por el CONSEJO NACIONAL ELECTORAL, hace constar que al siguiente candidato le fue REVOCADA la inscripción de su candidatura, por encontrarse incurso en inhabilidad o incompatibilidad para el cargo. Sin perjuicio de lo anterior, si reportaron gastos y obtuvieron votos, estos se mantendrán en el formulario 9B, sin embargo, en el momento de liquidar la reposición se procederá al descuento de sus votos y sus gastos:\n\n';
    t+='No.  | CÉDULA           | NOMBRE DEL CANDIDATO                | VOTOS  | GASTOS REPORTADOS\n';
    t+='──── | ──────────────── | ─────────────────────────────────── | ────── | ─────────────────\n';
    var totalVotosR=0, totalGastosR=0;
    ctx.revocados.forEach(function(cx,i){
      var gx=_cxGas(cx);
      totalVotosR+=(cx.votos||0); totalGastosR+=gx;
      t+=_padR(''+(i+1)+'.',5)+'| '+_padR(cx.id,17)+'| '+_padR(cx.nombre,36)+'| '+_padR(fmtNum(cx.votos||0),7)+'| '+fmtCOP(gx)+'\n';
    });
    t+='     | TOTAL VOTOS Y GASTOS A DESCONTAR                      | '+_padR(fmtNum(totalVotosR),7)+'| '+fmtCOP(totalGastosR)+'\n\n';

    t+='Que en relación con los candidatos que fueron revocados, obtuvieron votos y que reportaron gastos de campaña, dentro del formulario 9B y anexo 9.2B se mantienen, sin embargo, en el momento de liquidar la reposición de los gastos de la campaña, se procederá a descontar los votos y los gastos del total de la lista.\n\n';
  }

  // ══════════════════════════════════════════════════════════════════
  //  DESCUENTO DE VOTOS POR NOVEDADES
  // ══════════════════════════════════════════════════════════════════
  if(hayDescuento){
    var motivosDesc=[];
    if(tieneNoPres) motivosDesc.push('candidatos que no presentaron');
    if(tieneNoForma) motivosDesc.push('que no presentaron en debida forma');
    if(tieneRevocados) motivosDesc.push('fue revocada la inscripción');
    t+='Que por lo anterior se descontará del total de los votos obtenidos por la lista, el equivalente a '+_numPalabras(votosDesc)+' ('+fmtNum(votosDesc)+') votos que corresponden a: '+motivosDesc.join(', ')+', de la siguiente manera:\n\n';
    t+='  Votos válidos obtenidos:  '+fmtNum(ctx.totalVotos)+'\n';
    if(votosDescNoPres>0) t+='  (-) No presentaron:       '+fmtNum(votosDescNoPres)+'\n';
    if(votosDescRevoc>0)  t+='  (-) Revocados:            '+fmtNum(votosDescRevoc)+'\n';
    t+='  Votos netos:              '+fmtNum(votosNetos)+'\n\n';
  }

  // ── Art. 20 Res. 4737 ──
  t+='Que el inciso tercero del artículo 20 de la Resolución 4737 del 2023, proferida por el Consejo Nacional Electoral establece "…en todo caso, la reposición no podrá ser superior a lo efectivamente gastado por el partido, movimiento político, grupo significativo de ciudadanos o candidatos, según sea el caso.".\n\n';

  // ══════════════════════════════════════════════════════════════════
  //  LIQUIDACIÓN
  // ══════════════════════════════════════════════════════════════════
  if(!sinDerecho){
    t+='LIQUIDACIÓN SIN ANTICIPO\n\n';
    t+='Que se procedió a realizar la comparación de los gastos netos reportados por la campaña con el resultado de multiplicar el valor de reposición por voto establecido para esta elección, por el número de votos válidos obtenidos.\n\n';

    t+='LIQUIDACIÓN\n';
    t+='VALOR BRUTO A RECONOCER\n';
    t+='─────────────────────────────────────────────────────────────────\n';
    t+='                    POR GASTOS              |  POR VOTOS\n';
    t+='─────────────────────────────────────────────────────────────────\n';
    t+='GASTOS NETOS        VALOR DEL VOTO    No. DE VOTOS    VALOR BRUTO\n';
    t+='REPORTADOS                                            POR '+(esPorGastos?'GASTOS':'VOTOS')+'\n';
    t+=fmtCOP(gastosNetos)+'       '+fmtCOP(ctx.valorVoto)+'       '+fmtNum(votosNetos)+'         '+fmtCOP(valorBruto)+'\n';
    t+='─────────────────────────────────────────────────────────────────\n\n';

    t+='CIFRAS A PAGAR SIN ANTICIPO\n\n';
    t+='Que teniendo en cuenta que los gastos netos reportados por la campaña son '+(esPorGastos?'INFERIORES':'SUPERIORES')+' al valor resultante de los votos liquidados, se procede a reconocer el derecho a la reposición POR '+(esPorGastos?'GASTOS':'VOTOS')+' por un valor de '+fmtCOP(valorBruto)+' ('+_numPalabras(valorBruto)+' PESOS MONEDA CORRIENTE).\n\n';

    // ── Coalición distribución ──
    if(ctx.isCoalicion&&ctx.coal){
      t+='Valor que será girado de conformidad con lo dispuesto en el Acuerdo previo de Coalición celebrado entre los partidos políticos Coaligados, es decir:\n\n';
      t+='No.  | NOMBRE DEL PARTIDO                        | %     | VALOR\n';
      t+='──── | ───────────────────────────────────────── | ───── | ──────────────\n';
      if(ctx.coal.distribucion&&ctx.coal.distribucion.length){
        var totalPct=0;
        ctx.coal.distribucion.forEach(function(d,i){
          var pct=d.porcentaje||0;
          totalPct+=pct;
          t+=_padR(''+(i+1)+'.',5)+'| '+_padR(d.partido||'',42)+'| '+_padR(pct+'%',6)+'| '+fmtCOP(Math.round(valorBruto*pct/100))+'\n';
        });
        t+='     | TOTAL                                     | '+_padR(totalPct+'%',6)+'| '+fmtCOP(valorBruto)+'\n\n';
      } else {
        t+='     | [Completar distribución según acuerdo]\n\n';
      }
    }
  } else {
    t+='PARA EL CASO DE LOS INFORMES SIN DERECHO NO APLICA LA LIQUIDACIÓN.\n\n';
  }

  // ══════════════════════════════════════════════════════════════════
  //  FIRMA DEL CONTADOR
  // ══════════════════════════════════════════════════════════════════
  t+='Que '+elLa+' '+suscritoA+' Profesional de la Contaduría Pública, encargado(a) de la revisión de los informes presentados y de la verificación del cumplimiento de los requisitos para acceder a la financiación estatal, certifica que la campaña a la que se refiere el presente documento cumple con los requisitos de ley para obtener la financiación estatal de las campañas.\n\n';

  t+='Que la presente certificación corresponde a la '+certTipo+' liquidación de la campaña en mención y queda sometida a la auditoría externa de que trata el inciso segundo del artículo 49 de la Ley 130 de 1994.\n\n';

  t+='___________________________________________\n';
  t+=audNom+'\n';
  t+='T.P. No. '+audTPv+'\n\n';

  t+=''+((esFem?'La Doctora ':'El Doctor ')+audNom)+' exhibió la tarjeta profesional No. '+audTPv+' expedida por la Junta Central de Contadores que '+loLa+' acredita como '+contadorA+'(a) Público(a), documento que según la información reportada por dicha entidad se encuentra vigente y sin antecedentes disciplinarios.\n\n';

  t+='El presente documento se expide a día ('+dia+') de '+mes+' de '+ano+', como evento preparatorio del acto administrativo que habrá de producir el Consejo Nacional Electoral en caso de reconocerse el derecho a gastos de la campaña. Los datos aquí consignados se sustentan en la información aportada por la organización política y en la documentación aportada por la Registraduría Nacional del Estado Civil.\n\n';

  t+='___________________________________________\n';
  t+=jefe+'\n';
  t+='Jefe de Oficina\n';
  t+='Fondo Nacional de Financiación de Partidos y Campañas Electorales\n\n';

  t+='Proyectó: '+audNom+'\n';
  t+='Revisó: \n';

  var resEl=document.getElementById(uid+'_resumen');
  if(resEl) resEl.innerText=t;
}

// ── Helper: pad right ──
function _padR(s,len){s=String(s||'');while(s.length<len)s+=' ';return s;}

// ── JEFE DE OFICINA: dropdown persistente en localStorage ──
var _JEFES_DEFAULT=['ANDREA DEL PILAR LOPERA PRADA'];
function _getJefes(){
  var jefes=_JEFES_DEFAULT;
  try{
    var s=localStorage.getItem('cne_jefes_oficina');
    if(s){ var arr=JSON.parse(s); if(Array.isArray(arr)&&arr.length) jefes=arr; }
  }catch(e){}
  return jefes;
}
function _opcionesJefeOficina(){
  var jefes=_getJefes();
  return jefes.map(function(j){ return '<option value="'+esc(j)+'">'+esc(j)+'</option>'; }).join('');
}
function agregarJefeOficina(uid){
  var nombre=prompt('Nombre del nuevo Jefe de Oficina:');
  if(!nombre||!nombre.trim()) return;
  nombre=nombre.trim().toUpperCase();
  var jefes=_getJefes();
  if(jefes.indexOf(nombre)===-1) jefes.push(nombre);
  try{localStorage.setItem('cne_jefes_oficina',JSON.stringify(jefes));}catch(e){}
  var sel=document.getElementById(uid+'_jefe_oficina');
  if(sel){ sel.innerHTML=_opcionesJefeOficina(); sel.value=nombre; }
  actualizarResumenCert(uid);
}

