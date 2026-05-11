using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MQTTnet;
using MQTTnet.Client;

namespace MqttMonitor.Services;

public class MqttService : IDisposable
{
    private IMqttClient? _client;
    private readonly MqttFactory _factory = new();

    public event Action<string, string, int>? MessageReceived;  // topic, payload, qos
    public event Action<bool>? ConnectionChanged;

    public bool IsConnected => _client?.IsConnected ?? false;

    public async Task ConnectAsync(string host, int port, string clientId, CancellationToken ct = default)
    {
        _client = _factory.CreateMqttClient();

        _client.ConnectedAsync += _ =>
        {
            ConnectionChanged?.Invoke(true);
            return Task.CompletedTask;
        };

        _client.DisconnectedAsync += _ =>
        {
            ConnectionChanged?.Invoke(false);
            return Task.CompletedTask;
        };

        _client.ApplicationMessageReceivedAsync += args =>
        {
            var topic   = args.ApplicationMessage.Topic;
            var payload = Encoding.UTF8.GetString(args.ApplicationMessage.PayloadSegment);
            var qos     = (int)args.ApplicationMessage.QualityOfServiceLevel;
            MessageReceived?.Invoke(topic, payload, qos);
            return Task.CompletedTask;
        };

        var options = new MqttClientOptionsBuilder()
            .WithTcpServer(host, port)
            .WithClientId(clientId)
            .WithCleanSession()
            .Build();

        await _client.ConnectAsync(options, ct);
    }

    public async Task SubscribeAsync(string topic)
    {
        if (_client is null || !_client.IsConnected) return;

        var filter = new MqttTopicFilterBuilder()
            .WithTopic(topic)
            .Build();

        await _client.SubscribeAsync(filter);
    }

    public async Task DisconnectAsync()
    {
        if (_client?.IsConnected == true)
            await _client.DisconnectAsync();
    }

    public void Dispose() => _client?.Dispose();
}
