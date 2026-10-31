#ifndef BOARD_H
#define BOARD_H

// Hardware della scheda delle barriere Chronofit_BLE (ESP32 4 MB + NRF24L01+),
// ricavato da Firmware/Chronofit_BLE/GPIO.h.
//
// FILE CONDIVISO: Chronofit_Main_Cell_RF/board.h e Chronofit_Cell_RF/board.h
// devono restare identici.

// Ingressi (attivi bassi, senza pull-up interno: il GPIO36 è solo ingresso)
constexpr int PIN_BARRIER = 17;   // fotocellula
constexpr int PIN_PAD     = 36;   // pedana

// LED discreti (HIGH = acceso)
constexpr int PIN_LED1 = 12;
constexpr int PIN_LED2 = 13;
constexpr int PIN_LED3 = 14;
constexpr int PIN_LED4 = 25;

constexpr int PIN_BUZZER = 15;

// Alimentazione
constexpr int PIN_GATE_CONTROL   = 16;   // autoritenuta: HIGH = scheda accesa
constexpr int PIN_ADC_BATTERY    = 34;
constexpr int PIN_ADC_BUTTON     = 35;   // pulsante di accensione (pressione lunga = spegnimento)
constexpr int PIN_BATTERY_CHARGE = 26;   // LOW = in carica
constexpr int PIN_BATTERY_STBY   = 27;   // LOW = carica completa

// Modulo NRF24L01+ (SPI)
constexpr int PIN_RF_CE   = 4;
constexpr int PIN_RF_CSN  = 5;
constexpr int PIN_RF_SCK  = 18;
constexpr int PIN_RF_MISO = 19;
constexpr int PIN_RF_MOSI = 23;

#endif
