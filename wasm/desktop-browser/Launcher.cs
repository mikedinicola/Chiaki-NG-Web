using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

// A native tray launcher for the browser edition. No Electron or build tools required.
internal static class Launcher
{
    private static Process server;
    private static StreamWriter log;
    private static readonly object logLock = new object();
    private static bool ownsServer;
    private static string baseUrl;
    private static string dataDir;
    private static string logPath;
    private static string updateToken = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
    private static Control updateControl;
    private static string appRoot;

    private static void UpdateMessage(string line)
    {
        var prefix = "CHIAKI_UPDATE_" + updateToken + " ";
        if (line == null || !line.StartsWith(prefix) || updateControl == null) return;
        updateControl.BeginInvoke((Action)delegate {
            try {
                if (!ownsServer || !File.Exists(Path.Combine(appRoot, "unins000.exe"))) throw new Exception("Use the installed Windows edition to apply updates.");
                var parts = line.Substring(prefix.Length).Split(' ');
                if (parts.Length != 2) throw new Exception("Invalid update request.");
                var file = Path.GetFullPath(Encoding.UTF8.GetString(Convert.FromBase64String(parts[0])));
                var folder = Path.GetFullPath(Path.Combine(dataDir, "db", "..", "updates")) + Path.DirectorySeparatorChar;
                if (!file.StartsWith(folder, StringComparison.OrdinalIgnoreCase) || !file.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) throw new Exception("Invalid update location.");
                string digest;
                using (var sha = SHA256.Create()) using (var input = File.OpenRead(file))
                    digest = BitConverter.ToString(sha.ComputeHash(input)).Replace("-", "").ToLowerInvariant();
                if (digest != parts[1]) throw new Exception("Update checksum changed. Installation cancelled.");
                Stop();
                Process.Start(new ProcessStartInfo(file, "/SILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /CHIAKIUPDATE=1 /DIR=\"" + appRoot + "\"") { UseShellExecute = false });
                Application.Exit();
            } catch (Exception e) {
                try { if (!Healthy()) Start(new Uri(baseUrl).Port, appRoot); } catch { }
                MessageBox.Show(e.Message, "Chiaki update", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        });
    }

    private static string Option(string[] args, string name, string fallback)
    {
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
        return fallback;
    }
    private static bool Has(string[] args, string value) { return Array.IndexOf(args, value) >= 0; }
    private static bool Healthy()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(baseUrl + "/health");
            request.Timeout = 800; request.Proxy = null;
            using (var response = (HttpWebResponse)request.GetResponse())
                return response.StatusCode == HttpStatusCode.OK && response.Headers["X-Chiaki-App"] == "chiaki-ng-web";
        }
        catch { return false; }
    }
    private static void WriteLog(string text)
    {
        if (text == null) return;
        lock (logLock)
        {
            try { if (log != null && log.BaseStream.Length < 1024 * 1024) log.WriteLine(text); }
            catch (ObjectDisposedException) { }
        }
    }
    private static void Start(int port, string root)
    {
        if (Healthy()) return; // Reuse this app's server; never terminate a server we did not start.
        using (var probe = new TcpClient())
        {
            bool occupied = false;
            try { probe.Connect(IPAddress.Loopback, port); occupied = true; }
            catch (SocketException) { }
            if (occupied) throw new Exception("Port " + port + " is already in use. Close the other local server and open Chiaki again. Your saved console details are unchanged.");
        }
        Directory.CreateDirectory(dataDir);
        logPath = Path.Combine(dataDir, "server.log");
        log = new StreamWriter(logPath, false); log.AutoFlush = true;
        var info = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"), "\"" + Path.Combine(root, "proxy", "server.mjs") + "\"");
        info.WorkingDirectory = dataDir;
        info.UseShellExecute = false; info.CreateNoWindow = true;
        info.RedirectStandardInput = info.RedirectStandardOutput = info.RedirectStandardError = true;
        info.StandardOutputEncoding = info.StandardErrorEncoding = System.Text.Encoding.UTF8;
        var env = info.EnvironmentVariables;
        env["CHIAKI_WASM_PORT"] = port.ToString(); env["CHIAKI_WASM_BIND"] = "127.0.0.1";
        env["CHIAKI_WASM_LAN_HTTPS"] = "0"; env["CHIAKI_AUTH_ENABLED"] = "false";
        env["CHIAKI_ENV_FILE"] = Path.Combine(dataDir, "local.env");
        env["CHIAKI_DB_DIR"] = Path.Combine(dataDir, "db");
        env["CHIAKI_WASM_ROOT"] = Path.Combine(root, "core");
        env["CHIAKI_WASM_WWW"] = Path.Combine(root, "www");
        env["CHIAKI_RELAY_BACKEND"] = "rust";
        env["CHIAKI_RELAY_BIN"] = Path.Combine(root, "runtime", "chiaki-relay.exe");
        env["CHIAKI_RELAY_ALLOW_WAN"] = "false"; env["CHIAKI_DISCOVERY_ENABLED"] = "true";
        env["CHIAKI_CLOUD_URL"] = ""; env["CHIAKI_PUBLIC_ORIGIN"] = "";
        env["CHIAKI_DESKTOP_MANAGED"] = "1";
        env["CHIAKI_UPDATE_TOKEN"] = updateToken;
        env["CHIAKI_UPDATE_DIR"] = dataDir;
        env["CHIAKI_UPDATE_INSTALLABLE"] = File.Exists(Path.Combine(root, "unins000.exe")) ? "1" : "0";
        server = new Process(); server.StartInfo = info;
        server.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null && e.Data.StartsWith("CHIAKI_UPDATE_" + updateToken + " ")) UpdateMessage(e.Data); else WriteLog(e.Data); };
        server.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { WriteLog(e.Data); };
        if (!server.Start()) throw new Exception("Could not start the bundled server.");
        ownsServer = true; server.BeginOutputReadLine(); server.BeginErrorReadLine();
        for (int i = 0; i < 80; i++)
        {
            if (server.HasExited) throw new Exception("The server could not start. See " + logPath);
            if (Healthy()) return;
            Thread.Sleep(150);
        }
        throw new Exception("The server did not become ready. See " + logPath);
    }
    private static void Stop()
    {
        if (ownsServer && server != null)
        {
            try
            {
                if (!server.HasExited)
                {
                    server.StandardInput.WriteLine("shutdown"); server.StandardInput.Close();
                    if (!server.WaitForExit(4000)) server.Kill();
                }
            }
            catch (InvalidOperationException) { }
            server.Dispose(); server = null;
        }
        lock (logLock) { if (log != null) { log.Dispose(); log = null; } }
    }
    private static void OpenBrowser(string path)
    {
        Process.Start(new ProcessStartInfo(baseUrl + path) { UseShellExecute = true });
    }
    private static void SmokeCheck()
    {
        foreach (var route in new[] { "/", "/first-run.html", "/chiaki.js", "/chiaki.wasm" })
        {
            var request = (HttpWebRequest)WebRequest.Create(baseUrl + route); request.Proxy = null; request.Timeout = 5000;
            using (var response = (HttpWebResponse)request.GetResponse())
            {
                if (response.StatusCode != HttpStatusCode.OK) throw new Exception("Smoke check failed: " + route);
                if (response.Headers["Cross-Origin-Opener-Policy"] != "same-origin" || response.Headers["Cross-Origin-Embedder-Policy"] != "require-corp")
                    throw new Exception("Missing browser isolation headers: " + route);
                using (var stream = response.GetResponseStream()) { var buffer = new byte[8192]; while (stream.Read(buffer, 0, buffer.Length) > 0) { } }
            }
        }
        File.WriteAllText(Path.Combine(dataDir, "smoke-result.txt"), "PASS: bundled server, Rust relay startup, browser files, WASM and offline guide; isolation headers present.");
    }
    [STAThread]
    private static int Main(string[] args)
    {
        bool smoke = Has(args, "--smoke-test");
        int port;
        if (!int.TryParse(Option(args, "--port", "8090"), out port) || port < 1024 || port > 65535) return 2;
        baseUrl = "http://127.0.0.1:" + port;
        dataDir = Path.GetFullPath(Option(args, "--data-dir", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChiakiNGWebBrowser")));
        bool created;
        using (var mutex = new Mutex(true, "Local\\ChiakiNGWebBrowser-" + port, out created))
        {
            if (!created) { if (!smoke && !Has(args, "--no-browser")) OpenBrowser(Has(args, "--guide") ? "/first-run.html" : "/"); return 0; }
            try
            {
                var root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                appRoot = root;
                Start(port, root);
                if (smoke) { SmokeCheck(); return 0; }
                Application.EnableVisualStyles();
                updateControl = new Control(); updateControl.CreateControl();
                using (var menu = new ContextMenuStrip())
                using (var tray = new NotifyIcon())
                {
                    menu.Items.Add("Open Chiaki", null, delegate { OpenBrowser("/"); });
                    menu.Items.Add("First-time guide", null, delegate { OpenBrowser("/first-run.html"); });
                    menu.Items.Add("Check for updates", null, delegate { OpenBrowser("/#updates"); });
                    menu.Items.Add("Open local data folder", null, delegate { Process.Start("explorer.exe", "\"" + dataDir + "\""); });
                    menu.Items.Add(new ToolStripSeparator());
                    menu.Items.Add(ownsServer ? "Quit and stop server" : "Quit launcher", null, delegate { Application.Exit(); });
                    var iconPath = Path.Combine(root, "app.ico");
                    tray.Icon = File.Exists(iconPath) ? new Icon(iconPath) : SystemIcons.Application;
                    tray.Text = "Chiaki-NG Web · local browser server"; tray.ContextMenuStrip = menu; tray.Visible = true;
                    tray.DoubleClick += delegate { OpenBrowser("/"); };
                    if (!Has(args, "--no-browser")) OpenBrowser(Has(args, "--guide") ? "/first-run.html" : "/");
                    Application.Run(); tray.Visible = false;
                }
                return 0;
            }
            catch (Exception error)
            {
                Directory.CreateDirectory(dataDir);
                File.WriteAllText(Path.Combine(dataDir, "startup-error.txt"), error.Message);
                if (!smoke) MessageBox.Show(error.Message, "Chiaki-NG Web", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally { Stop(); mutex.ReleaseMutex(); }
        }
    }
}
