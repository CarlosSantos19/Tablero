"""
generar_presupuesto_full.py
===========================
Regenera data/presupuesto_full.json combinando:
  - pagostres.db          → val_rec, val_aud, val_neto, pagado
  - cc_financiero_v2.json → cc_ing, cc_gas (por cand_id desde cuentas_claras_index.json)

Deduplicación: cada cand_id se cuenta UNA sola vez por (corp, dpto, mun, partido).

Uso:
  python generar_presupuesto_full.py
"""

import json, sqlite3, os, unicodedata, re, time

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")

CC_IDX_FILE  = os.path.join(DATA, "cuentas_claras_index.json")
CC_FIN_V2    = os.path.join(DATA, "cc_financiero_v2.json")
DB_FILE      = os.path.join(DATA, "pagostres.db")
OUT_FILE     = os.path.join(DATA, "presupuesto_full.json")

CORP_ID_MAP = {2:"GOBERNACION",3:"ALCALDIA",5:"ASAMBLEA",6:"CONCEJO",7:"JAL",8:"PERSONERIA",22:"OTRO"}
CORPS_TERR  = {"ALCALDIA","CONCEJO","ASAMBLEA","GOBERNACION","JAL","ALCALDIA CONSULTA"}

def norm(s):
    if not s: return ""
    s = s.upper().strip()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s)

print("Cargando datos...")

# ── 1. Leer cc_financiero_v2.json (por cand_id) ───────────────────────────────
with open(CC_FIN_V2, encoding="utf-8") as f:
    cc_fin_v2 = json.load(f)
print(f"  cc_financiero_v2: {len(cc_fin_v2):,} entradas")

# ── 2. Leer cuentas_claras_index.json y construir lookup ─────────────────────
with open(CC_IDX_FILE, encoding="utf-8") as f:
    cc_idx = json.load(f)

# fin_agg: (corp_n, dpto_n, mun_n, partido_n) → {ingreso, gasto, n, cands_vistos}
fin_agg = {}

for dpto_nom, dpto_data in cc_idx.items():
    dn = norm(dpto_nom)
    for mun_nom, mun_data in dpto_data.get("municipios", {}).items():
        mn = norm(mun_nom)
        for cand in mun_data.get("candidatos", []):
            ci        = cand.get("corp_id", 0)
            corp_n    = CORP_ID_MAP.get(ci, str(ci))
            partido_n = norm(cand.get("org", ""))
            cand_id   = str(cand.get("cand_id", ""))

            if corp_n not in CORPS_TERR or not cand_id:
                continue

            fv  = cc_fin_v2.get(cand_id, {})
            ing = float(fv.get("total_ingreso", 0) or 0)
            gas = float(fv.get("total_gasto",   0) or 0)

            agg = (corp_n, dn, mn, partido_n)
            if agg not in fin_agg:
                fin_agg[agg] = {"ingreso": 0.0, "gasto": 0.0, "n": 0, "cands": set()}

            fin_agg[agg]["n"] += 1
            # Contar financiero solo una vez por cand_id único
            if cand_id not in fin_agg[agg]["cands"]:
                fin_agg[agg]["cands"].add(cand_id)
                fin_agg[agg]["ingreso"] += ing
                fin_agg[agg]["gasto"]   += gas

print(f"  Combinaciones CC: {len(fin_agg):,}")

# ── 3. Leer pagostres.db ──────────────────────────────────────────────────────
con  = sqlite3.connect(DB_FILE)
rows = con.execute("""
    SELECT CORPORACION, DEPARTAMENTO, MUNICIPIO, PARTIDO_MOVIMIENTO,
           SUM(VALOR_RECONOCIDO), SUM(VALOR_AUDITORIA), SUM(VALOR_NETO_GIRADO),
           COUNT(*), MAX(FECHA_PAGO)
    FROM pagos_elecciones
    GROUP BY CORPORACION, DEPARTAMENTO, MUNICIPIO, PARTIDO_MOVIMIENTO
""").fetchall()
con.close()
print(f"  pagostres.db: {len(rows):,} filas")

