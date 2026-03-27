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
    class Updater
    {
        public static event Action<string> LogReceived;
        private static void Log(string text) => LogReceived?.Invoke(text);
        private static bool RunEspTool(string args)
        {
            string espToolPath = Path.Combine(AppConstants.Tools, "esptool.exe");

            if (!File.Exists(espToolPath))
            {
                Log("Esptool non trovato!");
                return false;
            }

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
                p.OutputDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
                p.ErrorDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };

                p.Start();
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();

                // Legge stdout/stderr su thread separati per evitare deadlock
                Task outputTask = Task.Run(() => p.WaitForExit());
                outputTask.Wait();

                return p.ExitCode == 0;
            }
        }

        public static Task<bool> FlashBinAsync(UInt32 address, string filePath, string comport)
        {
            return Task.Run(() =>
            {
                if (!File.Exists(filePath))
                {
                    Log("File non trovato!");
                    return false;
                }

                string args = $"--chip esp32 --port {comport} --baud 921600 " +
                              $"write_flash 0x{address:X} \"{filePath}\"";

                return RunEspTool(args);
            });
        }

        public static Task<bool> FlashMergedAndFS(string comport)
        {
            return Task.Run(() =>
            {
                string mergedPath = Path.Combine(AppConstants.UpdateFiles, "merged.bin");
                string fsPath = Path.Combine(AppConstants.UpdateFiles, "fs.bin");

                if (!File.Exists(mergedPath)) { Log("Merged non trovato!"); return false; }
                if (!File.Exists(fsPath)) { Log("Filesystem non trovato!"); return false; }

                string mergedArgs = $"--chip esp32 --port {comport} --baud 921600 " +
                              $"write_flash 0x0 \"{mergedPath}\"";

                bool mergedSuccess = RunEspTool(mergedArgs);

                string fsArgs = $"--chip esp32 --port {comport} --baud 921600 " +
                              $"write_flash 0x210000 \"{fsPath}\"";

                bool fsSucess = RunEspTool(fsArgs);

                return mergedSuccess && fsSucess;
            });
        }

        public static Task<bool> FlashAppAndFS(string comport)
        {
            return Task.Run(() =>
            {
                string appPath = Path.Combine(AppConstants.UpdateFiles, "fw.bin");
                string fsPath = Path.Combine(AppConstants.UpdateFiles, "fs.bin");

                if (!File.Exists(appPath)) { Log("App file non trovato!"); return false; }
                if (!File.Exists(fsPath)) { Log("Filesystem non trovato!"); return false; }

                string appArgs = $"--chip esp32 --port {comport} --baud 921600 " +
                              $"write_flash 0x10000 \"{appPath}\"";

                bool mergedSuccess = RunEspTool(appArgs);

                string fsArgs = $"--chip esp32 --port {comport} --baud 921600 " +
                              $"write_flash 0x210000 \"{fsPath}\"";

                bool fsSucess = RunEspTool(fsArgs);

                return mergedSuccess && fsSucess;
            });
        }

    }
}