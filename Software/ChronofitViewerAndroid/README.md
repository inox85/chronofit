# Chronofit Viewer (Android)

App Android che mostra l'interfaccia web di un dispositivo Chronofit (GPS, Main Cell, fotocellula) a **schermo intero, senza barra degli indirizzi**: è una WebView puntata sul dispositivo. Equivalente di `Software/ChronofitViewer` (Windows).

Serve perché la console è servita in HTTP (`http://192.168.10.1`): Chrome la segna "Non sicuro" e non offre "Installa app" per la PWA. Questa app carica direttamente l'HTTP in chiaro, senza HTTPS e senza flag del browser.

## Installazione sul tablet

1. Copia `ChronofitViewer.apk` sul tablet (cavo USB, cloud, ecc.) oppure installala da PC con `adb install -r ChronofitViewer.apk`.
2. Apri il file dal tablet e consenti l'installazione da questa origine (impostazione "Installa app sconosciute").
3. Collegati alla WiFi del dispositivo (`Chronofit_…`) e apri **Chronofit**.

Requisiti: Android 10 o successivo (`minSdk 29`).

## Uso

- Si apre su `http://192.168.10.1/index.html`. Se il dispositivo non risponde mostra una pagina di attesa e riprova da sola ogni 3 secondi.
- **Cambia indirizzo** (pulsante nella pagina di attesa, oppure **pressione lunga sul tasto Indietro**): per l'IP ricevuto dalla WiFi esterna o per `192.168.11.1` (fotocellula). L'indirizzo resta salvato.
- **Indietro** torna alla pagina precedente, ma non esce mai dall'app (per evitare tocchi accidentali durante una gara).
- I link che aprono una nuova scheda (viste, manuale) si aprono in una **nuova finestra dell'app**; Indietro la chiude.
- Lo schermo resta sempre acceso.
- Gli export CSV ("Download session", "Download view") vengono salvati in **Download**.
- Il caricamento di file (lista concorrenti) apre il selettore file di Android.
- L'app lega il traffico alla WiFi del dispositivo anche con i **dati mobili accesi**, altrimenti Android instraderebbe le richieste verso 192.168.x.x sulla rete mobile.

## Compilare

```
build.bat
```

Non serve Gradle né Android Studio: usa solo `JAVA_HOME` (JDK) e l'SDK Android (`%LOCALAPPDATA%\Android\Sdk`, con `build-tools` e una `platforms\android-NN`). Produce `ChronofitViewer.apk` (firmato) nella stessa cartella.

La prima build crea `chronofit-viewer.keystore` (escluso da git). **Conservalo**: un aggiornamento si installa sopra la versione precedente solo se firmato con la stessa chiave. Per rilasciare una nuova versione alza `VERSION_CODE` e `VERSION_NAME` in `build.bat`.

## Struttura

| File | Contenuto |
|---|---|
| `src/it/chemitec/chronofit/viewer/MainActivity.java` | Tutta la logica (WebView, errore e riprova, download, nuove finestre, rete WiFi) |
| `AndroidManifest.xml` | Permessi e `usesCleartextTraffic` (HTTP in chiaro) |
| `res/` | Icona (copia di `Chronofit_GPS/data/icon-192.png`) e nome app |
| `build.bat` | Build senza Gradle: `aapt2`, `javac`, `d8`, `zipalign`, `apksigner` |
