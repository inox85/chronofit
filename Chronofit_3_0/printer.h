// routes.h
#pragma once
#include <Arduino.h>
#include "globals.h"

void printFormatted(int index, String line, int competitor, int hh, int mm, int ss, int ms, int cr);

// Inizializza task e coda
void printerInit();

// Funzione asincrona di stampa
void printOnPrinter(const String &text, int cr);