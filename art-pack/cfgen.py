#!/usr/bin/env python3
"""書靈美術生成：Workers AI（Leonardo Lucid Origin）。用法：python3 -I cfgen.py jobs.json RAW_DIR [name,name]
帳號與權杖只從環境變數或 ~/.secrets.env 讀，不寫進原始碼（本倉庫公開）。已生成的檔案略過，可重跑。"""
import json, sys, os, time, base64, urllib.request, re

def secret(key):
    if os.environ.get(key):
        return os.environ[key]
    for line in open(os.path.expanduser("~/.secrets.env")):
        m = re.match(rf"^(?:export )?{key}=['\"]?([^'\"\n]+)", line)
        if m:
            return m.group(1)
    raise SystemExit(f"missing {key}")

ACC, TOK = secret("CLOUDFLARE_ACCOUNT_ID"), secret("CLOUDFLARE_API_TOKEN")
jobs = json.load(open(sys.argv[1]))
raw = sys.argv[2]
only = set(sys.argv[3].split(",")) if len(sys.argv) > 3 and sys.argv[3] else None
os.makedirs(raw, exist_ok=True)
ok = 0
for j in jobs:
    if only and j["name"] not in only:
        continue
    out = f"{raw}/{j['name']}.jpg"
    if os.path.exists(out):
        continue
    body = {"prompt": j["prompt"], "width": j.get("w", 1024), "height": j.get("h", 1024), "steps": j.get("steps", 25), "guidance": j.get("guidance", 4.5), "seed": j["seed"]}
    t0, msg = time.time(), ""
    for attempt in range(3):
        try:
            req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{ACC}/ai/run/@cf/leonardo/lucid-origin", data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=240) as r:
                d = json.loads(r.read())
            if d.get("success") and d.get("result", {}).get("image"):
                open(out, "wb").write(base64.b64decode(d["result"]["image"]))
                ok += 1
                msg = f"ok {os.path.getsize(out)}B"
                break
            msg = "resp " + json.dumps(d)[:200]
        except Exception as e:
            msg = f"err {str(e)[:120]}"
            time.sleep(4)
    print(f"{j['name']} {msg} {time.time() - t0:.1f}s", flush=True)
    time.sleep(0.8)
print("done ok", ok)
