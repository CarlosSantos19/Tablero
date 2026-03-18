// ─── CARGA INICIAL ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',function(){
  // Detectar si está en file:// (no funciona fetch en file://)
  if(location.protocol==='file:'){
    document.getElementById('tbodyResultados').innerHTML=
      '<tr><td colspan="8"><div class="alert alert-danger m-3">'+
      '<h5><i class="fa fa-exclamation-triangle me-2"></i>El portal NO puede abrirse directamente con doble clic</h5>'+
      '<p class="mb-2">Los navegadores bloquean la carga de datos por seguridad cuando se abre con <code>file://</code>.</p>'+
      '<p class="mb-1"><strong>Solución:</strong></p>'+
      '<ol><li>Cierre esta pestaña.</li>'+
      '<li>Abra la carpeta <code>portal/</code> en el Explorador de archivos.</li>'+
      '<li>Haga doble clic en <code>INICIAR_PORTAL.bat</code>.</li>'+
      '<li>Cuando aparezca la ventana negra, abra su navegador en <a href="http://localhost:8081">http://localhost:8081</a></li></ol>'+
      '</div></td></tr>';
    return;
  }
  Promise.all([
    fetch('data/busqueda.json').then(function(r){if(!r.ok)throw new Error(r.status); return r.json();}).catch(function(){return {};}),
    fetch('data/stats.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/jcc_resultados.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/sai_index.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/analisis_previo.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/certificados.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/ani_index.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/votos_partido.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/cert_umbrales.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/cert_votos_candidatos.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/estado_candidatos.json').then(function(r){return r.json();}).catch(function(){return {};}),
    fetch('data/cc_procesos.json').then(function(r){return r.json();}).catch(function(){return [];})
  ]).then(function(results){
    BUSQUEDA=results[0]; STATS=results[1]; JCC_RESULTADOS=results[2]||{}; SAI_INDEX=results[3]||{}; ANALISIS=results[4]||{}; CERT_IDX=results[5]||{}; ANI_INDEX=results[6]||{}; VOTOS_PARTIDO=results[7]||{}; CERT_UMBRALES=results[8]||{}; CERT_VOTOS_CAND=results[9]||{}; ESTADO_CAND=results[10]||{};
    window._CC_PROCESOS=results[11]||[];
    _poblarProcesos();
    _restaurarVotosManuales();
    if(!Object.keys(BUSQUEDA).length){
      document.getElementById('tbodyResultados').innerHTML=
        '<tr><td colspan="8"><div class="alert alert-warning m-3">'+
        '<i class="fa fa-exclamation-circle me-2"></i>No se encontró el índice de búsqueda. '+
        'Verifique que <code>data/busqueda.json</code> existe y que el servidor HTTP está funcionando.'+
        '</div></td></tr>';
      return;
    }
    cargarStats(); poblarCorps();
    _cneCheckSesion();
  }).catch(function(err){
    document.getElementById('tbodyResultados').innerHTML=
      '<tr><td colspan="8"><div class="alert alert-danger m-3">Error cargando datos: '+err.message+'</div></td></tr>';
  });
});

function cargarStats(){
  var el=document.getElementById('resumenStats');
  el.innerHTML=fmtNum(STATS.total_candidatos||0)+' candidatos  |  '+
    'Art.23: <span class="text-danger fw-bold">'+fmtNum(STATS.total_art23||0)+'</span>  |  '+
    'Art.27: <span class="text-danger fw-bold">'+fmtNum(STATS.total_art27||0)+'</span>  |  '+
    'Art.34: <span class="text-danger fw-bold">'+fmtNum(STATS.total_art34||0)+'</span>  |  '+
    fmtNum(STATS.total_no_presentaron||0)+' no presentaron  |  '+
    fmtNum(STATS.total_extemporaneos||0)+' extemporáneos  |  '+
    fmtNum(STATS.total_revocados||0)+' revocados';
}

