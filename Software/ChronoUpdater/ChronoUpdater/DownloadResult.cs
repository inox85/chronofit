using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ChronoUpdater
{
    internal class DownloadResult
    {
        public bool Success { get; set; }
        public string Version { get; set; }
        public string ErrorMessage { get; set; }
    }
}
