/** Validar fecha DD/MM/YYYY — retorna '' si inválida */
function _validarFecha(s){
  if(!s) return '';
  var p=String(s).split('/');
  if(p.length!==3) return '';
  var d=parseInt(p[0],10), m=parseInt(p[1],10), y=parseInt(p[2],10);
  if(isNaN(d)||isNaN(m)||isNaN(y)||d<1||d>31||m<1||m>12||y<2020||y>2030) return '';
  return s;
}

/** _matchPartidoVP — busca partido en un bucket cData, retorna votos o 0 */
function _matchPartidoVP(cData, partido){
  if(!partido) return 0;
  for(var pk in cData){ if(norm(pk)===partido) return cData[pk]; }
  for(var pk in cData){ var npk=norm(pk); if(npk.indexOf(partido)!==-1||partido.indexOf(npk)!==-1) return cData[pk]; }
  var pWords=partido.split(/\s+/).filter(function(w){return w.length>3;});
  if(pWords.length>=2){
    for(var pk in cData){ var npk=norm(pk); var m=0; for(var i=0;i<pWords.length;i++){if(npk.indexOf(pWords[i])!==-1)m++;} if(m>=2) return cData[pk]; }
  }
  return 0;
}

/**
 * _buscarVotosPartido(dpto, mun, cargo, partido) — Busca votos de partido en VOTOS_PARTIDO
 * dpto/mun: normalized names, cargo: ALCALDIA/CONCEJO/etc, partido: normalized partido name
 * Returns total votos for the partido in that dpto/mun/corp, or 0 if not found
 */
function _buscarVotosPartido(dpto, mun, cargo, partido){
  if(!VOTOS_PARTIDO||!dpto||!cargo) return 0;
  // Votos Partido solo aplica a CONCEJO, ASAMBLEA, GOBERNACION (cuerpos colegiados / lista)
  // En ALCALDIA el voto es uninominal (por candidato), no hay "votos del partido" → 0
  if(cargo==='ALCALDIA') return 0;
  var corpCode=_VP_CORP_MAP[cargo]||cargo;
  // Usar _lookup (claves ya normalizadas) o directamente si no existe esa estructura
  var vpRoot=VOTOS_PARTIDO['_lookup']||VOTOS_PARTIDO;
  var dptoN=norm(dpto), munN=norm(mun);
  // Find department
  var dData=vpRoot[dptoN];
  if(!dData){
    for(var dk in vpRoot){ if(norm(dk)===dptoN){dData=vpRoot[dk];break;} }
  }
  if(!dData) return 0;
  // Para GOBERNACION/ASAMBLEA: sumar TODOS los municipios del departamento
  if(cargo==='GOBERNACION'||cargo==='ASAMBLEA'){
    var totalDpto=0;
    for(var mk in dData){
      var cData=dData[mk][corpCode];
      if(!cData) continue;
      if(!partido){ for(var pk in cData) totalDpto+=cData[pk]; }
      else {
        var found=_matchPartidoVP(cData, partido);
        totalDpto+=found;
      }
    }
    return totalDpto;
  }
  // Find municipality
  var mData=dData[munN];
  if(!mData){
    for(var mk in dData){ if(norm(mk)===munN){mData=dData[mk];break;} }
  }
  if(!mData) return 0;
  // Find corporation
  var cData=mData[corpCode];
  if(!cData) return 0;
  // If no partido selected, sum ALL parties (total votos corporación)
  if(!partido){
    var total=0;
    for(var pk in cData) total+=cData[pk];
    return total;
  }
  return _matchPartidoVP(cData, partido);
}

/**
 * _buscarVotosCorp(dpto, mun, cargo, partido) — Igual que _buscarVotosPartido pero SIN excluir ALCALDIA.
 * Sirve para obtener votos del partido y votos válidos generales para verificar derecho a reposición.
 * Si partido es vacío/null, retorna la suma de TODOS los partidos (votos válidos generales).
 */
