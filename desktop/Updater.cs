using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

internal sealed class UpdatePlan {
    public string Root { get; set; }
    public string Job { get; set; }
    public string Package { get; set; }
    public string Digest { get; set; }
    public string Version { get; set; }
    public string Session { get; set; }
    public int ProcessId { get; set; }
    public long ProcessStart { get; set; }
}

internal sealed class UpdateRollbackException : IOException {
    internal UpdateRollbackException(string message) : base(message) { }
}

internal static class UpdateRecovery {
    internal static bool OriginalIsRunning(UpdatePlan plan) {
        try {
            using (var original = Process.GetProcessById(plan.ProcessId))
                return original.StartTime.ToUniversalTime().Ticks == plan.ProcessStart && !original.WaitForExit(2000);
        } catch (ArgumentException) { return false; }
    }
    internal static ProcessStartInfo StartInfo(UpdatePlan plan) {
        // Both normal updates and safe recovery get a local startup acknowledgement.
        return new ProcessStartInfo(Path.Combine(plan.Root, "Sprite Check.exe")) {
            WorkingDirectory = plan.Root, UseShellExecute = false,
            Arguments = "--update-complete \"" + plan.Job + "\"" + (plan.Session == null ? "" : " \"" + plan.Session + "\"")
        };
    }
}

internal static class UpdaterEngine {
    internal static string Child(string root, string relative) {
        if (string.IsNullOrEmpty(relative) || relative.Any(c => c < 32 || "\\:<>\"|?*".Contains(c)) || relative.StartsWith("/") || relative.Split('/').Any(x => x == "" || x == "." || x == ".." || x.EndsWith(".") || x.EndsWith(" ") || Regex.IsMatch(x, @"^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)", RegexOptions.IgnoreCase))) throw new IOException("Invalid package path: " + relative);
        string full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        string start = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(start, StringComparison.OrdinalIgnoreCase)) throw new IOException("Package path escaped its destination.");
        for (var item = new FileInfo(full).Directory; item != null; item = item.Parent) {
            if (item.Exists && (item.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Update paths cannot contain junctions or symbolic links.");
        }
        if (File.Exists(full) && (File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0) throw new IOException("Update target cannot be a symbolic link.");
        return full;
    }

    internal static bool Allowed(string name) {
        if (new[] { "Sprite Check.exe", "Sprite Check.exe.config", "SpriteCheck.Updater.exe", "sprite-check.ico", "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll", "README.txt", "GUIDE.md", "update-package.json" }.Contains(name, StringComparer.OrdinalIgnoreCase)) return true;
        return Regex.IsMatch(name, @"^(app/[A-Za-z0-9_-]+\.(mjs|html|css|json)|app/assets/[A-Za-z0-9_-]+\.(png|ico)|licenses/[A-Za-z0-9_.-]+\.txt|Unity/[A-Za-z0-9_-]+\.cs)$", RegexOptions.IgnoreCase);
    }

    internal static List<string> Stage(UpdatePlan plan) {
        if (UpdateService.Hash(plan.Package) != plan.Digest) throw new IOException("Package checksum mismatch.");
        string prefix = "SpriteCheck-" + plan.Version + "-win-x64/", stage = Path.Combine(plan.Job, "stage");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var zip = ZipFile.OpenRead(plan.Package)) {
            if (zip.Entries.Count > 250) throw new IOException("Too many package files.");
            long total = 0;
            foreach (var entry in zip.Entries) {
                if (!entry.FullName.StartsWith(prefix, StringComparison.Ordinal)) throw new IOException("Unexpected package folder.");
                string relative = entry.FullName.Substring(prefix.Length);
                if (!Allowed(relative) || !names.Add(relative) || (entry.ExternalAttributes >> 16 & 0xF000) == 0xA000) throw new IOException("Unsupported, duplicate or symbolic-link package file: " + relative);
                total += entry.Length; if (entry.Length > 64L * 1024 * 1024 || total > 256L * 1024 * 1024) throw new IOException("Expanded package is too large.");
                string target = Child(stage, relative); Directory.CreateDirectory(Path.GetDirectoryName(target)); entry.ExtractToFile(target);
            }
        }
        string manifestPath = Child(stage, "update-package.json");
        if (!File.Exists(manifestPath) || new FileInfo(manifestPath).Length > 128 * 1024) throw new IOException("Missing or oversized update manifest.");
        var manifest = UpdateService.Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(manifestPath));
        if ((string)manifest["product"] != "SpriteCheck" || (string)manifest["version"] != plan.Version || Convert.ToInt32(manifest["schema"]) != 1) throw new IOException("Wrong update product/version/schema.");
        var expected = (Dictionary<string, object>)manifest["files"];
        if (names.Count != expected.Count + 1 || !names.Contains("update-package.json")) throw new IOException("Package contains unexpected or missing files.");
        foreach (var file in expected) {
            if (!names.Contains(file.Key) || file.Key == "update-package.json" || !Regex.IsMatch(Convert.ToString(file.Value), "^[a-f0-9]{64}$") || UpdateService.Hash(Child(stage, file.Key)) != (string)file.Value) throw new IOException("File checksum mismatch: " + file.Key);
        }
        foreach (string required in new[] { "Sprite Check.exe", "SpriteCheck.Updater.exe", "app/index.html", "app/app.mjs", "app/update.mjs", "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll" }) if (!names.Contains(required)) throw new IOException("Required application file is missing: " + required);
        var info = FileVersionInfo.GetVersionInfo(Child(stage, "Sprite Check.exe"));
        if (info.ProductName != "Sprite Check" || info.FileVersion != plan.Version + ".0") throw new IOException("Executable identity/version does not match the release.");
        return names.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
    }

