// ═══ Login CNE - Cuentas Claras ═══
function _cneCheckSesion(){
  var overlay=document.getElementById('cneLoginOverlay');
  if(overlay) overlay.style.display='flex';
  // Solo permitir "Continuar" si ESTE navegador hizo login (localStorage)
  var localSes=null;
  try{localSes=JSON.parse(localStorage.getItem('cne_portal_session')||'null');}catch(e){}
  var localOk=localSes && localSes.usuario && (Date.now()-localSes.ts)<3600000; // 1 hora max
  fetch('/api/cne_status').then(r=>r.json()).then(function(d){
    var msg=document.getElementById('cneLoginOverlayMsg');
    if(d.sesion_activa && localOk && msg){
      // Este navegador ya hizo login Y la sesión del servidor está activa
      msg.style.display='block';
      msg.className='alert alert-success py-2 small mb-2 text-center';
      msg.innerHTML='<i class="fa fa-check-circle me-1"></i>Sesión activa — <strong>'+localSes.usuario+'</strong> ('+Math.round(d.edad_min)+' min)<br>'+
        '<button class="btn btn-success btn-sm mt-2" onclick="document.getElementById(\'cneLoginOverlay\').style.display=\'none\'">'+
        '<i class="fa fa-arrow-right me-1"></i>Continuar</button>';
      // Auto-fill usuario
      var uInp=document.getElementById('cneLoginUser');
      if(uInp&&!uInp.value) uInp.value=localSes.usuario;
    } else if(d.sesion_activa && msg){
      // Servidor tiene sesión pero ESTE navegador no ha autenticado
      msg.style.display='block';
      msg.className='alert alert-info py-2 small mb-2 text-center';
      msg.innerHTML='<i class="fa fa-lock me-1"></i>Ingrese sus credenciales para acceder al portal.';
    }
  }).catch(function(){});
}
function _cneLoginManual(){
  var user=document.getElementById('cneLoginUser').value.trim();
  var pass=document.getElementById('cneLoginPass').value.trim();
  var msg=document.getElementById('cneLoginOverlayMsg');
  var btn=document.getElementById('cneLoginBtn');
  if(!user||!pass){
    msg.style.display='block';
    msg.className='alert alert-danger py-1 small mb-2';
    msg.innerHTML='<i class="fa fa-exclamation-triangle me-1"></i>Ingrese usuario y contraseña';
    return;
  }
  btn.disabled=true;
  btn.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Conectando con CNE...';
  msg.style.display='block';
  msg.className='alert alert-info py-1 small mb-2';
  msg.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Iniciando sesión en CNE-Cuentas Claras... (puede tardar ~15 segundos)';
  fetch('/api/cne_login_manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:user,password:pass})})
  .then(r=>r.json()).then(function(d){
    btn.disabled=false;
    btn.innerHTML='<i class="fa fa-sign-in-alt me-1"></i>Iniciar Sesión';
    if(d.ok){
      // Guardar sesión local en este navegador
      try{localStorage.setItem('cne_portal_session',JSON.stringify({usuario:user,ts:Date.now()}));}catch(e){}
      msg.className='alert alert-success py-1 small mb-2';
      // Si busqueda.json está vacío, ofrecer construir el índice
      fetch('data/busqueda.json').then(function(r){return r.json();}).then(function(b){
        var vacio=!b||!Object.keys(b).length;
        msg.innerHTML='<i class="fa fa-check-circle me-1"></i>'+d.mensaje+
          (vacio?'<div class="mt-2"><button class="btn btn-warning btn-sm" onclick="_cneIniciarIndice(this)">'+
          '<i class="fa fa-download me-1"></i>Descargar datos de candidatos (necesario 1ª vez)</button></div>':'');
        if(!vacio) setTimeout(function(){document.getElementById('cneLoginOverlay').style.display='none';},1000);
      }).catch(function(){
        msg.innerHTML='<i class="fa fa-check-circle me-1"></i>'+d.mensaje;
        setTimeout(function(){document.getElementById('cneLoginOverlay').style.display='none';},1000);
      });
    } else {
      msg.className='alert alert-danger py-1 small mb-2';
      var detalle=d.detalle?' <div class="mt-1" style="font-size:.75rem;opacity:.8">'+d.detalle+'</div>':'';
      msg.innerHTML='<i class="fa fa-times-circle me-1"></i>'+d.mensaje+detalle;
    }
  }).catch(function(e){
    btn.disabled=false;
    btn.innerHTML='<i class="fa fa-sign-in-alt me-1"></i>Iniciar Sesión';
    msg.className='alert alert-danger py-1 small mb-2';
    msg.innerHTML='<i class="fa fa-times-circle me-1"></i>Error de conexión: '+e;
  });
}
function _cneIniciarIndice(btn){
  btn.disabled=true;
  btn.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Iniciando descarga…';
  fetch('/api/construir_indice',{method:'POST'}).then(function(r){return r.json();}).then(function(d){
    if(d.ok){
      btn.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>Descargando candidatos… (5-10 min)';
      _cneMonitorIndice(btn);
    } else {
      btn.disabled=false;
      btn.innerHTML='<i class="fa fa-exclamation-triangle me-1"></i>'+d.msg;
    }
  });
}
function _cneMonitorIndice(btn){
  var iv=setInterval(function(){
    fetch('/api/indice_status').then(function(r){return r.json();}).then(function(s){
      if(s.fase==='listo'){
        clearInterval(iv);
        btn.className='btn btn-success btn-sm';
        btn.innerHTML='<i class="fa fa-check me-1"></i>'+s.msg;
        setTimeout(function(){
          document.getElementById('cneLoginOverlay').style.display='none';
          location.reload();
        },2000);
      } else if(s.fase==='error'){
        clearInterval(iv);
        btn.disabled=false; btn.className='btn btn-danger btn-sm';
        btn.innerHTML='<i class="fa fa-times me-1"></i>Error: '+s.error;
      } else {
        btn.innerHTML='<i class="fa fa-spinner fa-spin me-1"></i>'+s.msg+' ('+s.pct+'%)';
      }
    });
  },3000);
}
function _cneRequireLogin(){
  // Borrar sesión local
  try{localStorage.removeItem('cne_portal_session');}catch(e){}
  var overlay=document.getElementById('cneLoginOverlay');
  if(overlay) overlay.style.display='flex';
  var msg=document.getElementById('cneLoginOverlayMsg');
  if(msg){
    msg.style.display='block';
    msg.className='alert alert-warning py-1 small mb-2';
    msg.innerHTML='<i class="fa fa-exclamation-triangle me-1"></i>Sesión cerrada. Inicie sesión nuevamente.';
  }
  document.getElementById('cneLoginPass').value='';
}
