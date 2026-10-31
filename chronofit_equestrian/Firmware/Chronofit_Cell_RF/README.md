# Chronofit Cell RF

Fotocellula remota per **ChronofitMainCell RF**. Gira sulla scheda delle barriere Chronofit (ESP32 + radio NRF24) e comunica con la Main via radio, sul canale 80 (2,480 GHz, sopra i canali WiFi usati in pratica). Non ha WiFi: tutte le impostazioni si danno dalla console della Main, nella finestra **Fotocellule** (icona del segnale nella card Status).

## Abbinamento

1. Nella console della Main apri **Fotocellule** e premi **Abbina celle**. L'abbinamento resta aperto per 60 s.
2. Accendi la cella. Appena si abbina, lampeggia e suona per 3 s e compare in elenco con la prima linea libera.
3. Imposta linea, lockout e beep direttamente nella tabella. Le modifiche arrivano alla cella entro circa 1 s.

Una cella già abbinata a un'altra Main passa alla nuova solo se viene **accesa vicino alla nuova Main mentre l'abbinamento è aperto** e non sente la sua vecchia Main nei primi 2 minuti. Con **Rimuovi** la Main dimentica la cella, che al collegamento successivo perde l'abbinamento.

## LED

| LED | Significato |
|---|---|
| 1 | Collegamento alla Main: lampeggio lento = non abbinata · lampeggio veloce = Main non raggiungibile o clock non ancora sincronizzato · doppio lampeggio = sincronizzata ma con precisione ridotta · fisso = sincronizzata |
| 2 | Sensore: acceso = fascio interrotto (serve per allineare la fotocellula) · si inverte per un attimo a ogni passaggio |
| 3 | Consegna: lampeggio veloce = passaggio rifiutato o perso negli ultimi 10 s (le singole perdite poi recuperate non contano) · fisso = passaggi in coda · lampo breve = passaggio confermato dalla Main |
| 4 | Ricarica: fisso = carica completa · lampeggio = in carica |

**Trova** dalla console fa lampeggiare tutti i LED e suonare il buzzer per 3 s. **Test** invia un passaggio di prova.

## Taratura della batteria

Operazione di assistenza, non visibile nella console utente. Ogni scheda va tarata una volta. Misura la tensione della batteria col tester, con il caricatore scollegato. Poi apri la pagina **`http://192.168.10.1/service.html`** (non collegata dalla console), scrivi il valore accanto alla cella o alla Main e premi **Tara**. La cella conferma con un beep e la taratura resta salvata.

## Funzionamento

- Il passaggio viene timbrato localmente, con precisione al µs, nell'istante del fronte e poi convertito nel clock della Main.
- La conversione usa un offset misurato ogni secondo con uno scambio radio di andata e ritorno, prendendo il campione più veloce fra gli ultimi 8.
- Se la Main non risponde, i passaggi restano in coda (fino a 32, per al massimo 5 minuti) e vengono reinviati. I duplicati vengono scartati dalla Main.
- La precisione attesa è sotto il millisecondo. La console mostra il ritardo radio e la qualità del link in %.
- Nella scheda della cella, **Persi (ultimi 20)** dice perché si perdono gli scambi radio. *Senza ACK*: il pacchetto non arriva alla Main (distanza, ostacoli, alimentazione del modulo radio). *Senza risposta*: la Main l'ha ricevuto ma era occupata. Ogni scambio perso viene scritto anche sul monitor seriale della cella (115200).

## Accensione e spegnimento

Come le barriere Chronofit: tieni premuto il pulsante per accendere. Per spegnere tienilo premuto finché i 4 LED si spengono uno alla volta. Con una pressione breve i LED mostrano per 3 s la carica come una barra (4 LED = oltre il 75 %, 3 = oltre il 50 %, 2 = oltre il 25 %, 1 lampeggiante = sotto). Con la batteria bassa (sotto circa 3,55 V, il 30 % mostrato in console) la cella fa 3 beep brevi ogni minuto; con la batteria scarica (sotto circa 2,9 V) si spegne da sola.