# ── 4. Unificar ───────────────────────────────────────────────────────────────
# Empezar con todos los registros de pagostres.db
detalle_map = {}  # (corp_n, dpto_n, mun_n, partido_n) → dict

for r in rows:
    corp_r, dpto_r, mun_r, partido_r = r[0] or "", r[1] or "", r[2] or "", r[3] or ""
    agg = (norm(corp_r), norm(dpto_r), norm(mun_r), norm(partido_r))
    detalle_map[agg] = {
        "corp":    corp_r,
        "dpto":    dpto_r,
        "mun":     mun_r,
        "partido": partido_r,
        "val_rec": r[4] or 0,
        "val_aud": r[5] or 0,
        "val_neto": r[6] or 0,
        "pagado":  bool(r[8]),
    }

# Agregar entradas CC que no están en pagostres.db
for agg, fdata in fin_agg.items():
    if agg not in detalle_map and (fdata["ingreso"] > 0 or fdata["gasto"] > 0):
        corp_n, dn, mn, partido_n = agg
        detalle_map[agg] = {
            "corp":    corp_n,
            "dpto":    dn,
            "mun":     mn,
            "partido": partido_n,
            "val_rec": 0, "val_aud": 0, "val_neto": 0, "pagado": False,
        }

# Construir detalle final
detalle = []
totales = {"cc_ing": 0.0, "cc_gas": 0.0, "val_rec": 0, "val_aud": 0, "val_neto": 0}
por_corp = {}

for agg, row in detalle_map.items():
    fdata = fin_agg.get(agg, {"ingreso": 0.0, "gasto": 0.0, "n": 0, "cands": set()})
    cc_ing = round(fdata["ingreso"], 2)
    cc_gas = round(fdata["gasto"],   2)
    cc_n   = len(fdata.get("cands", set())) or fdata["n"]

    entry = {
        "corp":    row["corp"],
        "dpto":    row["dpto"],
        "mun":     row["mun"],
        "partido": row["partido"],
        "cc_ing":  cc_ing,
        "cc_gas":  cc_gas,
        "cc_n":    cc_n,
        "val_rec": row["val_rec"],
        "val_aud": row["val_aud"],
        "val_neto":row["val_neto"],
        "pagado":  row["pagado"],
    }
    detalle.append(entry)

    totales["cc_ing"]  += cc_ing
    totales["cc_gas"]  += cc_gas
    totales["val_rec"] += row["val_rec"]
    totales["val_aud"] += row["val_aud"]
    totales["val_neto"]+= row["val_neto"]

    cn = norm(row["corp"]).title()
    if cn not in por_corp:
        por_corp[cn] = {"cc_ing": 0.0, "cc_gas": 0.0, "val_rec": 0, "val_aud": 0, "val_neto": 0}
    por_corp[cn]["cc_ing"]  += cc_ing
    por_corp[cn]["cc_gas"]  += cc_gas
    por_corp[cn]["val_rec"] += row["val_rec"]
    por_corp[cn]["val_aud"] += row["val_aud"]
    por_corp[cn]["val_neto"]+= row["val_neto"]

# Ordenar detalle por corp, dpto, mun, partido
detalle.sort(key=lambda x: (x["corp"], x["dpto"], x["mun"], x["partido"]))

out = {
    "totales": totales,
    "por_corp": por_corp,
    "detalle": detalle,
    "_generado": time.strftime("%Y-%m-%d %H:%M"),
}

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

print(f"\n✔ Generado: {OUT_FILE}")
print(f"  Filas detalle: {len(detalle):,}")
print(f"  Total CC ingresos: ${totales['cc_ing']:>20,.2f}")
print(f"  Total CC gastos:   ${totales['cc_gas']:>20,.2f}")
print(f"  Total reconocido:  ${totales['val_rec']:>20,}")

# Verificar Arauca
for row in detalle:
    if "TIEMPO" in row["partido"].upper() and "ARAUCA" in row["dpto"].upper():
        print(f"\n  Verificación ARAUCA: {row}")
