import json, subprocess, urllib.request, re, os

cfg = open(r"C:\Users\kadexagent\AppData\Local\Syncthing\config.xml", encoding="utf-8").read()
KEY = re.search(r"<apikey>([^<]+)</apikey>", cfg).group(1)
BASE = "http://127.0.0.1:8384/rest"

def api(path):
    req = urllib.request.Request(BASE + path, headers={"X-API-Key": KEY})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)

print("=== FOLDERS ===")
for f in api("/config/folders"):
    print(" id=%s | label=%s | type=%s" % (f.get("id"), f.get("label"), f.get("type")))
    print("   path=%s" % f.get("path"))
    print("   devices=%s" % [d.get("deviceID", "")[:7] for d in f.get("devices", [])])

print("\n=== DEVICES ===")
for d in api("/config/devices"):
    print("  %s | %s" % (d.get("deviceID", "")[:7], d.get("name")))

print("\n=== FOLDER STATUS (tiap folder) ===")
for f in api("/config/folders"):
    fid = f.get("id")
    try:
        s = api("/db/status?folder=" + fid)
    except Exception as e:
        print("  %s: error %s" % (fid, e)); continue
    print(" %s (%s):" % (fid, f.get("label")))
    for k in ["state", "globalFiles", "localFiles", "needFiles", "needBytes",
              "pullErrors", "invalid", "errors", "globalBytes", "localBytes"]:
        if k in s:
            v = s[k]
            if isinstance(v, list) and len(v) > 3:
                v = "%d item" % len(v)
            print("     %s: %s" % (k, v))

print("\n=== CONNECTIONS ===")
c = api("/system/connections")
for k, v in (c.get("connections") or {}).items():
    print("  %s | connected=%s | addr=%s | type=%s" % (k[:7], v.get("connected"), v.get("address"), v.get("type")))

print("\n=== SYNCTHING VERSION / MYSELF ===")
st = api("/system/status")
print("  myID:", st.get("myID", "")[:7])
print("  version:", st.get("version"))
