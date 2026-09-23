
import json, urllib.request, re, urllib.parse
cfg = open(r"C:\Users\kadexagent\AppData\Local\Syncthing\config.xml", encoding="utf-8").read()
KEY = re.search(r"<apikey>([^<]+)</apikey>", cfg).group(1)
def api(p):
    q = urllib.request.Request("http://127.0.0.1:8384/rest"+p, headers={"X-API-Key":KEY})
    return json.loads(urllib.request.urlopen(q, timeout=15).read())
items = api("/db/browse?folder=gyygm-4dopv&levels=1")
print("total entries:", len(items))
for it in items:
    n = it.get("name","")
    if "Form_Pendaftaran" in n or n.startswith("~$") or ".tmp-" in n:
        print("  %-52s size=%-8s state=%-8s invalid=%s" % (n, it.get("size"), it.get("state"), it.get("invalid")))
        print("     modTime:", it.get("modTime"), "| devices:", [v.get("deviceID","")[:7] for v in (it.get("version") or [])])