    internal static void Apply(UpdatePlan plan, List<string> files, Action<string> beforeWrite = null) {
        string stage = Path.Combine(plan.Job, "stage"), backup = Path.Combine(plan.Job, "backup");
        // Complete the backup and validate every destination before modifying any installed file.
        var existed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in files) {
            string target = Child(plan.Root, name); if (!File.Exists(target)) continue;
            string copy = Child(backup, name); Directory.CreateDirectory(Path.GetDirectoryName(copy)); File.Copy(target, copy); existed.Add(name);
        }
        File.WriteAllText(Path.Combine(plan.Job, "backup-index.json"), UpdateService.Json.Serialize(existed.ToArray()));
        var touched = new List<string>();
        try {
            foreach (var name in files) {
                if (beforeWrite != null) beforeWrite(name);
                string target = Child(plan.Root, name); Directory.CreateDirectory(Path.GetDirectoryName(target));
                touched.Add(name); File.Copy(Child(stage, name), target, true);
            }
        } catch { Restore(plan, touched, existed); throw; }
    }

    internal static void Restore(UpdatePlan plan, IEnumerable<string> files, HashSet<string> existed) {
        var failures = new List<string>();
        foreach (var name in files.Reverse()) {
            try {
                string target = Child(plan.Root, name);
                if (existed.Contains(name)) File.Copy(Child(Path.Combine(plan.Job, "backup"), name), target, true);
                else if (File.Exists(target)) File.Delete(target);
            } catch (Exception error) { failures.Add(name + ": " + error.Message); }
        }
        if (failures.Count != 0) throw new UpdateRollbackException("Rollback incomplete. Backups are preserved in " + plan.Job + "\n" + string.Join("\n", failures));
    }
}

