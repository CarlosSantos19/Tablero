// ─── ESTADO GLOBAL ────────────────────────────────────────────────────────
// CANDIDATOS: carga lazy por municipio (slim index, keyed by id)
// CAND_DETALLE: detalle completo por cédula (cache)
var CANDIDATOS={}, BUSQUEDA={}, STATS={}, CAND_SELEC=null, TX_CACHE={},
    dtTodos=null, JCC_RESULTADOS={}, CAND_DETALLE={}, SAI_INDEX={}, ANALISIS={}, CERT_IDX={},
    _MUN_CARGADA=null, IG_INDEX=null, DICT_INDEX=null, AUDITOR_DB=null, DICT_ANALISIS=null, COALICION_META=null, COAL_ACUERDOS_INDEX=null, _pendingCoalKey=null, CONSOLIDADO44_INDEX=null, CONSOLIDADO100_INDEX=null, ANI_INDEX=null, PARTIDOS_DB=null, VISOR_INDEX=null, VISOR_MAPEO=null, VOTOS_PARTIDO=null, VISOR_DOCS_SLIM=null, INSCRIPCIONES_INDEX=null, FECHA_INSC_CARGUE=null, NOVEDADES_LIBRO=null, R8B_INDEX=null, R9B_INDEX=null, IG_DOCS_INDEX=null, CERT_UMBRALES=null, CERT_VOTOS_CAND=null, CONTADOR_CAMP_IDX=null, ESTADO_CAND=null; // "CORP||MUN" actualmente cargado

// Valor del voto por corporación (Resolución CNE 2023)
var VALOR_DEL_VOTO={GOBERNACION:4590,ASAMBLEA:4590,CONCEJO:2766,ALCALDIA:2766};

// Sobreescribir votos de candidatos con datos del certificado electoral (OCR)
// CERT_VOTOS_CAND: { CORP: { DPTO: { MUN: { PARTIDO: [{cc, nombre, votos}, ...] } } } }
function _aplicarVotosCert(){
  if(!CERT_VOTOS_CAND||!Object.keys(CERT_VOTOS_CAND).length) return;
  var corpVal=document.getElementById('selCorp').value||'';
  var dptoVal=norm(document.getElementById('selDpto').value||'');
  var munVal=norm(document.getElementById('selMun').value||'');
  var cn=norm(corpVal);
  var corpKey=cn.indexOf('ALCALD')!==-1?'ALCALDIA':
              cn.indexOf('CONCEJ')!==-1?'CONCEJO':
              cn.indexOf('ASAMBLEA')!==-1||cn.indexOf('DIPUTA')!==-1?'ASAMBLEA':
              cn.indexOf('JAL')!==-1||cn.indexOf('JUNTA')!==-1?'JAL':'GOBERNACION';
  var corpData=CERT_VOTOS_CAND[corpKey];
  if(!corpData) return;
  var dptoData=corpData[dptoVal];
  if(!dptoData) return;
  var munData=dptoData[munVal];
  if(!munData) return;
  // Build lookup: cedula → votos from all partidos
  var ccMap={};
  for(var p in munData){
    var cands=munData[p];
    for(var i=0;i<cands.length;i++){
      var cv=cands[i];
      if(cv.cc&&cv.cc!=='_LISTA'&&cv.cc!=='_TOTAL'){
        ccMap[cv.cc]={votos:cv.votos, nombre:cv.nombre, partido:p};
      }
    }
  }
  // Override votos in CANDIDATOS
  var updated=0;
  for(var id in CANDIDATOS){
    var c=CANDIDATOS[id];
    if(ccMap[c.id]!=null){
      c.votos=ccMap[c.id].votos;
      updated++;
    }
  }
  if(updated>0) console.log('[CERT_VOTOS] Actualizados '+updated+' candidatos con votos del certificado electoral');
}

// Aplicar estado (renuncias, revocados, no_presento, extemporaneo) desde ESTADO_CAND
function _aplicarEstadoCand(){
  if(!ESTADO_CAND||!Object.keys(ESTADO_CAND).length) return;
  var ren={}; (ESTADO_CAND.renuncias||[]).forEach(function(c){ren[c]=true;});
  var rev={}; (ESTADO_CAND.revocados||[]).forEach(function(c){rev[c]=true;});
  var nop={}; (ESTADO_CAND.no_presento||[]).forEach(function(c){nop[c]=true;});
  var ext={}; (ESTADO_CAND.extemporaneo||[]).forEach(function(c){ext[c]=true;});
  var updated=0;
  for(var id in CANDIDATOS){
    var c=CANDIDATOS[id];
    var changed=false;
    if(ren[c.id]){c.renuncio=true;changed=true;}
    if(rev[c.id]){c.revocado=true;changed=true;}
    if(nop[c.id]){c.no_presento=true;changed=true;}
    if(ext[c.id]){c.extemporaneo=true;changed=true;}
    if(changed) updated++;
  }
  if(updated>0) console.log('[ESTADO_CAND] Actualizados '+updated+' candidatos con estado (renuncias/revocados/no_presento/extemporaneo)');
}

