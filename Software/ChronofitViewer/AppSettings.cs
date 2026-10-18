using System.Text.Json;

namespace ChronofitViewer;

public sealed class SavedAddress
{
    public string Name { get; set; } = "";
    public string Url { get; set; } = "";
}

/// <summary>Impostazioni salvate in %AppData%\ChronofitViewer\settings.json.</summary>
public sealed class AppSettings
{
    public const string DefaultUrl = "http://192.168.10.1/";

    public string Url { get; set; } = DefaultUrl;
    public bool KeepAwake { get; set; } = true;
    /// <summary>All'avvio la finestra è massimizzata (con la sua barra del titolo).</summary>
    public bool StartMaximized { get; set; } = true;

    /// <summary>Schermo intero senza bordi: solo se richiesto (menu, F11 o --fullscreen).</summary>
    public bool StartFullscreen { get; set; } = false;

    /// <summary>Versione del formato: le impostazioni salvate con valori più vecchi si aggiornano.</summary>
    public int Version { get; set; } = 3;

    // Posizione della finestra principale (-1 = non salvata)
    public int X { get; set; } = -1;
    public int Y { get; set; } = -1;
    public int Width { get; set; } = 1280;
    public int Height { get; set; } = 800;
    public bool Maximized { get; set; } = false;

    public List<SavedAddress> Favorites { get; set; } = new()
    {
        new SavedAddress { Name = "Chronofit GPS / Main Cell", Url = "http://192.168.10.1/" },
        new SavedAddress { Name = "Fotocellula (configurazione)", Url = "http://192.168.11.1/" },
    };

    private static string FilePath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ChronofitViewer", "settings.json");

    public static string DataFolder =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChronofitViewer");

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                var s = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(FilePath));
                if (s != null)
                {
                    s.Url = NormalizeUrl(s.Url) ?? DefaultUrl;
                    if (s.Version < 3)
                    {
                        // il predefinito è la finestra massimizzata, non lo schermo intero
                        s.StartMaximized = true;
                        s.StartFullscreen = false;
                        s.Version = 3;
                    }
                    return s;
                }
            }
        }
        catch
        {
            // file illeggibile: si riparte dai valori predefiniti
        }
        return new AppSettings();
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
            // impossibile scrivere (cartella protetta?): le impostazioni restano solo in memoria
        }
    }

    /// <summary>Aggiunge l'indirizzo ai preferiti se non c'è già.</summary>
    public void RememberAddress(string url)
    {
        if (Favorites.Any(f => string.Equals(f.Url, url, StringComparison.OrdinalIgnoreCase)))
            return;
        string name = Uri.TryCreate(url, UriKind.Absolute, out var u) ? u.Host : url;
        Favorites.Add(new SavedAddress { Name = name, Url = url });
    }

    /// <summary>"192.168.10.1" → "http://192.168.10.1/"; ritorna null se non è un indirizzo valido.</summary>
    public static string? NormalizeUrl(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        string s = input.Trim();
        if (!s.Contains("://")) s = "http://" + s;
        if (!Uri.TryCreate(s, UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return null;
        if (string.IsNullOrEmpty(uri.Host)) return null;
        return uri.AbsoluteUri;
    }
}
