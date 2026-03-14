using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Diagnostics;



namespace ChronoUpdater
{
    static internal class DriverInstaller
    {

        public static bool checkDriver()
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = "pnputil.exe",
                Arguments = "/enum-drivers",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using (Process process = Process.Start(psi))
            {
                string output = process.StandardOutput.ReadToEnd();
                process.WaitForExit();

                bool present = output.ToLower().Contains("cp210x") || output.ToLower().Contains("silabs");

                return present;
            }
        }

        public static void install()
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = "pnputil",
                Arguments = "/add-driver cp210x.inf /install",
                Verb = "runas",   // richiede diritti amministratore
                UseShellExecute = true
            };

            Process.Start(psi);
        }
    }
}
