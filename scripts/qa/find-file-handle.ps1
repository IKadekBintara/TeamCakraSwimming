param([string]$Path)

# ============================================================
# Cari proses yang MEMEGANG HANDLE sebuah file.
# Pakai Windows Restart Manager (RmStartSession/RmRegisterResources/
# RmGetList) — API resmi Windows untuk "file in use" (yang dipakai
# Windows saat menampilkan "file is open in another program").
# ============================================================

$code = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class Rm {
  [StructLayout(LayoutKind.Sequential)]
  struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }

  const int RmRebootReasonNone = 0;
  const int CCH_RM_MAX_APP_NAME = 255;
  const int CCH_RM_MAX_SVC_NAME = 63;

  enum RM_APP_TYPE {
    RmUnknownApp = 0, RmMainWindow = 1, RmOtherWindow = 2, RmService = 3,
    RmExplorer = 4, RmConsole = 5, RmCritical = 1000
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)] public string strServiceShortName;
    public RM_APP_TYPE ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }

  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);
  [DllImport("rstrtmgr.dll")]
  static extern int RmEndSession(uint pSessionHandle);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames,
      uint nApplications, [In] RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
  [DllImport("rstrtmgr.dll")]
  static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo,
      [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);

  public static List<string> Who(string path) {
    var result = new List<string>();
    uint handle; string key = Guid.NewGuid().ToString();
    int res = RmStartSession(out handle, 0, key);
    if (res != 0) { result.Add("RmStartSession gagal: " + res); return result; }
    try {
      string[] resources = new string[] { path };
      res = RmRegisterResources(handle, (uint)resources.Length, resources, 0, null, 0, null);
      if (res != 0) { result.Add("RmRegisterResources gagal: " + res); return result; }
      uint pnProcInfoNeeded = 0, pnProcInfo = 0, lpdwRebootReasons = RmRebootReasonNone;
      res = RmGetList(handle, out pnProcInfoNeeded, ref pnProcInfo, null, ref lpdwRebootReasons);
      if (res == 234) { // ERROR_MORE_DATA
        var infos = new RM_PROCESS_INFO[pnProcInfoNeeded];
        pnProcInfo = pnProcInfoNeeded;
        res = RmGetList(handle, out pnProcInfoNeeded, ref pnProcInfo, infos, ref lpdwRebootReasons);
        if (res == 0) {
          for (int i = 0; i < pnProcInfo; i++) {
            try {
              var p = System.Diagnostics.Process.GetProcessById(infos[i].Process.dwProcessId);
              result.Add(infos[i].Process.dwProcessId + "|" + p.ProcessName + "|" + p.MainModule.FileName + "|" + infos[i].strAppName);
            } catch (Exception e) {
              result.Add(infos[i].Process.dwProcessId + "|?|akses ditolak: " + e.Message + "|" + infos[i].strAppName);
            }
          }
        } else result.Add("RmGetList(2) gagal: " + res);
      } else if (res == 0) {
        result.Add("(tidak ada proses yang memegang file)");
      } else {
        result.Add("RmGetList gagal: " + res);
      }
    } finally { RmEndSession(handle); }
    return result;
  }
}
'@

Add-Type -TypeDefinition $code -Language CSharp
Write-Output "=== PATH: $Path ==="
if (-not (Test-Path -LiteralPath $Path)) { Write-Output "FILE TIDAK ADA"; exit 0 }
foreach ($line in [Rm]::Who($Path)) { Write-Output "  HOLDER: $line" }
