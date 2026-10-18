using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ChronofitViewer;

/// <summary>
/// Finestra senza barra degli indirizzi che mostra l'interfaccia del dispositivo.
/// Tasti: F11 schermo intero · Ctrl+L cambia indirizzo · Ctrl+N nuova finestra · F5 ricarica.
/// Tasto destro: menu con le stesse voci.
/// </summary>
public sealed class ViewerForm : Form
{
    // Un solo ambiente WebView2 per processo (stessa cartella dati: cookie e localStorage condivisi,
    // quindi anche il registro atleti salvato dalla console vale per tutte le finestre).
    private static Task<CoreWebView2Environment>? _env;

    private readonly AppSettings _settings;
    private readonly bool _primary;
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };

    private string _target;
    private bool _fullscreen;
    private FormBorderStyle _prevBorder;
    private FormWindowState _prevState;
    private Rectangle _prevBounds;
    private string _baseTitle = "Chronofit";
    private string? _titleNote;
    private System.Windows.Forms.Timer? _noteTimer;

    // Modalità di prova automatica (--selftest): carica la pagina, scrive un esito in un file ed esce.
    public static string? SelfTestOut { get; set; }

    public ViewerForm(AppSettings settings, string url, bool primary, bool startFullscreen = false)
    {
        _settings = settings;
        _primary = primary;
        _target = url;
        _startFullscreen = startFullscreen;

        Text = _baseTitle;
        KeyPreview = true;
        BackColor = Color.Black;
        MinimumSize = new Size(480, 320);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { /* icona di sistema */ }

        if (primary && settings.X >= 0 && settings.Y >= 0)
        {
            StartPosition = FormStartPosition.Manual;
            Bounds = new Rectangle(settings.X, settings.Y, settings.Width, settings.Height);
            // se il monitor salvato non c'è più, si ricentra
            if (!Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(Bounds)))
                StartPosition = FormStartPosition.CenterScreen;
        }
        else
        {
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(settings.Width, settings.Height);
        }

        Controls.Add(_web);
        Load += async (_, _) =>
        {
            if (_startFullscreen) SetFullscreen(true);   // già a schermo intero al primo disegno, senza lampo
            await InitializeWebAsync();
        };
        FormClosing += OnFormClosing;
        Activated += (_, _) => ApplyKeepAwake();
    }

    private readonly bool _startFullscreen;

    // ── Avvio del browser integrato ──────────────────────────────────────────
    private static Task<CoreWebView2Environment> GetEnvironment() =>
        _env ??= CoreWebView2Environment.CreateAsync(null, Path.Combine(AppSettings.DataFolder, "WebView2"));

    private async Task InitializeWebAsync()
    {
        try
        {
            var env = await GetEnvironment();
            await _web.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(this,
                "Manca il componente Microsoft Edge WebView2 Runtime.\n\nInstallalo da:\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\nPoi riapri l'applicazione.",
                "Chronofit", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
            return;
        }

        var core = _web.CoreWebView2;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.Settings.IsBuiltInErrorPageEnabled = false;   // c'è la pagina di errore dedicata
        core.Settings.IsSwipeNavigationEnabled = false;

        // Cache sempre rivalidata: il firmware della GPS dichiara i file validi per 30 giorni,
        // ma qui dopo ogni aggiornamento dell'interfaccia si vuole vedere subito quella nuova.
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += (_, e) => e.Request.Headers.SetHeader("Cache-Control", "no-cache");

        core.NavigationStarting += OnNavigationStarting;
        core.NavigationCompleted += OnNavigationCompleted;
        core.NewWindowRequested += OnNewWindowRequested;
        core.DownloadStarting += OnDownloadStarting;
        core.DocumentTitleChanged += (_, _) => UpdateTitle();
        core.ContainsFullScreenElementChanged += (_, _) => SetFullscreen(core.ContainsFullScreenElement);
        core.ContextMenuRequested += OnContextMenuRequested;
        core.WebMessageReceived += (_, e) =>
        {
            if (e.TryGetWebMessageAsString() == "address") ChangeAddress();
        };
        // Il controllo WinForms non espone il controller: serve per intercettare F11, Ctrl+L… prima
        // della pagina. Se in una versione futura il campo cambiasse, restano il menu del tasto
        // destro e Ctrl+L/Ctrl+N quando il focus non è nel browser.
        var controller = typeof(WebView2).GetField("_coreWebView2Controller", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(_web) as CoreWebView2Controller;
        if (controller != null) controller.AcceleratorKeyPressed += OnAcceleratorKey;

        if (_startFullscreen) SetFullscreen(true);
        ApplyKeepAwake();
        Navigate(_target);
    }

    // ── Navigazione ──────────────────────────────────────────────────────────
    private void Navigate(string url)
    {
        _target = url;
        _web.CoreWebView2.Navigate(url);
    }

    private static bool IsLocalNetworkHost(string host)
    {
        if (host == "localhost" || !host.Contains('.')) return true;   // nomi senza punto: rete locale
        if (!System.Net.IPAddress.TryParse(host, out var ip)) return host.EndsWith(".local", StringComparison.OrdinalIgnoreCase);
        if (System.Net.IPAddress.IsLoopback(ip)) return true;
        var b = ip.GetAddressBytes();
        if (b.Length != 4) return false;
        return b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254);
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)) return;
        if (uri.Scheme == "http" || uri.Scheme == "https")
        {
            // un collegamento verso internet (per esempio un sito esterno) si apre nel browser predefinito
            if (!IsLocalNetworkHost(uri.Host))
            {
                e.Cancel = true;
                OpenExternal(uri.AbsoluteUri);
                return;
            }
            _target = uri.AbsoluteUri;
        }
        else if (uri.Scheme == "mailto" || uri.Scheme == "tel")
        {
            e.Cancel = true;
            OpenExternal(uri.AbsoluteUri);
        }
    }

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            if (e.WebErrorStatus == CoreWebView2WebErrorStatus.OperationCanceled) return;   // navigazione sostituita
            if (SelfTestOut != null) { WriteSelfTest(new { ok = false, error = e.WebErrorStatus.ToString() }); return; }
            _web.NavigateToString(ErrorPage.Html(_target, e.WebErrorStatus.ToString()));
            return;
        }
        if (SelfTestOut != null && _web.Source.Scheme.StartsWith("http")) _ = RunSelfTestAsync();
    }

    private static void OpenExternal(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { /* nessun programma associato */ }
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)) return;
        if ((uri.Scheme == "http" || uri.Scheme == "https") && IsLocalNetworkHost(uri.Host))
        {
            // window.open(url, "nome", …) con un nome (non "_blank"): se la finestra con quel nome
            // esiste già la si richiama in primo piano invece di aprirne un'altra (pulsante della vista).
            string name = e.Name ?? "";
            if (name.Length > 0 && !name.StartsWith('_') && NamedWindows.TryGetValue(name, out var existing) && !existing.IsDisposed)
                existing.Recall(uri.AbsoluteUri);
            else
                OpenWindow(uri.AbsoluteUri, name.Length > 0 && !name.StartsWith('_') ? name : null);   // viste per secondo schermo, manuale…
        }
        else
        {
            OpenExternal(uri.AbsoluteUri);
        }
    }

    // Finestre aperte dalla console con un nome (es. la vista della disciplina).
    private static readonly Dictionary<string, ViewerForm> NamedWindows = new();

    public void OpenWindow(string url, string? name = null)
    {
        var f = new ViewerForm(_settings, url, primary: false);
        Program.Track(f);
        if (name != null)
        {
            NamedWindows[name] = f;
            f.FormClosed += (_, _) => { if (NamedWindows.TryGetValue(name, out var cur) && cur == f) NamedWindows.Remove(name); };
        }
        f.Show();
    }

    /// <summary>Porta la finestra in primo piano (anche se ridotta a icona) e, se serve, cambia pagina.</summary>
    private void Recall(string url)
    {
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Show();
        Activate();
        BringToFront();
        bool same = string.Equals(_target, url, StringComparison.OrdinalIgnoreCase);
        if (!same && _web.CoreWebView2 != null) Navigate(url);   // disciplina cambiata: vista nuova; stessa vista: non si ricarica
    }

    // ── Download (CSV della sessione, della vista…) ──────────────────────────
    private void OnDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs e)
    {
        string suggested = Path.GetFileName(e.ResultFilePath);
        using var dlg = new SaveFileDialog
        {
            FileName = suggested,
            InitialDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
            OverwritePrompt = true,
        };
        string ext = Path.GetExtension(suggested).TrimStart('.');
        if (ext.Length > 0) dlg.Filter = $"File {ext.ToUpperInvariant()} (*.{ext})|*.{ext}|Tutti i file (*.*)|*.*";

        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            e.Cancel = true;
            e.Handled = true;
            return;
        }
        e.ResultFilePath = dlg.FileName;
        e.Handled = true;    // niente finestra di download di Edge
        e.DownloadOperation.StateChanged += (op, _) =>
        {
            var d = (CoreWebView2DownloadOperation)op!;
            if (d.State == CoreWebView2DownloadState.Completed)
            {
                System.Media.SystemSounds.Asterisk.Play();
                Note($"Salvato: {Path.GetFileName(dlg.FileName)}");
            }
            else if (d.State == CoreWebView2DownloadState.Interrupted)
            {
                Note("Download interrotto");
            }
        };
    }

    // ── Titolo e note temporanee ─────────────────────────────────────────────
    private void UpdateTitle()
    {
        string t = _web.CoreWebView2?.DocumentTitle ?? "";
        _baseTitle = string.IsNullOrWhiteSpace(t) || t.StartsWith("data:") ? "Chronofit" : t;
        Text = _titleNote != null ? $"{_baseTitle} — {_titleNote}" : _baseTitle;
    }

    private void Note(string text)
    {
        _titleNote = text;
        UpdateTitle();
        _noteTimer?.Stop();
        _noteTimer ??= new System.Windows.Forms.Timer { Interval = 5000 };
        _noteTimer.Tick -= ClearNote;
        _noteTimer.Tick += ClearNote;
        _noteTimer.Start();
    }

    private void ClearNote(object? sender, EventArgs e)
    {
        _noteTimer?.Stop();
        _titleNote = null;
        UpdateTitle();
    }

    // ── Schermo intero ───────────────────────────────────────────────────────
    private void SetFullscreen(bool on)
    {
        if (on == _fullscreen) return;
        _fullscreen = on;
        if (on)
        {
            _prevBorder = FormBorderStyle;
            _prevState = WindowState;
            _prevBounds = Bounds;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Normal;
            Bounds = Screen.FromControl(this).Bounds;
        }
        else
        {
            FormBorderStyle = _prevBorder;
            WindowState = _prevState;
            if (_prevState == FormWindowState.Normal) Bounds = _prevBounds;
        }
    }

    // ── Tasti rapidi ─────────────────────────────────────────────────────────
    private void OnAcceleratorKey(object? sender, CoreWebView2AcceleratorKeyPressedEventArgs e)
    {
        if (e.KeyEventKind != CoreWebView2KeyEventKind.KeyDown && e.KeyEventKind != CoreWebView2KeyEventKind.SystemKeyDown) return;
        bool ctrl = (Control.ModifierKeys & Keys.Control) != 0;
        var key = (Keys)e.VirtualKey;

        if (key == Keys.F11) { e.Handled = true; BeginInvoke(() => SetFullscreen(!_fullscreen)); }
        else if (key == Keys.Escape && _fullscreen && !_web.CoreWebView2.ContainsFullScreenElement) { e.Handled = true; BeginInvoke(() => SetFullscreen(false)); }
        else if (ctrl && key == Keys.L) { e.Handled = true; BeginInvoke(ChangeAddress); }
        else if (ctrl && key == Keys.N) { e.Handled = true; BeginInvoke(() => OpenWindow(_target)); }
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.F11: SetFullscreen(!_fullscreen); return true;
            case Keys.Control | Keys.L: ChangeAddress(); return true;
            case Keys.Control | Keys.N: OpenWindow(_target); return true;
            case Keys.Escape when _fullscreen: SetFullscreen(false); return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    // ── Menu del tasto destro ────────────────────────────────────────────────
    private void OnContextMenuRequested(object? sender, CoreWebView2ContextMenuRequestedEventArgs e)
    {
        var env = _web.CoreWebView2.Environment;
        var items = e.MenuItems;
        int pos = 0;

        CoreWebView2ContextMenuItem Cmd(string label, Action action)
        {
            var it = env.CreateContextMenuItem(label, null, CoreWebView2ContextMenuItemKind.Command);
            it.CustomItemSelected += (_, _) => BeginInvoke(action);
            return it;
        }

        items.Insert(pos++, Cmd("Cambia indirizzo…  (Ctrl+L)", ChangeAddress));

        if (_settings.Favorites.Count > 0)
        {
            var sub = env.CreateContextMenuItem("Indirizzi salvati", null, CoreWebView2ContextMenuItemKind.Submenu);
            foreach (var f in _settings.Favorites.ToList())
            {
                string url = f.Url;
                sub.Children.Add(Cmd($"{f.Name}  ({new Uri(url).Host})", () => { _settings.Url = url; _settings.Save(); Navigate(url); }));
            }
            items.Insert(pos++, sub);
        }

        items.Insert(pos++, Cmd("Ricarica  (F5)", () => _web.CoreWebView2.Reload()));
        items.Insert(pos++, Cmd(_fullscreen ? "Esci da schermo intero  (F11)" : "Schermo intero  (F11)", () => SetFullscreen(!_fullscreen)));
        items.Insert(pos++, Cmd("Nuova finestra  (Ctrl+N)", () => OpenWindow(_target)));

        var startMax = env.CreateContextMenuItem("Avvia massimizzata", null, CoreWebView2ContextMenuItemKind.CheckBox);
        startMax.IsChecked = _settings.StartMaximized;
        startMax.CustomItemSelected += (_, _) => BeginInvoke(() =>
        {
            _settings.StartMaximized = !_settings.StartMaximized;
            _settings.Save();
        });
        items.Insert(pos++, startMax);

        var startFs = env.CreateContextMenuItem("Avvia a schermo intero", null, CoreWebView2ContextMenuItemKind.CheckBox);
        startFs.IsChecked = _settings.StartFullscreen;
        startFs.CustomItemSelected += (_, _) => BeginInvoke(() =>
        {
            _settings.StartFullscreen = !_settings.StartFullscreen;
            _settings.Save();
        });
        items.Insert(pos++, startFs);

        var awake = env.CreateContextMenuItem("Tieni lo schermo acceso", null, CoreWebView2ContextMenuItemKind.CheckBox);
        awake.IsChecked = _settings.KeepAwake;
        awake.CustomItemSelected += (_, _) => BeginInvoke(() =>
        {
            _settings.KeepAwake = !_settings.KeepAwake;
            _settings.Save();
            ApplyKeepAwake();
        });
        items.Insert(pos++, awake);

        items.Insert(pos++, env.CreateContextMenuItem("", null, CoreWebView2ContextMenuItemKind.Separator));
    }

    private void ChangeAddress()
    {
        using var dlg = new AddressDialog(_settings, _target);
        if (dlg.ShowDialog(this) != DialogResult.OK || dlg.ResultUrl == null) return;
        _settings.Url = dlg.ResultUrl;
        if (dlg.Remember) _settings.RememberAddress(dlg.ResultUrl);
        _settings.Save();
        Navigate(dlg.ResultUrl);
    }

    // ── Schermo sempre acceso ────────────────────────────────────────────────
    // La pagina chiede il "wake lock", ma funziona solo su HTTPS: sul dispositivo (http) lo fa l'app.
    [DllImport("kernel32.dll")]
    private static extern uint SetThreadExecutionState(uint esFlags);
    private const uint ES_CONTINUOUS = 0x80000000, ES_SYSTEM_REQUIRED = 0x00000001, ES_DISPLAY_REQUIRED = 0x00000002;

    private void ApplyKeepAwake()
    {
        SetThreadExecutionState(_settings.KeepAwake ? (ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED) : ES_CONTINUOUS);
    }

    // ── Chiusura ─────────────────────────────────────────────────────────────
    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_primary)
        {
            var b = _fullscreen ? _prevBounds : (WindowState == FormWindowState.Normal ? Bounds : RestoreBounds);
            _settings.X = b.X; _settings.Y = b.Y; _settings.Width = b.Width; _settings.Height = b.Height;
            _settings.Maximized = (_fullscreen ? _prevState : WindowState) == FormWindowState.Maximized;
            _settings.Save();
        }
        SetThreadExecutionState(ES_CONTINUOUS);
    }

    // ── Prova automatica ─────────────────────────────────────────────────────
    private bool _selfTestStarted;

    private async Task RunSelfTestAsync()
    {
        if (_selfTestStarted) return;
        _selfTestStarted = true;
        await Task.Delay(3000);   // il tempo che gli script della pagina partano
        string js = """
            JSON.stringify({
              title: document.title,
              url: location.href,
              hasTime: !!document.getElementById('time'),
              hasCheckpoints: !!document.querySelector('.checkpoint-settings'),
              scripts: document.scripts.length,
              innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio,
              docWidth: document.documentElement.scrollWidth, docClientWidth: document.documentElement.clientWidth
            })
            """;
        string raw = await _web.CoreWebView2.ExecuteScriptAsync(js);
        string json = JsonSerializer.Deserialize<string>(raw) ?? "{}";
        WriteSelfTest(JsonSerializer.Deserialize<JsonElement>(json), extra: new
        {
            fullscreen = _fullscreen,
            addressBar = false,
            formClient = new { w = ClientSize.Width, h = ClientSize.Height },
            webSize = new { w = _web.Width, h = _web.Height },
            deviceDpi = DeviceDpi,
            windows = Application.OpenForms.Cast<Form>().OfType<ViewerForm>().Select(f => f._target).ToArray(),
            screen = new { w = Screen.FromControl(this).Bounds.Width, h = Screen.FromControl(this).Bounds.Height },
            userDataFolder = _web.CoreWebView2.Environment.UserDataFolder
        });
    }

    private void WriteSelfTest(object page, object? extra = null)
    {
        try { File.WriteAllText(SelfTestOut!, JsonSerializer.Serialize(new { page, extra })); } catch { /* percorso non scrivibile */ }
        Application.Exit();
    }
}
