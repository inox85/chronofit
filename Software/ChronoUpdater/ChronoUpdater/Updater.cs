using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.IO;
using System.Configuration;

namespace ChronoUpdater
{
    internal class Updater
    {
        public static  event Action<string> LogReceived;

        private static void Log(string text)
        {
            LogReceived?.Invoke(text);
        }

        public static bool Flash(string comport)
        {
            string fw = "fw.bin";
            string fs = "fs.bin";

            string fwPath = Path.Combine(AppConstants.UpdateFiles, fw);
            string fsPath = Path.Combine(AppConstants.UpdateFiles, fs);
            string espToolPath = Path.Combine(AppConstants.Tools, "esptool.exe");



            if (!File.Exists(fwPath))
            {
                Console.WriteLine("Firmware non trovato!");
                return false;
            }

            if (!File.Exists(fsPath))
            {
                Console.WriteLine("Filesystem non trovato!");
                return false;
            }

            if (!File.Exists(espToolPath))
            {
                Console.WriteLine("Esptool non trovato!");
                return false;
            }


            string args =
                $"--chip esp32 --port {comport} --baud 921600 " +
                $"write_flash 0x10000 \"{fwPath}\" 0x210000 \"{fsPath}\"";

            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = espToolPath,
                Arguments = args,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using (Process p = new Process())
            {
                p.StartInfo = psi;

                p.OutputDataReceived += (s, e) =>
                {
                    if (e.Data != null)
                        Log(e.Data);
                };

                p.ErrorDataReceived += (s, e) =>
                {
                    if (e.Data != null)
                        Log(e.Data);
                };

                p.Start();

                p.BeginOutputReadLine();
                p.BeginErrorReadLine();

                p.WaitForExit();

                return p.ExitCode == 0;
            }

        }
    }
}