namespace ChronofitViewer;

/// <summary>Finestra per scegliere o scrivere l'indirizzo del dispositivo.</summary>
public sealed class AddressDialog : Form
{
    private readonly ComboBox _combo = new();
    private readonly CheckBox _remember = new();
    private readonly List<SavedAddress> _items;

    public string? ResultUrl { get; private set; }
    public bool Remember => _remember.Checked;

    public AddressDialog(AppSettings settings, string currentUrl)
    {
        _items = settings.Favorites;

        Text = "Indirizzo del dispositivo";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(460, 150);
        Font = SystemFonts.MessageBoxFont ?? Font;

        var label = new Label
        {
            Text = "Scegli un indirizzo salvato o scrivine uno (per esempio 192.168.10.1):",
            Left = 12, Top = 12, Width = 436, Height = 36,
        };

        _combo.Left = 12;
        _combo.Top = 52;
        _combo.Width = 436;
        _combo.DropDownStyle = ComboBoxStyle.DropDown;
        foreach (var f in _items)
            _combo.Items.Add($"{f.Name}  —  {f.Url}");
        _combo.Text = currentUrl;
        _combo.SelectedIndexChanged += (_, _) =>
        {
            if (_combo.SelectedIndex >= 0 && _combo.SelectedIndex < _items.Count)
                _combo.Text = _items[_combo.SelectedIndex].Url;
        };

        _remember.Text = "Ricorda questo indirizzo";
        _remember.Left = 12;
        _remember.Top = 88;
        _remember.Width = 300;
        _remember.Checked = true;

        var ok = new Button { Text = "Apri", Left = 280, Top = 112, Width = 80, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "Annulla", Left = 368, Top = 112, Width = 80, DialogResult = DialogResult.Cancel };
        AcceptButton = ok;
        CancelButton = cancel;

        ok.Click += (_, _) =>
        {
            string? url = AppSettings.NormalizeUrl(_combo.Text);
            if (url == null)
            {
                MessageBox.Show(this, "Indirizzo non valido.", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                DialogResult = DialogResult.None;   // resta aperta
                return;
            }
            ResultUrl = url;
        };

        Controls.AddRange(new Control[] { label, _combo, _remember, ok, cancel });
    }
}
