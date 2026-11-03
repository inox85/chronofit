package it.chemitec.chronofit.viewer;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Chronofit Viewer per Android: la console web di un dispositivo Chronofit
 * (GPS, Main Cell, fotocellula) a schermo intero, senza barra degli indirizzi.
 * Equivalente di Software/ChronofitViewer (Windows). Non richiede HTTPS: la
 * WebView carica direttamente http://192.168.10.1/.
 */
public class MainActivity extends Activity {

    static final String EXTRA_URL = "url";
    static final String PREFS = "viewer";
    static final String KEY_URL = "url";
    static final String DEFAULT_URL = "http://192.168.10.1/index.html";
    static final int REQ_FILE = 1;
    static final long RETRY_MS = 3000;

    // Le pagine generano i CSV con Blob + <a download>, che la WebView non gestisce:
    // si intercetta il click sull'ancora e si passa il contenuto all'app. Il Blob va
    // catturato in createObjectURL perché la pagina fa subito revokeObjectURL.
    static final String BLOB_HOOK =
        "(function(){if(window.__cfHook)return;window.__cfHook=1;"
        + "var blobs={},orig=URL.createObjectURL.bind(URL);"
        + "URL.createObjectURL=function(b){var u=orig(b);blobs[u]=b;return u;};"
        + "var click=HTMLAnchorElement.prototype.click;"
        + "HTMLAnchorElement.prototype.click=function(){var a=this,h=a.href;"
        + "if(a.download&&h&&h.indexOf('blob:')===0&&blobs[h]){var b=blobs[h],r=new FileReader();"
        + "r.onload=function(){var s=r.result;ChronofitAndroid.saveFile(a.download,"
        + "b.type||'application/octet-stream',s.substring(s.indexOf(',')+1));};"
        + "r.readAsDataURL(b);return;}"
        + "return click.apply(this,arguments);};})();";

    private WebView web;
    private String target;
    private boolean isChild;
    private boolean errorShown;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ValueCallback<Uri[]> filePathCallback;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getAttributes().layoutInDisplayCutoutMode =
            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;

