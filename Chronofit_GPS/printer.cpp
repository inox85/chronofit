#include "printer.h"
#include <Arduino.h>
#include "globals.h"
#include "services_serial.h"


void printFormatted(int index, int line, int competitor, int hh, int mm, int ss, int ms, int cr){

  char buffer[40];

  sprintf(buffer, "#%03d L%03d C%05d T%02d:%02d:%02d.%03d", index, line, competitor, hh, mm, ss, ms);

  String text = String(buffer);

  printOnPrinter(text, cr);

}

void printOnPrinter(String text, int cr)
{
  ServicesSerial.print(text);
  for(int i=1; i<=cr; i++)
    ServicesSerial.write(0x0A);
}