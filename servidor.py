"""
Servidor HTTP multi-hilo para el portal CNE.
Soporta 200+ conexiones simultáneas.
Usa subst P: para evitar límite de 260 chars en paths largos de Windows.

Uso:
    python servidor.py              # Puerto 8081
    python servidor.py 9000         # Puerto personalizado
"""

import sys
import os
import re
import json
import threading
import atexit
import subprocess
import unicodedata
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs, unquote
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

# ── Constantes ────────────────────────────────────────────────────────────────
CNE_API        = "https://app.cne.gov.co/fondo/public"
CNE_LOGIN_URL  = "https://app.cne.gov.co/usuarios/public/login"
CNE_LOGIN_HOME = "https://app.cne.gov.co/usuarios/public/"   # GET aquí para CSRF
CNE_AUTOLOGIN  = "https://app.cne.gov.co/usuarios/public/autoLoginRedirect/1"
DRIVE     = "P:"
_cne_session: requests.Session | None = None
_cne_session_ts: float = 0.0
_cne_usuario: str = ""
_gestion_cache: dict = {}
_cache_lock = threading.Lock()

# Estado del indexador en segundo plano
_indice_estado: dict = {"fase": "idle", "pct": 0, "msg": "", "error": ""}
_indice_lock = threading.Lock()

# Caché financiero: cargado una vez, reutilizado en todas las peticiones
_fin_data: dict = {}          # key -> {total_ingreso, total_gasto}
_fin_idx:  dict = {}          # cand_id -> {org_id, tipo_id, circ_id, dpto_id, mun_id}
_fin_loaded: bool = False
_fin_lock = threading.Lock()

# Caché de votos: votos_index.json cargado una vez
_votos_completo: dict = {}  # "nombre|mun|corp" -> votos
_votos_nombre:   dict = {}  # "nombre|corp"     -> votos (fallback)
_votos_loaded:   bool = False
_votos_lock = threading.Lock()

# Caché de reposición CNE 2023 (vigencia 2024): reposicion.db
# key "partido_norm|corp_norm|dpto_norm" -> {val_rec, val_neto, estado, resolucion}
# key "partido_norm|corp_norm"           -> {val_rec, val_neto, estado, resolucion}  (agregado)
_repos_full: dict = {}
_repos_agg:  dict = {}
_repos_loaded: bool = False
_repos_lock = threading.Lock()

def _load_repos_cache(portal_dir: str) -> None:
    global _repos_full, _repos_agg, _repos_loaded
    with _repos_lock:
        if _repos_loaded:
            return
        db_path = os.path.join(portal_dir, "data", "pagostres.db")
        if not os.path.exists(db_path):
            _repos_loaded = True
            return
        try:
            import sqlite3 as _sq
            def _rn(s):
                import unicodedata as _ud
                s = _ud.normalize("NFD", str(s or "").upper().strip())
                return "".join(c for c in s if _ud.category(c) != "Mn")
            con = _sq.connect(db_path)
            rows = con.execute("""
                SELECT CORPORACION, DEPARTAMENTO, PARTIDO_MOVIMIENTO,
                       SUM(VALOR_RECONOCIDO), SUM(VALOR_AUDITORIA), SUM(VALOR_NETO_GIRADO),
                       GROUP_CONCAT(DISTINCT RES_PAGO)
                FROM pagos_elecciones
                WHERE CORPORACION IN ('ALCALDIA','CONCEJO','ASAMBLEA','GOBERNACION','JAL',
                                      'ALCALDIA ATIPICA','CONCEJO ATIPICA')
                GROUP BY CORPORACION, DEPARTAMENTO, PARTIDO_MOVIMIENTO
            """).fetchall()
            con.close()
            CORP_CC = {"ALCALDIA":"Alcaldía","CONCEJO":"Concejo","ASAMBLEA":"Asamblea",
                       "GOBERNACION":"Gobernación","JAL":"JAL",
                       "ALCALDIA ATIPICA":"Alcaldía","CONCEJO ATIPICA":"Concejo"}
            full = {}
            agg  = {}
            for corp_r, dpto_r, partido_r, val_rec, val_aud, val_neto, resoluciones in rows:
                corp_cc  = CORP_CC.get(corp_r, corp_r)
                pk_full  = f"{_rn(partido_r)}|{_rn(corp_cc)}|{_rn(dpto_r)}"
                pk_agg   = f"{_rn(partido_r)}|{_rn(corp_cc)}"
                rec = {"val_rec": val_rec or 0, "val_neto": val_neto or 0,
                       "estado": "", "resolucion": (resoluciones or "").strip(),
                       "dpto": dpto_r or ""}
                full[pk_full] = rec
                if pk_agg not in agg:
                    agg[pk_agg] = {"val_rec": 0.0, "val_neto": 0.0, "estado": "", "resolucion": set()}
                agg[pk_agg]["val_rec"]  += val_rec or 0
                agg[pk_agg]["val_neto"] += val_neto or 0
                if resoluciones: agg[pk_agg]["resolucion"].add(resoluciones.strip())
            for v in agg.values():
                v["resolucion"] = ",".join(sorted(v["resolucion"]))
            _repos_full = full
            _repos_agg  = agg
        except Exception as e:
            print(f"[pagostres] error cargando cache: {e}")
        _repos_loaded = True

def _load_votos_cache(portal_dir: str) -> None:
    global _votos_completo, _votos_nombre, _votos_loaded
    with _votos_lock:
        if _votos_loaded:
            return
        path = os.path.join(portal_dir, "data", "votos_index.json")
        if not os.path.exists(path):
            _votos_loaded = True
            return
        try:
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
            _votos_completo = d.get("completo", {})
            _votos_nombre   = d.get("nombre", {})
        except Exception:
            pass
        _votos_loaded = True

def _get_votos(nombre: str, mun: str, corp: str) -> int:
    """Busca votos para un candidato. Primero exact match, luego fallback por nombre."""
    import unicodedata as _ud
    def _n(s):
        s = _ud.normalize("NFD", str(s or "").upper().strip())
        return "".join(c for c in s if _ud.category(c) != "Mn")
    CORP_MAP = {"ALCALDÍA":"ALCALDIA","ALCALDIA":"ALCALDIA","CONCEJO":"CONCEJO",
                "GOBERNACIÓN":"GOBERNACION","GOBERNACION":"GOBERNACION",
                "ASAMBLEA":"ASAMBLEA","JAL":"JAL"}
    corp_n = CORP_MAP.get(_n(corp), _n(corp))
    key_full = f"{_n(nombre)}|{_n(mun)}|{corp_n}"
    if key_full in _votos_completo:
        return _votos_completo[key_full]
    key_nom = f"{_n(nombre)}|{corp_n}"
    return _votos_nombre.get(key_nom, 0)

# Caché de búsqueda global: índice + gerentes PDF en memoria
_buscar_idx:    list  = []    # [{cand_id, nombre, cedula, org, corp, dpto, mun, ...}]
_buscar_norm:   list  = []    # cadena pre-normalizada por candidato para búsqueda rápida
_ger_pdf_cache: dict  = {}    # cand_id(str) -> {gerente_nombre, gerente_cc, contador_nombre, ...}
_buscar_loaded: bool  = False
_buscar_lock = threading.Lock()

def _norm_search(s: str) -> str:
    """Normaliza texto para búsqueda: mayúsculas, sin tildes."""
    s = unicodedata.normalize("NFD", str(s or "").upper())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")

def _load_buscar_cache(portal_dir: str) -> None:
    """Carga índice de candidatos + gerentes PDF en memoria (una vez).
    Pre-normaliza campos para búsquedas rápidas O(n) sin recompute."""
    global _buscar_idx, _buscar_norm, _ger_pdf_cache, _buscar_loaded
    with _buscar_lock:
        if _buscar_loaded:
            return
        idx_path = os.path.join(portal_dir, "data", "cuentas_claras_index.json")
        ger_path = os.path.join(portal_dir, "data", "cc_gerentes_pdf.json")
        try:
            with open(ger_path, encoding="utf-8") as f:
                _ger_pdf_cache = json.load(f)
        except Exception:
            _ger_pdf_cache = {}
        try:
            with open(idx_path, encoding="utf-8") as f:
                idx = json.load(f)
            flat  = []
            norms = []
            for dpto_nom, dpto_data in idx.items():
                dpto_id = dpto_data.get("id", 0)
                for mun_nom, mun_data in dpto_data.get("municipios", {}).items():
                    mun_id = mun_data.get("id", 0)
                    for c in mun_data.get("candidatos", []):
                        cid = c.get("cand_id")
                        ger = _ger_pdf_cache.get(str(cid), {})
                        rec = {
                            "cand_id": cid,
                            "nombre":  c.get("nombre", ""),
                            "cedula":  str(c.get("cedula", "")),
                            "org":     c.get("org", ""),
                            "corp":    c.get("corp", ""),
                            "corp_id": c.get("corp_id"),
                            "org_id":  c.get("org_id"),
                            "tipo_id": c.get("tipo_id"),
                            "circ_id": c.get("circ_id"),
                            "dpto":    dpto_nom,
                            "mun":     mun_nom,
                            "dpto_id": dpto_id,
                            "mun_id":  mun_id,
                        }
                        flat.append(rec)
                        # Cadena buscable pre-normalizada
                        norms.append("|".join([
                            _norm_search(c.get("nombre","")),
                            str(c.get("cedula","")),
                            _norm_search(c.get("org","")),
                            _norm_search(ger.get("gerente_nombre","")),
                            _norm_search(ger.get("contador_nombre","")),
                        ]))
            _buscar_idx  = flat
            _buscar_norm = norms
        except Exception:
            _buscar_idx  = []
            _buscar_norm = []
        _buscar_loaded = True

def _load_fin_cache(portal_dir: str) -> None:
    """Carga cc_financiero.json y el índice de candidatos en memoria (una vez)."""
    global _fin_data, _fin_idx, _fin_loaded
    with _fin_lock:
        if _fin_loaded:
            return
        fin_path = os.path.join(portal_dir, "data", "cc_financiero.json")
        idx_path = os.path.join(portal_dir, "data", "cuentas_claras_index.json")
        if os.path.exists(fin_path):
            try:
                with open(fin_path, encoding="utf-8") as f:
                    _fin_data = json.load(f)
            except Exception:
                _fin_data = {}
        if os.path.exists(idx_path):
            try:
                with open(idx_path, encoding="utf-8") as f:
                    idx = json.load(f)
                for dpto_data in idx.values():
                    dpto_id = dpto_data.get("id", 0)
                    for mun_data in dpto_data.get("municipios", {}).values():
                        mun_id = mun_data.get("id", 0)
                        for c in mun_data.get("candidatos", []):
                            cid = c.get("cand_id")
                            if cid:
                                _fin_idx[cid] = {
                                    "org_id":  c.get("org_id"),
                                    "tipo_id": c.get("tipo_id"),
                                    "circ_id": c.get("circ_id"),
                                    "dpto_id": dpto_id,
                                    "mun_id":  mun_id,
                                }
            except Exception:
                _fin_idx = {}
        _fin_loaded = True


# ── Utilidades ────────────────────────────────────────────────────────────────

def _parse_multipart(rfile, content_type: str, content_length: int) -> tuple[dict, dict]:
    """Parse multipart/form-data sin modulo cgi (removido en Python 3.13+)."""
    body = rfile.read(content_length)
    m = re.search(r"boundary=([^\s;]+)", content_type)
    if not m:
        return {}, {}
    boundary = m.group(1).encode()
    parts = body.split(b"--" + boundary)
    fields: dict = {}
    files: dict  = {}
    for part in parts[1:]:
        if part in (b"--", b"--\r\n"):
            break
        header_block, _, data = part.lstrip(b"\r\n").partition(b"\r\n\r\n")
        headers = header_block.decode("utf-8", errors="replace")
        name_m = re.search(r'name="([^"]*)"', headers)
        if not name_m:
            continue
        name = name_m.group(1)
        fname_m = re.search(r'filename="([^"]*)"', headers)
        if fname_m:
            files[name] = {"filename": fname_m.group(1), "data": data.rstrip(b"\r\n")}
        else:
            fields[name] = data.rstrip(b"\r\n").decode("utf-8", errors="replace")
    return fields, files


def _norm_folder(s: str) -> str:
    """Normaliza string a formato carpeta: MAYUS, sin tildes, espacios → guión bajo."""
    nfkd = unicodedata.normalize("NFD", s)
    limpio = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    limpio = re.sub(r"[^A-Za-z0-9\-_ ]", "", limpio)
    return limpio.strip().upper().replace(" ", "_")


