import json, urllib.request, re, os, glob

cfg = open(r"C:\Users\kadexagent\AppData\Local\Syncthing\config.xml", encoding="utf-8").read()
KEY = re.search(r"<apikey>([^<]+)</apikey>", cfg).group(1)

def api(path):
    req = urllib.request.Request("http://127.0.0.1:8384/rest" + path, headers={"X-API-Key": KEY})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)

print("=== STATUS FILE Form_Pendaftaran.xlsx ===")
for f in api("/db/browse?folder=gyygm-4dopv&levels=1&prefix=Form_"):
    print("  name:", f.get("name"))
    print("  size:", f.get("size"), "| modified:", f.get("modTime"))
    print("  state:", f.get("state"), "| stateChanged:", f.get("stateChanged"))
    print("  version:", [v.get("deviceID", "")[:7] for v in (f.get("version") or [])])
    print("  localFlags:", f.get("localFlags"), "| invalid:", f.get("invalid"))
    print()

print("=== FILE CONFLICT / FAILED di folder (nama mengandung 'sync-conflict') ===")
hits = []
base = r"C:\Users\kadexagent\Documents\atlet cakra"
for root, dirs, files in os.walk(base):
    for n in files:
        if "sync-conflict" in n.lower() or n.startswith("~$") or ".tmp-" in n:
            hits.append(os.path.join(root, n))
print("  ditemukan:", len(hits))
for h in hits[:20]:
    print("   ", h)

print("\n=== FILE KANDIDAT FORM PENDAFTARAN + BACKUP ===")
for n in sorted(os.listdir(base)):
    if "Form_Pendaftaran" in n or "Form Pendaftaran" in n:
        p = os.path.join(base, n)
        st = os.stat(p)
        print("  %-46s %8d bytes  %s" % (n, st.st_size, __import__("datetime").datetime.utcfromtimestamp(st.st_mtime).isoformat()))
