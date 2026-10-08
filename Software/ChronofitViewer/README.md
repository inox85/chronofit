# Chronofit Viewer

Applicazione Windows che mostra l'interfaccia web di un dispositivo Chronofit (GPS, Main Cell, fotocellula)
in una finestra **senza barra degli indirizzi**: è il browser integrato di Edge (WebView2) puntato sul dispositivo.

## Uso

1. Collega il PC alla rete WiFi del dispositivo (`Chronofit_…` o `ChronofitMainCell_…`).
2. Apri `ChronofitViewer.exe`: si apre **massimizzata** e carica `http://192.168.10.1/`. Se il dispositivo non
   risponde, mostra una pagina di attesa e riprova da sola ogni 3 secondi. `F11` passa allo schermo intero senza bordi.

| Comando | Cosa fa |
|---|---|
| **Tasto destro** | Menu: cambia indirizzo, indirizzi salvati, ricarica, schermo intero, nuova finestra, avvia massimizzata / a schermo intero, schermo sempre acceso |
| `Ctrl+L` | Cambia l'indirizzo (es. l'IP ricevuto dalla WiFi esterna, o `192.168.11.1` per la fotocellula) |
| `F11` / `Esc` | Schermo intero |
| `Ctrl+N` | Nuova finestra (utile per le viste per secondo schermo) |
| `F5` | Ricarica |

I link che aprono una nuova scheda (viste `view.html`, manuale…) si aprono in una **nuova finestra dell'app**;
i link verso internet si aprono nel browser predefinito.

### Da riga di comando

```
ChronofitViewer.exe [indirizzo] [--fullscreen | --windowed]
ChronofitViewer.exe http://192.168.10.1/view.html --windowed        (finestra normale, non massimizzata)
```

Con un collegamento a questo comando si prepara un'icona per ogni vista. Dalla console, il pulsante accanto
all'icona della disciplina apre la vista della disciplina in una **nuova finestra** dell'app (normale, non a schermo intero).

## Cosa fa in più rispetto a un browser

- **Cache sempre rivalidata**: dopo aver caricato un nuovo filesystem sul dispositivo si vede subito l'interfaccia
  nuova (il firmware della GPS dichiara i file validi per 30 giorni).
- **Schermo sempre acceso** (la pagina lo chiederebbe, ma funziona solo su HTTPS).
- **Download** (CSV della sessione, della vista, template competitors): chiede dove salvare.
- Ricorda indirizzo, posizione e dimensione della finestra, preferiti: `%AppData%\ChronofitViewer\settings.json`.
  Il registro atleti e le preferenze della console stanno in `%LocalAppData%\ChronofitViewer\WebView2`.

## Compilazione

```
publish.bat
```

Crea `publish\ChronofitViewer.exe` (circa 50 MB, autonomo: non serve installare .NET). Serve solo
**Microsoft Edge WebView2 Runtime**, presente su Windows 11 e su Windows 10 aggiornato; se manca, l'app lo dice
e indica dove scaricarlo.

Per sviluppare: `dotnet build` (richiede .NET SDK 10). Prova automatica senza interfaccia visibile:

```
ChronofitViewer.exe --selftest esito.json http://192.168.10.1/
```

Windows può mostrare l'avviso SmartScreen al primo avvio, perché l'eseguibile non è firmato.