def _subst_mount(portal_dir: str) -> str:
    """Mapea portal_dir a P: para paths cortos. Limpia al salir."""
    try:
        subprocess.run(
            ["subst", DRIVE, portal_dir],
            capture_output=True,
            check=True,
        )
        atexit.register(lambda: subprocess.run(["subst", f"{DRIVE}", "/D"], capture_output=True))
        os.chdir(DRIVE + "\\")
        print(f"Mapeado {portal_dir} -> {DRIVE}")
        return DRIVE + "\\"
    except Exception as e:
        print(f"subst falló ({e}), usando ruta original")
        return portal_dir


# ── Indexador en segundo plano ────────────────────────────────────────────────

def _norm_idx(s: str) -> str:
    import unicodedata as _ud
    s = _ud.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if _ud.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.upper().strip())

CORP_ID_MAP = {2:"GOBERNACION",3:"ALCALDIA",5:"ASAMBLEA",6:"CONCEJO",7:"JAL",8:"PERSONERIA"}

def _indice_set(fase: str, pct: int, msg: str, error: str = "") -> None:
    with _indice_lock:
        _indice_estado.update({"fase": fase, "pct": pct, "msg": msg, "error": error})
    print(f"[Indice] {msg}")

def _construir_indice_bg() -> None:
    """Descarga todos los candidatos y construye busqueda.json + candidatos_mun/."""
    import time as _t, os as _os, json as _j
    global _cne_session

    data_dir  = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "data")
    cand_dir  = _os.path.join(data_dir, "candidatos_mun")
    proceso   = 7

    def _cne(endpoint, params=None):
        """GET al API de fondo con los headers requeridos."""
        if _cne_session is None:
            return None
        url  = CNE_API + "/" + endpoint.lstrip("/")
        xsrf = requests.utils.unquote(_cne_session.cookies.get("XSRF-TOKEN", ""))
        hdrs = {"Accept":"application/json","X-Requested-With":"XMLHttpRequest",
                "X-XSRF-TOKEN": xsrf, "Referer": CNE_API + "/"}
        try:
            r = _cne_session.get(url, params=params, headers=hdrs, timeout=30)
            return r.json() if r.ok else None
        except Exception:
            return None

    def _paginar(endpoint, extra=None, workers=20):
        """Descarga todas las páginas de un endpoint en paralelo."""
        p0 = dict(extra or {}); p0["page"] = 1
        d0 = _cne(endpoint, p0)
        if not d0:
            return []
        # detectar clave de datos y total de páginas
        data_key = next((k for k in d0 if isinstance(d0[k], dict) and "data" in d0[k]), None)
        if data_key:
            items   = list(d0[data_key].get("data", []))
            last_p  = d0[data_key].get("last_page", 1)
        elif isinstance(d0, list):
            return d0
        else:
            items  = d0.get("data", list(d0.values()) if not any(isinstance(v,dict) for v in d0.values()) else [])
            last_p = d0.get("last_page", 1)

        if last_p <= 1:
            return items

        lock2 = threading.Lock()
        def _fetch(pg):
            pp = dict(extra or {}); pp["page"] = pg
            d  = _cne(endpoint, pp)
            if not d: return []
            if data_key: return d[data_key].get("data", [])
            if isinstance(d, list): return d
            return d.get("data", [])

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = {pool.submit(_fetch, pg): pg for pg in range(2, last_p+1)}
            for fut in as_completed(futs):
                rows = fut.result()
                with lock2:
                    items.extend(rows)
        return items

    try:
        _indice_set("trabajando", 2, "Descargando departamentos…")
        dptos_raw = _paginar("departamento")
        dptos_map = {str(d["id"]): _norm_idx(d.get("nombre","")) for d in dptos_raw if d.get("id")}

        _indice_set("trabajando", 6, f"Descargando municipios ({len(dptos_map)} dptos)…")
        muns_map: dict = {}
        mlock = threading.Lock()
        def _fetch_muns(did):
            muns = _paginar("municipio", {"id_departamento": did})
            with mlock:
                for m in muns:
                    mid = str(m.get("id",""))
                    nom = _norm_idx(m.get("nombre") or m.get("munipioNombre") or m.get("municipioNombre") or "")
                    if mid and nom:
                        muns_map[mid] = nom
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(_fetch_muns, list(dptos_map.keys())))

        _indice_set("trabajando", 10, "Consultando total de candidatos…")
        first = _cne("candidatos", {"idproceso": proceso, "page": 1})
        if not first:
            return _indice_set("error", 0, "No se pudo obtener candidatos", "Sin respuesta del API")
        total_p = first.get("pagination", {}).get("last_page", 1)
        total_c = first.get("pagination", {}).get("total", 0)
        _indice_set("trabajando", 12, f"Descargando {total_c:,} candidatos ({total_p:,} páginas)…")

        # Primera página ya descargada
        all_cands: list = []
        primera_data = first.get("candidatos", {})
        if isinstance(primera_data, dict): primera_data = primera_data.get("data", [])
        all_cands.extend(primera_data or [])

        done = [0]
        alock = threading.Lock()
        def _fetch_cand(pg):
            d = _cne("candidatos", {"idproceso": proceso, "page": pg})
            if not d: return []
            rows = d.get("candidatos", {})
            if isinstance(rows, dict): rows = rows.get("data", [])
            return rows if isinstance(rows, list) else []

        with ThreadPoolExecutor(max_workers=30) as pool:
            futs = {pool.submit(_fetch_cand, pg): pg for pg in range(2, total_p+1)}
            for fut in as_completed(futs):
                rows = fut.result()
                with alock:
                    all_cands.extend(rows)
                    done[0] += 1
                    if done[0] % 300 == 0:
                        pct = 12 + int(done[0] * 78 / total_p)
                        _indice_set("trabajando", pct,
                                    f"Descargando… {done[0]:,}/{total_p:,} págs | {len(all_cands):,} cands")

        _indice_set("trabajando", 91, f"Construyendo índices ({len(all_cands):,} candidatos)…")

        busqueda: dict = {}
        by_corp_mun: dict = {}
        renuncias=[]; revocados=[]; no_presento=[]; extemp=[]
        art23=art27=art34=0

        for c in all_cands:
            # Campos reales de la API CNE
            corp_id = int(c.get("id_corporacion") or 0)
            corp    = CORP_ID_MAP.get(corp_id, "OTRO")
            # Dpto y municipio vienen como strings directamente
            dpto    = _norm_idx(c.get("depto") or c.get("departamento") or
                                 dptos_map.get(str(c.get("id_departamento","")), "") or "")
            mun     = _norm_idx(c.get("municipio") or
                                 muns_map.get(str(c.get("id_municipio","")), "") or "")
            # Partido: viene en relacion_agrupacion, relacion_grupo o relacion_coalicion
            rel_ag  = c.get("relacion_agrupacion") or []
            rel_gr  = c.get("relacion_grupo") or []
            rel_co  = c.get("relacion_coalicion") or []
            if rel_ag:
                partido_nom = rel_ag[0].get("nombre_agrupacion") or rel_ag[0].get("nombre") or ""
            elif rel_gr:
                partido_nom = rel_gr[0].get("nombre_grupo") or rel_gr[0].get("nombre") or ""
            elif rel_co:
                partido_nom = rel_co[0].get("nombre_coalicion") or rel_co[0].get("nombre") or ""
            else:
                partido_nom = ""
            partido = _norm_idx(partido_nom or "SIN PARTIDO")
            cedula  = str(c.get("cedula") or "")
            if not dpto: continue
            mun_key = mun if mun else dpto

            busqueda.setdefault(corp,{}).setdefault(dpto,{}).setdefault(mun_key,set()).add(partido)
            by_corp_mun.setdefault((corp, mun_key), []).append({
                "id":      c.get("id_candidato") or "",
                "nombre":  (str(c.get("nombre") or "")+" "+str(c.get("apellido") or "")).strip(),
                "cedula":  cedula,
                "partido": partido,
                "dpto":    dpto, "mun": mun_key, "corp": corp, "corp_id": corp_id,
                "org_id":  c.get("id_organizacion_politica") or "",
                "circ_id": c.get("id_circunscripcion") or "",
                "tipo_id": c.get("id_tipo_organizacion") or "",
                "estado":  str(c.get("estado") or ""),
            })

        # Convertir sets → listas
        for corp in busqueda:
            for dpto in busqueda[corp]:
                for mun in busqueda[corp][dpto]:
                    busqueda[corp][dpto][mun] = sorted(busqueda[corp][dpto][mun])

        _indice_set("trabajando", 95, "Guardando archivos…")

        def _guardar(path, data):
            _os.makedirs(_os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                _j.dump(data, fh, ensure_ascii=False, separators=(",",":"))

        _guardar(_os.path.join(data_dir, "busqueda.json"), busqueda)

        files = 0
        for (corp, mun_key), cands in by_corp_mun.items():
            _guardar(_os.path.join(cand_dir, corp, mun_key+".json"), cands)
            files += 1

        _guardar(_os.path.join(data_dir, "stats.json"), {
            "total_candidatos": len(all_cands), "total_art23": art23,
            "total_art27": art27, "total_art34": art34,
            "total_no_presentaron": len(no_presento),
            "total_extemporaneos": len(extemp), "total_revocados": len(revocados),
            "_generado": _t.strftime("%Y-%m-%d %H:%M"), "_fuente": "CNE Cuentas Claras",
        })
        _guardar(_os.path.join(data_dir, "estado_candidatos.json"), {
            "renuncias": renuncias, "revocados": revocados,
            "no_presento": no_presento, "extemporaneo": extemp,
        })

        corps_n = len(busqueda)
        dptos_n = sum(len(v) for v in busqueda.values())
        _indice_set("listo", 100,
                    f"Índice completo: {len(all_cands):,} candidatos | "
                    f"{corps_n} corps | {dptos_n} dptos | {files} archivos")

    except Exception as e:
        _indice_set("error", 0, "Error en indexación", str(e))


# ── Handler ───────────────────────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):

    # ── Helpers internos ──────────────────────────────────────────────────────

    def _send_json(self, data, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, msg: str, status: int = 500):
        self._send_json({"error": msg}, status)

    def _qs(self) -> dict:
        parsed = urlparse(self.path)
        return {k: v[0] for k, v in parse_qs(parsed.query).items()}

    def _cne_get(self, endpoint: str, params: dict | None = None) -> requests.Response:
        global _cne_session
        url = CNE_API + "/" + endpoint.lstrip("/")
        xsrf = requests.utils.unquote(_cne_session.cookies.get("XSRF-TOKEN", ""))
        headers = {
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-XSRF-TOKEN": xsrf,
            "Referer": CNE_API + "/",
        }
        resp = _cne_session.get(url, params=params, headers=headers, timeout=30)
        return resp

    # ── Routing ───────────────────────────────────────────────────────────────

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/cne_buscar_candidatos":
                self._handle_cne_buscar_candidatos()
            elif path == "/api/cne_gestion_filtrado":
                self._handle_cne_gestion_filtrado()
            elif path == "/api/cne_dictamen_filtrado":
                self._handle_cne_dictamen_filtrado()
            elif path == "/api/cne_status":
                self._handle_cne_status()
            elif path == "/api/indice_status":
                self._handle_indice_status()
            elif path.startswith("/api/cne/"):
                self._handle_cne_proxy()
            elif path == "/api/lista_respuestas":
                self._handle_lista_respuestas()
            elif path == "/api/cc_stats":
                self._handle_cc_stats()
            elif path == "/api/cc_candidatos":
                self._handle_cc_candidatos()
            elif path == "/api/cc_municipios":
                self._handle_cc_municipios()
            elif path == "/api/cc_dpto_detalle":
                self._handle_cc_dpto_detalle()
            elif path == "/api/cc_exportar_gerentes":
                self._handle_cc_exportar_gerentes()
            elif path == "/api/cc_gerentes":
                self._handle_cc_gerentes()
            elif path == "/api/cc_gerentes_pdf":
                self._handle_cc_gerentes_pdf()
            elif path == "/api/cc_buscar":
                self._handle_cc_buscar()
            elif path == "/api/cc_partido":
                self._handle_cc_partido()
            elif path == "/api/cc_liquidacion_partidos":
                self._handle_cc_liquidacion_partidos()
            elif path == "/api/cc_exportar_dictamen":
                self._handle_cc_exportar_dictamen()
            elif path == "/api/pagos_partido":
                self._handle_pagos_partido()
            elif path == "/api/presupuesto":
                self._handle_presupuesto()
            elif path == "/api/explorador":
                self._handle_explorador()
            else:
                super().do_GET()
        except Exception as e:
            self._send_error_json(str(e))

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path in ("/api/cne_login", "/api/cne_login_manual"):
                self._handle_cne_login()
            elif path == "/api/construir_indice":
                self._handle_construir_indice()
            elif path == "/api/cne_import_cookies":
                self._handle_cne_import_cookies()
            elif path == "/api/guardar_liquidacion":
                self._handle_guardar_liquidacion()
            else:
                self.send_response(404)
                self.end_headers()
        except Exception as e:
            self._send_error_json(str(e))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ── /api/cne_status ───────────────────────────────────────────────────────

    def _handle_cne_status(self):
        import time
        if _cne_session is None:
            return self._send_json({"sesion_activa": False})
        edad_min = (time.time() - _cne_session_ts) / 60 if _cne_session_ts else 0
        self._send_json({"sesion_activa": True, "edad_min": round(edad_min, 1),
                         "usuario": _cne_usuario})

    # ── /api/indice_status  y  /api/construir_indice ─────────────────────────

    def _handle_indice_status(self):
        with _indice_lock:
            self._send_json(dict(_indice_estado))

    def _handle_construir_indice(self):
        if _cne_session is None:
            return self._send_error_json("Sin sesión CNE activa.", 401)
        with _indice_lock:
            if _indice_estado["fase"] == "trabajando":
                return self._send_json({"ok": False, "msg": "Ya hay una indexación en curso."})
        t = threading.Thread(target=_construir_indice_bg, daemon=True)
        t.start()
        self._send_json({"ok": True, "msg": "Indexación iniciada en segundo plano."})

    # ── /api/cne_login  y  /api/cne_login_manual ─────────────────────────────

    def _handle_cne_login(self):
        global _cne_session, _cne_session_ts, _cne_usuario
        import re as _re, time as _time

        length = int(self.headers.get("Content-Length", 0))
        ct = self.headers.get("Content-Type", "")
        raw = self.rfile.read(length).decode("utf-8", errors="replace")

        # Soportar JSON (auth.js), form-urlencoded y multipart
        if "application/json" in ct:
            try:
                fields = json.loads(raw)
            except Exception:
                fields = {}
        elif "multipart" in ct:
            fields, _ = _parse_multipart(
                __import__("io").BytesIO(raw.encode()), ct, length)
        else:
            fields = dict(pair.split("=", 1) for pair in raw.split("&") if "=" in pair)

        usuario  = (fields.get("usuario") or fields.get("username") or "").strip()
        password = (fields.get("password") or "").strip()
        if not usuario or not password:
            return self._send_error_json("Usuario y contraseña requeridos", 400)

        sess = requests.Session()
        sess.verify = False
        sess.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "es-CO,es;q=0.9",
        })

        try:
            # Paso 1: GET home de usuarios para obtener CSRF
            print(f"[CNE Login] Paso 1: obteniendo CSRF desde {CNE_LOGIN_HOME}...")
            r1 = sess.get(CNE_LOGIN_HOME, timeout=15)
            csrf_m = _re.search(
                r"name=[\"']_token[\"'].*?value=[\"'](.*?)[\"']", r1.text)
            if not csrf_m:
                csrf_m = _re.search(
                    r"meta[^>]+name=[\"']csrf-token[\"'][^>]+content=[\"'](.*?)[\"']",
                    r1.text)
            if not csrf_m:
                return self._send_error_json(
                    "No se pudo obtener el token CSRF del portal CNE. "
                    "Intente más tarde.", 502)
            csrf = csrf_m.group(1)

            # Paso 2: POST login con usuario + contraseña
            print(f"[CNE Login] Paso 2: enviando credenciales para {usuario}...")
            r2 = sess.post(
                CNE_LOGIN_URL,
                data={"_token": csrf, "usuario": usuario, "password": password},
                allow_redirects=True,
                timeout=20,
            )

            # Detectar credenciales incorrectas
            txt2 = r2.text.lower()
            if any(k in txt2 for k in ("incorrectos", "inválid", "invalid",
                                        "aceptadas", "credentials")):
                print("[CNE Login] Credenciales inválidas")
                return self._send_json({
                    "ok": False,
                    "mensaje": "Usuario o contraseña incorrectos. "
                               "Verifique sus credenciales del portal CNE-Cuentas Claras."})

            if r2.status_code >= 400:
                return self._send_error_json(
                    f"El servidor CNE respondió con error {r2.status_code}. "
                    "Intente más tarde.", 502)

            if "centralizadoredirect" not in r2.url.lower() and \
               "login" in r2.url.lower():
                return self._send_json({
                    "ok": False,
                    "mensaje": "Credenciales no aceptadas por el portal CNE.",
                    "detalle": f"URL final: {r2.url}"})

            print(f"[CNE Login] Login exitoso, URL: {r2.url}")

            # Paso 3: autoLoginRedirect → obtener JWT y seguirlo al fondo
            # El servidor CNE necesita ~10s para guardar el token en su BD antes
            # de que podamos usarlo (timing issue confirmado).
            print("[CNE Login] Paso 3: solicitando JWT (esperando 10s para que CNE guarde el token)...")
            r3 = sess.get(CNE_AUTOLOGIN, allow_redirects=False, timeout=15)
            autologin_url = r3.headers.get("Location", "")
            r4_url = ""

            if autologin_url and "/fondo/" in autologin_url:
                _time.sleep(10)  # esperar a que CNE persista el token en su BD
                r4 = sess.get(autologin_url, allow_redirects=True, timeout=20)
                r4_url = r4.url
                print(f"[CNE Login] Autologin URL final: {r4_url}")
            elif autologin_url:
                # Seguir igualmente aunque no reconozcamos el patrón
                r4 = sess.get(autologin_url, allow_redirects=True, timeout=20)
                r4_url = r4.url
                print(f"[CNE Login] Autologin (URL alternativa): {r4_url}")
            else:
                # autoLoginRedirect siguió redirects automáticamente
                r3f = sess.get(CNE_AUTOLOGIN, allow_redirects=True, timeout=20)
                r4_url = r3f.url
                print(f"[CNE Login] Autologin directo: {r4_url}")

            # Paso 4: verificar sesión con el API del fondo
            print("[CNE Login] Paso 4: verificando sesión en API del fondo...")
            xsrf_val = requests.utils.unquote(sess.cookies.get("XSRF-TOKEN", ""))
            api_headers = {
                "Accept": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "X-XSRF-TOKEN": xsrf_val,
                "Referer": CNE_API + "/",
            }
            r5_status = 0
            for vurl in [CNE_API + "/candidatos?idproceso=7&page=1",
                         CNE_API + "/departamento"]:
                try:
                    r5 = sess.get(vurl, headers=api_headers, timeout=15)
                    r5_status = r5.status_code
                    print(f"[CNE Login] Verificación {vurl}: {r5_status}")
                    if r5_status == 200:
                        break
                except Exception:
                    continue

            if r5_status == 200:
                print(f"[CNE Login] Sesión activa para: {usuario}")
                _cne_session    = sess
                _cne_session_ts = _time.time()
                _cne_usuario    = usuario
                return self._send_json({
                    "ok": True,
                    "mensaje": f"Sesión iniciada correctamente para {usuario}"})

            # Si llegamos al fondo pero API no responde, aceptar igual
            if "/fondo/" in r4_url:
                print(f"[CNE Login] Llegó al fondo (API {r5_status}), aceptando sesión")
                _cne_session    = sess
                _cne_session_ts = _time.time()
                _cne_usuario    = usuario
                return self._send_json({
                    "ok": True,
                    "mensaje": f"Sesión iniciada para {usuario} "
                               f"(API status {r5_status})"})

            return self._send_json({
                "ok": False,
                "mensaje": "Login en usuarios OK pero no se pudo activar la sesión "
                           "en el módulo FNFP.",
                "detalle": f"API status: {r5_status}. URL fondo: {r4_url}. "
                           "Verifique que su usuario tenga permisos en Cuentas Claras."})

        except requests.Timeout:
            return self._send_error_json(
                "Tiempo de espera agotado conectando con el servidor CNE. "
                "Intente más tarde.", 504)
        except requests.ConnectionError:
            print("[CNE Login] Error de conexión")
            return self._send_error_json(
                "No se pudo conectar con el servidor CNE. "
                "Verifique su conexión a internet.", 503)
        except Exception as e:
            return self._send_error_json(
                f"Error durante el login: {e}", 500)

    # ── /api/cne_buscar_candidatos ────────────────────────────────────────────

    def _handle_cne_buscar_candidatos(self):
        """
        Busca candidatos en CC por corporación y departamento.
        GET /api/cne_buscar_candidatos?corp=GOBERNACION&dpto=Huila
        Explora la API de CC para encontrar organizaciones y candidatos departamentales.
        """
        if _cne_session is None:
            return self._send_error_json("Sin sesion CNE. Use /api/cne_login o ejecute indexar_cuentas_claras.py", 401)

        qs = self._qs()
        id_circunscripcion = qs.get("id_circunscripcion", "")
        id_departamento    = qs.get("id_departamento", "")
        tipo_id            = qs.get("tipo_id", "")
        id_organizacion    = qs.get("id_organizacion", "")
        id_municipio       = qs.get("id_municipio", "")
        cand_id            = qs.get("cand_id", "")
        cedula             = qs.get("cedula", "")
        documento          = qs.get("documento", "")
        org_id             = qs.get("org_id", "")
        corp_id            = qs.get("corp_id", "")
        circ_id            = qs.get("circ_id", "")
        partido_filter     = qs.get("partido", "").upper()
        dpto_name          = qs.get("dpto", "").upper()
        corp_name          = qs.get("corp", "").upper()

        try:
            # Listar organizaciones
            params_orgs: dict = {}
            if id_circunscripcion:
                params_orgs["id_circunscripcion"] = id_circunscripcion
            if tipo_id:
                params_orgs["tipo_id"] = tipo_id
            if id_departamento:
                params_orgs["id_departamento"] = id_departamento

            try:
                r_orgs = self._cne_get("/organizacionPolitica", params_orgs)
                orgs_data = r_orgs.json() if r_orgs.ok else []
            except Exception as e:
                print(f"[BuscarCandidatos] Error listando orgs tipo={tipo_id}: {e}")
                orgs_data = []

            orgs = orgs_data if isinstance(orgs_data, list) else orgs_data.get("data", [])
            print(f"[BuscarCandidatos] Encontradas {len(orgs)} organizaciones")

            # Mapear org_id → nombre
            corp_map: dict = {str(o.get("id", "")): o.get("nombre", "") for o in orgs}

            candidatos = []
            for org in orgs:
                org_name = org.get("nombre", "")
                if partido_filter and partido_filter not in org_name.upper():
                    continue
                o_id = str(org.get("id", org_id))
                params_cand: dict = {}
                if o_id:
                    params_cand["id_organizacion"] = o_id
                if id_municipio:
                    params_cand["id_municipio"] = id_municipio
                if corp_id:
                    params_cand["corp_id"] = corp_id
                if circ_id:
                    params_cand["id_circunscripcion"] = circ_id
                if cand_id:
                    params_cand["cand_id"] = cand_id
                if cedula or documento:
                    params_cand["documento"] = cedula or documento

                try:
                    r_cand = self._cne_get("/candidato", params_cand)
                    cands = r_cand.json() if r_cand.ok else []
                    if isinstance(cands, dict):
                        cands = cands.get("data", [])
                    for c in cands:
                        c["org_name"] = org_name
                        c["dpto_name"] = dpto_name
                    candidatos.extend(cands)
                except Exception as e:
                    print(f"[BuscarCandidatos] Error listando candidatos org={o_id}: {e}")

            print(f"[BuscarCandidatos] Total candidatos: {len(candidatos)}")
            self._send_json({"candidatos": candidatos, "orgs": orgs})

        except Exception as e:
            print(f"[BuscarCandidatos] Error: {e}")
            self._send_error_json(str(e))

    # ── /api/cne_gestion_filtrado ─────────────────────────────────────────────

    def _handle_cne_gestion_filtrado(self):
        """
        Endpoint que consulta módulos de gestión del CNE y filtra.
        GET /api/cne_gestion_filtrado?dpto=ATLANTICO&mun=BARANOA&corp=ALCALDIA&partido=LIBERAL
        Devuelve {dictamen:[], coalicion:[], contador:[], gerente:[], auditor:[]}
        DICTAMEN: usa endpoint departamentosFilter del CNE (filtra server-side por depto)
        GERENTE/AUDITOR: descarga todo con caché 30min (API no soporta filtros)
        """
        if _cne_session is None:
            return self._send_error_json("Sin sesion CNE. Use /api/cne_login o ejecute indexar_cuentas_claras.py", 401)

        import time
        t_start = time.time()

        qs       = self._qs()
        dpto_raw    = qs.get("dpto", "").strip()
        mun_raw     = qs.get("mun", "").strip()
        f_corp      = qs.get("corp", "").strip().upper()
        f_partido   = qs.get("partido", "").strip().upper()
        f_dpto      = _norm_folder(dpto_raw)
        f_mun       = _norm_folder(mun_raw)

        def _n(s: str) -> str:
            """Normaliza para comparación."""
            return _norm_folder(s)

        def _parse_page(resp_json) -> tuple[list, int]:
            """Extrae items y last_page de una respuesta paginada de CNE.
            Maneja la estructura: {"pagination":{}, "COLLECTION": {"data":[...],"last_page":N}}
            y también la estructura plana: {"data":[...],"last_page":N}.
            """
            if isinstance(resp_json, list):
                return resp_json, 1
            if not isinstance(resp_json, dict):
                return [], 1
            # Buscar la clave colección: valor dict con "data" (lista) y "last_page"
            for k, v in resp_json.items():
                if k == "pagination":
                    continue
                if isinstance(v, dict) and isinstance(v.get("data"), list):
                    return v["data"], v.get("last_page", 1)
            # Fallback: "data" en la raíz
            if isinstance(resp_json.get("data"), list):
                return resp_json["data"], resp_json.get("last_page", 1)
            return [], 1

        def _fetch_page(endpoint: str, page: int, extra_params: dict | None = None) -> list:
            """Descarga una página de un endpoint."""
            params = {"page": page}
            if extra_params:
                params.update(extra_params)
            try:
                r = self._cne_get(endpoint, params)
                if not r.ok:
                    return []
                items, _ = _parse_page(r.json())
                return items
            except Exception:
                return []

        def _consultar_dictamen(mun_id: str, dpto_id: str) -> list:
            """
            Consulta dictamen usando los endpoints de filtro del CNE.
            - Si hay mun_id: usa municipioFilter (resultado directo, ~10 items)
            - Si solo hay dpto_id: usa departamentosFilter (pagina ~160 págs del depto)
            - Sin filtros: pagina todo (24K, fallback)
            """
            import time
            t0 = time.time()

            if mun_id:
                try:
                    r = self._cne_get("/dictament-de-auditoria/municipioFilter",
                                      {"id_municipio": mun_id, "dictamen_auditor": "true"})
                    if r.ok:
                        items, _ = _parse_page(r.json())
                        elapsed = f"{time.time()-t0:.1f}"
                        print(f"[Gestion] dictamen municipioFilter dpto={dpto_id} mun={mun_id} "
                              f"{len(items)} items, {elapsed}s")
                        return items
                except Exception as e:
                    print(f"[Gestion] dictamen error: {e}")

            if dpto_id:
                try:
                    r1 = self._cne_get("/dictament-de-auditoria/departamentosFilter",
                                       {"id_departamento": dpto_id, "page": 1})
                    if r1.ok:
                        first_items, last_p = _parse_page(r1.json())
                        print(f"[Gestion] dictamen departamentosFilter dpto={dpto_id} "
                              f"{last_p} páginas detectadas, descargando en paralelo...")
                        all_items = list(first_items)
                        batch_size = 10
                        for batch_start in range(2, last_p + 1, batch_size):
                            batch_end = min(batch_start + batch_size, last_p + 1)
                            pages = range(batch_start, batch_end)
                            with ThreadPoolExecutor(max_workers=batch_size) as pool:
                                futs = {pool.submit(_fetch_page,
                                                    "/dictament-de-auditoria/departamentosFilter",
                                                    pg, {"id_departamento": dpto_id}): pg
                                        for pg in pages}
                                for f in as_completed(futs):
                                    all_items.extend(f.result())
                        elapsed = f"{time.time()-t0:.1f}"
                        print(f"[Gestion] dictamen departamentosFilter dpto={dpto_id} "
                              f"{len(all_items)} items, {elapsed}s")
                        return all_items
                except Exception as e:
                    print(f"[Gestion] dictamen error: {e}")

            # Fallback: paginar todo
            return _paginar_modulo("dictament-de-auditoria")

        def _paginar_modulo(modulo: str, extra_params: dict | None = None) -> list:
            """Descarga TODAS las páginas de un módulo y las guarda en caché (30 min)."""
            import time
            cache_key = modulo + str(extra_params)
            with _cache_lock:
                cache_entry = _gestion_cache.get(cache_key)
                if cache_entry and (time.time() - cache_entry["ts"]) < 1800:
                    items = cache_entry["items"]
                    print(f"[Gestion] {modulo}: usando caché ({len(items)} items)")
                    return items

            r1 = self._cne_get(f"/{modulo}", {**(extra_params or {}), "page": 1})
            if not r1.ok:
                return []
            first_items, last_p = _parse_page(r1.json())
            print(f"[Gestion] {modulo}: {last_p} páginas detectadas, descargando en paralelo...")
            all_items = list(first_items)
            batch_size = 20
            for batch_start in range(2, last_p + 1, batch_size):
                batch_end = min(batch_start + batch_size, last_p + 1)
                pages = range(batch_start, batch_end)
                with ThreadPoolExecutor(max_workers=batch_size) as batch_pool:
                    page_results = {batch_pool.submit(_fetch_page, f"/{modulo}", pg, extra_params): pg
                                    for pg in pages}
                    for f in as_completed(page_results):
                        pg_items = f.result()
                        all_items.extend(pg_items)

            with _cache_lock:
                _gestion_cache[cache_key] = {"ts": time.time(), "items": all_items}
            return all_items

        try:
            # Resolver IDs de depto/municipio
            dpto_id = mun_id = ""
            try:
                r_dptos = self._cne_get("/departamento")
                if r_dptos.ok:
                    dptos, _ = _parse_page(r_dptos.json())
                    for d in dptos:
                        if not isinstance(d, dict):
                            continue
                        nom = (d.get("nombre") or d.get("departamentoNombre") or
                               d.get("nom_departamento") or "")
                        if _n(nom) == f_dpto:
                            dpto_id = str(d.get("id", ""))
                            break
            except Exception:
                pass

            if dpto_id and f_mun:
                try:
                    r_muns = self._cne_get("/municipio", {"id_departamento": dpto_id})
                    if r_muns.ok:
                        muns, _ = _parse_page(r_muns.json())
                        for m in muns:
                            if not isinstance(m, dict):
                                continue
                            nom = (m.get("nombre") or m.get("munipioNombre") or
                                   m.get("municipioNombre") or m.get("nom_ciudad") or "")
                            if _n(nom) == f_mun:
                                mun_id = str(m.get("id", ""))
                                break
                except Exception:
                    pass

            print(f"[Gestion] IDs resueltos: dpto={dpto_id} ('{dpto_raw}') / "
                  f"mun={mun_id} ('{mun_raw}')")

            # Dictamen
            dict_items = _consultar_dictamen(mun_id, dpto_id)

            # Coalición
            try:
                r_coal = self._cne_get("/coalicionPolitica")
                if r_coal.ok:
                    coal_items, _ = _parse_page(r_coal.json())
                else:
                    coal_items = []
                print(f"[Gestion] coalicion: {len(coal_items)} items "
                      f"(búsqueda: {f_dpto}|{f_mun})")
            except Exception as e:
                print(f"[Gestion] Error coalicion: {e}")
                coal_items = []

            # Contador, Gerente, Auditor (con caché)
            all_items = {
                "contador": _paginar_modulo("contador"),
                "gerente":  _paginar_modulo("gerente"),
                "auditor":  _paginar_modulo("dictament-de-auditoria"),
            }

            # _es_dpto: filtrar por depto cuando no hay municipio
            _es_dpto = bool(dpto_id and not mun_id)

            def _filtrar(items: list, nom_fields: list) -> list:
                result = []
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    # Filtro corporación
                    corp_val = it.get("corporacionNombre", "")
                    if f_corp and f_corp not in _n(corp_val) and "ALCALDR" not in corp_val.upper():
                        if "GOBERN" not in corp_val.upper() or "GOBERN" not in f_corp:
                            pass
                    # Filtro partido
                    org_names = [it.get(fn, "") for fn in nom_fields]
                    partido_match = (not f_partido or
                                     any(f_partido in _n(n) for n in org_names if n))
                    # Filtro depto/mun
                    nom_d = it.get("departamentoNombre") or it.get("nom_departamento", "")
                    nom_m = it.get("municipioNombre") or it.get("nom_ciudad", "")
                    dpto_match = (not f_dpto or _n(nom_d) == f_dpto)
                    mun_match  = (not f_mun  or _n(nom_m) == f_mun)
                    if partido_match and dpto_match and mun_match:
                        result.append(it)
                return result

            nom_fields_dict = ["agrupacionPoliticaNombre", "grupoSignificativoNombre",
                               "coalicionPoliticaNombre", "organizacion"]
            nom_fields_org  = ["nombre_org1", "nombre_org2", "nombre_org3", "nombre_coalicion"]

            filtered = {
                "dictamen":  _filtrar(dict_items, nom_fields_dict),
                "coalicion": _filtrar(coal_items, ["agrupacionPoliticaNombre", "nombre_coalicion"]),
                "contador":  _filtrar(all_items["contador"], nom_fields_org),
                "gerente":   _filtrar(all_items["gerente"],  nom_fields_org),
                "auditor":   _filtrar(all_items["auditor"],  nom_fields_dict),
            }

            import time
            elapsed_total = f"{time.time()-t_start:.1f}"
            sizes = {k: len(v) for k, v in filtered.items()}
            print(f"[Gestion Filtrado] {dpto_raw}|{mun_raw}|{f_corp}|{f_partido} "
                  f"→ {sizes} total | {elapsed_total}s")

            self._send_json(filtered)

        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            print(f"[Gestion ERROR] {tb}")
            self._send_error_json(str(e))

    # ── /api/cne_dictamen_filtrado ────────────────────────────────────────────

    def _handle_cne_dictamen_filtrado(self):
        """
        Endpoint dedicado para dictamen de auditoría.
        GET /api/cne_dictamen_filtrado?dpto=HUILA&mun=TESALIA
        Devuelve {dictamen:[...]}
        Usa municipioFilter/departamentosFilter del CNE.
        """
        if _cne_session is None:
            return self._send_error_json("Sin sesion CNE. Use /api/cne_login o ejecute indexar_cuentas_claras.py", 401)

        qs    = self._qs()
        dpto  = _norm_folder(qs.get("dpto", ""))
        mun   = _norm_folder(qs.get("mun", ""))

        def _n(s: str) -> str:
            return _norm_folder(s)

        def _parse_cne_page(resp_json) -> tuple[list, int]:
            if isinstance(resp_json, list):
                return resp_json, 1
            if not isinstance(resp_json, dict):
                return [], 1
            for k, v in resp_json.items():
                if k == "pagination":
                    continue
                if isinstance(v, dict) and isinstance(v.get("data"), list):
                    return v["data"], v.get("last_page", 1)
            if isinstance(resp_json.get("data"), list):
                return resp_json["data"], resp_json.get("last_page", 1)
            return [], 1

        try:
            # Resolver IDs
            dpto_id = mun_id = ""
            r_dptos = self._cne_get("/departamento")
            if r_dptos.ok:
                dptos, _ = _parse_cne_page(r_dptos.json())
                for d in dptos:
                    if not isinstance(d, dict):
                        continue
                    nom = d.get("nombre") or d.get("departamentoNombre") or d.get("nom_departamento") or ""
                    if _n(nom) == dpto:
                        dpto_id = str(d.get("id", ""))
                        break

            if dpto_id and mun:
                r_muns = self._cne_get("/municipio", {"id_departamento": dpto_id})
                if r_muns.ok:
                    muns, _ = _parse_cne_page(r_muns.json())
                    for m in muns:
                        if not isinstance(m, dict):
                            continue
                        nom = m.get("nombre") or m.get("munipioNombre") or m.get("municipioNombre") or m.get("nom_ciudad") or ""
                        if _n(nom) == mun:
                            mun_id = str(m.get("id", ""))
                            break

            # Intentar municipioFilter
            all_items = []
            if mun_id:
                try:
                    r = self._cne_get("/dictament-de-auditoria/municipioFilter",
                                      {"id_municipio": mun_id, "dictamen_auditor": "true"})
                    if r.ok:
                        all_items, _ = _parse_cne_page(r.json())
                        print(f"[Dictamen] municipioFilter dpto={dpto_id} mun={mun_id} "
                              f"{len(all_items)} items")
                except Exception as e:
                    print(f"[Dictamen] municipioFilter error: {e}")

            # Intentar departamentosFilter
            if not all_items and dpto_id:
                try:
                    r1 = self._cne_get("/dictament-de-auditoria/departamentosFilter",
                                       {"id_departamento": dpto_id, "page": 1})
                    if r1.ok:
                        items1, last_p = _parse_cne_page(r1.json())
                        all_items = list(items1)
                        print(f"[Dictamen] departamentosFilter dpto={dpto_id} {last_p} págs")
                        for pg in range(2, last_p + 1):
                            r_pg = self._cne_get("/dictament-de-auditoria/departamentosFilter",
                                                 {"id_departamento": dpto_id, "page": pg})
                            if r_pg.ok:
                                items_pg, _ = _parse_cne_page(r_pg.json())
                                all_items.extend(items_pg)
                except Exception as e:
                    print(f"[Dictamen] departamentosFilter error: {e}")

            # Filtrar por municipio si vino mun
            if mun and all_items:
                filtered = [it for it in all_items
                            if isinstance(it, dict) and
                            _n(it.get("municipioNombre") or it.get("nom_ciudad") or "") == mun]
            else:
                filtered = all_items

            total_orig = len(all_items)
            print(f"[Dictamen Filtrado] {len(filtered)} de {total_orig}")
            self._send_json({"dictamen": filtered})

        except Exception as e:
            self._send_error_json(str(e))

    # ── /api/cne/<endpoint> (proxy) ───────────────────────────────────────────

    def _handle_cne_proxy(self):
        """
        Proxy a Cuentas Claras del CNE.
        /api/cne/<endpoint>?params → CNE_API/<endpoint>?params
        Devuelve JSON o PDF segun lo que devuelva CNE.
        """
        if _cne_session is None:
            body = b"Sin sesion CNE. Use /api/cne_login o ejecute indexar_cuentas_claras.py"
            self.send_response(401)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        parsed   = urlparse(self.path)
        endpoint = parsed.path[len("/api/cne"):]
        cne_url  = CNE_API + endpoint + ("?" + parsed.query if parsed.query else "")

        try:
            xsrf = requests.utils.unquote(_cne_session.cookies.get("XSRF-TOKEN", ""))
            # Detectar si es descarga de archivo (PDF/Excel) o llamada JSON
            is_file = (
                "/storage/" in endpoint or
                "imprimir" in endpoint.lower() or
                "descargar" in endpoint.lower() or
                "download" in endpoint.lower() or
                "libroContable" in endpoint or
                "descargar-consolidado" in endpoint or
                endpoint.lower().endswith(".pdf") or
                endpoint.lower().endswith(".xlsx")
            )
            proxy_headers = {
                "Accept": "application/pdf,application/octet-stream,*/*" if is_file else "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "X-XSRF-TOKEN": xsrf,
                "Referer": CNE_API + "/",
                "Accept-Language": "es-CO,es;q=0.9",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            }
            resp = _cne_session.get(cne_url, headers=proxy_headers, timeout=60, stream=True)
            if resp.status_code == 401:
                # Re-login fallido
                body = b"Re-login fallido"
                self.send_response(401)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            if not resp.ok:
                body = f"CNE respondio HTTP {resp.status_code}".encode()
                self.send_response(resp.status_code)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            content = resp.content
            ct = resp.headers.get("Content-Type", "application/json")
            self.send_response(200)
            self.send_header("Content-Type", ct)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            if "application/pdf" in ct or "octet" in ct:
                self.send_header("Content-Disposition", "inline")
            self.end_headers()
            self.wfile.write(content)

        except Exception as e:
            print(f"Error proxy CNE: {e}")
            self._send_error_json(str(e))

    # ── /api/lista_respuestas ─────────────────────────────────────────────────

    def _handle_lista_respuestas(self):
        qs         = self._qs()
        cargo      = _norm_folder(qs.get("cargo", ""))
        dpto       = _norm_folder(qs.get("dpto", ""))
        mun        = _norm_folder(qs.get("mun", ""))
        partido    = _norm_folder(qs.get("partido", ""))
        base       = os.path.join("data", "respuestas", cargo, dpto, mun, partido)
        rel_prefix = os.path.join("data", "respuestas", cargo, dpto, mun, partido)
        try:
            files = sorted(
                f for f in os.listdir(base) if os.path.isfile(os.path.join(base, f))
            )
            self._send_json({"files": [os.path.join(rel_prefix, f) for f in files]})
        except FileNotFoundError:
            self._send_json({"files": []})
        except Exception as e:
            self._send_error_json(str(e))

    # ── /api/cc_stats  y  /api/cc_candidatos ─────────────────────────────────

    def _handle_cc_stats(self):
        """Sirve data/cc_stats_analisis.json enriquecido con totales financieros de cc_financiero.json."""
        portal_dir = self.server.portal_dir if hasattr(self.server, "portal_dir") else os.getcwd()
        stats_path = os.path.join(portal_dir, "data", "cc_stats_analisis.json")
        fin_path   = os.path.join(portal_dir, "data", "cc_financiero.json")
        if not os.path.exists(stats_path):
            return self._send_json({"error": "No indexado aún. Ejecute indexar_candidatos_cc.py"})
        try:
            with open(stats_path, encoding="utf-8") as f:
                data = json.load(f)
            # Calcular totales reales de ingresos y gastos desde cc_financiero
            if os.path.exists(fin_path):
                with open(fin_path, encoding="utf-8") as f:
                    cc_fin = json.load(f)
                total_ingresos = sum((v.get("total_ingreso") or 0) for v in cc_fin.values())
                total_gastos   = sum((v.get("total_gasto")   or 0) for v in cc_fin.values())
                reportaron     = sum(1 for v in cc_fin.values() if v.get("envio_informe"))
                data["total_ingresos"] = round(total_ingresos, 2)
                data["total_gastos"]   = round(total_gastos,   2)
                data["total_reportaron"] = reportaron
            # Total pagos ET2023 desde pagostres.db
            db_path = os.path.join(portal_dir, "data", "pagostres.db")
            if os.path.exists(db_path):
                import sqlite3 as _sq
                con = _sq.connect(db_path)
                row = con.execute("SELECT SUM(VALOR_NETO_GIRADO) FROM pagos_elecciones").fetchone()
                con.close()
                data["total_pagos_et2023"] = round(row[0] or 0, 2)
            self._send_json(data)
        except Exception as e:
            self._send_error_json(str(e))

    def _handle_cc_candidatos(self):
        """
        Busca candidatos indexados.
        QS: dpto=, mun=, partido=, corp_id=, sin_radicacion=1, page=, per_page=
        Retorna: {total, page, per_page, candidatos:[...]}
        """
        qs       = self._qs()
        f_dpto   = qs.get("dpto", "").upper().strip()
        f_mun    = qs.get("mun", "").upper().strip()
        f_partido= qs.get("partido", "").upper().strip()
        f_corp   = qs.get("corp_id", "")
        f_sinrad = qs.get("sin_radicacion", "") == "1"
        f_q      = qs.get("q", "").upper().strip()
        page     = max(1, int(qs.get("page", 1)))
        per_page = min(500, max(10, int(qs.get("per_page", 100))))

        # Cargar cachés (solo la primera vez)
        portal_dir = self.server.portal_dir if hasattr(self.server, "portal_dir") else "."
        _load_fin_cache(portal_dir)
        _load_votos_cache(portal_dir)

        cc_dir = os.path.join("data", "candidatos_cc")
        if not os.path.isdir(cc_dir):
            return self._send_json({"total": 0, "page": 1, "per_page": per_page, "candidatos": []})

        resultados = []
        def _norm_folder(s):
            import re
            return re.sub(r'[^A-Z0-9]', '', s.upper())

        try:
            dptos = sorted(os.listdir(cc_dir))
            for dpto_folder in dptos:
                if f_dpto and _norm_folder(f_dpto) not in _norm_folder(dpto_folder):
                    continue
                dpto_path = os.path.join(cc_dir, dpto_folder)
                if not os.path.isdir(dpto_path):
                    continue
                for mun_folder in sorted(os.listdir(dpto_path)):
                    if f_mun and _norm_folder(f_mun) not in _norm_folder(mun_folder):
                        continue
                    mun_path = os.path.join(dpto_path, mun_folder)
                    if not os.path.isdir(mun_path):
                        continue
                    for fname in sorted(os.listdir(mun_path)):
                        if not fname.endswith(".json"):
                            continue
                        try:
                            with open(os.path.join(mun_path, fname), encoding="utf-8") as fh:
                                c = json.load(fh)
                        except Exception:
                            continue
                        if f_partido and f_partido not in (c.get("org") or "").upper():
                            continue
                        if f_corp and str(c.get("corp_id", "")) != f_corp:
                            continue
                        if f_sinrad and len(c.get("envios") or []) > 0:
                            continue
                        if f_q:
                            blob = " ".join([
                                str(c.get("nombre", "")),
                                str(c.get("cedula", "")),
                                str(c.get("org", "")),
                            ]).upper()
                            if f_q not in blob:
                                continue
                        # Resumen liviano
                        cons = c.get("consolidado") or {}
                        def _v(d, *ks):
                            for k in ks:
                                v = d.get(k)
                                if v is not None:
                                    try: return float(str(v).replace(",","").replace("$","").strip() or 0)
                                    except: pass
                            return 0.0
                        envios = c.get("envios") or []
                        fecha_rad = ""
                        if envios and isinstance(envios[0], dict):
                            fecha_rad = (envios[0].get("fecha_final") or "")[:10]
                        # Buscar datos financieros del candidato
                        cid = c.get("cand_id")
                        ingreso = 0.0
                        gasto   = 0.0
                        if cid and _fin_idx and _fin_data:
                            fi = _fin_idx.get(cid, {})
                            fkey = f"{fi.get('tipo_id')}|{fi.get('org_id')}|{c.get('corp_id')}|{fi.get('circ_id')}|{fi.get('dpto_id')}|{fi.get('mun_id')}"
                            fv = _fin_data.get(fkey, {})
                            if fv:
                                ingreso = float(fv.get("total_ingreso") or 0)
                                gasto   = float(fv.get("total_gasto")   or 0)
                        votos = _get_votos(
                            c.get("nombre",""),
                            c.get("mun",""),
                            c.get("corp","")
                        ) if _votos_loaded else 0
                        resultados.append({
                            "cand_id":   cid,
                            "nombre":    c.get("nombre"),
                            "cedula":    c.get("cedula"),
                            "org":       c.get("org"),
                            "partido":   c.get("org"),
                            "corp":      c.get("corp"),
                            "corp_id":   c.get("corp_id"),
                            "dpto":      c.get("dpto"),
                            "mun":       c.get("mun"),
                            "radico":    len(envios) > 0,
                            "fecha_rad": fecha_rad,
                            "ingreso":   ingreso,
                            "gasto":     gasto,
                            "votos":     votos,
                        })
        except Exception as e:
            return self._send_error_json(str(e))

        total = len(resultados)
        start = (page - 1) * per_page
        self._send_json({
            "total":      total,
            "page":       page,
            "per_page":   per_page,
            "candidatos": resultados[start: start + per_page],
        })

    def _handle_cc_municipios(self):
        """Retorna lista de municipios para un departamento dado."""
        dpto = self._qs().get("dpto", "").strip()
        cc_dir = os.path.join("data", "candidatos_cc")
        muns = []
        if dpto:
            import re as _re
            safe = lambda s: _re.sub(r'[^A-Za-z0-9_\-]', '_', str(s))[:40]
            dpto_path = os.path.join(cc_dir, safe(dpto))
            if os.path.isdir(dpto_path):
                muns = sorted(os.listdir(dpto_path))
        else:
            if os.path.isdir(cc_dir):
                for d in sorted(os.listdir(cc_dir)):
                    dp = os.path.join(cc_dir, d)
                    if os.path.isdir(dp):
                        muns += sorted(os.listdir(dp))
        self._send_json({"municipios": muns})

    def _handle_cc_dpto_detalle(self):
        """
        Detalle financiero completo de un departamento.
        GET /api/cc_dpto_detalle?dpto=ANTIOQUIA
        Retorna: totales, por_municipio, por_partido, top_org (más gastos), bottom_org (menos gastos)
        """
        dpto_filtro = self._qs().get("dpto", "").strip().upper()
        if not dpto_filtro:
            return self._send_error_json("Parámetro dpto requerido", 400)

        fin_path   = os.path.join("data", "cc_financiero.json")
        idx_path   = os.path.join("data", "cuentas_claras_index.json")
        stats_path = os.path.join("data", "cc_stats_analisis.json")

        if not os.path.exists(fin_path) or not os.path.exists(idx_path):
            return self._send_error_json("Datos financieros no disponibles aún", 404)

        with open(fin_path, encoding="utf-8") as f:
            fin = json.load(f)
        with open(idx_path, encoding="utf-8") as f:
            idx = json.load(f)

        # Buscar departamento en índice (tolerante a tildes)
        import unicodedata as _ud
        def _norm(s):
            s = _ud.normalize("NFD", str(s or ""))
            s = "".join(c for c in s if _ud.category(c) != "Mn")
            return s.upper().strip()

        dpto_data = None
        dpto_nom  = dpto_filtro
        for k, v in idx.items():
            if _norm(k) == _norm(dpto_filtro):
                dpto_data = v
                dpto_nom  = k
                break
        if not dpto_data:
            return self._send_error_json(f"Departamento '{dpto_filtro}' no encontrado", 404)

        dpto_id = dpto_data.get("id", 0)

        # Construir lookup key → info
        key_info = {}
        for mun_nom, mun_data in dpto_data.get("municipios", {}).items():
            mun_id = mun_data.get("id", 0)
            for c in mun_data.get("candidatos", []):
                key = f"{c.get('tipo_id')}|{c.get('org_id')}|{c.get('corp_id')}|{c.get('circ_id')}|{dpto_id}|{mun_id}"
                key_info[key] = {
                    "mun":    mun_nom,
                    "org":    c.get("org", ""),
                    "corp":   c.get("corp", ""),
                    "cand":   c.get("nombre", ""),
                    "org_id": c.get("org_id"),
                }

        # Agregar datos financieros
        por_mun     = {}
        por_partido = {}
        por_org     = {}   # org_id → {org, mun, corp, ingreso, gasto}

        total_ingreso = 0.0
        total_gasto   = 0.0
        con_datos     = 0

        for key, info in key_info.items():
            v = fin.get(key)
            if not v:
                continue
            ing  = float(v.get("total_ingreso") or 0)
            gast = float(v.get("total_gasto")   or 0)
            if ing == 0 and gast == 0:
                continue

            con_datos     += 1
            total_ingreso += ing
            total_gasto   += gast
            mun           = info["mun"]
            org           = info["org"]

            if mun not in por_mun:
                por_mun[mun] = {"ingreso": 0.0, "gasto": 0.0}
            por_mun[mun]["ingreso"] += ing
            por_mun[mun]["gasto"]   += gast

            if org not in por_partido:
                por_partido[org] = {"ingreso": 0.0, "gasto": 0.0, "corp": info["corp"]}
            por_partido[org]["ingreso"] += ing
            por_partido[org]["gasto"]   += gast

            okey = f"{info['org_id']}|{mun}|{info['corp']}"
            if okey not in por_org:
                por_org[okey] = {"org": org, "mun": mun, "corp": info["corp"],
                                  "ingreso": 0.0, "gasto": 0.0}
            por_org[okey]["ingreso"] += ing
            por_org[okey]["gasto"]   += gast

        # Stats de candidatos (radicación)
        cand_stats = {"candidatos": 0, "radicaron": 0}
        if os.path.exists(stats_path):
            with open(stats_path, encoding="utf-8") as f:
                st = json.load(f)
            dp = st.get("por_dpto", {}).get(dpto_nom, {})
            cand_stats = {"candidatos": dp.get("candidatos", 0),
                          "radicaron":  dp.get("radicaron", 0)}

        # Ordenar
        top_partidos = sorted(por_partido.items(), key=lambda x: x[1]["gasto"], reverse=True)
        top_mun      = sorted(por_mun.items(),     key=lambda x: x[1]["gasto"], reverse=True)
        top_org_list = sorted(por_org.values(),    key=lambda x: x["gasto"],    reverse=True)

        self._send_json({
            "dpto":          dpto_nom,
            "total_ingreso": total_ingreso,
            "total_gasto":   total_gasto,
            "con_datos":     con_datos,
            "candidatos":    cand_stats["candidatos"],
            "radicaron":     cand_stats["radicaron"],
            "por_municipio": [{"mun": k, **v} for k, v in top_mun],
            "por_partido":   [{"partido": k, **v} for k, v in top_partidos],
            "top_gastos":    top_org_list[:10],
            "menos_gastos":  [x for x in top_org_list if x["gasto"] > 0][-10:][::-1],
        })

    # ── /api/cc_exportar_gerentes ─────────────────────────────────────────────
    def _handle_cc_exportar_gerentes(self):
        """Descarga gerentes y contadores via sesión CNE y guarda en cc_gerentes.json."""
        if _cne_session is None:
            return self._send_error_json("Sin sesión CNE", 401)

        import time as _time

        def _paginar(modulo):
            items = []
            page = 1
            while True:
                try:
                    r = self._cne_get(f"/{modulo}", {"page": page})
                    if not r.ok:
                        break
                    raw = r.json()
                    # Extraer data y last_page
                    data, last_page = [], 1
                    if isinstance(raw, list):
                        data, last_page = raw, 1
                    elif isinstance(raw, dict):
                        for k, v in raw.items():
                            if k == "pagination":
                                continue
                            if isinstance(v, dict) and isinstance(v.get("data"), list):
                                data = v["data"]
                                last_page = v.get("last_page", 1)
                                break
                        if not data and isinstance(raw.get("data"), list):
                            data = raw["data"]
                            last_page = raw.get("last_page", 1)
                    items.extend(data)
                    if page >= last_page:
                        break
                    page += 1
                except Exception:
                    break
            return items

        gerentes   = _paginar("gerente")
        contadores = _paginar("contador")

        out = {
            "gerentes":   gerentes,
            "contadores": contadores,
            "_ts": _time.strftime("%Y-%m-%d %H:%M"),
        }
        out_path = os.path.join("data", "cc_gerentes.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

        self._send_json({
            "ok": True,
            "gerentes":   len(gerentes),
            "contadores": len(contadores),
            "archivo":    out_path,
        })

    def _handle_cc_gerentes(self):
        """Sirve cc_gerentes.json filtrado por dpto y/o mun."""
        qs   = self._qs()
        dpto = qs.get("dpto", "").strip().upper()
        mun  = qs.get("mun",  "").strip().upper()

        path = os.path.join("data", "cc_gerentes.json")
        if not os.path.exists(path):
            return self._send_json({"gerentes": [], "contadores": [], "descargado": False})

        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        import unicodedata as _ud
        def _n(s):
            s = _ud.normalize("NFD", str(s or ""))
            s = "".join(c for c in s if _ud.category(c) != "Mn")
            return re.sub(r"[^A-Z0-9]", "", s.upper())

        def _filtrar(items):
            result = []
            for it in items:
                if not isinstance(it, dict):
                    continue
                nom_d = it.get("departamentoNombre") or it.get("nom_departamento", "")
                nom_m = it.get("municipioNombre") or it.get("nom_ciudad", "")
                if dpto and _n(nom_d) != _n(dpto):
                    continue
                if mun and _n(nom_m) != _n(mun):
                    continue
                result.append(it)
            return result

        self._send_json({
            "gerentes":   _filtrar(data.get("gerentes", [])),
            "contadores": _filtrar(data.get("contadores", [])),
            "descargado": True,
            "_ts":        data.get("_ts", ""),
        })

    # ── /api/cc_gerentes_pdf ──────────────────────────────────────────────────
    def _handle_cc_gerentes_pdf(self):
        """
        Sirve cc_gerentes_pdf.json filtrado por dpto y/o mun.
        GET /api/cc_gerentes_pdf?dpto=ANTIOQUIA&mun=MEDELLIN
        Devuelve lista de {cand_id, nombre, gerente_nombre, gerente_cc,
                           contador_nombre, contador_cc, cuenta, dpto, mun}
        """
        qs   = self._qs()
        dpto = re.sub(r"[^A-Z0-9]", "", (qs.get("dpto", "") or "").upper())
        mun  = re.sub(r"[^A-Z0-9]", "", (qs.get("mun",  "") or "").upper())

        path = os.path.join("data", "cc_gerentes_pdf.json")
        if not os.path.exists(path):
            return self._send_json({"registros": [], "total": 0, "descargado": False})

        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        result = []
        for cand_id, v in data.items():
            if not isinstance(v, dict):
                continue
            rec_dpto = re.sub(r"[^A-Z0-9]", "", (v.get("_dpto") or "").upper())
            rec_mun  = re.sub(r"[^A-Z0-9]", "", (v.get("_mun")  or "").upper())
            if dpto and dpto not in rec_dpto:
                continue
            if mun and mun not in rec_mun:
                continue
            result.append({
                "cand_id":         int(cand_id) if cand_id.isdigit() else cand_id,
                "nombre":          v.get("_nombre", ""),
                "dpto":            v.get("_dpto", ""),
                "mun":             v.get("_mun", ""),
                "gerente_nombre":  v.get("gerente_nombre", ""),
                "gerente_cc":      v.get("gerente_cc", ""),
                "contador_nombre": v.get("contador_nombre", ""),
                "contador_cc":     v.get("contador_cc", ""),
                "cuenta":          v.get("cuenta", ""),
            })

        self._send_json({"registros": result, "total": len(result), "descargado": True})

    # ── /api/cc_buscar ────────────────────────────────────────────────────────
    def _handle_cc_buscar(self):
        """
        Búsqueda global: candidatos, gerentes, contadores, partidos.
        GET /api/cc_buscar?q=TEXTO&limit=50
        Usa caché en memoria para respuesta rápida.
        """
        qs    = self._qs()
        q_raw = (qs.get("q") or "").strip()
        limit = int(qs.get("limit") or 100)
        if not q_raw:
            return self._send_json({"resultados": [], "total": 0})

        portal_dir = self.server.portal_dir if hasattr(self.server, "portal_dir") else os.getcwd()
        _load_buscar_cache(portal_dir)

        q = _norm_search(q_raw)

        resultados = []
        seen = set()
        for i, norm_str in enumerate(_buscar_norm):
            if q not in norm_str:
                continue
            c   = _buscar_idx[i]
            cid = c.get("cand_id")
            if not cid or cid in seen:
                continue
            seen.add(cid)
            ger  = _ger_pdf_cache.get(str(cid), {})
            fkey = f"{c.get('tipo_id')}|{c.get('org_id')}|{c.get('corp_id')}|{c.get('circ_id')}|{c.get('dpto_id')}|{c.get('mun_id')}"
            fin  = _fin_data.get(fkey, {})
            resultados.append({
                "cand_id":         cid,
                "nombre":          c.get("nombre",""),
                "cedula":          c.get("cedula",""),
                "partido":         c.get("org",""),
                "corp":            c.get("corp",""),
                "dpto":            c.get("dpto",""),
                "mun":             c.get("mun",""),
                "ingreso":         float(fin.get("total_ingreso") or 0),
                "gasto":           float(fin.get("total_gasto")   or 0),
                "votos":           _get_votos(c.get("nombre",""), c.get("mun",""), c.get("corp","")),
                "gerente_nombre":  ger.get("gerente_nombre",""),
                "gerente_cc":      ger.get("gerente_cc",""),
                "contador_nombre": ger.get("contador_nombre",""),
                "contador_cc":     ger.get("contador_cc",""),
            })
            if len(resultados) >= limit:
                break

        self._send_json({"resultados": resultados, "total": len(resultados), "limite": limit})

    # ── /api/cc_partido ───────────────────────────────────────────────────────
    def _handle_cc_partido(self):
        """
        Todos los candidatos de un partido en el país.
        GET /api/cc_partido?partido=LIBERAL&limit=500
        """
        qs      = self._qs()
        partido = (qs.get("partido") or "").strip()
        dpto    = (qs.get("dpto")    or "").strip().upper()
        limit   = int(qs.get("limit") or 1000)
        if not partido:
            return self._send_json({"candidatos": [], "total": 0})

        portal_dir = self.server.portal_dir if hasattr(self.server, "portal_dir") else os.getcwd()
        _load_buscar_cache(portal_dir)
        _load_fin_cache(portal_dir)
        _load_votos_cache(portal_dir)

        def _norm(s):
            s = unicodedata.normalize("NFD", str(s or "").upper())
            return "".join(c for c in s if unicodedata.category(c) != "Mn")

        q_partido = _norm(partido)

        candidatos = []
        total_ing  = 0.0
        total_gas  = 0.0
        por_corp   = {}
        por_dpto   = {}

        for c in _buscar_idx:
            org_norm = _norm(c.get("org",""))
            # Coincidencia exacta primero, si no, busca como substring
            if org_norm != q_partido and q_partido not in org_norm:
                continue
            if dpto and _norm(dpto) not in _norm(c.get("dpto","")):
                continue
            cid      = c.get("cand_id")
            corp     = c.get("corp","")
            dpto_nom = c.get("dpto","")
            mun_nom  = c.get("mun","")
            fkey = f"{c.get('tipo_id')}|{c.get('org_id')}|{c.get('corp_id')}|{c.get('circ_id')}|{c.get('dpto_id')}|{c.get('mun_id')}"
            fin  = _fin_data.get(fkey, {})
            ing  = float(fin.get("total_ingreso") or 0)
            gas  = float(fin.get("total_gasto")   or 0)
            rad  = bool(fin.get("reporta") or fin.get("envio_informe"))
            ger  = _ger_pdf_cache.get(str(cid), {})

            total_ing += ing
            total_gas += gas
            por_corp[corp] = por_corp.get(corp, 0) + 1
            por_dpto[dpto_nom] = por_dpto.get(dpto_nom, 0) + 1

            if len(candidatos) < limit:
                candidatos.append({
                    "cand_id":  cid,
                    "nombre":   c.get("nombre",""),
                    "cedula":   c.get("cedula",""),
                    "corp":     corp,
                    "dpto":     dpto_nom,
                    "mun":      mun_nom,
                    "ingreso":  ing,
                    "gasto":    gas,
                    "radico":   rad,
                    "votos":    _get_votos(c.get("nombre",""), mun_nom, corp),
                    "gerente_nombre":  ger.get("gerente_nombre",""),
                    "contador_nombre": ger.get("contador_nombre",""),
                })

        self._send_json({
            "partido":     partido,
            "candidatos":  candidatos,
            "total":       sum(por_corp.values()),
            "total_ingreso": total_ing,
            "total_gasto":   total_gas,
            "por_corp":    por_corp,
            "por_dpto":    por_dpto,
        })

    # ── /api/cc_liquidacion_partidos ─────────────────────────────────────────
    def _handle_cc_liquidacion_partidos(self):
        """
        Resumen de liquidación agrupado por partido + corporación.
        GET /api/cc_liquidacion_partidos?dpto=&corp=&q=
        Devuelve una fila por (partido, corp) con votos/gastos/liquidación/neto agregados.
        """
        qs     = self._qs()
        dpto_f = (qs.get("dpto") or "").strip().upper()
        corp_f = (qs.get("corp") or "").strip().upper()
        q_f    = _norm_search((qs.get("q") or "").strip())

        portal_dir = self.server.portal_dir if hasattr(self.server, "portal_dir") else os.getcwd()
        _load_buscar_cache(portal_dir)
        _load_fin_cache(portal_dir)
        _load_votos_cache(portal_dir)
        _load_repos_cache(portal_dir)

        def _norm(s):
            s = unicodedata.normalize("NFD", str(s or "").upper())
            return "".join(c for c in s if unicodedata.category(c) != "Mn")

        TARIFA = {"ALCALDIA":2766,"ALCALDÍA":2766,"CONCEJO":2766,"JAL":2766,
                  "ASAMBLEA":4590,"GOBERNACION":4590,"GOBERNACIÓN":4590}
        # Solo corporaciones territoriales 2023 (index usa mayúsculas sin tilde)
        CORPS_TERR = {"ALCALDIA", "CONCEJO", "ASAMBLEA", "GOBERNACION", "JAL"}

        # key: (partido, corp, dpto) → acumuladores
        grupos = {}

        for c in _buscar_idx:
            org      = c.get("org", "") or ""
            corp     = c.get("corp", "") or ""
            dpto_nom = c.get("dpto", "") or ""
            mun_nom  = c.get("mun", "")  or ""

            if corp not in CORPS_TERR:
                continue
            if dpto_f and _norm(dpto_f) not in _norm(dpto_nom):
                continue
            if corp_f and _norm(corp_f) not in _norm(corp):
                continue
            if q_f and q_f not in _norm(org):
                continue

            fkey = f"{c.get('tipo_id')}|{c.get('org_id')}|{c.get('corp_id')}|{c.get('circ_id')}|{c.get('dpto_id')}|{c.get('mun_id')}"
            fin  = _fin_data.get(fkey, {})
            ing  = float(fin.get("total_ingreso") or 0)
            gas  = float(fin.get("total_gasto")   or 0)
            rad  = bool(fin.get("reporta") or fin.get("envio_informe"))
            vot  = _get_votos(c.get("nombre",""), mun_nom, corp)

            key = (org, corp, dpto_nom)
            if key not in grupos:
                grupos[key] = {"partido": org, "corp": corp, "dpto": dpto_nom,
                               "votos": 0, "gastos": 0.0, "ingresos": 0.0,
                               "candidatos": 0, "radicaron": 0}
            g = grupos[key]
            g["votos"]      += vot
            g["gastos"]     += gas
            g["ingresos"]   += ing
            g["candidatos"] += 1
            if rad:
                g["radicaron"] += 1

        # Calcular liquidación + cruzar con reposicion.db
        CORP_LABEL = {"ALCALDIA":"Alcaldía","CONCEJO":"Concejo","ASAMBLEA":"Asamblea",
                      "GOBERNACION":"Gobernación","JAL":"JAL"}
        resultado = []
        for g in grupos.values():
            corp_up  = g["corp"].upper().replace("Ó","O").replace("Á","A")
            tarifa   = TARIFA.get(corp_up, 2766)
            val_vot  = g["votos"] * tarifa
            liq      = min(g["gastos"], val_vot)

            # Buscar pago real CNE en reposicion.db
            pk_full = f"{_norm(g['partido'])}|{_norm(g['corp'])}|{_norm(g['dpto'])}"
            pk_agg  = f"{_norm(g['partido'])}|{_norm(g['corp'])}"
            rep_full = _repos_full.get(pk_full)
            rep_agg  = _repos_agg.get(pk_agg)
            rep = rep_full or (rep_agg if not dpto_f else None)

            resultado.append({
                "partido":     g["partido"],
                "corp":        CORP_LABEL.get(g["corp"], g["corp"]),
                "dpto":        g["dpto"] or (rep_full["dpto"] if rep_full else "") or (rep_agg.get("dpto","") if rep_agg else ""),
                "candidatos":  g["candidatos"],
                "radicaron":   g["radicaron"],
                "votos":       g["votos"],
                "gastos":      round(g["gastos"]),
                "ingresos":    round(g["ingresos"]),
                "tarifa":      tarifa,
                "valor_votos": round(val_vot),
                "liquidacion": round(liq),
                "auditoria":   round(liq * 0.01),
                "neto":        round(liq * 0.99),
                # Pago real CNE
                "cne_reconocido": round(rep["val_rec"])  if rep else None,
                "cne_neto":       round(rep["val_neto"]) if rep else None,
                "cne_estado":     rep["estado"]          if rep else None,
                "cne_resolucion": rep["resolucion"]       if rep else None,
            })

        # Ordenar por neto desc por defecto
        resultado.sort(key=lambda x: x["neto"], reverse=True)

        self._send_json({"total": len(resultado), "grupos": resultado})

    # ── /api/guardar_liquidacion ──────────────────────────────────────────────

    def _handle_guardar_liquidacion(self):
        """Guarda JSON de liquidación en data/liquidacion/{cargo}/{dpto}/{mun}/{partido}.json"""
        length = int(self.headers.get("Content-Length", 0))
        ct = self.headers.get("Content-Type", "")
        if "multipart" in ct:
            fields, _ = _parse_multipart(self.rfile, ct, length)
            data_str  = fields.get("data", "{}")
        else:
            data_str = self.rfile.read(length).decode("utf-8", errors="replace")

        try:
            payload = json.loads(data_str)
        except json.JSONDecodeError:
            return self._send_error_json("Nombre de archivo inválido", 400)

        cargo   = _norm_folder(payload.get("cargo", ""))
        dpto    = _norm_folder(payload.get("dpto", ""))
        mun     = _norm_folder(payload.get("mun", ""))
        partido = _norm_folder(payload.get("partido", ""))
        tipo    = payload.get("tipo", "LIQUIDACIÓN ÚNICA")

        destino = os.path.join("data", "liquidacion", cargo, dpto, mun)
        os.makedirs(destino, exist_ok=True)
        fname = os.path.join(destino, f"{partido}.json")
        with open(fname, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)

        self._send_json({"ok": True, "file": fname, "tipo": tipo})

    # ── Silenciar log ─────────────────────────────────────────────────────────

    def log_message(self, fmt, *args):
        pass  # Comentar para ver log de accesos

    # ── /api/pagos_partido ────────────────────────────────────────────────────
    def _handle_pagos_partido(self):
        """
        GET /api/pagos_partido?partido=&corp=&dpto=&agrupado=1
        Devuelve pagos de pagostres.db agrupados por partido (+ corp + dpto).
        Con agrupado=1 devuelve solo totales por partido sin desagregar.
        """
        qs        = self._qs()
        partido_f = (qs.get("partido") or "").strip().upper()
        corp_f    = (qs.get("corp")    or "").strip().upper()
        dpto_f    = (qs.get("dpto")    or "").strip().upper()
        agrupado  = (qs.get("agrupado") or "") == "1"

        portal_dir = self.server.portal_dir if hasattr(self.server, "portal_dir") else os.getcwd()
        db_path    = os.path.join(portal_dir, "data", "pagostres.db")
        try:
            import sqlite3 as _sq
            con = _sq.connect(db_path)

            individual = (qs.get("individual") or "") == "1"

            params = []
            where  = " WHERE 1=1"
            if partido_f:
                where += " AND UPPER(PARTIDO_MOVIMIENTO) LIKE ?"
                params.append(f"%{partido_f}%")
            if corp_f:
                where += " AND UPPER(CORPORACION) LIKE ?"
                params.append(f"%{corp_f}%")
            if dpto_f:
                where += " AND UPPER(DEPARTAMENTO) LIKE ?"
                params.append(f"%{dpto_f}%")

            if individual:
                sql = f"""
                    SELECT NO, PARTIDO_MOVIMIENTO, CORPORACION, DEPARTAMENTO, MUNICIPIO,
                           VALOR_RECONOCIDO, VALOR_AUDITORIA, VALOR_NETO_GIRADO,
                           RES_RECONOCIMIENTO, FECHA_RECONOCIMIENTO,
                           RES_PAGO, FECHA_PAGO
                    FROM pagos_elecciones{where}
                    ORDER BY PARTIDO_MOVIMIENTO, CORPORACION, DEPARTAMENTO
                """
                rows = con.execute(sql, params).fetchall()
                con.close()
                result = [{"no": r[0], "partido": r[1], "corp": r[2], "dpto": r[3] or "",
                           "municipio": r[4] or "",
                           "val_reconocido": r[5] or 0, "val_auditoria": r[6] or 0,
                           "val_neto": r[7] or 0,
                           "res_reconocimiento": r[8] or "", "fecha_reconocimiento": r[9] or "",
                           "res_pago": r[10] or "", "fecha_pago": r[11] or ""} for r in rows]
            elif agrupado:
                sql = f"""
                    SELECT PARTIDO_MOVIMIENTO,
                           COUNT(*) as registros,
                           SUM(VALOR_RECONOCIDO) as total_reconocido,
                           SUM(VALOR_AUDITORIA)  as total_auditoria,
                           SUM(VALOR_NETO_GIRADO) as total_neto,
                           GROUP_CONCAT(DISTINCT CORPORACION) as corporaciones,
                           MAX(FECHA_PAGO) as ultima_fecha_pago
                    FROM pagos_elecciones{where}
                    GROUP BY PARTIDO_MOVIMIENTO ORDER BY total_reconocido DESC
                """
                rows = con.execute(sql, params).fetchall()
                con.close()
                result = [{"partido": r[0], "registros": r[1],
                           "val_reconocido": r[2] or 0, "val_auditoria": r[3] or 0,
                           "val_neto": r[4] or 0, "corporaciones": r[5] or "",
                           "ultima_fecha_pago": r[6] or ""} for r in rows]
            else:
                sql = f"""
                    SELECT PARTIDO_MOVIMIENTO, CORPORACION, DEPARTAMENTO,
                           COUNT(*) as registros,
                           SUM(VALOR_RECONOCIDO) as total_reconocido,
                           SUM(VALOR_AUDITORIA)  as total_auditoria,
                           SUM(VALOR_NETO_GIRADO) as total_neto,
                           GROUP_CONCAT(DISTINCT RES_PAGO) as resoluciones,
                           MAX(FECHA_PAGO) as ultima_fecha_pago
                    FROM pagos_elecciones{where}
                    GROUP BY PARTIDO_MOVIMIENTO, CORPORACION, DEPARTAMENTO
                    ORDER BY total_reconocido DESC
                """
                rows = con.execute(sql, params).fetchall()
                con.close()
                result = [{"partido": r[0], "corp": r[1], "dpto": r[2] or "",
                           "registros": r[3],
                           "val_reconocido": r[4] or 0, "val_auditoria": r[5] or 0,
                           "val_neto": r[6] or 0,
                           "resoluciones": r[7] or "", "ultima_fecha_pago": r[8] or ""} for r in rows]

            self._send_json(result)
        except Exception as e:
            self._send_json({"error": str(e)}, 500)


    # ── /api/presupuesto ──────────────────────────────────────────────────────
    def _handle_presupuesto(self):
        """
        GET /api/presupuesto?corp=&dpto=&by=corp|dpto
        Resumen presupuestal ET2023: reconocido, pagado, pendiente, avg días revisión.
        by=corp  → agrupa por corporación (default)
        by=dpto  → agrupa por corporación + departamento
        """
        qs     = self._qs()
        corp_f = (qs.get("corp") or "").strip().upper()
        dpto_f = (qs.get("dpto") or "").strip().upper()
        by     = (qs.get("by")   or "corp").strip().lower()

        portal_dir = self.server.portal_dir if hasattr(self.server, "portal_dir") else os.getcwd()
        db_path    = os.path.join(portal_dir, "data", "pagostres.db")
        try:
            import sqlite3 as _sq
            con = _sq.connect(db_path)

            params = []
            where  = " WHERE CORPORACION IN ('ALCALDIA','GOBERNACION','ASAMBLEA','CONCEJO','JAL')"
            if corp_f:
                where += " AND UPPER(CORPORACION) LIKE ?"
                params.append(f"%{corp_f}%")
            if dpto_f:
                where += " AND UPPER(DEPARTAMENTO) LIKE ?"
                params.append(f"%{dpto_f}%")

            if by == "dpto":
                group_cols = "CORPORACION, DEPARTAMENTO"
                select_extra = ", DEPARTAMENTO"
            else:
                group_cols   = "CORPORACION"
                select_extra = ""

            sql = f"""
                SELECT
                    CORPORACION{select_extra},
                    COUNT(*) AS registros,
                    SUM(VALOR_RECONOCIDO)  AS total_reconocido,
                    SUM(VALOR_AUDITORIA)   AS total_auditoria,
                    SUM(VALOR_NETO_GIRADO) AS total_neto,
                    SUM(CASE WHEN FECHA_PAGO IS NOT NULL AND FECHA_PAGO != '' THEN VALOR_NETO_GIRADO ELSE 0 END) AS pagado,
                    SUM(CASE WHEN FECHA_PAGO IS NULL  OR  FECHA_PAGO  = '' THEN VALOR_RECONOCIDO   ELSE 0 END) AS pendiente,
                    COUNT(CASE WHEN FECHA_PAGO IS NOT NULL AND FECHA_PAGO != '' THEN 1 END) AS reg_pagados,
                    COUNT(CASE WHEN FECHA_PAGO IS  NULL  OR  FECHA_PAGO  = '' THEN 1 END)  AS reg_pendientes,
                    ROUND(AVG(CASE WHEN FECHA_PAGO IS NOT NULL AND FECHA_PAGO != ''
                                        AND FECHA_RECONOCIMIENTO IS NOT NULL AND FECHA_RECONOCIMIENTO != ''
                                   THEN julianday(FECHA_PAGO) - julianday(FECHA_RECONOCIMIENTO)
                              END), 1) AS avg_dias_revision,
                    MIN(FECHA_RECONOCIMIENTO) AS primera_reconoc,
                    MAX(FECHA_PAGO)           AS ultimo_pago
                FROM pagos_elecciones{where}
                GROUP BY {group_cols}
                ORDER BY total_reconocido DESC
            """
            rows = con.execute(sql, params).fetchall()
            con.close()

            if by == "dpto":
                result = [{"corp": r[0], "dpto": r[1] or "", "registros": r[2],
                           "total_reconocido": r[3] or 0, "total_auditoria": r[4] or 0,
                           "total_neto": r[5] or 0, "pagado": r[6] or 0,
                           "pendiente": r[7] or 0, "reg_pagados": r[8], "reg_pendientes": r[9],
                           "avg_dias": r[10], "primera_reconoc": r[11] or "",
                           "ultimo_pago": r[12] or ""} for r in rows]
            else:
                result = [{"corp": r[0], "registros": r[1],
                           "total_reconocido": r[2] or 0, "total_auditoria": r[3] or 0,
                           "total_neto": r[4] or 0, "pagado": r[5] or 0,
                           "pendiente": r[6] or 0, "reg_pagados": r[7], "reg_pendientes": r[8],
                           "avg_dias": r[9], "primera_reconoc": r[10] or "",
                           "ultimo_pago": r[11] or ""} for r in rows]

            self._send_json(result)
        except Exception as e:
            self._send_json({"error": str(e)}, 500)


    # ── /api/explorador ───────────────────────────────────────────────────────
    def _handle_explorador(self):
        """
        GET /api/explorador
        Devuelve todos los registros de pagostres.db enriquecidos con datos de
        Cuentas Claras (candidatos, reportaron, ingreso CC, gasto CC).
        El frontend construye el árbol: Corp → Dpto → Municipio → Partido.
        """
        import unicodedata, re as _re

        def _norm(s):
            if not s:
                return ''
            s = s.upper().strip()
            try:
                s = unicodedata.normalize('NFD', s)
                s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
            except Exception:
                pass
            return _re.sub(r'\s+', ' ', s)

        portal_dir = self.server.portal_dir if hasattr(self.server, 'portal_dir') else os.getcwd()
        db_path    = os.path.join(portal_dir, 'data', 'pagostres.db')

        try:
            import sqlite3 as _sq, json as _json

            # ── 1. Cargar pagostres ──────────────────────────────────────────
            con  = _sq.connect(db_path)
            rows = con.execute("""
                SELECT NO, CORPORACION, DEPARTAMENTO, MUNICIPIO, PARTIDO_MOVIMIENTO,
                       VALOR_RECONOCIDO, VALOR_AUDITORIA, VALOR_NETO_GIRADO,
                       RES_RECONOCIMIENTO, FECHA_RECONOCIMIENTO, RES_PAGO, FECHA_PAGO
                FROM pagos_elecciones
                ORDER BY CORPORACION, DEPARTAMENTO, MUNICIPIO, PARTIDO_MOVIMIENTO
            """).fetchall()
            con.close()

            # ── 2. Construir lookup de Cuentas Claras ────────────────────────
            cc_lookup = {}   # (corp_norm, dpto_norm, partido_norm) → {candidatos, reportaron, ingreso, gasto}

            CORP_ID_MAP = {3: 'ALCALDIA', 6: 'CONCEJO', 2: 'GOBERNACION',
                           5: 'ASAMBLEA', 7: 'JAL', 1: 'GOBERNACION', 4: 'ASAMBLEA'}
            try:
                fin_path = os.path.join(portal_dir, 'data', 'cc_financiero.json')
                idx_path = os.path.join(portal_dir, 'data', 'cuentas_claras_index.json')
                with open(fin_path, encoding='utf-8') as f:
                    cc_fin = _json.load(f)
                with open(idx_path, encoding='utf-8') as f:
                    cc_idx = _json.load(f)

                # (tipo_id, org_id, corp_id, circ_id) → (corp_norm, dpto_norm, partido_norm)
                key_map   = {}
                cand_cnt  = {}   # (corp_n, dpto_n, partido_n) → int

                for dpto_nom, dpto in cc_idx.items():
                    dn = _norm(dpto_nom)
                    for muni_nom, muni in dpto.get('municipios', {}).items():
                        for cand in muni.get('candidatos', []):
                            ti  = cand.get('tipo_id', 0)
                            oi  = cand.get('org_id', 0)
                            ci  = cand.get('corp_id', 0)
                            circ = cand.get('circ_id', 0)
                            corp_n   = CORP_ID_MAP.get(ci, str(ci))
                            partido_n = _norm(cand.get('org', ''))
                            k = (ti, oi, ci, circ)
                            if k not in key_map:
                                key_map[k] = (corp_n, dn, partido_n)
                            agg = (corp_n, dn, partido_n)
                            cand_cnt[agg] = cand_cnt.get(agg, 0) + 1

                # Agregar cc_financiero
                fin_agg = {}   # (corp_n, dpto_n, partido_n) → {ingreso, gasto, reportaron}
                for fk, fv in cc_fin.items():
                    parts = fk.split('|')
                    if len(parts) < 4:
                        continue
                    try:
                        k = (int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3]))
                    except Exception:
                        continue
                    if k not in key_map:
                        continue
                    agg = key_map[k]
                    if agg not in fin_agg:
                        fin_agg[agg] = {'ingreso': 0.0, 'gasto': 0.0, 'reportaron': 0}
                    fin_agg[agg]['ingreso']   += fv.get('total_ingreso', 0) or 0
                    fin_agg[agg]['gasto']     += fv.get('total_gasto',   0) or 0
                    if fv.get('envio_informe'):
                        fin_agg[agg]['reportaron'] += 1

                # Unificar
                for agg, cnt in cand_cnt.items():
                    fin = fin_agg.get(agg, {'ingreso': 0, 'gasto': 0, 'reportaron': 0})
                    cc_lookup[agg] = {
                        'candidatos': cnt,
                        'reportaron': fin['reportaron'],
                        'cc_ingreso': round(fin['ingreso'], 2),
                        'cc_gasto':   round(fin['gasto'],   2),
                    }
            except Exception:
                pass   # Si no hay CC, continúa solo con pagostres

            # ── 3. Enriquecer registros ──────────────────────────────────────
            result = []
            for r in rows:
                corp   = r[1] or ''
                dpto   = r[2] or ''
                muni   = r[3] or ''
                partido = r[4] or ''

                agg = (_norm(corp), _norm(dpto), _norm(partido))
                cc  = cc_lookup.get(agg, {})

                result.append({
                    'no':                  r[0],
                    'corp':                corp,
                    'dpto':                dpto,
                    'muni':                muni,
                    'partido':             partido,
                    'val_reconocido':      r[5] or 0,
                    'val_auditoria':       r[6] or 0,
                    'val_neto':            r[7] or 0,
                    'res_reconocimiento':  r[8]  or '',
                    'fecha_reconocimiento': r[9] or '',
                    'res_pago':            r[10] or '',
                    'fecha_pago':          r[11] or '',
                    'pagado':              bool(r[11]),
                    'cc_candidatos':       cc.get('candidatos', 0),
                    'cc_reportaron':       cc.get('reportaron', 0),
                    'cc_ingreso':          cc.get('cc_ingreso', 0),
                    'cc_gasto':            cc.get('cc_gasto',   0),
                })

            self._send_json(result)
        except Exception as e:
            self._send_json({'error': str(e)}, 500)


# ── Servidor multi-hilo ───────────────────────────────────────────────────────

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# ── Punto de entrada ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081

    # En Windows: montar unidad P: para paths cortos
    portal_dir = os.path.dirname(os.path.abspath(__file__))
    if sys.platform == "win32":
        portal_dir = _subst_mount(portal_dir)

    server = ThreadedHTTPServer(("0.0.0.0", port), Handler)
    server.portal_dir = portal_dir
    print(f"Portal CNE corriendo en http://0.0.0.0:{port}")
    print(f"Acceso local: http://localhost:{port}")
    print(f"Acceso red:   http://<tu-ip>:{port}")
    print("Ctrl+C para detener")
    # Pre-cargar caché en background para que la primera búsqueda sea rápida
    threading.Thread(target=_load_buscar_cache, args=(portal_dir,), daemon=True).start()
    threading.Thread(target=_load_fin_cache,    args=(portal_dir,), daemon=True).start()
    threading.Thread(target=_load_votos_cache,  args=(portal_dir,), daemon=True).start()
    threading.Thread(target=_load_repos_cache,  args=(portal_dir,), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        server.shutdown()
