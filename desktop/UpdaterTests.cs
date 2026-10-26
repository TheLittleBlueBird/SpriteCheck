using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;

internal static class UpdaterTests {
    private static int checks;
    private static string evidence, source;
    private static void Pass(string name, bool ok) { if (!ok) throw new Exception(name); checks++; Console.WriteLine("PASS " + name); }
    private static void Reject(string name, Action action) { bool rejected = false; try { action(); } catch { rejected = true; } Pass(name, rejected); }
    private static UpdatePlan Plan(string name, string package = null) {
        string job = Path.Combine(evidence, name); Directory.CreateDirectory(job);
        return new UpdatePlan { Root = Path.Combine(job, "installed"), Job = job, Package = package ?? source, Digest = UpdateService.Hash(package ?? source), Version = UpdateService.Version };
    }
    private static string Alter(string name, Action<ZipArchive> modify) {
        string file = Path.Combine(evidence, name + ".zip"); File.Copy(source, file, true);
        using (var zip = ZipFile.Open(file, ZipArchiveMode.Update)) modify(zip); return file;
    }
    private static void Add(ZipArchive zip, string path, string text) { using (var writer = new StreamWriter(zip.CreateEntry(path).Open())) writer.Write(text); }
    private static void Main(string[] args) {
        try {
            source = Path.GetFullPath(args[0]); evidence = Path.GetFullPath(args[1]); Directory.CreateDirectory(evidence);
            string prefix = "SpriteCheck-" + UpdateService.Version + "-win-x64/";
            var good = Plan("valid"); var files = UpdaterEngine.Stage(good);
            Pass("Valid package verifies all paths, hashes and executable identity", files.Count > 20);
            foreach (string path in new[] { "../outside", "/absolute", "app/../outside", "app\\bad", "C:/outside", "app/NUL.txt", "app/trailing.", "app/CON", "app/part ", "app//bad" }) Reject("Reject unsafe path " + path, () => UpdaterEngine.Child(good.Root, path));
            foreach (string path in new[] { "UserData/preferences.json", "Updates/x/app.mjs", "scene.dat", "app/payload.exe", "app/assets/scene.dat", "OtherProject/a.cs" }) Pass("Protect non-program file " + path, !UpdaterEngine.Allowed(path));
            var corrupt = Plan("bad-hash"); corrupt.Digest = new string('0',64); Reject("Reject archive checksum mismatch", () => UpdaterEngine.Stage(corrupt));
            string traversal = Alter("traversal", z => Add(z,prefix+"app/../escape.mjs","bad")); Reject("Reject traversal even with matching archive SHA",()=>UpdaterEngine.Stage(Plan("bad-traversal",traversal)));
            string duplicate = Alter("duplicate", z => Add(z,prefix+"APP/INDEX.HTML","bad")); Reject("Reject case-insensitive duplicate entry",()=>UpdaterEngine.Stage(Plan("bad-duplicate",duplicate)));
            string unlisted = Alter("unlisted", z => Add(z,prefix+"app/extra.mjs","bad")); Reject("Reject file absent from manifest",()=>UpdaterEngine.Stage(Plan("bad-unlisted",unlisted)));
            string tampered = Alter("tampered", z => { z.GetEntry(prefix+"app/app.mjs").Delete(); Add(z,prefix+"app/app.mjs","bad"); }); Reject("Reject changed payload against per-file hash",()=>UpdaterEngine.Stage(Plan("bad-file-hash",tampered)));
            string symlink = Alter("symlink", z => {var entry=z.CreateEntry(prefix+"app/link.mjs");entry.ExternalAttributes=unchecked((int)0xA1FF0000);}); Reject("Reject symbolic links",()=>UpdaterEngine.Stage(Plan("bad-symlink",symlink)));
            string protectedFile = Alter("protected", z=>Add(z,prefix+"UserData/prefs.json","bad")); Reject("Reject user-data overwrite",()=>UpdaterEngine.Stage(Plan("bad-userdata",protectedFile)));
            string wrongFolder = Alter("wrong-folder", z=>Add(z,"OtherProduct/file.exe","bad")); Reject("Reject other product folder",()=>UpdaterEngine.Stage(Plan("bad-product",wrongFolder)));
            Directory.CreateDirectory(Path.Combine(good.Root,"UserData")); File.WriteAllText(Path.Combine(good.Root,"UserData","preferences.json"),"preserve-me"); File.WriteAllText(Path.Combine(good.Root,"artist-project.dat"),"artist-original");
            File.WriteAllText(Path.Combine(good.Root,"Sprite Check.exe"),"old-program");
            UpdaterEngine.Apply(good,files);
            Pass("Successful install writes exact program bytes",UpdateService.Hash(Path.Combine(good.Root,"Sprite Check.exe"))==UpdateService.Hash(Path.Combine(good.Job,"stage","Sprite Check.exe")));
            Pass("Successful install keeps user project and preferences",File.ReadAllText(Path.Combine(good.Root,"UserData","preferences.json"))=="preserve-me"&&File.ReadAllText(Path.Combine(good.Root,"artist-project.dat"))=="artist-original");
            Pass("Old program backup is retained",File.ReadAllText(Path.Combine(good.Job,"backup","Sprite Check.exe"))=="old-program");
            var rollback=Plan("rollback"); var rollbackFiles=UpdaterEngine.Stage(rollback); Directory.CreateDirectory(rollback.Root); File.WriteAllText(Path.Combine(rollback.Root,"GUIDE.md"),"old-guide");
            int written=0;Reject("Injected mid-install failure triggers rollback",()=>UpdaterEngine.Apply(rollback,rollbackFiles,name=>{if(++written==6)throw new IOException("Injected disk failure");}));
            Pass("Rollback restores all prior bytes and removes newly added files",Directory.GetFiles(rollback.Root,"*",SearchOption.AllDirectories).Length==1&&File.ReadAllText(Path.Combine(rollback.Root,"GUIDE.md"))=="old-guide");
            var asset=new Dictionary<string,object>{{"name","SpriteCheck-1.6.1-win-x64.zip"},{"state","uploaded"},{"size",100},{"digest","sha256:"+new string('a',64)},{"browser_download_url",UpdateService.Releases+"/download/v1.6.1/SpriteCheck-1.6.1-win-x64.zip"}};
            var release=new Dictionary<string,object>{{"tag_name","v1.6.1"},{"published_at","2026-10-26"},{"body","notes"},{"draft",false},{"prerelease",false},{"assets",new[]{asset}}};
            Pass("Stable GitHub release parsed with SHA-256",UpdateService.ParseRelease(UpdateService.Json.Serialize(release)).Version=="1.6.1");
            asset["digest"]=null;Reject("Missing GitHub digest blocks installation",()=>UpdateService.ParseRelease(UpdateService.Json.Serialize(release)));asset["digest"]="sha256:"+new string('a',64);
            asset["browser_download_url"]="https://untrusted.example/update.zip";Reject("Untrusted download source rejected",()=>UpdateService.ParseRelease(UpdateService.Json.Serialize(release)));
            Pass("Numeric versions avoid lexical downgrade",UpdateService.ParseVersion("v1.10.0")>UpdateService.ParseVersion("1.9.9"));
            var recovery=new byte[64];Encoding.ASCII.GetBytes("SPRITECHECK-DAT\0").CopyTo(recovery,0);UpdateService.ValidateRecovery(recovery);Pass("Valid 16-byte DAT signature accepted for recovery",true);
            recovery[15]=1;Reject("Invalid DAT terminator rejected",()=>UpdateService.ValidateRecovery(recovery));
            Reject("Truncated recovery rejected",()=>UpdateService.ValidateRecovery(new byte[16]));
            Console.WriteLine("PASS ALL " + checks + " native updater checks");
        } catch (Exception error) { Console.WriteLine("FAIL " + error); Environment.ExitCode=1; }
    }
}
