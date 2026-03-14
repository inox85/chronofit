using System;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Xml.Linq;
using System.IO;
using System.IO.Compression;
using System.IO.Ports;



namespace ChronoUpdater
{

    public partial class frmMain : Form
    {

        public frmMain()
        {
            InitializeComponent();
        }

        private async void btnDownload_Click(object sender, EventArgs e)
        {
            try
            {

                btnDownload.Enabled = false;

                var res = await DownloadFiles();

                if (res.Success)
                {
                    lblDownloadResult.Text = "New version available: " + res.Version;
                    cbPorts.DataSource = SerialPort.GetPortNames();
                }
                else
                {
                    MessageBox.Show(res.ErrorMessage);
                }                 

            }
            catch (Exception ex)
            {
                MessageBox.Show("Errore: " + ex.Message);
            }
            finally
            {
                btnDownload.Enabled = true;
            }
        }
        static async Task<DownloadResult> DownloadFiles()
        {
            var result = new DownloadResult();

            try
            {
                string token = Secrets.gitApiKey;
                string repo = "inox85/chronofit";

                using HttpClient client = new HttpClient();

                client.DefaultRequestHeaders.Add("User-Agent", "FW-Updater");
                client.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

                string apiUrl = $"https://api.github.com/repos/{repo}/releases/latest";

                string json = await client.GetStringAsync(apiUrl);

                using JsonDocument doc = JsonDocument.Parse(json);

                result.Version = doc.RootElement.GetProperty("tag_name").GetString();

                result.Success = true;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorMessage = ex.Message;
            }

            return result;
        }

        private async void btnCheckUpdates_Click(object sender, EventArgs e)
        {

            string token = Secrets.gitApiKey;
            string repo = "inox85/chronofit";

            using HttpClient client = new HttpClient();

            client.DefaultRequestHeaders.Add("User-Agent", "FW-Updater");
            client.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

            string apiUrl = $"https://api.github.com/repos/{repo}/releases";

            Console.WriteLine("Lettura release...");

            try
            {

                string json = await client.GetStringAsync(apiUrl);

                using JsonDocument doc = JsonDocument.Parse(json);

                foreach (var release in doc.RootElement.EnumerateArray())
                {
                    string tag = release.GetProperty("tag_name").GetString();
                    Console.WriteLine(tag);
                }

                btnDownload.Text = "Download latest version";
                btnDownload.BackColor = Color.LightGreen;



            }
            catch (Exception ex)
            {
                MessageBox.Show("Server connection error: " + ex.Message);
            }

            //foreach (var asset in doc.RootElement.GetProperty("assets").EnumerateArray())
            //{
            //    string name = asset.GetProperty("name").GetString();
            //    string url = asset.GetProperty("browser_download_url").GetString();
            //    Console.WriteLine($"Trovato {name}");
            //}
        }

        private void frmMain_Load(object sender, EventArgs e)
        {
            bool driverInstalled = DriverInstaller.checkDriver();

            if (!driverInstalled)
            {
                MessageBox.Show("Driver not found. Please install the driver before using the application.", "Driver Not Found", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void cbPorts_SelectedIndexChanged(object sender, EventArgs e)
        {

        }
    }
}
