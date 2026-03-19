using System;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.IO;
using System.IO;
using System.IO.Compression;
using System.IO.Ports;
using System.Linq;
using System.Net.Http;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Xml.Linq;
using static System.Net.Mime.MediaTypeNames;
using static System.Windows.Forms.VisualStyles.VisualStyleElement;



namespace ChronoUpdater
{

    public partial class frmMain : Form
    {
        DownloadResult res;
        public frmMain()
        {
            InitializeComponent();
        }

        private async void btnDownload_Click(object sender, EventArgs e)
        {
            try
            {

                btnDownload.Enabled = false;

                res = await DownloadFiles();

                if (res.Success)
                {
                    lblDownloadResult.Text = "Version available: " + res.Version;
                    lblDownloadResult.Visible = true;
                    lblDownloadResult.BackColor = Color.LightGreen;
                    updateFlashableStatus();
                }
                else
                {
                    lblDownloadResult.Text = "Error checking for updates.";
                    lblDownloadResult.Visible = true;
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

                result.Assets = doc.RootElement.GetProperty("assets");

                var asset = result.Assets[0];

                string fileName = asset.GetProperty("name").GetString();

                // 3. Crea cartella
                if (!Directory.Exists(AppConstants.DownloadPath))
                    Directory.CreateDirectory(AppConstants.DownloadPath);

                string zipPath = Path.Combine(AppConstants.DownloadPath, fileName);

                string downloadUrl = asset.GetProperty("browser_download_url").GetString();
                // 4. Download file
                using (var response = await client.GetAsync(downloadUrl))
                {
                    response.EnsureSuccessStatusCode();

                    using var fs = new FileStream(zipPath, FileMode.Create, FileAccess.Write);
                    await response.Content.CopyToAsync(fs);
                }

                Console.WriteLine("Download completato!");

                // 5. Estrazione ZIP (solo se è zip)
                if (Path.GetExtension(zipPath).ToLower() == ".zip")
                {
                    string extractPath = AppConstants.UpdateFiles;


                    if (Directory.Exists(extractPath))
                        Directory.Delete(extractPath, true);

                    ZipFile.ExtractToDirectory(zipPath, extractPath);

                    Console.WriteLine("Estrazione completata in: " + extractPath);
                }

                result.Success = true;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorMessage = ex.Message;
            }

            return result;
        }


        private void frmMain_Load(object sender, EventArgs e)
        {
            bool driverInstalled = DriverInstaller.checkDriver();

            if (!driverInstalled)
            {
                MessageBox.Show("Driver not found. Please install the driver before using the application.", "Driver Not Found", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }

            Updater.LogReceived += AppendLog;


            cbPorts.DataSource = DriverInstaller.GetCP210xPorts();
            cbPorts.DisplayMember = "Text";
            cbPorts.ValueMember = "Value";

            cbPorts.Enabled = true;
            btnFlash.Enabled = true;
        }


        private async void btnFlash_Click(object sender, EventArgs e)
        {

            beginFlash(cbPorts.SelectedValue.ToString());
        }

        async void beginFlash(string port)
        {
            if (cbPorts.InvokeRequired)
            {
                cbPorts.Invoke(new Action<string>(beginFlash), port);
                return;
            }
            await Task.Run(() => Updater.Flash(port));
        }

        void AppendLog(string text)
        {
            if (tbLog.InvokeRequired)
            {
                tbLog.Invoke(new Action<string>(AppendLog), text);
                return;
            }

            tbLog.AppendText(text + Environment.NewLine);
        }


        private void updateFlashableStatus()    
        {
            if (cbPorts.SelectedIndex != -1 && res != null)
            {
                btnFlash.Enabled = true;
                btnFlash.Text = "Flash firmware [" + res.Version + "]";
            }
            else
            {
                btnFlash.Text = "Flash firmware";
                btnFlash.Enabled = false;
            }
        }

        private void cbPorts_SelectedIndexChanged(object sender, EventArgs e)
        {
            updateFlashableStatus();
        }
    }
}
