using System;
using System.Collections.Generic;
using System.Data;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Management;
using System.Text.RegularExpressions;
using System.IO;
using System.Windows.Forms;


namespace ChronoUpdater
{
    static internal class DriverInstaller
    {

        public static bool checkDriver()
        {

            string pnpUtilPath = Path.Combine(AppConstants.Tools, "pnputil.exe");

            string pnpUtilSystemPath = "";

            if (Environment.Is64BitOperatingSystem && !Environment.Is64BitProcess)
            {
                pnpUtilSystemPath = Path.Combine("C:\\", "Windows", "Sysnative", "pnputil.exe");
            }
            else
            {
                pnpUtilSystemPath = Path.Combine("C:\\", "Windows", "System32", "pnputil.exe");
            }

            if (File.Exists(pnpUtilSystemPath))
            {
                pnpUtilPath = pnpUtilSystemPath;
            }
            else if (!File.Exists(pnpUtilPath)) {
                MessageBox.Show($"Cannot find {Path.Combine(AppConstants.Tools, "pnputil.exe")} or {Path.Combine(AppConstants.System32, "pnputil.exe")}"); 
            }


            try
            {

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = pnpUtilPath,
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
            catch (Exception ex) { 
            
                MessageBox.Show("Error checking driver: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
                return false;
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

        public static DataTable GetCP210xPorts()
        {
            DataTable table = new DataTable();
            table.Columns.Add("Text");   // quello che vede l'utente
            table.Columns.Add("Value");  // numero COM

            using (var searcher = new ManagementObjectSearcher(
                "SELECT * FROM Win32_PnPEntity WHERE Name LIKE '%(COM%'"))
            {
                foreach (ManagementObject obj in searcher.Get())
                {
                    string name = obj["Name"]?.ToString();
                    string deviceId = obj["DeviceID"]?.ToString();

                    if (deviceId != null &&
                        deviceId.Contains("VID_10C4") &&
                        deviceId.Contains("PID_EA60"))
                    {
                        Match m = Regex.Match(name, @"\(COM\d+\)");

                        if (m.Success)
                        {
                            string com = m.Value.Replace("(", "").Replace(")", "");
                            table.Rows.Add(name, com);
                        }
                    }
                }
            }

            return table;
        }
    }
}
