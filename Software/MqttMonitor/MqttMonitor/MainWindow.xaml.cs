using System;
using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Media;
using MqttMonitor.Models;
using MqttMonitor.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MqttMonitor;

public partial class MainWindow : Window
{
    private readonly MqttService _mqtt = new();
    private readonly ObservableCollection<MqttMessage> _messages = new();
    private int _counter;

    public MainWindow()
    {
        InitializeComponent();
        GridMessages.ItemsSource = _messages;

        _mqtt.MessageReceived   += OnMessageReceived;
        _mqtt.ConnectionChanged += OnConnectionChanged;
    }

    // ── Connessione ──────────────────────────────────────────────────────────

    private async void BtnConnect_Click(object sender, RoutedEventArgs e)
    {
        var host  = TxtHost.Text.Trim();
        var topic = TxtTopic.Text.Trim();

        if (!int.TryParse(TxtPort.Text, out var port))
            port = 1883;

        if (string.IsNullOrWhiteSpace(host))
        {
            MessageBox.Show("Inserisci un indirizzo broker.", "Campo obbligatorio",
                            MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        try
        {
            BtnConnect.IsEnabled    = false;
            BtnDisconnect.IsEnabled = false;
            SetStatus("Connessione in corso...", "#EF9F27");

            await _mqtt.ConnectAsync(host, port, $"wpf-monitor-{Guid.NewGuid():N}");
            await _mqtt.SubscribeAsync(topic);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Impossibile connettersi:\n{ex.Message}",
                            "Errore di connessione",
                            MessageBoxButton.OK, MessageBoxImage.Error);
            BtnConnect.IsEnabled = true;
            SetStatus("Disconnesso", "#993C1D");
        }
    }

    private async void BtnDisconnect_Click(object sender, RoutedEventArgs e)
    {
        await _mqtt.DisconnectAsync();
    }

    private void BtnClear_Click(object sender, RoutedEventArgs e)
    {
        _messages.Clear();
        _counter = 0;
    }

    // ── Ricezione messaggi ───────────────────────────────────────────────────

    private void OnMessageReceived(string topic, string payload, int qos)
    {
        Dispatcher.Invoke(() =>
        {
            dynamic message = JsonConvert.DeserializeObject(payload);

            int id = message.id;
            int line = message.ln;
            string lineID = message.lId;
            string TimeStamp = $"{message.h}:{message.m}:{message.s}:{message.ms}";

            var msg = new MqttMessage
            {
                Index      = ++_counter,
                Topic      = topic,
                Payload    = payload,
                ReceivedAt = DateTime.Now,
                ID         = id,
                LineNumber = line,
                LineID     = lineID,
                TimeStamp  = TimeStamp,
            };

            // Parsing JSON opzionale per i campi
            try
            {
                var obj = JObject.Parse(payload);
                foreach (var prop in obj.Properties())
                    msg.JsonFields[prop.Name] = prop.Value.ToString();
            }
            catch
            {
                // Payload non-JSON: va bene comunque
            }

            // Inserisce in cima (messaggi più recenti prima)
            _messages.Insert(0, msg);

            // Limita a 500 messaggi per non esaurire la memoria
            if (_messages.Count > 500)
                _messages.RemoveAt(_messages.Count - 1);

        });
    }

    private void OnConnectionChanged(bool connected)
    {
        Dispatcher.Invoke(() =>
        {
            if (connected)
            {
                SetStatus($"Connesso  ·  topic: {TxtTopic.Text}", "#1D9E75");
                BtnConnect.IsEnabled    = false;
                BtnDisconnect.IsEnabled = true;
            }
            else
            { 
                SetStatus("Disconnesso", "#993C1D");
                BtnConnect.IsEnabled    = true;
                BtnDisconnect.IsEnabled = false;
            }
        });
    }

    // ── Selezione riga ───────────────────────────────────────────────────────

    private void GridMessages_SelectionChanged(object sender,
        System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (GridMessages.SelectedItem is not MqttMessage msg)
            return;

        try
        {
            var parsed = JsonConvert.DeserializeObject(msg.Payload);

        }
        catch
        {

        }
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private void SetStatus(string text, string hexColor)
    {
        StatusText.Text = text;
        StatusDot.Fill  = new SolidColorBrush(
            (Color)ColorConverter.ConvertFromString(hexColor));
    }

    protected override void OnClosed(EventArgs e)
    {
        _mqtt.Dispose();
        base.OnClosed(e);
    }
}
