namespace ChronofitViewer;

internal static class Program
{
    private static readonly List<Form> Windows = new();

    /// <summary>
    /// Uso:  ChronofitViewer.exe [indirizzo] [--fullscreen | --windowed]
    /// Per impostazione predefinita si apre massimizzata; --fullscreen = schermo intero senza bordi,
    /// --windowed = finestra normale.
    /// Esempio per un secondo schermo:  ChronofitViewer.exe http://192.168.10.1/view.html --fullscreen
    /// </summary>
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        var settings = AppSettings.Load();
        string? url = null;
        bool fullscreen = settings.StartFullscreen;
        bool maximized = settings.StartMaximized;

        for (int i = 0; i < args.Length; i++)
        {
            string a = args[i];
            if (a == "--fullscreen") fullscreen = true;
            else if (a == "--windowed") { fullscreen = false; maximized = false; }
            else if (a == "--selftest" && i + 1 < args.Length) ViewerForm.SelfTestOut = args[++i];   // solo per i collaudi
            else if (!a.StartsWith("--")) url = AppSettings.NormalizeUrl(a) ?? url;
        }

        if (ViewerForm.SelfTestOut != null) fullscreen = false;   // il collaudo non deve occupare lo schermo

        var first = new ViewerForm(settings, url ?? settings.Url, primary: true, startFullscreen: fullscreen);
        if (maximized && !fullscreen && ViewerForm.SelfTestOut == null) first.WindowState = FormWindowState.Maximized;
        if (ViewerForm.SelfTestOut != null)
        {
            first.Opacity = 0;
            first.ShowInTaskbar = false;
        }

        Track(first);
        first.Show();
        Application.Run(new ApplicationContext());
    }

    /// <summary>L'applicazione si chiude quando si chiude l'ultima finestra.</summary>
    public static void Track(Form f)
    {
        Windows.Add(f);
        f.FormClosed += (_, _) =>
        {
            Windows.Remove(f);
            if (Windows.Count == 0) Application.Exit();
        };
    }
}
