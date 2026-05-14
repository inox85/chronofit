using System;
using System.Collections.Generic;
using System.ComponentModel;

namespace MqttMonitor.Models;

public class MqttMessage : INotifyPropertyChanged
{
    public int Index           { get; set; }
    public string Topic        { get; set; } = "";
    public string Payload      { get; set; } = "";
    public int ID              { get; set; }
    public int LineNumber { get; set; }
    public string LineID       { get; set; } = "";
    public string TimeStamp    { get; set; } = "";
    public DateTime ReceivedAt { get; set; }
    public string QoS          { get; set; } = "";

    // Campi dinamici estratti dal JSON
    public Dictionary<string, string> JsonFields { get; set; } = new();

    public string TimestampDisplay => ReceivedAt.ToString("HH:mm:ss.fff");

    public event PropertyChangedEventHandler? PropertyChanged;
}
