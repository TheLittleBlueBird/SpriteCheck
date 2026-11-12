using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Diagnostics;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: System.Reflection.AssemblyTitle("Sprite Check")]
[assembly: System.Reflection.AssemblyProduct("Sprite Check")]
[assembly: System.Reflection.AssemblyVersion("1.9.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.9.0.0")]

internal static class Program {
    [STAThread]
    private static void Main(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SpriteCheckWindow(args));
    }
}

internal sealed class SpriteCheckWindow : Form {
    private const string Origin = "https://spritecheck.local";
    private readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    private readonly string[] args;
    private readonly WebView2 web = new WebView2();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 100 * 1024 * 1024 };
    private readonly bool selfTest;
    private bool ready;
    private string testDirectory;
    private StreamWriter testLog;
    private readonly Timer startupTimeout = new Timer { Interval = 30000 };
    private readonly Queue<Dictionary<string, object>> saves = new Queue<Dictionary<string, object>>();
    private bool saving;
    private bool updating, restarting;
    private ReleaseCandidate updateCandidate;

    public SpriteCheckWindow(string[] arguments) {
        args = arguments;
        selfTest = args.Contains("--self-test");
        Text = "Sprite Check 1.9.0";
        BackColor = Color.FromArgb(11, 13, 23);
        StartPosition = FormStartPosition.CenterScreen;
        var available = Screen.PrimaryScreen.WorkingArea;
        ClientSize = new Size(Math.Min(1440, available.Width - 40), Math.Min(940, available.Height - 80));
        MinimumSize = new Size(1100, 660);
        var iconPath = Path.Combine(root, "sprite-check.ico");
        if (File.Exists(iconPath)) Icon = new Icon(iconPath);
        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = BackColor;
        Controls.Add(web);
        Shown += async (sender, e) => await Initialize();
        startupTimeout.Tick += (sender, e) => { startupTimeout.Stop(); Fail(new TimeoutException("The local Sprite Check window did not load within 30 seconds.")); };
        FormClosing += (sender, e) => { if (updating && !restarting) { e.Cancel = true; return; } startupTimeout.Dispose(); if (testLog != null) testLog.Dispose(); };
    }

    private async Task Initialize() {
        try {
            var appFolder = Path.Combine(root, "app");
            if (!File.Exists(Path.Combine(appFolder, "index.html"))) throw new FileNotFoundException("Extract the complete Sprite Check ZIP before opening Sprite Check.exe.");
            if (selfTest) {
                int i = Array.IndexOf(args, "--self-test");
                testDirectory = Path.GetFullPath(args.Length > i + 1 ? args[i + 1] : Path.Combine(root, "self-test"));
                Directory.CreateDirectory(testDirectory);
                testLog = new StreamWriter(Path.Combine(testDirectory, "native-runtime.log"), false) { AutoFlush = true };
            }
            var userData = Path.Combine(root, selfTest ? "TestUserData" : "UserData");
            Directory.CreateDirectory(userData);
            var environment = await CoreWebView2Environment.CreateAsync(null, userData);
            await web.EnsureCoreWebView2Async(environment);
            var core = web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping("spritecheck.local", appFolder, CoreWebView2HostResourceAccessKind.DenyCors);
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDevToolsEnabled = selfTest;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            await core.AddScriptToExecuteOnDocumentCreatedAsync("window.spriteCheckDesktop = {version:'1.9.0'};");
            core.NewWindowRequested += (sender, e) => { e.Handled = true; };
            core.PermissionRequested += (sender, e) => { e.State = CoreWebView2PermissionState.Deny; };
            core.NavigationStarting += (sender, e) => {
                Uri uri;
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out uri) || uri.Scheme != "https" || uri.Host != "spritecheck.local") e.Cancel = true;
            };
            core.WebMessageReceived += ReceiveSave;
            core.ProcessFailed += (sender, e) => {
                if (testLog != null) testLog.WriteLine("FAIL WebView2 process: " + e.ProcessFailedKind);
            };
            core.NavigationCompleted += async (sender, e) => {
                if (ready) return;
                ready = true;
                startupTimeout.Stop();
                try {
                    if (!e.IsSuccess) throw new Exception("Local app navigation failed: " + e.WebErrorStatus);
                    for (int attempt = 0; attempt < 200; attempt++) {
                        if (await core.ExecuteScriptAsync("!!window.spriteCheck?.ready") == "true") break;
                        await Task.Delay(100);
                    }
                    if (await core.ExecuteScriptAsync("!!window.spriteCheck?.ready") != "true") throw new Exception("Sprite Check did not finish loading.");
                    if (selfTest) { await RunSelfTest(); Close(); }
                    else {
                        var file = args.FirstOrDefault(a => a.EndsWith(".dat", StringComparison.OrdinalIgnoreCase) || a.EndsWith(".png", StringComparison.OrdinalIgnoreCase));
                        if (file != null) await OpenFile(file);
                        int updateArgument = Array.IndexOf(args, "--update-complete");
                        if (updateArgument >= 0 && args.Length > updateArgument + 1) {
                            string job = Path.GetFullPath(args[updateArgument + 1]);
                            string allowed = Path.GetFullPath(Path.Combine(root, "Updates")) + Path.DirectorySeparatorChar;
                            Guid id;
                            if (!job.StartsWith(allowed, StringComparison.OrdinalIgnoreCase) || !Guid.TryParseExact(Path.GetFileName(job), "N", out id)) throw new IOException("Invalid completed-update path.");
                            string recoveryState = await core.ExecuteScriptAsync("({version:window.spriteCheckDesktop.version,hasProject:!!spriteCheck.project,draft:spriteCheck.project?.draft??null,dirty:spriteCheck.project?.dirty??false,mergedFrames:spriteCheck.project?.merged?.frames.length??null,compare:spriteCheck.compare,layout:spriteCheck.layout.preferences,time:spriteCheck.time,summary:document.getElementById('sheetSummary').textContent})");
                            using (var image = File.Create(Path.Combine(job, "updated-window.png"))) await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, image);
                            File.WriteAllText(Path.Combine(job, "ready"), recoveryState);
                        }
                    }
                } catch (Exception error) { Fail(error); }
            };
            startupTimeout.Start();
            core.Navigate(Origin + "/index.html");
        } catch (Exception error) { Fail(error); }
    }

    private void Fail(Exception error) {
        if (testLog != null) { testLog.WriteLine("FAIL " + error); Environment.ExitCode = 1; Close(); return; }
        MessageBox.Show(this, error.Message + "\n\nSprite Check requires Microsoft Edge WebView2 Runtime and a writable extracted folder. See README.txt.", "Sprite Check", MessageBoxButtons.OK, MessageBoxIcon.Error);
        Close();
    }

    private async Task OpenFile(string path) {
        var file = new FileInfo(Path.GetFullPath(path));
        if (!file.Exists || file.Length > 68L * 1024 * 1024) throw new IOException("Project file is missing or larger than 68 MiB.");
        string name = json.Serialize(file.Name), b64 = json.Serialize(Convert.ToBase64String(File.ReadAllBytes(file.FullName)));
        string token = json.Serialize(Guid.NewGuid().ToString("N"));
        await web.CoreWebView2.ExecuteScriptAsync("(async()=>{try{await window.spriteCheck.openNativeFile(" + name + "," + b64 + ");window.__nativeOpen={token:" + token + ",ok:true};}catch(error){window.__nativeOpen={token:" + token + ",error:String(error)};}})()");
        for (int attempt = 0; attempt < 1200; attempt++) {
            string result = await web.CoreWebView2.ExecuteScriptAsync("window.__nativeOpen?.token===" + token + "?window.__nativeOpen:null");
            if (result != "null") {
                var opened = json.Deserialize<Dictionary<string, object>>(result);
                if (opened.ContainsKey("error")) throw new IOException(Convert.ToString(opened["error"]));
                return;
            }
            await Task.Delay(100);
        }
        throw new IOException("Opening the project timed out.");
    }

    private async void ReceiveSave(object sender, CoreWebView2WebMessageReceivedEventArgs e) {
        Uri uri;
        if (!Uri.TryCreate(e.Source, UriKind.Absolute, out uri) || uri.Scheme != "https" || uri.Host != "spritecheck.local") return;
        try {
            var packet = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
            if (packet == null || !packet.ContainsKey("kind")) return;
            string kind = (string)packet["kind"];
            if (kind == "update-open-release") { Process.Start(new ProcessStartInfo(UpdateService.Releases) { UseShellExecute = true }); return; }
            if (kind == "update-check" || kind == "update-install") { await HandleUpdate(packet, kind); return; }
            if (kind == "export-bundle") { ExportBundle(packet); return; }
            if (kind != "save-file") return;
            saves.Enqueue(packet);
            if (saving) return;
            saving = true;
            try {
                while (saves.Count > 0) SavePacket(saves.Dequeue());
            } finally { saving = false; }
        } catch (Exception error) {
            if (testLog != null) testLog.WriteLine("FAIL Save bridge " + error);
            web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new { kind = "save-result", message = "Save failed: " + error.Message, error = true }));
        }
    }

    private void UpdateState(int requestId, string state, ReleaseCandidate release = null, string message = null, int percent = 0) {
        if (IsDisposed || web.CoreWebView2 == null) return;
        web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new { kind = "update-state", requestId, state, version = release == null ? null : release.Version, notes = release == null ? null : release.Notes, message, percent }));
    }

    private async Task HandleUpdate(Dictionary<string, object> packet, string kind) {
        int requestId = Convert.ToInt32(packet["requestId"]);
        if (updating) { UpdateState(requestId, "error", null, "An update request is still running. Please try again shortly."); return; }
        updating = true;
        try {
            if (kind == "update-check") {
                updateCandidate = await Task.Run(() => UpdateService.Check());
                UpdateState(requestId, UpdateService.ParseVersion(updateCandidate.Version) > UpdateService.ParseVersion(UpdateService.Version) ? "available" : "current", updateCandidate);
                return;
            }
            if (updateCandidate == null || UpdateService.ParseVersion(updateCandidate.Version) <= UpdateService.ParseVersion(UpdateService.Version)) throw new IOException("Check for an available update first.");
            string job = UpdaterEngine.Child(root, "Updates/" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(job);
            object rawSession; packet.TryGetValue("session", out rawSession);
            string session = rawSession as string;
            var plan = new UpdatePlan { Root = root.TrimEnd('\\'), Job = job, Package = Path.Combine(job, "package.zip"), Digest = updateCandidate.Digest, Version = updateCandidate.Version, ProcessId = Process.GetCurrentProcess().Id, ProcessStart = Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks };
            if (session != null) {
                if (session.Length > 96 * 1024 * 1024) throw new IOException("Recovery project is too large.");
                byte[] bytes = Convert.FromBase64String(session);
                UpdateService.ValidateRecovery(bytes);
                plan.Session = Path.Combine(job, "resume.dat"); File.WriteAllBytes(plan.Session, bytes);
            }
            var progress = new Progress<int>(percent => UpdateState(requestId, "downloading", updateCandidate, null, percent));
            await Task.Run(() => UpdateService.Download(updateCandidate, plan.Package, percent => ((IProgress<int>)progress).Report(percent)));
            // Validate the archive while the current app is still open. The helper verifies again independently.
            await Task.Run(() => UpdaterEngine.Stage(new UpdatePlan { Package = plan.Package, Digest = plan.Digest, Version = plan.Version, Job = Path.Combine(job, "preflight") }));
            File.WriteAllText(Path.Combine(job, "plan.json"), json.Serialize(plan));
            string helper = Path.Combine(job, "SpriteCheck.Updater.exe"); File.Copy(Path.Combine(root, "SpriteCheck.Updater.exe"), helper);
            Process.Start(new ProcessStartInfo(helper, "\"" + Path.Combine(job, "plan.json") + "\"") { UseShellExecute = false, WorkingDirectory = job, WindowStyle = ProcessWindowStyle.Hidden });
            UpdateState(requestId, "installing", updateCandidate, null, 100); restarting = true; Close();
        } catch (Exception error) {
            UpdateState(requestId, "error", null, error.Message);
            if (testLog != null) testLog.WriteLine("UPDATE " + error.Message);
        } finally { updating = false; }
    }

    private void ExportBundle(Dictionary<string,object> packet) {
        int requestId=Convert.ToInt32(packet["requestId"]);
        try {
            string name=(string)packet["name"],b64=(string)packet["base64"];
            if(!System.Text.RegularExpressions.Regex.IsMatch(name,"^[A-Za-z0-9_][A-Za-z0-9_-]{0,69}$"))throw new IOException("Invalid export folder name.");
            if(b64.Length>96*1024*1024)throw new IOException("Export exceeds64MiB.");
            byte[] bytes=Convert.FromBase64String(b64);if(bytes.Length>64*1024*1024)throw new IOException("Export exceeds64MiB.");
            using(var stream=new MemoryStream(bytes))using(var archive=new System.IO.Compression.ZipArchive(stream,System.IO.Compression.ZipArchiveMode.Read)) {
                if(archive.Entries.Count<1||archive.Entries.Count>65535)throw new IOException("Invalid export file count.");
                var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
                foreach(var entry in archive.Entries) {
                    string extension=Path.GetExtension(entry.FullName).ToLowerInvariant();
                    if(entry.FullName!=entry.Name||!System.Text.RegularExpressions.Regex.IsMatch(entry.Name,"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,179}$")||!names.Add(entry.Name)||(extension!=".png"&&extension!=".json"&&extension!=".dat"))throw new IOException("Invalid export entry name.");
                    if(System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileNameWithoutExtension(entry.Name),"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$",System.Text.RegularExpressions.RegexOptions.IgnoreCase))throw new IOException("Reserved export filename.");
                    total+=entry.Length;if(total>64*1024*1024)throw new IOException("Export files exceed64MiB.");
                }
                string parent;
                if(selfTest)parent=testDirectory;
                else using(var dialog=new FolderBrowserDialog()) {
                    dialog.Description="Select parent folder. Sprite Check creates a new subfolder for all exported files.";
                    dialog.ShowNewFolderButton=true;
                    if(dialog.ShowDialog(this)!=DialogResult.OK){web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{kind="export-result",requestId,message="Export cancelled.",error=false}));return;}
                    parent=dialog.SelectedPath;
                }
                parent=Path.GetFullPath(parent).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
                string folder=Path.GetFullPath(Path.Combine(parent,name+"_frames"));int suffix=1;
                while(Directory.Exists(folder)||File.Exists(folder))folder=Path.GetFullPath(Path.Combine(parent,name+"_frames_"+(suffix++)));
                if(!folder.StartsWith(parent,StringComparison.OrdinalIgnoreCase))throw new IOException("Invalid export destination.");
                Directory.CreateDirectory(folder);
                foreach(var entry in archive.Entries){string destination=Path.GetFullPath(Path.Combine(folder,entry.Name));if(!destination.StartsWith(folder+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new IOException("Invalid entry destination.");using(var input=entry.Open())using(var output=new FileStream(destination,FileMode.CreateNew,FileAccess.Write))input.CopyTo(output);}
                if(testLog!=null)testLog.WriteLine("SAVED FOLDER "+folder+" "+archive.Entries.Count+" files");
                web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{kind="export-result",requestId,message="Exported "+archive.Entries.Count+" files to "+folder,error=false}));
            }
        }catch(Exception error){if(testLog!=null)testLog.WriteLine("FAIL Export bundle "+error);web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{kind="export-result",requestId,message="Export failed: "+error.Message,error=true}));}
    }

    private void SavePacket(Dictionary<string, object> packet) {
        string name = Path.GetFileName((string)packet["name"]);
        string extension = Path.GetExtension(name).ToLowerInvariant();
        if (extension != ".dat" && extension != ".png" && extension != ".json") throw new IOException("Unsupported export extension.");
        string b64 = (string)packet["base64"];
        if (b64.Length > 96 * 1024 * 1024) throw new IOException("Export is too large.");
        byte[] data = Convert.FromBase64String(b64);
        string destination;
        if (selfTest) destination = Path.Combine(testDirectory, name);
        else {
            using (var dialog = new SaveFileDialog()) {
                dialog.Title = extension == ".dat" ? "Save Sprite Check project" : "Export Sprite Check " + extension;
                dialog.FileName = name;
                dialog.DefaultExt = extension.TrimStart('.');
                dialog.AddExtension = true;
                dialog.Filter = extension == ".dat" ? "Sprite Check project (*.dat)|*.dat" : extension == ".png" ? "PNG image (*.png)|*.png" : "JSON manifest (*.json)|*.json";
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                destination = dialog.FileName;
            }
        }
        // Write a temporary sibling first, then replace atomically after the user selects a path.
        string temporary = destination + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllBytes(temporary, data);
        try {
            if (File.Exists(destination)) File.Replace(temporary, destination, null);
            else File.Move(temporary, destination);
        } finally { if (File.Exists(temporary)) File.Delete(temporary); }
        if (testLog != null) testLog.WriteLine("SAVED " + name + " " + data.Length + " bytes");
        web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new { kind = "save-result", message = "Saved " + name, error = false }));
    }

    private async Task Check(string description, string expression) {
        string result = await web.CoreWebView2.ExecuteScriptAsync(expression);
        if (result != "true") throw new Exception(description + " returned " + result);
        testLog.WriteLine("PASS " + description);
    }

    private async Task CheckCompareLoopResume(string phase, int rowIndex) {
        string looped = "(()=>{const p=spriteCheck.project,o=p.sheet.original[" + rowIndex + "],e=p.merged?p.merged.manifest.animations[" + rowIndex + "]:p.draft[" + rowIndex + "];return spriteCheck.time>Math.max(o.keys.reduce((n,k)=>n+k.ticks,0)/o.fps,(e.totalTicks??e.keys.reduce((n,k)=>n+k.ticks,0))/e.fps)*1.3})()";
        for (int n = 0; n < 80 && await web.CoreWebView2.ExecuteScriptAsync(looped) != "true"; n++) await Task.Delay(100);
        await Check(phase + " Compare clock advances beyond one loop", looped);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('play').click();{const t=spriteCheck.time,l=document.getElementById('compareOriginal').toDataURL(),r=document.getElementById('compareMerged').toDataURL();document.getElementById('play').click();window.__compareResumeExact=spriteCheck.time===t&&l===document.getElementById('compareOriginal').toDataURL()&&r===document.getElementById('compareMerged').toDataURL()}");
        await Check(phase + " Compare resumes exact paused time and pixels", "window.__compareResumeExact===true && spriteCheck.playing");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('play').click();{const p=spriteCheck.project,row=Number(document.querySelector('#rows .active').dataset.row),a=spriteCheck.mode==='merged'?p.merged.manifest.animations[row]:spriteCheck.mode==='original'?p.sheet.original[row]:p.draft[row],duration=(a.totalTicks??a.keys.reduce((n,k)=>n+k.ticks,0))/a.fps,phase=spriteCheck.time%duration,pixels=document.getElementById('previewCanvas').toDataURL();document.getElementById('sheetTab').click();document.getElementById('play').click();window.__sheetResumeExact=Math.abs(spriteCheck.time-phase)<1e-7&&pixels===document.getElementById('previewCanvas').toDataURL();document.getElementById('compareTab').click()}");
        await Check(phase + " Sheet resumes the same frame after Compare loop", "window.__sheetResumeExact===true && spriteCheck.playing");
        await web.CoreWebView2.ExecuteScriptAsync("if(!document.getElementById('compareLink').checked)document.getElementById('compareLink').click();document.getElementById('compareOriginalFit').click();document.getElementById('compareLink').click();{const right=JSON.stringify(spriteCheck.compare.right),leftPixels=document.getElementById('compareOriginal').toDataURL(),rightPixels=document.getElementById('compareMerged').toDataURL();document.getElementById('compareOriginalIn').click();window.__compareZoomExact=right===JSON.stringify(spriteCheck.compare.right)&&leftPixels!==document.getElementById('compareOriginal').toDataURL()&&rightPixels===document.getElementById('compareMerged').toDataURL()}");
        await Check(phase + " unlinked zoom changes only the left pixels", "window.__compareZoomExact===true");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('compareOriginalActual').click()");
        await Check(phase + " Compare actual size is 100 percent", "document.getElementById('compareOriginalZoom').textContent==='100%'");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('compareLink').click();document.getElementById('compareOriginalFit').click()");
        await Check(phase + " Compare Fit and toolbar restore correctly", "spriteCheck.compare.left.zoom===1 && spriteCheck.compare.right.zoom===1 && getComputedStyle(document.querySelector('.canvas-toolbar')).display==='none'");
    }

    private async Task CheckReadableLayout() {
        await Check("Every visible native UI text/control uses at least 12px", @"[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||e.matches('input,select,button'))).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)");
        await web.CoreWebView2.ExecuteScriptAsync(@"{const before=JSON.stringify(spriteCheck.project.draft),history=spriteCheck.project.undoStack.length,time=spriteCheck.time,sizes=spriteCheck.layout.sizes;for(const [id,key]of [['sidebarDivider','ArrowRight'],['inspectorDivider','ArrowLeft'],['timelineDivider','ArrowUp'],['previewDivider','ArrowUp']]){const h=document.getElementById(id);h.focus();h.dispatchEvent(new KeyboardEvent('keydown',{key,code:key,bubbles:true,cancelable:true}));}window.__layoutCheck=before===JSON.stringify(spriteCheck.project.draft)&&history===spriteCheck.project.undoStack.length&&time===spriteCheck.time&&sizes.sidebar!==spriteCheck.layout.sizes.sidebar&&sizes.inspector!==spriteCheck.layout.sizes.inspector&&sizes.timeline!==spriteCheck.layout.sizes.timeline&&sizes.preview!==spriteCheck.layout.sizes.preview;}");
        await Task.Delay(120);
        await Check("Native splitters resize four panes without changing animation/history", "window.__layoutCheck===true && document.querySelector('.editor').clientWidth>=298");
        using (var resized = File.Create(Path.Combine(testDirectory, "native-layout-compact.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, resized);
        ClientSize = new Size(1440, 940);
        await Task.Delay(150);
        await web.CoreWebView2.ExecuteScriptAsync(@"document.getElementById('resetLayout').click();for(const[id,key]of [['timelineDivider','ArrowUp'],['inspectorDivider','ArrowLeft'],['previewDivider','ArrowDown']]){const h=document.getElementById(id);h.dispatchEvent(new KeyboardEvent('keydown',{key,code:key,bubbles:true,cancelable:true,shiftKey:true}));}");
        await Task.Delay(120);
        await Check("Native enlarged layout keeps the Timeline inside the window", "document.getElementById('scrubber').getBoundingClientRect().bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth");
        using (var enlarged = File.Create(Path.Combine(testDirectory, "native-layout-large.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, enlarged);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('resetLayout').click();document.getElementById('play').focus()");
        ClientSize = new Size(1280, 680);
        await Task.Delay(150);
    }

    private async Task CheckFileMenuAndLog() {
        await Check("Project DAT actions are in the top application menu bar", "document.querySelector('.menubar #openProject')!==null && document.querySelector('.menubar #saveProject')!==null && document.querySelector('.sidebar #openProject')===null && document.getElementById('openProject').getBoundingClientRect().bottom<=document.querySelector('.brand').getBoundingClientRect().top+1");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('compareTab').click();window.__logHiddenHeight=document.getElementById('compareOriginalStage').clientHeight;document.getElementById('compareLogToggle').click()");
        await Task.Delay(150);
        await Check("Compare Log opens with measured source rows", "!document.getElementById('compareLog').hidden && spriteCheck.compare.log && document.getElementById('compareLogRows').rows.length===7");
        using (var shown = File.Create(Path.Combine(testDirectory, "native-log-open.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, shown);
        await web.CoreWebView2.ExecuteScriptAsync("window.__logShownHeight=document.getElementById('compareOriginalStage').clientHeight;document.getElementById('compareLogClose').click()");
        await Task.Delay(150);
        await Check("Closing Compare Log returns its space to the animation viewport", "document.getElementById('compareLog').hidden && !spriteCheck.compare.log && document.getElementById('compareOriginalStage').clientHeight>window.__logShownHeight");
        using (var hidden = File.Create(Path.Combine(testDirectory, "native-log-closed.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, hidden);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('fileMenuButton').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',bubbles:true,cancelable:true}))");
        await Check("File menu keyboard opens and focuses its first command", "!document.getElementById('fileMenu').hidden && document.activeElement===document.getElementById('menuOpenPNG')");
        using (var menu = File.Create(Path.Combine(testDirectory, "native-file-menu.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, menu);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('menuOpenPNG').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));window.__beforeReset=spriteCheck.project;document.getElementById('fileMenuButton').click();document.getElementById('menuResetScene').click();document.getElementById('cancelResetScene').click()");
        await Check("Cancel Reset preserves current native project", "spriteCheck.project===window.__beforeReset && !document.getElementById('resetSceneDialog').open");
        await web.CoreWebView2.ExecuteScriptAsync("window.__beforeResetLayout=JSON.stringify(spriteCheck.layout.preferences);document.getElementById('play').click();document.getElementById('fileMenuButton').click();document.getElementById('menuResetScene').click()");
        using (var dialog = File.Create(Path.Combine(testDirectory, "native-reset-confirmation.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, dialog);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('confirmResetScene').click()");
        await Check("Reset Scene clears playback, source, keys, logs and keeps pane preferences", "spriteCheck.project===null && !spriteCheck.playing && spriteCheck.time===0 && document.getElementById('rows').children.length===0 && document.getElementById('keyframes').children.length===0 && document.getElementById('sourceFrame').options.length===0 && document.getElementById('compareLogRows').rows.length===0 && document.getElementById('sheetSummary').textContent==='Open a PNG or .dat project to begin.' && document.getElementById('saveProject').disabled && document.getElementById('menuResetScene').disabled && document.getElementById('sheetCanvas').hidden && JSON.stringify(spriteCheck.layout.preferences)===window.__beforeResetLayout");
        using (var empty = File.Create(Path.Combine(testDirectory, "native-reset-empty.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, empty);
        await OpenFile(Path.Combine(root, "app", "assets", "test-sheet.png"));
        for (int n=0;n<100 && await web.CoreWebView2.ExecuteScriptAsync("spriteCheck.project!==null && !document.body.classList.contains('busy')")!="true";n++) await Task.Delay(100);
        await Check("Original PNG reopens normally after Reset Scene", "spriteCheck.project!==null && spriteCheck.project.sheet.frames.length===116 && !spriteCheck.playing");
    }

    private async Task WaitForSaved(string name) {
        string path=Path.Combine(testDirectory,name);
        for(int n=0;n<1200&&!File.Exists(path);n++)await Task.Delay(100);
        if(!File.Exists(path))throw new Exception("Native paint save did not complete: "+name);
        await Task.Delay(100);
    }

    private async Task CheckPaintEditor() {
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('compareTab').click();window.__paintOriginalBefore=document.getElementById('compareOriginal').toDataURL();window.__paintEditedBefore=document.getElementById('compareMerged').toDataURL();document.getElementById('paintTab').click()");
        await Check("Paint opens a selected source frame with a usable canvas", "!document.getElementById('paintViewport').hidden && spriteCheck.paint.sourceId===0 && spriteCheck.paint.geometry.scale>0 && document.getElementById('paintCanvas').height>100 && document.getElementById('paintFrameSelect').value==='0'");
        // Integration probe uses the application's normal commit callback; physical strokes are checked separately through CUA.
        await web.CoreWebView2.ExecuteScriptAsync("{const p=spriteCheck.project,f=p.sheet.frames[0],data=f.data.slice();window.__paintOffset=(9*p.sheet.grid.cellWidth+7)*4;window.__paintOriginal=Array.from(f.data.subarray(__paintOffset,__paintOffset+4));data.set([255,29,223,255],__paintOffset);spriteCheck.paint.onCommit(0,data);}");
        await Check("Paint replaces one source buffer, keeps baseline and records one undo", "spriteCheck.project.hasPixelEdits && spriteCheck.project.undoStack.length===1 && spriteCheck.project.dirty && spriteCheck.project.sheet.frames[0].data[__paintOffset]===255 && spriteCheck.project.originalSheet.frames[0].data[__paintOffset]===__paintOriginal[0] && spriteCheck.project.sheet.frames.length===116");
        await Check("Live Preview refreshes after a pixel edit", "document.getElementById('previewMode').textContent==='PAINT FRAME' && document.getElementById('paintResetFrame').disabled===false && document.getElementById('paintPalette').querySelector('[aria-label=\"#FF1DDFFF\"]')!==null");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('compareTab').click()");
        await Check("Original Compare stays unchanged while edited Compare pixels change", "document.getElementById('compareOriginal').toDataURL()===__paintOriginalBefore && document.getElementById('compareMerged').toDataURL()!==__paintEditedBefore");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('paintTab').click();document.getElementById('paintUndo').click()");
        await Check("Paint Undo restores exact pixels without moving source IDs", "!spriteCheck.project.hasPixelEdits && spriteCheck.project.undoStack.length===0 && spriteCheck.project.redoStack.length===1 && spriteCheck.project.sheet.frames[0].id===0 && spriteCheck.project.sheet.frames[0].data[__paintOffset]===__paintOriginal[0]");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('paintRedo').click();{const p=spriteCheck.project;spriteCheck.paint.onCommit(0,new Uint8ClampedArray(p.sheet.frames[0].data.length));}");
        await Check("Erasing a whole frame preserves its cell and timeline references", "spriteCheck.project.sheet.frames[0].data.every(n=>n===0) && spriteCheck.project.sheet.frames[0].id===0 && spriteCheck.project.sheet.cells[0].frameId===0 && spriteCheck.project.draft[0].keys[0].sourceId===0 && spriteCheck.project.sheet.frames.length===116");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('paintUndo').click();document.getElementById('exportName').value='paint-native';document.getElementById('saveProject').click()");
        await WaitForSaved("paint-native.dat");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('paintExport').click()");
        await WaitForSaved("paint-native-edited.png");
        await OpenFile(Path.Combine(testDirectory,"paint-native.dat"));
        await Check("Painted DAT v2 reopens Paint, working pixels and original source with fresh history", "spriteCheck.project.hasPixelEdits && !document.getElementById('paintViewport').hidden && spriteCheck.project.sheet.frames[0].data[__paintOffset]===255 && spriteCheck.project.originalSheet.frames[0].data[__paintOffset]===__paintOriginal[0] && spriteCheck.project.undoStack.length===0 && spriteCheck.paint.sourceId===0");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('confirm').click();document.getElementById('merge').click()");
        for(int n=0;n<200&&await web.CoreWebView2.ExecuteScriptAsync("!!spriteCheck.project.merged && !document.body.classList.contains('busy')")!="true";n++)await Task.Delay(100);
        await Check("Merge after painting preserves twelve animation rows and edited source references", "spriteCheck.project.merged?.manifest.animations.length===12 && spriteCheck.project.merged.manifest.animations.reduce((n,a)=>n+a.totalTicks,0)===116");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('export').click();document.getElementById('downloadBoth').click();document.getElementById('exportDialog').close();document.getElementById('paintTab').click()");
        await WaitForSaved("paint-native-merged.png");await WaitForSaved("paint-native-merged.json");
        using(var image=File.Create(Path.Combine(testDirectory,"native-paint.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        await Check("Paint controls keep at least 12px text", "[...document.querySelectorAll('#paintViewport button,#paintViewport input,#paintViewport label,#paintViewport span')].filter(e=>e.getClientRects().length).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)");
        await OpenFile(Path.Combine(root,"app","assets","test-sheet.png"));
    }

    private async Task CheckLargeSheet() {
        ClientSize=new Size(1440,940);await Task.Delay(200);
        await OpenFile(Path.Combine(testDirectory,"large-8192.png"));
        await Check("8192 PNG opens with usable auto grid and full source canvas", "spriteCheck.project.sheet.image.width===8192 && spriteCheck.project.sheet.image.height===8192 && spriteCheck.project.sheet.cells.length<=4096 && document.getElementById('sheetCanvas').width===8192 && document.getElementById('sourceDimensions').textContent==='8192 × 8192 px'");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('detect').click()");
        for(int n=0;n<1200&&(await web.CoreWebView2.ExecuteScriptAsync("!!spriteCheck.project.detection&&!document.body.classList.contains('busy')"))!="true";n++)await Task.Delay(100);
        await Check("Detect infers2048x2048 uniform cells in an8192 PNG", "spriteCheck.project.sheet.grid.cellWidth===2048 && spriteCheck.project.sheet.grid.cellHeight===2048 && spriteCheck.project.sheet.frames.length===16");
        await web.CoreWebView2.ExecuteScriptAsync("window.__largeFit=document.getElementById('sheetCanvas').clientWidth;document.getElementById('zoomOut').click()");
        await Check("8192 Sheet zoom out shrinks the fitted image", "document.getElementById('sheetCanvas').clientWidth<__largeFit");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('zoomFit').click();document.getElementById('openGrid').click();for(const id of ['cellWidth','cellHeight'])document.getElementById(id).value='2048';document.getElementById('gridForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));document.getElementById('paintTab').click();document.getElementById('paintFit').click()");
        await Check("8192 custom grid keeps sixteen source frames and Paint fits", "spriteCheck.project.sheet.frames.length===16 && spriteCheck.project.sheet.grid.rows===4 && spriteCheck.paint.zoom*2048<=document.getElementById('paintStage').clientHeight && !document.getElementById('paintViewport').hidden");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('exportName').value='large-original';document.getElementById('saveProject').click()");
        await WaitForSaved("large-original.dat");await OpenFile(Path.Combine(testDirectory,"large-original.dat"));
        await Check("8192 unpainted DAT v1 reopens full dimensions and source frame order", "spriteCheck.project.sheet.image.width===8192 && spriteCheck.project.sheet.image.height===8192 && !spriteCheck.project.hasPixelEdits && spriteCheck.project.sheet.frames.length===16 && spriteCheck.project.draft.every((a,r)=>a.keys.every((k,c)=>k.sourceId===r*4+c))");
        await web.CoreWebView2.ExecuteScriptAsync("{const p=spriteCheck.project,data=p.sheet.frames[0].data.slice();data.set([251,99,33,255],(9*2048+7)*4);spriteCheck.paint.onCommit(0,data);}document.getElementById('paintUndo').click();document.getElementById('paintRedo').click();document.getElementById('exportName').value='large-8192';document.getElementById('saveProject').click()");
        await WaitForSaved("large-8192.dat");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('paintExport').click()");
        await WaitForSaved("large-8192-edited.png");
        await OpenFile(Path.Combine(testDirectory,"large-8192.dat"));
        await Check("8192 painted DAT reopens original and working pixels with original timeline", "spriteCheck.project.sheet.image.width===8192 && spriteCheck.project.hasPixelEdits && spriteCheck.project.sheet.frames.length===16 && spriteCheck.project.sheet.frames[0].data[(9*2048+7)*4]===251 && spriteCheck.project.originalSheet.frames[0].data[(9*2048+7)*4]===0 && spriteCheck.project.undoStack.length===0 && spriteCheck.project.draft.every(a=>a.keys.length===4)");
        using(var image=File.Create(Path.Combine(testDirectory,"native-large-paint.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('confirm').click();document.getElementById('merge').click()");
        for(int n=0;n<1200&&(await web.CoreWebView2.ExecuteScriptAsync("!!spriteCheck.project.merged && !document.body.classList.contains('busy')"))!="true";n++)await Task.Delay(100);
        await Check("8192 Merge packs all sixteen unique frames without changing duration", "spriteCheck.project.merged.width===8192 && spriteCheck.project.merged.height===8192 && spriteCheck.project.merged.frames.length===16 && spriteCheck.project.merged.manifest.animations.every(a=>a.totalTicks===4)");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('export').click();document.getElementById('downloadBoth').click()");
        await WaitForSaved("large-8192-merged.png");await WaitForSaved("large-8192-merged.json");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('exportDialog').close();document.getElementById('compareTab').click();document.getElementById('play').click()");
        await Task.Delay(250);
        await Check("8192 Compare animates after Merge", "!document.getElementById('compareViewport').hidden && spriteCheck.playing && spriteCheck.time>0 && document.getElementById('compareOriginal').width>0 && document.getElementById('compareMerged').width>0");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('play').click()");
        using(var image=File.Create(Path.Combine(testDirectory,"native-large-compare.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        testLog.WriteLine("PASS 8192 native DAT, edited PNG and merged PNG/JSON saves");
    }

    private async Task CheckFrameDeleteAndGrid() {
        ClientSize=new Size(1440,940);await Task.Delay(150);
        await web.CoreWebView2.ExecuteScriptAsync(@"window.__pickSource=id=>{document.getElementById('sheetTab').click();document.getElementById('viewOriginal').click();const p=spriteCheck.project,f=p.sheet.frames[id],c=document.getElementById('sheetCanvas'),r=c.getBoundingClientRect();c.focus();c.dispatchEvent(new MouseEvent('click',{clientX:r.left+(f.x+p.sheet.grid.cellWidth/2)*r.width/c.width,clientY:r.top+(f.y+p.sheet.grid.cellHeight/2)*r.height/c.height,bubbles:true}));};__pickSource(2);{const f=spriteCheck.project.sheet.frames[2];window.__deletedData=f.data.slice();let i=0;while(!f.data[i+3])i+=4;window.__deletedPoint={x:f.x+(i/4)%105,y:f.y+Math.floor(i/4/105)};}document.getElementById('removeFrame').click();");
        await Check("Remove Frame changes Idle12 to11 and clears only its edited cell", "spriteCheck.project.draft[0].keys.length===11 && !spriteCheck.project.draft[0].keys.some(k=>k.sourceId===2) && spriteCheck.project.sheet.frames.length===116 && spriteCheck.project.sheet.frames[2].data.every((v,i)=>v===__deletedData[i]) && document.getElementById('sheetCanvas').getContext('2d').getImageData(__deletedPoint.x,__deletedPoint.y,1,1).data[3]===0 && document.getElementById('viewOriginal').textContent==='Edited sheet'");
        using(var image=File.Create(Path.Combine(testDirectory,"native-remove-frame-controls.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('exportName').value='frame-one-removed';document.getElementById('paintExport').click()");
        await WaitForSaved("frame-one-removed-edited.png");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('sheetCanvas').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',key:'z',ctrlKey:true,bubbles:true,cancelable:true}))");
        await Check("Frame deletion CtrlZ restores image and exact12-key order", "spriteCheck.project.draft[0].keys.length===12 && spriteCheck.project.draft[0].keys.every((k,i)=>k.sourceId===i) && document.getElementById('sheetCanvas').getContext('2d').getImageData(__deletedPoint.x,__deletedPoint.y,1,1).data[3]>0");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('sheetCanvas').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyY',key:'y',ctrlKey:true,bubbles:true,cancelable:true}));__pickSource(0);document.getElementById('removeFrame').click();document.getElementById('duplicateKey').click();document.getElementById('removeFrame').click()");
        await Check("Removing a repeated key preserves its remaining source and other rows", "spriteCheck.project.draft[0].keys.length===10 && spriteCheck.project.draft[0].keys.filter(k=>k.sourceId===1).length===1 && spriteCheck.project.draft[1].keys.length===12 && spriteCheck.project.sheet.frames[1].data.some(v=>v>0)");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('exportName').value='frame-two-removed';document.getElementById('saveProject').click()");
        await WaitForSaved("frame-two-removed.dat");await OpenFile(Path.Combine(testDirectory,"frame-two-removed.dat"));
        await Check("DAT retains deleted keys while keeping116 original sources", "spriteCheck.project.draft[0].keys.length===10 && !spriteCheck.project.draft[0].keys.some(k=>k.sourceId===0||k.sourceId===2) && spriteCheck.project.sheet.frames.length===116 && !spriteCheck.project.hasPixelEdits && spriteCheck.project.undoStack.length===0");
        await web.CoreWebView2.ExecuteScriptAsync("window.__deletedDraft=JSON.stringify(spriteCheck.project.draft);document.getElementById('detect').click()");
        for(int n=0;n<300&&(await web.CoreWebView2.ExecuteScriptAsync("!document.body.classList.contains('busy')"))!="true";n++)await Task.Delay(100);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('reviewGrid').click()");
        await Check("Detect computes grid but protects edited timeline from reslicing", "JSON.stringify(spriteCheck.project.draft)===__deletedDraft && document.getElementById('gridDetectDialog').open && document.getElementById('gridDetectApply').disabled && document.getElementById('gridDetectCandidates').options.length>0");
        using(var image=File.Create(Path.Combine(testDirectory,"native-grid-protected.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('gridDetectClose').click();document.getElementById('compareTab').click();document.getElementById('compareOriginalMode').value='sheet';document.getElementById('compareOriginalMode').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('compareMergedMode').value='sheet';document.getElementById('compareMergedMode').dispatchEvent(new Event('change',{bubbles:true}));");
        await Check("Compare shows removed cells only in edited sheet before Merge", "document.getElementById('compareOriginal').toDataURL()!==document.getElementById('compareMerged').toDataURL() && !spriteCheck.project.merged && spriteCheck.project.draft[0].keys.length===10");
        await web.CoreWebView2.ExecuteScriptAsync("__pickSource(2);document.getElementById('restoreFrame').click();document.getElementById('exportName').value='frame-restored';document.getElementById('confirm').click();document.getElementById('merge').click()");
        for(int n=0;n<300&&(await web.CoreWebView2.ExecuteScriptAsync("!!spriteCheck.project.merged&&!document.body.classList.contains('busy')"))!="true";n++)await Task.Delay(100);
        await Check("Restore Frame and Merge omit only the remaining removed source", "spriteCheck.project.draft[0].keys.length===11 && spriteCheck.project.draft[0].keys.at(-1).sourceId===2 && !spriteCheck.project.merged.sourceToFrame.has(0) && spriteCheck.project.merged.sourceToFrame.has(2) && spriteCheck.project.merged.manifest.animations[0].totalTicks===11");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('export').click();document.getElementById('downloadBoth').click()");
        await WaitForSaved("frame-restored-merged.png");await WaitForSaved("frame-restored-merged.json");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('exportDialog').close();document.getElementById('compareTab').click()");
        using(var image=File.Create(Path.Combine(testDirectory,"native-frame-removed.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        await web.CoreWebView2.ExecuteScriptAsync("__pickSource(spriteCheck.project.draft[0].keys[0].sourceId);{const count=spriteCheck.project.draft[0].keys.length;for(let i=0;i<count;i++)document.getElementById('removeFrame').click();}document.getElementById('play').click()");
        await Check("Removing all row frames leaves an empty playable-safe row with Restore", "spriteCheck.project.draft[0].keys.length===0 && !spriteCheck.playing && document.getElementById('removeFrame').disabled && !document.getElementById('restoreFrame').disabled && spriteCheck.project.sheet.frames.length===116");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('sheetCanvas').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',key:'z',ctrlKey:true,bubbles:true,cancelable:true}))");
        await Check("Undo empty-row deletion selects a usable restored frame", "spriteCheck.project.draft[0].keys.length===1 && !document.getElementById('removeFrame').disabled && document.getElementById('selectedLabel').textContent==='KEY 01'");
        await OpenFile(Path.Combine(testDirectory,"auto-grid-640.png"));
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('detect').click()");
        for(int n=0;n<300&&(await web.CoreWebView2.ExecuteScriptAsync("!!spriteCheck.project.detection&&!document.body.classList.contains('busy')"))!="true";n++)await Task.Delay(100);
        await Check("Detect infers128x128 cells and5x3 uniform grid from image content", "spriteCheck.project.sheet.grid.cellWidth===128 && spriteCheck.project.sheet.grid.cellHeight===128 && spriteCheck.project.sheet.grid.columns===5 && spriteCheck.project.sheet.grid.rows===3 && spriteCheck.project.sheet.frames.length===15 && spriteCheck.project.detection.unique===15");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('reviewGrid').click()");
        await Check("Auto Grid review displays candidates and exact equal-cell preview", "document.getElementById('gridDetectDialog').open && document.getElementById('gridDetectColumns').value==='5' && document.getElementById('gridDetectRows').value==='3' && document.getElementById('gridDetectCanvas').width===640 && document.getElementById('gridDetectCanvas').height===384 && !document.getElementById('gridDetectApply').disabled");
        using(var image=File.Create(Path.Combine(testDirectory,"native-auto-grid.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('gridDetectColumns').value='3';document.getElementById('gridDetectColumns').dispatchEvent(new Event('input',{bubbles:true}))");
        await Check("Grid review rejects counts that cannot divide image dimensions equally", "document.getElementById('gridDetectApply').disabled && document.getElementById('gridDetectError').textContent.length>0 && spriteCheck.project.sheet.grid.columns===5");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('gridDetectColumns').value='4';document.getElementById('gridDetectColumns').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('gridDetectApply').click();document.getElementById('detect').click()");
        for(int n=0;n<300&&(await web.CoreWebView2.ExecuteScriptAsync("!document.body.classList.contains('busy')"))!="true";n++)await Task.Delay(100);
        await Check("A manually chosen grid is preserved on the next Detect", "spriteCheck.project.sheet.grid.cellWidth===160 && spriteCheck.project.sheet.grid.columns===4 && spriteCheck.project.sheet.grid.rows===3 && spriteCheck.project.sheet.frames.length===12");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('paintTab').click();{const data=spriteCheck.project.sheet.frames[0].data.slice();data.set([11,22,33,255],0);spriteCheck.paint.onCommit(0,data);}document.getElementById('detect').click()");
        for(int n=0;n<300&&(await web.CoreWebView2.ExecuteScriptAsync("!document.body.classList.contains('busy')"))!="true";n++)await Task.Delay(100);
        await Check("Detect after painting retains grid, pixels and undo history", "spriteCheck.project.hasPixelEdits && spriteCheck.project.sheet.grid.cellWidth===160 && spriteCheck.project.sheet.frames[0].data[0]===11 && spriteCheck.project.undoStack.length===1");
        await OpenFile(Path.Combine(root,"app","assets","test-sheet.png"));
    }

    private async Task CheckTimelineDrag() {
        await OpenFile(Path.Combine(root,"app","assets","test-sheet.png"));
        await web.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(testDirectory,"timeline-native.js")));
        for(int n=0;n<600&&(await web.CoreWebView2.ExecuteScriptAsync("window.__timelineChecks?.done===true"))!="true";n++)await Task.Delay(100);
        string report=await web.CoreWebView2.ExecuteScriptAsync("window.__timelineChecks");
        File.WriteAllText(Path.Combine(testDirectory,"timeline-dom-results.json"),report);
        await Check("Timeline pointer test completes without error", "window.__timelineChecks?.done===true && !window.__timelineChecks.error");
        var checks=json.Deserialize<Dictionary<string,object>>(report);
        foreach(object description in (System.Collections.IEnumerable)checks["checks"])testLog.WriteLine("PASS Timeline " + description);
        using(var image=File.Create(Path.Combine(testDirectory,"native-timeline-moved.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        await web.CoreWebView2.ExecuteScriptAsync("__showTimelineInsertion()");
        await Check("Native drag displays a visible insertion marker", "!!document.querySelector('.key-drop-marker:not([hidden])') && !!document.querySelector('.key-dragging') && document.getElementById('timelineDragHint').textContent.includes('MOVE KEY')");
        using(var image=File.Create(Path.Combine(testDirectory,"native-timeline-insertion.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        await web.CoreWebView2.ExecuteScriptAsync("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}))");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('saveProject').click()");await WaitForSaved("timeline-moved.dat");
        await OpenFile(Path.Combine(testDirectory,"timeline-moved.dat"));
        await Check("Timeline DAT reopens exact order, holds, view and immutable original", "JSON.stringify(spriteCheck.project.draft)===JSON.stringify(__timelineChecks.expected) && JSON.stringify(spriteCheck.project.sheet.original)===JSON.stringify(__timelineChecks.original) && spriteCheck.mode==='edited' && spriteCheck.project.undoStack.length===0");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('confirm').click();document.getElementById('merge').click()");
        for(int n=0;n<300&&(await web.CoreWebView2.ExecuteScriptAsync("!!spriteCheck.project.merged&&!document.body.classList.contains('busy')"))!="true";n++)await Task.Delay(100);
        await Check("Merge retains reordered playback duration, FPS and Loop", "spriteCheck.project.merged.manifest.animations.every((a,i)=>a.totalTicks===__timelineChecks.expected[i].keys.reduce((n,k)=>n+k.ticks,0)&&a.fps===__timelineChecks.expected[i].fps&&a.loop===__timelineChecks.expected[i].loop)");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('export').click();document.getElementById('downloadBoth').click()");
        await WaitForSaved("timeline-moved-merged.png");await WaitForSaved("timeline-moved-merged.json");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('exportDialog').close();document.getElementById('compareTab').click()");
        using(var image=File.Create(Path.Combine(testDirectory,"native-timeline-compare.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
    }

    private async Task CheckArrowSelection() {
        await OpenFile(Path.Combine(root,"app","assets","test-sheet.png"));
        await web.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(testDirectory,"arrow-native.js")));
        for(int n=0;n<600&&(await web.CoreWebView2.ExecuteScriptAsync("window.__arrowChecks?.done===true"))!="true";n++)await Task.Delay(100);
        string report=await web.CoreWebView2.ExecuteScriptAsync("window.__arrowChecks");
        File.WriteAllText(Path.Combine(testDirectory,"arrow-dom-results.json"),report);
        await Check("Arrow selection tests complete without error", "window.__arrowChecks?.done===true&&!window.__arrowChecks.error");
        var checks=json.Deserialize<Dictionary<string,object>>(report);
        foreach(object description in (System.Collections.IEnumerable)checks["checks"])testLog.WriteLine("PASS Arrow " + description);
        using(var image=File.Create(Path.Combine(testDirectory,"native-arrow-selection.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('exportName').value='arrow-selection';document.getElementById('saveProject').click()");
        await WaitForSaved("arrow-selection.dat");await OpenFile(Path.Combine(testDirectory,"arrow-selection.dat"));
        await Check("Arrow-selected frame and exact time survive native DAT reopening", "JSON.stringify(spriteCheck.project.draft)===JSON.stringify(__arrowChecks.draft)&&Number(document.getElementById('sourceFrame').value)===__arrowChecks.finalSource&&Number(document.querySelector('#keyframes .selected')?.dataset.index)===__arrowChecks.finalIndex&&Math.abs(spriteCheck.time-__arrowChecks.finalTime)<1e-7");
    }

    private async Task CheckWorkflow() {
        if(args.Contains("--test-workflow-compact")){ClientSize=new Size(1280,680);await Task.Delay(150);}
        await OpenFile(Path.Combine(root,"app","assets","test-sheet.png"));
        await web.CoreWebView2.ExecuteScriptAsync("window.__workflowFixture="+json.Serialize(Convert.ToBase64String(File.ReadAllBytes(Path.Combine(testDirectory,"workflow-pack.png")))));
        await web.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(testDirectory,"workflow-native.js")));
        var captured=new HashSet<string>();
        for(int n=0;n<1200;n++) {
            if(await web.CoreWebView2.ExecuteScriptAsync("window.__workflowChecks?.done===true")=="true")break;
            string raw=await web.CoreWebView2.ExecuteScriptAsync("window.__workflowChecks?.capture??null");
            if(raw!="null") {string name=json.Deserialize<string>(raw);if(System.Text.RegularExpressions.Regex.IsMatch(name,"^[a-z0-9-]+[.]png$")&&captured.Add(name)){using(var image=File.Create(Path.Combine(testDirectory,name)))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);await web.CoreWebView2.ExecuteScriptAsync("window.__workflowCaptureAck="+json.Serialize(name));}}
            await Task.Delay(100);
        }
        string report=await web.CoreWebView2.ExecuteScriptAsync("window.__workflowChecks");File.WriteAllText(Path.Combine(testDirectory,"workflow-dom-results.json"),report);
        await Check("Workflow multi-select/Pack/frame-export tests complete without error","window.__workflowChecks?.done===true&&!window.__workflowChecks.error");
        var values=json.Deserialize<Dictionary<string,object>>(report);foreach(object description in (System.Collections.IEnumerable)values["checks"])testLog.WriteLine("PASS Workflow "+description);
        await OpenFile(Path.Combine(testDirectory,"PackMonster_frames","PackMonster.dat"));
        await Check("Packed DAT reopens6columns and preserves3logical animation rows","spriteCheck.project.packColumns===6&&spriteCheck.project.merged.width===192&&spriteCheck.project.merged.height===64&&spriteCheck.project.draft.length===3&&spriteCheck.project.draft[1].keys.length===0&&spriteCheck.project.draft[2].keys.length===8&&spriteCheck.project.draft[0].keys[0].ticks===3");
    }

    private async Task RunSelfTest() {
        testLog.WriteLine("Sprite Check 1.9.0 native WinForms/WebView2 runtime " + web.CoreWebView2.Environment.BrowserVersionString);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('fileMenuButton').click();document.getElementById('menuUpdate').click()");
        for (int n = 0; n < 250 && await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('updateStatus').dataset.state==='checking'") == "true"; n++) await Task.Delay(100);
        await Check("File Update works in an empty scene with no newer published release", "document.getElementById('updateDialog').open && document.getElementById('updateCurrent').textContent==='1.9.0' && /^[0-9]+[.][0-9]+[.][0-9]+$/.test(document.getElementById('updateLatest').textContent) && document.getElementById('updateStatus').dataset.state==='current' && document.getElementById('updateInstall').hidden && spriteCheck.project===null");
        await Check("Native Update dialog text is at least 12px", "[...document.querySelectorAll('#updateDialog *')].filter(e=>e.getClientRects().length&&e.textContent.trim()).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)");
        using (var updateImage = File.Create(Path.Combine(testDirectory, "native-update-current.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, updateImage);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('updateClose').click()");
        await Check("Empty startup, no implicit image", "spriteCheck.project===null && document.getElementById('sheetCanvas').hidden && document.getElementById('detect').disabled");
        using (var empty = File.Create(Path.Combine(testDirectory, "empty-startup.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, empty);
        await OpenFile(Path.Combine(root, "app", "assets", "test-sheet.png"));
        for (int n = 0; n < 100 && await web.CoreWebView2.ExecuteScriptAsync("spriteCheck.project!==null") != "true"; n++) await Task.Delay(100);
        await CheckFileMenuAndLog();
        await CheckPaintEditor();
        await web.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-row=\"8\"]').click();{const c=document.getElementById('sheetCanvas'),r=c.getBoundingClientRect(),f=spriteCheck.project.sheet.frames.find(f=>f.row===8&&f.column===3),g=spriteCheck.project.sheet.grid;c.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+(f.x+g.cellWidth/2)*r.width/c.width,clientY:r.top+(f.y+g.cellHeight/2)*r.height/c.height}))}");
        await Check("Sheet selection seeks and pauses on clicked key", "!spriteCheck.playing && Math.abs(spriteCheck.time-.25)<1e-9 && document.getElementById('previewCounter').textContent==='04 / 8' && document.getElementById('selectedLabel').textContent==='KEY 04' && spriteCheck.project.undoStack.length===0");
        await Check("Live Preview pixels match clicked source", @"(()=>{const s=spriteCheck.project.sheet,f=s.frames.find(f=>f.row===8&&f.column===3),a=document.getElementById('previewCanvas'),e=document.createElement('canvas'),c=document.createElement('canvas');e.width=a.width;e.height=a.height;c.width=s.grid.cellWidth;c.height=s.grid.cellHeight;c.getContext('2d').putImageData(new ImageData(f.data,c.width,c.height),0,0);const x=e.getContext('2d'),factor=Math.min(a.width*.78/c.width,a.height*.88/c.height),scale=factor>=1?Math.floor(factor):factor;x.imageSmoothingEnabled=false;x.drawImage(c,Math.floor((a.width-c.width*scale)/2),Math.floor((a.height-c.height*scale)/2),Math.max(1,Math.floor(c.width*scale)),Math.max(1,Math.floor(c.height*scale)));const p=a.getContext('2d').getImageData(0,0,a.width,a.height).data,q=x.getImageData(0,0,a.width,a.height).data;return p.every((v,i)=>v===q[i]);})()");
        using (var selection = File.Create(Path.Combine(testDirectory, "native-selection.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, selection);
        await web.CoreWebView2.ExecuteScriptAsync("{const h=document.getElementById('holdTicks');h.value=3;h.dispatchEvent(new Event('change',{bubbles:true}))}");
        await Check("Hold edit retains selected Preview and time", "Math.abs(spriteCheck.time-.25)<1e-9 && document.getElementById('previewCounter').textContent==='04 / 8' && !spriteCheck.playing");
        await web.CoreWebView2.ExecuteScriptAsync("{const p=document.getElementById('playbackMode');p.value='original';p.dispatchEvent(new Event('change',{bubbles:true}))}");
        await Check("Playback mode switch preserves cursor", "Math.abs(spriteCheck.time-.25)<1e-9");
        ClientSize = new Size(1280, 680);
        await Task.Delay(150);
        await Check("Compact layout keeps timeline on screen", "document.getElementById('scrubber').getBoundingClientRect().bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth");
        await CheckReadableLayout();
        using (var compact = File.Create(Path.Combine(testDirectory, "native-ux-compact.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, compact);
        await web.CoreWebView2.ExecuteScriptAsync("document.querySelector('#keyframes [data-index=\"3\"]').click();document.getElementById('deleteKey').click();{const c=document.getElementById('sheetCanvas'),r=c.getBoundingClientRect(),f=spriteCheck.project.sheet.frames.find(f=>f.row===8&&f.column===3),g=spriteCheck.project.sheet.grid;c.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+(f.x+g.cellWidth/2)*r.width/c.width,clientY:r.top+(f.y+g.cellHeight/2)*r.height/c.height}))}document.getElementById('exportName').value='selected-source';document.getElementById('saveProject').click()");
        string selectionDat = Path.Combine(testDirectory, "selected-source.dat");
        for (int n = 0; n < 100 && !File.Exists(selectionDat); n++) await Task.Delay(100);
        if (!File.Exists(selectionDat)) throw new Exception("Removed-source DAT save did not complete.");
        await Task.Delay(100);
        await OpenFile(selectionDat);
        for (int n = 0; n < 100 && await web.CoreWebView2.ExecuteScriptAsync("!document.body.classList.contains('busy') && document.getElementById('selectedLabel').textContent==='SOURCE FRAME'") != "true"; n++) await Task.Delay(100);
        await Check("Removed source selection survives native DAT save/open", "Number(document.getElementById('sourceFrame').value)===spriteCheck.project.sheet.frames.find(f=>f.row===8&&f.column===3).id && spriteCheck.project.draft[8].keys.length===7");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('addKey').click()");
        await Check("Add Key restores the same source after native DAT reopen", "spriteCheck.project.draft[8].keys.at(-1).sourceId===spriteCheck.project.sheet.frames.find(f=>f.row===8&&f.column===3).id");
        using (var restoredSelection = File.Create(Path.Combine(testDirectory, "native-removed-source.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, restoredSelection);
        await OpenFile(Path.Combine(root, "app", "assets", "test-sheet.png"));
        for (int n = 0; n < 100 && await web.CoreWebView2.ExecuteScriptAsync("spriteCheck.project.draft[8].keys[3].ticks===1 && !document.body.classList.contains('busy')") != "true"; n++) await Task.Delay(100);
        await web.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-row=\"0\"]').click()");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('play').focus();document.getElementById('play').dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true}))");
        await Task.Delay(150);
        await Check("Spacebar starts playback", "spriteCheck.playing && spriteCheck.time>0");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('play').dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',repeat:true,bubbles:true,cancelable:true}))");
        await Check("Held Space does not retrigger", "spriteCheck.playing");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('play').dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true}));for(let n=0;n<55;n++)document.getElementById('holdPlus').click();for(let n=0;n<50;n++)document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',key:'z',ctrlKey:true,bubbles:true,cancelable:true}))");
        await Check("Native UI Ctrl+Z 50-step history", "spriteCheck.project.draft[0].keys[0].ticks===6 && spriteCheck.project.redoStack.length===50 && document.getElementById('undo').disabled");
        await web.CoreWebView2.ExecuteScriptAsync("for(let n=0;n<50;n++)document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyY',key:'y',ctrlKey:true,bubbles:true,cancelable:true}))");
        await Check("Native UI Ctrl+Y 50-step history", "spriteCheck.project.draft[0].keys[0].ticks===56 && spriteCheck.project.undoStack.length===50 && document.getElementById('redo').disabled");
        using (var history = File.Create(Path.Combine(testDirectory, "native-keyboard-history.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, history);
        await OpenFile(Path.Combine(root, "app", "assets", "test-sheet.png"));
        for (int n = 0; n < 100 && await web.CoreWebView2.ExecuteScriptAsync("spriteCheck.project.draft[0].keys[0].ticks===1 && !document.body.classList.contains('busy')") != "true"; n++) await Task.Delay(100);
        await Check("All newly imported rows loop", "spriteCheck.project.draft.every(a=>a.loop)");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('compareTab').click();document.querySelector('[data-row=\"4\"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
        await Task.Delay(350);
        await Check("Compare and row double-click play before Merge", "spriteCheck.playing && spriteCheck.time>0 && spriteCheck.project.merged===null && !document.getElementById('compareViewport').hidden");
        using (var preview = File.Create(Path.Combine(testDirectory, "original-before-merge.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, preview);
        await CheckCompareLoopResume("Before Merge", 4);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('play').click();document.querySelector('[data-row=\"0\"]').click()");
        await Check("Native local HTTPS app, source PNG and 12 rows", "location.protocol==='https:' && spriteCheck.project.sheet.frames.length===116 && spriteCheck.project.sheet.grid.rows===12");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('detect').click()");
        await Task.Delay(350);
        await Check("Detect exact duplicates", "spriteCheck.project.detection?.unique===96");
        await web.CoreWebView2.ExecuteScriptAsync("let h=document.getElementById('holdTicks');h.value=5;h.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('confirm').click();document.getElementById('merge').click()");
        await Task.Delay(700);
        await Check("Edited hold and actual packed pixels", "spriteCheck.project.merged?.frames.length===107 && spriteCheck.project.confirmed[0].keys[0].ticks===5");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('compareTab').click();document.getElementById('play').click()");
        await Task.Delay(500);
        await Check("Compare playback advances", "spriteCheck.time>0 && !document.getElementById('compareViewport').hidden");
        await CheckCompareLoopResume("After Merge", 0);
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('play').click();document.getElementById('saveProject').click()");
        string dat = Path.Combine(testDirectory, "test-sheet.dat");
        for (int n = 0; n < 100 && !File.Exists(dat); n++) await Task.Delay(100);
        if (!File.Exists(dat)) throw new Exception("Native .dat save did not complete.");
        await Task.Delay(350);
        testLog.WriteLine("PASS Native project save " + new FileInfo(dat).Length + " bytes");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('resetRow').click()");
        await Check("Changed timeline before reopen", "spriteCheck.project.draft[0].keys[0].ticks===1 && spriteCheck.project.merged===null");
        await OpenFile(dat);
        for (int n = 0; n < 100; n++) {
            if (await web.CoreWebView2.ExecuteScriptAsync("spriteCheck.project.merged!==null") == "true") break;
            await Task.Delay(100);
        }
        await Check("Native saved .dat reopens exact hold, merged state and Compare", "spriteCheck.project.draft[0].keys[0].ticks===5 && spriteCheck.project.merged.frames.length===107 && !document.getElementById('compareViewport').hidden && !document.getElementById('sheetSummary').textContent.startsWith('Open a')");
        await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('export').click();document.getElementById('downloadBoth').click()");
        string png = Path.Combine(testDirectory, "test-sheet-merged.png"), manifest = Path.Combine(testDirectory, "test-sheet-merged.json");
        for (int n = 0; n < 100 && (!File.Exists(png) || !File.Exists(manifest)); n++) await Task.Delay(100);
        await Task.Delay(350);
        if (!File.Exists(png) || !File.Exists(manifest)) throw new Exception("Native two-file export failed.");
        testLog.WriteLine("PASS Native PNG and JSON file saves");
        await web.CoreWebView2.ExecuteScriptAsync("document.querySelector('#exportDialog .close-dialog').click()");
        using (var image = File.Create(Path.Combine(testDirectory, "native-program.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, image);
        testLog.WriteLine("PASS Actual native WebView2 screenshot captured");
        await web.CoreWebView2.ExecuteScriptAsync("let view=document.getElementById('compareOriginalMode');view.value='sheet';view.dispatchEvent(new Event('change'));document.getElementById('compareOriginalFit').click()");
        await Task.Delay(200);
        await Check("Full-sheet Compare and measured log", "spriteCheck.compare.left.mode==='sheet' && spriteCheck.compare.right.mode==='sheet' && document.getElementById('compareLogState').textContent==='MEASURED EXPORT' && document.getElementById('compareLogRows').rows[4].cells[2].textContent==='107'");
        using (var sheets = File.Create(Path.Combine(testDirectory, "native-sheets.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, sheets);
        if(args.Contains("--test-frame-grid"))await CheckFrameDeleteAndGrid();
        if(args.Contains("--test-8192"))await CheckLargeSheet();
        if(args.Contains("--test-timeline-move"))await CheckTimelineDrag();
        if(args.Contains("--test-arrow-selection"))await CheckArrowSelection();
        if(args.Contains("--test-workflow"))await CheckWorkflow();
        testLog.WriteLine("PASS ALL native smoke checks");
    }
}
