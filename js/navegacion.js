// ─── NAVEGACIÓN ───────────────────────────────────────────────────────────
function _findCoalicion(c){
  if(!COALICION_META||!COALICION_META.length||!c) return null;
  var pN=_alphaKey(c.partido);
  // Si está en PARTIDOS_DB es partido, NO coalición
  if(PARTIDOS_DB){
    var pU=(c.partido||'').toUpperCase().trim();
    if(PARTIDOS_DB[pU]) return null;
  }
  // Solo match exacto: el nombre en BUSQUEDA ES el nombre de la coalición si aplica
  for(var i=0;i<COALICION_META.length;i++){
    var e=COALICION_META[i]; if(_alphaKey(e.nombre_coalicion||'')===pN) return e;
  }
  return null;
}
function _candBannerHtml(){
  if(!CAND_SELEC) return '';
  var h='<span class="badge bg-dark me-1"><i class="fa fa-user me-1"></i>'+esc(CAND_SELEC.nombre)+'</span>'+
    '<span class="badge bg-primary me-1">CC: '+esc(CAND_SELEC.id)+'</span>'+
    '<span class="badge bg-secondary">'+esc(CAND_SELEC.cargo||'')+'</span>';
  var coal=_findCoalicion(CAND_SELEC);
  if(coal) h+=' <span class="badge bg-warning text-dark"><i class="fa fa-handshake me-1"></i>COALICIÓN: '+esc(coal.nombre_coalicion)+'</span>';
  return h;
}

var _irPasoAutoSelecting=false;
var _PASO_ACTUAL=1;
function irPaso(n){
  _PASO_ACTUAL=n;
  // Auto-seleccionar primer candidato si hay resultados pero no hay selección
  if(n>=2 && n<=11 && !CAND_SELEC && !_irPasoAutoSelecting && CANDIDATOS && Object.keys(CANDIDATOS).length>0){
    _irPasoAutoSelecting=true;
    var primerCid=Object.keys(CANDIDATOS)[0];
    var _targetPaso=n;
    seleccionarCandidato(primerCid);
    // Esperar a que CAND_SELEC se cargue y luego ir al paso pedido
    var _waitInt=setInterval(function(){
      if(CAND_SELEC){
        clearInterval(_waitInt);
        _irPasoAutoSelecting=false;
        if(_targetPaso!==2) irPaso(_targetPaso);
      }
    }, 200);
    return;
  }
  document.querySelectorAll('.seccion').forEach(function(s){s.classList.remove('activa');});
  document.querySelectorAll('.paso').forEach(function(s){s.classList.remove('activo');});
  document.getElementById('sec'+n).classList.add('activa');
  // sec6 es sub-vista de paso 5 (no tiene step propio en sidebar)
  var stepN=(n===6)?5:n;
  var el=document.getElementById('step'+stepN);
  if(el) el.classList.add('activo');
  // Nombre del candidato en banners
  var banners=['sec6CandBanner']; // sec7 es nivel partido, no candidato
  banners.forEach(function(id){
    var b=document.getElementById(id);
    if(b){ if(CAND_SELEC){b.innerHTML=_candBannerHtml();b.style.display='block';}else{b.style.display='none';} }
  });
  if(n===2){ _renderFiltroBar('filtroBarP2'); _renderDictBrowse(); var _pd=document.getElementById('panelDictamen'); if(_pd) _pd.innerHTML=''; }
  if(n===3){ _renderFiltroBar('filtroBarP3'); if(CAND_SELEC) render9BAnexos(); }
  if(n===4){ _renderFiltroBar('filtroBarP4'); if(CAND_SELEC){ renderGlobalP3(); renderPaso3(); renderPaso2(); } }
  if(n===5){ _renderFiltroBar('filtroBarP5'); renderCandidatosLista(); }
  if(n===6 && CAND_SELEC){ renderPaso5(); renderPaso6(); _renderAccionesCand(); }
  if(n===7 && CAND_SELEC) renderPaso7();
  if(n===8 && CAND_SELEC) renderPaso8();
  if(n===9) renderInvestigaciones();
  if(n===10 && CAND_SELEC) renderCertificado();
  if(n===11 && CAND_SELEC) renderLiquidacion();
  if(n===12) poblarTodos();
  if(n===13) _ccInit();
  window.scrollTo(0,0);
}