function _buscarVotosCorp(dpto, mun, cargo, partido){
  if(!VOTOS_PARTIDO||!dpto||!cargo) return 0;
  var corpCode=_VP_CORP_MAP[cargo]||cargo;
  var vpRoot=VOTOS_PARTIDO['_lookup']||VOTOS_PARTIDO;
  var dptoN=norm(dpto), munN=norm(mun);
  var dData=vpRoot[dptoN];
  if(!dData){ for(var dk in vpRoot){ if(norm(dk)===dptoN){dData=vpRoot[dk];break;} } }
  if(!dData) return 0;
  // Para GOBERNACION/ASAMBLEA: sumar TODOS los municipios del departamento
  if(cargo==='GOBERNACION'||cargo==='ASAMBLEA'){
    var totalDpto=0;
    for(var mk in dData){
      var cData=dData[mk][corpCode];
      if(!cData) continue;
      if(!partido){ for(var pk in cData) totalDpto+=cData[pk]; }
      else { totalDpto+=_matchPartidoVP(cData, norm(partido)); }
    }
    return totalDpto;
  }
  var mData=dData[munN];
  if(!mData){ for(var mk in dData){ if(norm(mk)===munN){mData=dData[mk];break;} } }
  if(!mData) return 0;
  var cData=mData[corpCode];
  if(!cData) return 0;
  if(!partido){
    var total=0; for(var pk in cData) total+=cData[pk]; return total;
  }
  return _matchPartidoVP(cData, norm(partido));
}

/**
 * _verificarDerechoReposicion(dpto, mun, cargo, partido) — Verifica si el partido tiene
 * derecho a reposición de gastos según votos obtenidos vs umbral.
 * ALCALDIA/GOBERNACION: votos_partido >= votos_validos_gral * 4%
 * CONCEJO/ASAMBLEA/JAL: votos_partido >= votos_validos_gral * 50%
 */
function _verificarDerechoReposicion(dpto, mun, cargo, partido){
  var votosPartido=_buscarVotosCorp(dpto, mun, cargo, partido);
  var votosValidos=_buscarVotosCorp(dpto, mun, cargo, '');
  var esUninominal=(cargo==='ALCALDIA'||cargo==='GOBERNACION');
  var pct=esUninominal?0.04:0.50;
  var umbral=Math.ceil(votosValidos*pct);
  var tiene=votosPartido>=umbral && votosValidos>0;
  return {tiene:tiene, votosPartido:votosPartido, votosValidos:votosValidos, pct:pct, umbral:umbral};
}

/**
 * _renderDerechoReposicion(dpto, mun, cargo, partido) — Muestra el resultado en el panel.
 */
function _renderDerechoReposicion(dpto, mun, cargo, partido){
  var wrap=document.getElementById('resDerechoWrap');
  if(!wrap) return;
  if(!partido||!dpto||!mun||!cargo){wrap.style.display='none';return;}
  var r=_verificarDerechoReposicion(dpto, mun, cargo, partido);
  if(r.votosValidos===0){wrap.style.display='none';return;}
  document.getElementById('resDerVotosPartido').textContent=fmtNum(r.votosPartido);
  var _elVV=document.getElementById('resDerVotosValidos'); if(_elVV) _elVV.textContent=fmtNum(r.votosValidos);
  var _elUmb=document.getElementById('resDerUmbral'); if(_elUmb) _elUmb.textContent=(r.pct*100)+'% = '+fmtNum(r.umbral);
  var card=document.getElementById('resDerechoCard');
  var resEl=document.getElementById('resDerResultado');
  if(r.tiene){
    resEl.innerHTML='<span class="text-success"><i class="fa fa-check-circle me-1"></i>TIENE DERECHO<br>A REPOSICIÓN DE GASTOS</span>';
    card.className='card border-success';
  } else {
    resEl.innerHTML='<span class="text-danger"><i class="fa fa-times-circle me-1"></i>NO TIENE DERECHO<br>A REPOSICIÓN DE GASTOS</span>';
    card.className='card border-danger';
  }
  wrap.style.display='block';
}

/**
 * _onUmbralChange() — Cuando el usuario edita manualmente el input de umbral/votos válidos
 */
function _onUmbralChange(){
  var inp=document.getElementById('resDerUmbralInput');
  if(!inp) return;
  var val=parseInt(inp.value)||0;
  var corp=document.getElementById('selCorp').value;
  var corpN=norm(corp);
  var esAlcGob=corpN.indexOf('ALCALD')!==-1||corpN.indexOf('GOBERN')!==-1;
  var pct=esAlcGob?0.04:0.50;
  var lbl=document.getElementById('resDerPctLabel');
  if(lbl) lbl.textContent=esAlcGob?'4% votos válidos':'50% umbral';
  var el50=document.getElementById('resDerUmbral50');
  if(el50) el50.textContent=val>0?fmtNum(Math.round(val*pct)):'—';
}

