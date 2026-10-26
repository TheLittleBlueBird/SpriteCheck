using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

internal sealed class ReleaseCandidate {
    public string Version, Tag, Notes, Url, Digest;
    public long Bytes;
}

internal static class UpdateService {
    internal const string Version = "1.6.1";
    internal const string Repository = "TheLittleBlueBird/SpriteCheck";
    internal const string Releases = "https://github.com/" + Repository + "/releases";
    internal const string Api = "https://api.github.com/repos/" + Repository + "/releases/latest";
    internal const long MaxPackage = 128L * 1024 * 1024;
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 2 * 1024 * 1024 };

    internal static Version ParseVersion(string text) {
        if (!Regex.IsMatch(text ?? "", @"\Av?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\z")) throw new IOException("Invalid release version.");
        Version value;
        if (!System.Version.TryParse(text.TrimStart('v'), out value)) throw new IOException("Invalid release version.");
        return value;
    }

    internal static ReleaseCandidate ParseRelease(string body) {
        var release = Json.Deserialize<Dictionary<string, object>>(body);
        if ((bool)release["draft"] || (bool)release["prerelease"] || release["published_at"] == null) throw new IOException("No published stable release is available.");
        string tag = (string)release["tag_name"], version = ParseVersion(tag).ToString(3);
        string name = "SpriteCheck-" + version + "-win-x64.zip", url = Releases + "/download/" + tag + "/" + name;
        var assets = (IEnumerable)release["assets"];
        foreach (Dictionary<string, object> asset in assets) {
            if ((string)asset["name"] != name || (string)asset["state"] != "uploaded") continue;
            long bytes = Convert.ToInt64(asset["size"]);
            object hash;
            string digest = asset.TryGetValue("digest", out hash) ? hash as string : null;
            if ((string)asset["browser_download_url"] != url || bytes <= 0 || bytes > MaxPackage) throw new IOException("Invalid Windows package URL or size.");
            if (digest == null || !Regex.IsMatch(digest, "^sha256:[a-fA-F0-9]{64}$")) throw new IOException("The GitHub release is missing its SHA-256 digest. Publish a new verified release.");
            return new ReleaseCandidate { Version = version, Tag = tag, Notes = Convert.ToString(release["body"]), Url = url, Digest = digest.Substring(7).ToLowerInvariant(), Bytes = bytes };
        }
        throw new IOException("This release has no compatible Windows package.");
    }

    private static HttpWebRequest Request(string url, bool api) {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.UserAgent = "SpriteCheck/" + Version;
        request.Accept = api ? "application/vnd.github+json" : "application/octet-stream";
        if (api) request.Headers["X-GitHub-Api-Version"] = "2026-03-10";
        request.Timeout = 20000; request.ReadWriteTimeout = 30000;
        request.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
        return request;
    }

    internal static ReleaseCandidate Check() {
        try {
            using (var response = Request(Api, true).GetResponse())
            using (var stream = response.GetResponseStream())
            using (var reader = new StreamReader(stream, Encoding.UTF8)) {
                var buffer = new char[4096]; var body = new StringBuilder(); int read;
                while ((read = reader.Read(buffer, 0, buffer.Length)) > 0) { body.Append(buffer, 0, read); if (body.Length > 1024 * 1024) throw new IOException("Release information is too large."); }
                return ParseRelease(body.ToString());
            }
        } catch (WebException error) {
            var response = error.Response as HttpWebResponse;
            if (response != null && response.StatusCode == HttpStatusCode.NotFound) throw new IOException("No release has been published yet. Please try again later.");
            if (response != null && (int)response.StatusCode == 403) throw new IOException("GitHub request limit reached. Please try again later.");
            throw new IOException("Cannot reach GitHub. Check your internet connection and try again.", error);
        }
    }

    internal static string Hash(string path) { using (var sha = SHA256.Create()) using (var input = File.OpenRead(path)) return BitConverter.ToString(sha.ComputeHash(input)).Replace("-", "").ToLowerInvariant(); }

    internal static void ValidateRecovery(byte[] bytes) {
        byte[] magic = Encoding.ASCII.GetBytes("SPRITECHECK-DAT\0");
        if (bytes == null || bytes.Length < 64) throw new IOException("Invalid recovery project.");
        for (int i = 0; i < magic.Length; i++) if (bytes[i] != magic[i]) throw new IOException("Invalid recovery project.");
    }

    internal static void Download(ReleaseCandidate release, string target, Action<int> progress) {
        if (release.Url != Releases + "/download/" + release.Tag + "/SpriteCheck-" + release.Version + "-win-x64.zip") throw new IOException("Untrusted update URL.");
        try {
            using (var response = Request(release.Url, false).GetResponse())
            using (var input = response.GetResponseStream())
            using (var output = File.Create(target)) {
                var buffer = new byte[65536]; long bytes = 0; int read, previous = -1;
                while ((read = input.Read(buffer, 0, buffer.Length)) > 0) {
                    bytes += read; if (bytes > release.Bytes || bytes > MaxPackage) throw new IOException("Update package exceeds expected size.");
                    output.Write(buffer, 0, read); int percent = (int)(bytes * 100 / release.Bytes); if (percent != previous) { previous = percent; progress(percent); }
                }
                if (bytes != release.Bytes) throw new IOException("Update download is incomplete.");
            }
            if (Hash(target) != release.Digest) throw new IOException("Update checksum does not match. Your current program has not been changed.");
        } catch { if (File.Exists(target)) File.Delete(target); throw; }
    }
}
