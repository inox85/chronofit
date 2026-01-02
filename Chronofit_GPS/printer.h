// routes.h
#pragma once
#include <Arduino.h>
#include "globals.h"

void printFormatted(int index, int line, int competitor, int hh, int mm, int ss, int ms, int cr);
void printOnPrinter(String text, int cr);