        String extra = getIntent().getStringExtra(EXTRA_URL);
        isChild = extra != null;
        target = isChild ? extra
                         : getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_URL, DEFAULT_URL);

        bindToWifi();

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);
        configureWebView();
        web.loadUrl(target);
    }

    // Con i dati mobili accesi Android instrada le connessioni verso 192.168.x.x sulla rete
    // di default (mobile) invece che sulla WiFi del dispositivo, che non ha Internet.
    private void bindToWifi() {
        connectivity = getSystemService(ConnectivityManager.class);
        NetworkRequest request = new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) { connectivity.bindProcessToNetwork(network); }
            @Override public void onLost(Network network) { connectivity.bindProcessToNetwork(null); }
        };
        try {
            connectivity.requestNetwork(request, networkCallback);
        } catch (RuntimeException e) {
            networkCallback = null;
        }
    }

    private void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);

        web.addJavascriptInterface(new Bridge(), "ChronofitAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError(request.getUrl().toString(), error.getDescription());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(BLOB_HOOK, null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }

            // Link con target=_blank / window.open (viste, manuale...): nuova finestra dell'app
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                final WebView temp = new WebView(MainActivity.this);
                final boolean[] opened = {false};
                temp.setWebViewClient(new WebViewClient() {
                    private void open(String url) {
                        if (opened[0] || url == null || url.equals("about:blank")) return;
                        opened[0] = true;
                        openNewWindow(url);
                        handler.post(temp::destroy);
                    }
                    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                        open(r.getUrl().toString());
                        return true;
                    }
                    @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap f) {
                        open(url);
                    }
                });
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(temp);
                resultMsg.sendToTarget();
                return true;
            }

            // Dialoghi alert/confirm della pagina (la console usa i propri, ma per sicurezza)
            @Override
            public boolean onJsAlert(WebView v, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.cancel()).show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView v, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel()).show();
                return true;
            }
        });

        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                if (url.startsWith("blob:")) {
                    // Percorso di riserva: la maggior parte dei blob passa già da BLOB_HOOK
                    web.evaluateJavascript("fetch('" + url + "').then(function(r){return r.blob();})"
                        + ".then(function(b){var r=new FileReader();r.onload=function(){var s=r.result;"
                        + "ChronofitAndroid.saveFile('" + name.replace("'", "") + "',b.type,"
                        + "s.substring(s.indexOf(',')+1));};r.readAsDataURL(b);});", null);
                    return;
                }
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setMimeType(mimeType);
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(req);
                Toast.makeText(MainActivity.this, "Download: " + name, Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ── Dispositivo non raggiungibile ────────────────────────────────────────

    private void showError(String failedUrl, CharSequence reason) {
        if (errorShown) return;
        errorShown = true;
        String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
            + "<body style='margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;"
            + "justify-content:center;background:#111;color:#eee;font-family:sans-serif;text-align:center'>"
            + "<h2>Dispositivo non raggiungibile</h2>"
            + "<p>" + escape(target) + "</p>"
            + "<p style='color:#999'>" + escape(String.valueOf(reason)) + "</p>"
            + "<p>Collegati alla WiFi del dispositivo.<br>Nuovo tentativo ogni 3 secondi&hellip;</p>"
            + "<button style='font-size:20px;padding:12px 24px;margin-top:12px' "
            + "onclick='ChronofitAndroid.changeAddress()'>Cambia indirizzo</button>"
            + "</body></html>";
        web.loadDataWithBaseURL("http://offline.local/", html, "text/html", "utf-8", null);
        scheduleProbe();
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private final Runnable probe = new Runnable() {
        @Override public void run() {
            if (!errorShown) return;
            final String url = target;
            new Thread(() -> {
                final boolean ok = reachable(url);
                handler.post(() -> {
                    if (!errorShown) return;
                    if (ok) {
                        errorShown = false;
                        web.loadUrl(target);
                    } else {
                        scheduleProbe();
                    }
                });
            }).start();
        }
    };

    private void scheduleProbe() {
        handler.removeCallbacks(probe);
        handler.postDelayed(probe, RETRY_MS);
    }

    private static boolean reachable(String url) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(2000);
            c.setReadTimeout(2000);
            return c.getResponseCode() < 500;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ── Indirizzo ────────────────────────────────────────────────────────────

    private static String normalize(String input) {
        String s = input.trim();
        if (s.isEmpty()) return DEFAULT_URL;
        if (!s.contains("://")) s = "http://" + s;
        int hostEnd = s.indexOf('/', s.indexOf("://") + 3);
        if (hostEnd < 0) s += "/index.html";
        return s;
    }

    private void showAddressDialog() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(target);
        input.setSelectAllOnFocus(true);
        new AlertDialog.Builder(this)
            .setTitle("Indirizzo del dispositivo")
            .setMessage("Es. 192.168.10.1 (GPS / Main Cell) oppure 192.168.11.1 (fotocellula)")
            .setView(input)
            .setPositiveButton("Apri", (d, w) -> {
                target = normalize(input.getText().toString());
                if (!isChild) {
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_URL, target).apply();
                }
                errorShown = false;
                web.loadUrl(target);
            })
            .setNegativeButton(android.R.string.cancel, null)
            .show();
    }

    private void openNewWindow(String url) {
        Intent i = new Intent(this, MainActivity.class).putExtra(EXTRA_URL, url)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
        startActivity(i);
    }

    // ── Ponte JavaScript ─────────────────────────────────────────────────────

    private class Bridge {
        @JavascriptInterface
        public void changeAddress() {
            runOnUiThread(MainActivity.this::showAddressDialog);
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                    os.write(data);
                }
                toast("Salvato in Download: " + name);
            } catch (Exception e) {
                toast("Salvataggio non riuscito: " + e.getMessage());
            }
        }

        private void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
        }
    }

    // ── Ciclo di vita, tasti, schermo intero ─────────────────────────────────

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && filePathCallback != null) {
            filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePathCallback = null;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // Indietro: pagina precedente; nella finestra principale non esce mai (tocco accidentale
    // durante una gara). Pressione lunga: cambia indirizzo.
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            event.startTracking();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            showAddressDialog();
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && event.isTracking() && !event.isCanceled()) {
            if (web.canGoBack() && !errorShown) web.goBack();
            else if (isChild) finish();
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (networkCallback != null) {
            try { connectivity.unregisterNetworkCallback(networkCallback); } catch (RuntimeException ignored) { }
            if (!isChild) connectivity.bindProcessToNetwork(null);
        }
        web.destroy();
        super.onDestroy();
    }
}
