# MQTT Monitor — WPF

Applicazione WPF per .NET 8 che si sottoscrive a topic MQTT e visualizza i messaggi JSON in una griglia.

## Requisiti

- .NET 8 SDK (https://dotnet.microsoft.com/download)
- Windows 10/11

## Avvio rapido

```bash
cd MqttMonitor
dotnet restore
dotnet run
```

## Dipendenze NuGet

| Pacchetto | Versione | Scopo |
|---|---|---|
| MQTTnet | 4.3.7.1207 | Client MQTT |
| Newtonsoft.Json | 13.0.3 | Parsing e pretty-print JSON |

## Funzionalità

- Connessione TCP a qualsiasi broker MQTT (host + porta configurabili)
- Sottoscrizione a topic con wildcard (`#`, `+`)
- Griglia messaggi in tempo reale (più recenti in cima)
- Pretty-print JSON del messaggio selezionato
- Limite 500 messaggi in memoria (FIFO)
- Pulsante "Pulisci" per svuotare la lista

## Broker di test gratuiti

- `broker.hivemq.com` porta `1883`
- `test.mosquitto.org` porta `1883`

## Note

Per connessioni TLS (porta 8883) aggiungere `.WithTlsOptions(...)` in `MqttService.ConnectAsync`.
