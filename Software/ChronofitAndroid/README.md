# Chronofit per Android

App Android che mostra la console web di un dispositivo Chronofit (GPS, Main Cell, fotocellula) **a schermo intero e senza
barra degli indirizzi**. È la WebView di sistema puntata sul dispositivo: l'equivalente di `Software/ChronofitViewer` per Windows.
Non contiene la logica del cronometro: tutto resta sull'unità, l'app è solo il "contenitore".

## Perché un'app e non la PWA

La console è servita in HTTP (`http://192.168.10.1`) e Chrome non permette di installare una PWA da un indirizzo non sicuro.
La WebView invece accetta l'HTTP della rete locale.

## Cosa fa

- Apre `http://192.168.10.1/` (Main/GPS). L'indirizzo si cambia dal pulsante **⋮** (in basso a sinistra, semitrasparente):
  `Cambia indirizzo…`, `Indirizzi salvati…` (con `192.168.10.1` e `192.168.11.1` della fotocellula sempre disponibili),
  `Ricarica`, `Nuova finestra`, `Schermo intero`, `Schermo sempre acceso`.
- Si lega alla **WiFi del Chronofit** anche se Android la considera "senza Internet" (altrimenti il traffico andrebbe sulla
  rete mobile e la console non si aprirebbe).
- Se l'unità non risponde mostra una pagina di attesa e riprova da sola ogni 3 secondi.
- Schermo sempre acceso e schermo intero di default; i suoni dei passaggi partono senza toccare lo schermo.
- I link che aprono una nuova scheda (viste `view.html`, manuale…) si aprono in una **nuova finestra dell'app**; i link verso
  altri siti nel browser del telefono.
- Caricamento del file CSV dei competitor dal selettore file.
- I download (CSV della sessione, classifica…) vengono salvati in **Download/Chronofit** (i file creati dalla pagina prendono
  il nome `chronofit_AAAAMMGG_oomm.csv`).
- Il tasto Indietro torna alla pagina precedente.

## Compilare l'APK (Android Studio)

1. Installa **Android Studio** (include JDK e Android SDK). Alla prima apertura accetta l'installazione dell'SDK 34.
2. `File → Open…` e scegli la cartella `Software/ChronofitAndroid`. Attendi la sincronizzazione di Gradle (scarica Gradle 8.7
   e i plugin: serve Internet). Se propone di aggiornare il plugin Android Gradle, puoi rifiutare o accettare.
3. `Build → Build Bundle(s) / APK(s) → Build APK(s)`. L'APK di prova è in
   `app/build/outputs/apk/debug/app-debug.apk`.
4. Installa sul telefono: collega via USB con il debug USB attivo e premi ▶ in Android Studio, oppure copia l'APK sul
   telefono e aprilo (consenti l'installazione da "origini sconosciute" per l'app con cui lo apri).

Requisiti sul telefono: **Android 10 o successivo** e un WebView di sistema aggiornato (Android System WebView / Chrome).

### APK da consegnare ai clienti

L'APK debug va bene per le prove. Per distribuirlo firmalo con una tua chiave: `Build → Generate Signed Bundle / APK…` →
APK → crea un nuovo keystore (conservalo e non perderlo: serve per ogni aggiornamento futuro). **Il file `.jks` non va nel
repository** (è già in `.gitignore`).

## Uso

1. Sul telefono collegati alla rete WiFi del Chronofit (`Chronofit_…` o `ChronofitMainCell_…`). Se Android chiede di restare
   collegato perché "senza Internet", rispondi **Sì** e, se c'è, spegni "Cambio automatico rete / WiFi+".
2. Apri l'app **Chronofit**: carica la console. Se non risponde, mostra "In attesa di Chronofit…" e riprova.
3. Per la fotocellula (`192.168.11.1`) o per un'unità sulla WiFi del campo: **⋮ → Cambia indirizzo…**.

## Limiti

- Non è una PWA: niente installazione da browser e nessun funzionamento offline. Senza l'unità si vede la pagina di attesa.
- Il pulsante ⋮ è piccolo e semitrasparente per non coprire la console; se copre un comando della tua pagina, dimmelo e lo
  sposto o lo rendo trascinabile.
- Le notifiche di sistema e l'avvio automatico non sono previsti.

## Struttura

```
settings.gradle, build.gradle, gradle.properties   configurazione Gradle (AGP 8.5, Kotlin 1.9)
app/build.gradle                                  minSdk 29, targetSdk 34, nessuna dipendenza esterna
app/src/main/AndroidManifest.xml                  permessi di rete, traffico in chiaro consentito
app/src/main/java/it/chemitec/chronofit/MainActivity.kt   tutta la logica
app/src/main/res                                  icona (la stessa della console), tema, regole di rete
```
