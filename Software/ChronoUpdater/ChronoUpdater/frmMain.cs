using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System;
using System.Net.Http;
using System.Text.Json;
using System.IO;
using System.Threading.Tasks;

namespace ChronoUpdater
{
    public partial class frmMain : Form
    {
        public frmMain()
        {
            InitializeComponent();
        }

        private void btnDownload_Click(object sender, EventArgs e)
        {
            
        }

        static async Task Main()
        {
            string token = "";
            string repo = "inox85/chronofit";

            using HttpClient client = new HttpClient();

            client.DefaultRequestHeaders.Add("User-Agent", "FW-Updater");
            client.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

            string apiUrl = $"https://api.github.com/repos/{repo}/releases/latest";

            Console.WriteLine("Lettura release...");

            string json = await client.GetStringAsync(apiUrl);

            using JsonDocument doc = JsonDocument.Parse(json);

            foreach (var asset in doc.RootElement.GetProperty("assets").EnumerateArray())
            {
                string name = asset.GetProperty("name").GetString();
                string url = asset.GetProperty("browser_download_url").GetString();

                Console.WriteLine($"Download {name}");

                var data = await client.GetByteArrayAsync(url);

                await File.WriteAllBytesAsync(name, data);
            }

            Console.WriteLine("Download completato");
        }
    }
}