/**
 * _autoFillUmbral(corpPortal, dpto, mun) — Auto-rellena el campo umbral/votos válidos desde cert_umbrales.json
 * Respeta los filtros del paso 1. corpPortal = nombre del portal (ALCALDIA, CONCEJO, etc.)
 */
function _autoFillUmbral(corpPortal, dpto, mun){
  var inp=document.getElementById('resDerUmbralInput');
  if(!inp) return;
  if(!CERT_UMBRALES||!corpPortal||!dpto) return;
  var bucket=CERT_UMBRALES[corpPortal];
  if(!bucket) return;
  var dBucket=bucket[dpto];
  if(!dBucket){
    // Fuzzy: buscar dpto similar
    var dN=norm(dpto);
    for(var dk in bucket){
      if(norm(dk)===dN){ dBucket=bucket[dk]; break; }
    }
  }
  if(!dBucket) return;
  // Para ASAMBLEA/GOBERNACION: el municipio en el JSON es el nombre del departamento
  var munKey=mun;
  if(corpPortal==='ASAMBLEA'||corpPortal==='GOBERNACION'){
    munKey=dpto; // usar dpto como clave de municipio
  }
  var entry=dBucket[munKey];
  if(!entry){
    var mN=norm(munKey), mNbase=mN.replace(/\s*\(.*\)\s*/g,'').trim();
    for(var mk in dBucket){
      var mkN=norm(mk);
      if(mkN===mN||mkN===mNbase||mN.indexOf(mkN)===0){ entry=dBucket[mk]; break; }
    }
  }
  if(!entry) return;
  // Sumar todos los votos de partidos = votos válidos totales
  var sumaVotos=0;
  if(entry.partidos&&entry.partidos.length){
    entry.partidos.forEach(function(p){ sumaVotos+=p.v||0; });
  }
  var valorFinal=sumaVotos>0?sumaVotos:(entry.vvu||0);
  if(!valorFinal) return;
  inp.value=valorFinal;
  inp.title='Suma votos partidos: '+fmtNum(valorFinal)+' ('+entry.tipo+' - cert. electoral)';
  inp.classList.add('border-success');
  _onUmbralChange();
  // Filtrar tabla de partidos por el partido seleccionado en Paso 1
  var partidoSel=document.getElementById('selPartido').value;
  _renderCertPartidos(entry, partidoSel);
  // Recalcular derecho a reposición usando el valor del certificado
  _recalcDerechoCert(valorFinal, entry, corpPortal, partidoSel);
}

/**
 * _renderCertPartidos(entry) — Muestra tabla de partidos del certificado electoral
 */
function _renderCertPartidos(entry, partidoFiltro){
  var wrap=document.getElementById('resCertPartidosWrap');
  if(!wrap) return;
  if(!entry||!entry.partidos||!entry.partidos.length){wrap.innerHTML='';return;}
  var filtroN=partidoFiltro?norm(partidoFiltro):'';
  var partidos=entry.partidos;
  if(filtroN){
    partidos=partidos.filter(function(p){ return norm(p.p).indexOf(filtroN)!==-1||filtroN.indexOf(norm(p.p))!==-1; });
  }
  if(!partidos.length){wrap.innerHTML='';return;}
  var h='<table class="table table-sm table-bordered mb-0" style="font-size:.75rem">';
  h+='<thead class="table-dark"><tr><th>Partido (certificado)</th><th class="text-end">Votos</th><th class="text-center">Reposición</th></tr></thead><tbody>';
  partidos.forEach(function(p){
    var cls=p.r==='SI'?'text-success':'text-danger';
    h+='<tr><td>'+esc(p.p)+'</td><td class="text-end">'+fmtNum(p.v)+'</td>';
    h+='<td class="text-center"><span class="'+cls+' fw-bold">'+esc(p.r)+'</span></td></tr>';
  });
  h+='</tbody></table>';
  wrap.innerHTML=h;
}

/**
 * _recalcDerechoCert — Recalcula derecho a reposición usando datos del certificado.
 * Para Concejo/Asamblea/JAL: votos partido >= 50% del umbral (valorCert)
 * Para Alcaldía/Gobernación: votos partido >= 4% de votos válidos (valorCert)
 */