internal static class UpdateProgram {
    [STAThread]
    private static void Main(string[] args) {
        UpdatePlan plan = null; List<string> files = null; bool applied = false, validatedPlan = false; StreamWriter log = null;
        try {
            if (args.Length != 1) throw new IOException("Start updates from Sprite Check: File > Update.");
            string planPath = Path.GetFullPath(args[0]);
            plan = UpdateService.Json.Deserialize<UpdatePlan>(File.ReadAllText(planPath));
            plan.Root = Path.GetFullPath(plan.Root); plan.Job = Path.GetFullPath(plan.Job);
            string expectedJob = UpdaterEngine.Child(plan.Root, "Updates/" + Path.GetFileName(plan.Job));
            Guid jobId;
            if (!Guid.TryParseExact(Path.GetFileName(plan.Job), "N", out jobId) || !plan.Job.Equals(expectedJob, StringComparison.OrdinalIgnoreCase) || !planPath.Equals(Path.Combine(plan.Job, "plan.json"), StringComparison.OrdinalIgnoreCase) || !AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\').Equals(plan.Job, StringComparison.OrdinalIgnoreCase) || !plan.Package.Equals(Path.Combine(plan.Job, "package.zip"), StringComparison.OrdinalIgnoreCase) || (plan.Session != null && !plan.Session.Equals(Path.Combine(plan.Job, "resume.dat"), StringComparison.OrdinalIgnoreCase))) throw new IOException("Invalid update plan location.");
            UpdateService.ParseVersion(plan.Version);
            validatedPlan = true;
            log = new StreamWriter(Path.Combine(plan.Job, "update.log"), true) { AutoFlush = true };
            files = UpdaterEngine.Stage(plan); log.WriteLine("PASS Package, paths, identity and file hashes verified");
            try {
                using (var previous = Process.GetProcessById(plan.ProcessId)) {
                    if (previous.StartTime.ToUniversalTime().Ticks != plan.ProcessStart) throw new IOException("Original process identity changed.");
                    if (!previous.WaitForExit(60000)) throw new IOException("Close Sprite Check before updating. No files were changed.");
                }
            } catch (ArgumentException) { }
            // Do not overwrite another instance's files; fail safely if any are locked.
            foreach (var name in files.Where(n => n.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || n.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))) {
                string target = UpdaterEngine.Child(plan.Root, name);
                if (File.Exists(target)) using (File.Open(target, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { }
            }
            UpdaterEngine.Apply(plan, files); applied = true; log.WriteLine("PASS Files installed; original files backed up");
            var start = UpdateRecovery.StartInfo(plan);
            using (var next = Process.Start(start)) {
                bool healthy = false;
                for (int n = 0; n < 300; n++) { if (File.Exists(Path.Combine(plan.Job, "ready"))) { healthy = true; break; } if (next.HasExited) break; Thread.Sleep(200); }
                if (!healthy) {
                    if (!next.HasExited) { next.CloseMainWindow(); if (!next.WaitForExit(10000)) throw new IOException("Updated program did not confirm startup and is still running. Close it before restoring the preserved backup: " + plan.Job); }
                    throw new IOException("Updated program did not confirm successful startup.");
                }
            }
            log.WriteLine("PASS Update complete; new program is ready" );
        } catch (Exception error) {
            if (log != null) log.WriteLine("FAIL " + error);
            bool canReopen = validatedPlan && plan != null && !(error is UpdateRollbackException);
            if (applied && plan != null) {
                try {
                    var existed = new HashSet<string>(UpdateService.Json.Deserialize<string[]>(File.ReadAllText(Path.Combine(plan.Job, "backup-index.json"))), StringComparer.OrdinalIgnoreCase);
                    UpdaterEngine.Restore(plan, files, existed); if (log != null) log.WriteLine("PASS Original version restored");
                } catch (Exception rollback) { canReopen = false; error = new IOException(error.Message + "\nRollback: " + rollback.Message); }
            }
            if (canReopen) {
                try {
                    if (!UpdateRecovery.OriginalIsRunning(plan)) {
                        Process.Start(UpdateRecovery.StartInfo(plan));
                        if (log != null) log.WriteLine("PASS Original version reopened with recovery project");
                    } else if (log != null) log.WriteLine("PASS Original process is still running; no duplicate recovery window");
                } catch (Exception restart) { error = new IOException(error.Message + "\nRecovery: " + restart.Message); }
            }
            MessageBox.Show("Update stopped: " + error.Message + (plan == null ? "" : "\n\nBackup/session/log: " + plan.Job), "Sprite Check Update", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Environment.ExitCode = 1;
        } finally { if (log != null) log.Dispose(); }
    }
}
