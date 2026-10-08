using System.Net;

namespace ChronofitViewer;

/// <summary>Pagina mostrata quando il dispositivo non risponde: riprova da sola ogni 3 secondi.</summary>
public static class ErrorPage
{
    public static string Html(string targetUrl, string reason)
    {
        string url = WebUtility.HtmlEncode(targetUrl);
        string why = WebUtility.HtmlEncode(reason);
        string jsUrl = targetUrl.Replace("\\", "\\\\").Replace("'", "\\'");
        return $$"""
<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><title>Chronofit</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;background:#1b1b1b;color:#eee;
       font-family:"Segoe UI",system-ui,sans-serif}
  .box{max-width:560px;padding:32px;text-align:center}
  h1{font-size:26px;margin:0 0 8px}
  p{margin:8px 0;color:#bbb;line-height:1.5}
  code{background:#2c2c2c;border-radius:4px;padding:2px 6px;color:#fff}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#c62828;margin-right:8px;
       animation:b 1s infinite}
  @keyframes b{50%{opacity:.25} }
  button{margin:14px 6px 0;padding:9px 18px;border:0;border-radius:6px;background:#800020;color:#fff;
         font-size:15px;cursor:pointer}
</style></head><body><div class="box">
  <h1><span class="dot"></span>Dispositivo non raggiungibile</h1>
  <p>Indirizzo: <code>{{url}}</code></p>
  <p>Collega il computer alla rete WiFi del Chronofit (<code>Chronofit_…</code> o <code>ChronofitMainCell_…</code>)
     e controlla che il dispositivo sia acceso. Riprovo da solo ogni 3 secondi.</p>
  <p style="font-size:12px;color:#777">{{why}}</p>
  <button onclick="location.replace('{{jsUrl}}')">Riprova ora</button>
  <button onclick="window.chrome.webview.postMessage('address')">Cambia indirizzo…</button>
</div>
<script>setTimeout(function(){location.replace('{{jsUrl}}')},3000);</script>
</body></html>
""";
    }
}