function _recalcDerechoCert(valorCert, entry, corpPortal, partidoSel){
  if(!valorCert||!entry) return;
  var card=document.getElementById('resDerechoCard');
  var resEl=document.getElementById('resDerResultado');
  var el50=document.getElementById('resDerUmbral50');
  var lblPct=document.getElementById('resDerPctLabel');
  if(!card||!resEl) return;
  var esAlcGob=(corpPortal==='ALCALDIA'||corpPortal==='GOBERNACION');
  var pct=esAlcGob?0.04:0.50;
  var umbral50=Math.ceil(valorCert*pct);
  if(lblPct) lblPct.textContent=esAlcGob?'4% votos válidos':'50% umbral';
  if(el50) el50.textContent=fmtNum(umbral50);
  // Buscar votos del partido en el certificado
  var vpSel=document.getElementById('resDerVotosPartido');
  var votosP=vpSel?parseInt(vpSel.textContent.replace(/\./g,'').replace(/,/g,''))||0:0;
  // Si hay partido filtrado, buscar votos en el certificado
  if(partidoSel&&entry.partidos){
    var filtroN=norm(partidoSel);
    entry.partidos.forEach(function(p){
      if(norm(p.p).indexOf(filtroN)!==-1||filtroN.indexOf(norm(p.p))!==-1){
        votosP=p.v||0;
      }
    });
    if(vpSel) vpSel.textContent=fmtNum(votosP);
  }
  var tiene=votosP>=umbral50&&valorCert>0;
  if(tiene){
    resEl.innerHTML='<span class="text-success"><i class="fa fa-check-circle me-1"></i>TIENE DERECHO<br>A REPOSICIÓN DE GASTOS</span>';
    card.className='card border-success';
  } else {
    resEl.innerHTML='<span class="text-danger"><i class="fa fa-times-circle me-1"></i>NO TIENE DERECHO<br>A REPOSICIÓN DE GASTOS</span>';
    card.className='card border-danger';
  }
  document.getElementById('resDerechoWrap').style.display='block';
}

/**
 * _findCertPath(dpto, mun, cargo) — Busca certificado electoral con fuzzy matching.
 * Las keys en certificados.json son irregulares: "-ANTIOQUIA-", "1 BOLIVAR",
 * "BOYACA DEP", "013_CIENAGA DE ORO", "ARAUCA-DEPARTAMENTAL", etc.
 */
function _findCertPath(dpto, mun, cargo){
  if(!CERT_IDX||!Object.keys(CERT_IDX).length) return null;
  var dN=norm(dpto), mN=norm(mun);
  var cargoN=dN.indexOf('ALCALD')!==-1?'ALCALDIA':
             dN.indexOf('CONCEJO')!==-1?'CONCEJO':
             cargo; // use cargo param as-is
  // 1. Exact match
  var dBucket=CERT_IDX[dN];
  if(!dBucket){
    // Try fuzzy: find dept key that contains our norm'd name
    for(var dk in CERT_IDX){
      if(norm(dk)===dN || norm(dk).replace(/[^A-Z ]/g,'').trim()===dN){
        dBucket=CERT_IDX[dk]; break;
      }
    }
  }
  if(!dBucket) return null;

  // 2. Find municipio key
  var mBucket=dBucket[mN];
  if(!mBucket){
    // Fuzzy: strip numeric prefixes, dashes, suffixes like "DEP", "DEPARTAMENTAL"
    for(var mk in dBucket){
      var mkClean=norm(mk).replace(/^[\d_]+/,'').replace(/-?(DEPARTAMENTAL|DEP|COMPLEMENTARIA)$/,'').replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim();
      var mNbase=mN.replace(/\s*\(.*\)\s*/g,'').trim();
      if(mkClean===mN || mkClean===mNbase || mN===norm(mk) || mNbase===norm(mk) || mN.indexOf(mkClean)===0){
        mBucket=dBucket[mk]; break;
      }
    }
  }
  // For departamental cargos (ASAMBLEA/GOBERNACION), also try keys with dept name
  if(!mBucket && (cargoN==='ASAMBLEA'||cargoN==='GOBERNACION')){
    for(var mk2 in dBucket){
      var mk2N=norm(mk2);
      if(mk2N.indexOf(dN)!==-1 || mk2N.indexOf('DEPARTAMENTAL')!==-1 || mk2N.indexOf(' DEP')!==-1 ||
         mk2N.indexOf('GOBERNADOR')!==-1 || mk2N.match(/^[\-\d]/)){
        var inner=dBucket[mk2];
        if(inner[cargoN]||inner['GENERAL']||inner['GOBERNACION']||inner['ASAMBLEA']){
          mBucket=inner; break;
        }
      }
    }
  }
  if(!mBucket) return null;

  // 3. Find cargo
  return mBucket[cargoN]||mBucket['GENERAL']||null;
}

