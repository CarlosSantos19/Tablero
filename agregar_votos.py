"""
agregar_votos.py
================
Enriquece data/presupuesto_full.json con el campo 'votos' por fila,
cruzando con votos_index.json y cuentas_claras_index.json.

Estrategia:
- CONCEJO / ASAMBLEA / JAL: clave directa "PARTIDO|MUN|CORP"
- ALCALDIA / GOBERNACION   : suma de votos por candidato "NOMBRE|MUN|CORP"
                              (se obtienen los nombres desde cuentas_claras_index)
"""

import json, unicodedata, re, os, sys, time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")

CORP_ID_MAP = {2:"GOBERNACION",3:"ALCALDIA",5:"ASAMBLEA",6:"CONCEJO",7:"JAL",8:"PERSONERIA",22:"OTRO"}
CORPS_LISTA = {"ASAMBLEA","CONCEJO","JAL"}   # elecciones de lista → clave partido
CORPS_INDIV = {"ALCALDIA","GOBERNACION"}     # elecciones uninominales → clave nombre

def norm(s):
    if not s: return ""
    s = s.upper().strip()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s)

def norm_mun(s):
    """Normaliza municipio eliminando puntuación extra (ej: BOGOTA. D.C. -> BOGOTA D.C.)"""
    s = norm(s)
    return re.sub(r"\.(?=\s)", "", s).strip()

print("Cargando archivos...")

with open(os.path.join(DATA, "presupuesto_full.json"), encoding="utf-8") as f:
    pres = json.load(f)

with open(os.path.join(DATA, "votos_index.json"), encoding="utf-8") as f:
    vi = json.load(f)
completo_raw = vi.get("completo", {})
print(f"  votos_index: {len(completo_raw):,} entradas")

# Reindexar con municipios normalizados (sin puntuación extra)
completo = {}
for k, v in completo_raw.items():
    partes = k.split("|")
    if len(partes) == 3:
        nombre, mun, corp = partes
        clave_norm = f"{norm(nombre)}|{norm_mun(mun)}|{norm(corp)}"
        completo[clave_norm] = v
    else:
        completo[norm(k)] = v
print(f"  Reindexado: {len(completo):,} entradas normalizadas")

with open(os.path.join(DATA, "cuentas_claras_index.json"), encoding="utf-8") as f:
    cc_idx = json.load(f)

# ── Construir lookup nombres por (corp_n, mun_n, partido_n) ──────────────────
# Solo necesario para ALCALDIA / GOBERNACION
nombres_por_grupo = {}  # (corp_n, mun_n, partido_n) -> set of nombres normalizados

for dpto_nom, dpto_data in cc_idx.items():
    for mun_nom, mun_data in dpto_data.get("municipios", {}).items():
        mn = norm(mun_nom)
        for cand in mun_data.get("candidatos", []):
            ci     = cand.get("corp_id", 0)
            corp_n = CORP_ID_MAP.get(ci, str(ci))
            if corp_n not in CORPS_INDIV:
                continue
            partido_n = norm(cand.get("org", ""))
            nombre_n  = norm(cand.get("nombre", ""))
            key = (corp_n, mn, partido_n)
            if key not in nombres_por_grupo:
                nombres_por_grupo[key] = set()
            nombres_por_grupo[key].add(nombre_n)

print(f"  Grupos nominales: {len(nombres_por_grupo):,}")

# ── Enriquecer cada fila de presupuesto_full ──────────────────────────────────
actualizados = 0
for row in pres["detalle"]:
    corp_n    = norm(row["corp"])
    mun_n     = norm(row["mun"])
    partido_n = norm(row["partido"])

    votos = 0

    mun_k = norm_mun(row["mun"])

    if corp_n in CORPS_LISTA:
        # Clave directa: PARTIDO|MUN|CORP
        clave = f"{partido_n}|{mun_k}|{corp_n}"
        votos = completo.get(clave, 0)

    elif corp_n in CORPS_INDIV:
        # Suma votos de todos los candidatos del partido en ese municipio
        nombres = nombres_por_grupo.get((corp_n, mun_n, partido_n), set())
        for nom in nombres:
            clave = f"{nom}|{mun_k}|{corp_n}"
            votos += completo.get(clave, 0)

    row["votos"] = votos
    if votos > 0:
        actualizados += 1

print(f"  Filas con votos > 0: {actualizados:,} / {len(pres['detalle']):,}")

# Guardar
out_path = os.path.join(DATA, "presupuesto_full.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(pres, f, ensure_ascii=False, separators=(",", ":"))

print(f"\nGenerado: {out_path}")
print(f"  _generado actualizado a: {time.strftime('%Y-%m-%d %H:%M')}")
