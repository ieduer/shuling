#!/usr/bin/env python3
"""萬國星海快照：把 data/curated/world.tsv 每一列解析成 Wikidata 實體，並取諾貝爾得主的文學流派（P135）。
用法：python3 -I scripts/fetch/world_wikidata.py CACHE_DIR
- 檢索英文名，取第一個英文描述含 hint（或括號裡的消歧義字）的候選；作品另須 P50 含本表作者的 QID。
- 只保存建置用得到的欄位，寫到 data/raw/wikidata/world-lit.json（CC0）。
- 每次請求間隔 1.5 秒，遇 429 依 Retry-After 退避；結果快取在 CACHE_DIR，重跑不重抓。"""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE = sys.argv[1]
os.makedirs(CACHE, exist_ok=True)
UA = {"User-Agent": "bdfz-shuling-build/0.2 (education project; https://bdfz.net)"}
LANGS = "en|zh|zh-hant|zh-hans|zh-tw|zh-cn|zh-hk|ja"
PROPS = ["P31", "P50", "P136", "P135", "P569", "P570", "P571", "P577", "P800", "P407", "P364"]


def api(params):
    key = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()[:20]
    path = f"{CACHE}/{key}.json"
    if os.path.exists(path):
        return json.load(open(path))
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    for attempt in range(4):
        try:
            data = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
            json.dump(data, open(path, "w"))
            time.sleep(1.5)
            return data
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 3:
                raise
            time.sleep(min(int(e.headers.get("Retry-After") or 30), 120))


def entities(ids, props="labels|descriptions|claims|sitelinks"):
    out = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 50):
        out.update(api({"action": "wbgetentities", "ids": "|".join(ids[i:i + 50]), "props": props, "languages": LANGS})["entities"])
    return out


def claim_values(e, p):
    vals = []
    for c in e.get("claims", {}).get(p, []):
        v = c["mainsnak"].get("datavalue", {}).get("value")
        if isinstance(v, dict) and "id" in v:
            vals.append(v["id"])
        elif isinstance(v, dict) and "time" in v:
            vals.append(v["time"])
    return vals


def slim(e):
    return {
        "labels": {k: v["value"] for k, v in e.get("labels", {}).items()},
        "description_en": e.get("descriptions", {}).get("en", {}).get("value", ""),
        "sitelinks": len(e.get("sitelinks", {})),
        **{p: claim_values(e, p) for p in PROPS},
    }


rows = []
for line in open(os.path.join(ROOT, "data/curated/world.tsv"), encoding="utf-8"):
    if line.startswith("#") or not line.strip():
        continue
    rows.append(line.rstrip("\n").split("\t"))
head, rows = rows[0], [dict(zip(rows[0], r)) for r in rows[1:]]

resolved, problems = {}, []
for r in sorted(rows, key=lambda r: r["kind"] != "person"):  # 人物先解析，作品才能核對作者
    base = r["en"].split(" (")[0]
    disamb = r["en"].split(" (")[1].rstrip(")") if " (" in r["en"] else ""
    need = (disamb or r["hint"]).lower()
    hits = api({"action": "wbsearchentities", "search": base, "language": "en", "type": "item", "limit": 10})["search"]
    cands = entities([h["id"] for h in hits]) if hits else {}
    pick = None
    for h in hits:
        e = cands.get(h["id"], {})
        desc = e.get("descriptions", {}).get("en", {}).get("value", "").lower()
        if need not in desc:
            continue
        if r["kind"] == "work" and r["author"] not in ("", "-"):
            aq = resolved.get(r["author"], {}).get("qid")
            if not aq or aq not in claim_values(e, "P50"):
                continue
        pick = h["id"]
        break
    # 書名太常見（Antigone、Medea、Republic…）時，改以「作者＝本表作者」的全文檢索找作品
    if not pick and r["kind"] == "work" and r["author"] not in ("", "-") and resolved.get(r["author"]):
        aq = resolved[r["author"]]["qid"]
        found = api({"action": "query", "list": "search", "srsearch": f"haswbstatement:P50={aq} {base}", "srlimit": 10})["query"]["search"]
        more = entities([x["title"] for x in found]) if found else {}
        for x in found:
            e = more.get(x["title"], {})
            if base.lower() in e.get("labels", {}).get("en", {}).get("value", "").lower() and aq in claim_values(e, "P50"):
                pick, cands = x["title"], {**cands, x["title"]: e}
                break
    if pick and r["kind"] == "person" and "Q5" not in claim_values(cands[pick], "P31"):
        problems.append(f"NOT-HUMAN {r['id']} {pick}")
        pick = None
    if not pick:
        problems.append(f"UNRESOLVED {r['id']} ({r['en']}; need '{need}')")
        continue
    resolved[r["id"]] = {"qid": pick, **slim(cands[pick])}

# 諾貝爾得主的流派（P135），供思潮館出題
nobel = json.load(open(os.path.join(ROOT, "data/raw/wikidata/nobel-lit-laureates.json")))
laureate_movements = {q: claim_values(e, "P135") for q, e in entities(list(nobel["laureates"]), "claims").items()}

aux_ids = set()
for v in resolved.values():
    for p in ("P31", "P136", "P135", "P407", "P364"):
        aux_ids.update(x for x in v[p] if x.startswith("Q"))
for ms in laureate_movements.values():
    aux_ids.update(ms)
aux = {q: {k: v["value"] for k, v in e.get("labels", {}).items()} for q, e in entities(list(aux_ids), "labels").items()}

out = {"fetched": time.strftime("%Y-%m-%d"), "source": "https://www.wikidata.org/w/api.php (wbsearchentities, wbgetentities)", "license": "CC0",
       "resolved": resolved, "laureate_movements": laureate_movements, "aux_labels": aux, "problems": problems}
json.dump(out, open(os.path.join(ROOT, "data/raw/wikidata/world-lit.json"), "w"), ensure_ascii=False, indent=0)
print(json.dumps({"resolved": len(resolved), "problems": problems, "aux": len(aux)}, ensure_ascii=False))
