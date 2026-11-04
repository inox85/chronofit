package it.chemitec.chronofit

import android.app.Activity
import android.app.AlertDialog
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.provider.MediaStore
import android.text.InputType
import android.text.TextUtils
import android.util.Base64
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Chronofit per Android: mostra la console web di un dispositivo Chronofit (GPS, Main Cell, fotocellula)
 * a schermo intero, senza barra degli indirizzi. È la WebView di sistema puntata sul dispositivo
 * (equivalente di Software/ChronofitViewer per Windows).
 */
class MainActivity : Activity() {

    companion object {
        const val EXTRA_URL = "url"
        const val DEFAULT_URL = "http://192.168.10.1/"
        private const val PRESET_CELL = "http://192.168.11.1/"
        private const val REQ_FILE = 1
        private const val RETRY_MS = 3000L
        private const val MAX_SAVED = 10
    }

    private lateinit var prefs: SharedPreferences
    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())

    private var target = DEFAULT_URL          // indirizzo della console
    private var errored = false               // l'ultimo caricamento è fallito
    private var waiting = false               // pagina di attesa mostrata, si riprova da soli
    @Volatile private var currentUrl = ""     // pagina caricata (per il controllo dei metodi esposti alla pagina)
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var netCallback: ConnectivityManager.NetworkCallback? = null

    private val retry = Runnable {
        if (waiting) webView.loadUrl(target)
    }

    // ── Ciclo di vita ────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("chronofit", Context.MODE_PRIVATE)
        target = intent.getStringExtra(EXTRA_URL) ?: prefs.getString("url", DEFAULT_URL) ?: DEFAULT_URL

        // L'immagine arriva fino al bordo anche sui telefoni con tacca
        val lp = window.attributes
        lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        window.attributes = lp

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        webView = WebView(this)
        setupWebView()
        root.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        val button = buildMenuButton()
        val blp = FrameLayout.LayoutParams(dp(40), dp(40), Gravity.BOTTOM or Gravity.START)
        blp.setMargins(dp(8), 0, 0, dp(8))
        root.addView(button, blp)
        setContentView(root)

        applyScreenFlags()
        bindToWifi()
        webView.loadUrl(target)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacks(retry)
        netCallback?.let {
            try {
                getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it)
            } catch (e: Exception) { /* già rimosso */ }
        }
        webView.destroy()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyFullscreen(prefs.getBoolean("fullscreen", true))
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (!waiting && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    // ── WebView ──────────────────────────────────────────────────────────────

    @Suppress("SetJavaScriptEnabled")
    private fun setupWebView() {
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        webView.setBackgroundColor(Color.BLACK)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true                      // preferenze e elenco competitor della console
            mediaPlaybackRequiresUserGesture = false      // i suoni dei passaggi partono da soli
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true)               // link con target="_blank" (viste, manuale)
            setSupportZoom(false)                         // lo zoom lo gestisce la console
            builtInZoomControls = false
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT          // la rivalidazione la decide l'unità (no-cache + ETag)
            useWideViewPort = true
        }
        webView.addJavascriptInterface(Bridge(), "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val scheme = uri.scheme ?: return false
                if (scheme != "http" && scheme != "https") return false     // blob:, about:, data:
                if (uri.host == Uri.parse(target).host) return false        // stessa unità: si naviga qui
                return try {                                                // altro sito: browser di sistema
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (e: Exception) {
                    false
                }
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                errored = false
                currentUrl = url ?: ""
            }

            override fun onPageFinished(view: WebView, url: String?) {
                currentUrl = url ?: ""
                if (!errored && url != null && url.startsWith("http")) {
                    waiting = false
                    handler.removeCallbacks(retry)
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    errored = true
                    showWaiting()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            // Selezione file (caricamento CSV dei competitor)
            override fun onShowFileChooser(
                view: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                if (callback == null || params == null) return false
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    startActivityForResult(params.createIntent(), REQ_FILE)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }

            // Link che aprono una nuova finestra: una nuova finestra dell'app (come in ChronofitViewer)
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                if (resultMsg == null) return false
                val temp = WebView(this@MainActivity)
                var opened = false
                temp.webViewClient = object : WebViewClient() {
                    override fun onPageStarted(v: WebView, url: String?, favicon: Bitmap?) {
                        if (opened || url == null || url == "about:blank") return
                        opened = true
                        openNewWindow(url)
                        v.stopLoading()
                        handler.post { v.destroy() }
                    }
                }
                (resultMsg.obj as WebView.WebViewTransport).webView = temp
                resultMsg.sendToTarget()
                return true
            }
        }

        // Download (CSV della sessione, classifica…): la pagina scarica il file con fetch() e lo passa
        // all'app, che lo salva in Download/Chronofit. DownloadManager userebbe la rete mobile.
        webView.setDownloadListener { url, _, contentDisposition, mimetype, _ ->
            val name = downloadName(url, contentDisposition, mimetype)
            val js = "(async function(){try{" +
                "var r=await fetch(" + JSONObject.quote(url) + ");" +
                "var b=await r.blob();" +
                "var fr=new FileReader();" +
                "fr.onloadend=function(){Android.saveFile(" + JSONObject.quote(name) + "," +
                JSONObject.quote(mimetype ?: "") + ",String(fr.result).split(',')[1]);};" +
                "fr.readAsDataURL(b);" +
                "}catch(e){Android.saveFailed(String(e));}})();"
            webView.evaluateJavascript(js, null)
        }
    }

    /** Pagina di attesa: l'unità non risponde (WiFi non ancora collegata, unità in avvio); si riprova ogni 3 s. */
    private fun showWaiting() {
        waiting = true
        val html = """
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              body{margin:0;background:#111;color:#eee;font-family:sans-serif;display:flex;min-height:100vh;
                   align-items:center;justify-content:center;text-align:center}
              div{padding:24px} h1{color:#e0405a;font-size:22px} p{color:#bbb;line-height:1.4}
              button{margin-top:16px;padding:12px 20px;border:0;border-radius:8px;background:#800020;color:#fff;font-size:16px}
            </style></head>
            <body><div>
              <h1>In attesa di Chronofit…</h1>
              <p>${TextUtils.htmlEncode(target)}</p>
              <p>Collega il telefono alla rete WiFi del Chronofit.<br>Riprovo da solo ogni 3 secondi.</p>
              <button onclick="Android.changeAddress()">Cambia indirizzo</button>
            </div></body></html>
        """.trimIndent()
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
        handler.removeCallbacks(retry)
        handler.postDelayed(retry, RETRY_MS)
    }

    private fun reloadTarget() {
        waiting = false
        errored = false
        handler.removeCallbacks(retry)
        webView.loadUrl(target)
    }

    private fun openNewWindow(url: String) {
        val uri = Uri.parse(url)
        if (uri.host != Uri.parse(target).host) {
            try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (e: Exception) { /* nessuna app */ }
            return
        }
        val i = Intent(this, MainActivity::class.java)
        i.putExtra(EXTRA_URL, url)
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT or Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
        startActivity(i)
    }

    // ── Rete ─────────────────────────────────────────────────────────────────

    /**
     * Android, davanti a una WiFi "senza Internet" (la rete del Chronofit), tende a instradare il traffico
     * sulla rete mobile: la console non si aprirebbe. Legando il processo alla WiFi tutto passa da lì.
     */
    private fun bindToWifi() {
        try {
            val cm = getSystemService(ConnectivityManager::class.java)
            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .build()
            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    cm.bindProcessToNetwork(network)
                }

                override fun onLost(network: Network) {
                    cm.bindProcessToNetwork(null)
                }
            }
            netCallback = callback
            cm.requestNetwork(request, callback)
        } catch (e: Exception) {
            // senza il legame l'app funziona comunque se Android usa già la WiFi
        }
    }

    // ── Menu e indirizzo ─────────────────────────────────────────────────────

    private fun buildMenuButton(): View {
        val tv = TextView(this)
        tv.text = "⋮"
        tv.setTextColor(Color.WHITE)
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        tv.gravity = Gravity.CENTER
        tv.alpha = 0.35f
        tv.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.parseColor("#800020"))
        }
        tv.setOnClickListener { showMenu(it) }
        return tv
    }

    private fun showMenu(anchor: View) {
        val menu = PopupMenu(this, anchor)
        menu.menu.add(0, 1, 0, "Cambia indirizzo…")
        menu.menu.add(0, 2, 1, "Indirizzi salvati…")
        menu.menu.add(0, 3, 2, "Ricarica")
        menu.menu.add(0, 4, 3, "Nuova finestra")
        menu.menu.add(0, 5, 4, "Schermo intero").apply {
            isCheckable = true
            isChecked = prefs.getBoolean("fullscreen", true)
        }
        menu.menu.add(0, 6, 5, "Schermo sempre acceso").apply {
            isCheckable = true
            isChecked = prefs.getBoolean("keepOn", true)
        }
        menu.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> askAddress()
                2 -> showSaved()
                3 -> reloadTarget()
                4 -> openNewWindow(webView.url?.takeIf { it.startsWith("http") } ?: target)
                5 -> {
                    val on = !item.isChecked
                    prefs.edit().putBoolean("fullscreen", on).apply()
                    applyFullscreen(on)
                }
                6 -> {
                    val on = !item.isChecked
                    prefs.edit().putBoolean("keepOn", on).apply()
                    applyScreenFlags()
                }
            }
            true
        }
        menu.show()
    }

    private fun askAddress() {
        val input = EditText(this)
        input.setText(target)
        input.setSelectAllOnFocus(true)
        input.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        val box = FrameLayout(this)
        box.setPadding(dp(20), dp(8), dp(20), 0)
        box.addView(input)
        AlertDialog.Builder(this)
            .setTitle("Indirizzo del Chronofit")
            .setMessage("Per esempio 192.168.10.1 (Main/GPS) o 192.168.11.1 (fotocellula), oppure l'IP ricevuto dalla WiFi del campo.")
            .setView(box)
            .setPositiveButton("Apri") { _, _ -> setAddress(input.text.toString()) }
            .setNegativeButton("Annulla", null)
            .show()
    }

    private fun showSaved() {
        val list = ArrayList<String>()
        list.add(DEFAULT_URL)
        list.add(PRESET_CELL)
        for (s in savedAddresses()) if (!list.contains(s)) list.add(s)
        AlertDialog.Builder(this)
            .setTitle("Indirizzi salvati")
            .setItems(list.toTypedArray()) { _, which -> setAddress(list[which]) }
            .setNegativeButton("Chiudi", null)
            .show()
    }

    private fun savedAddresses(): List<String> =
        prefs.getString("saved", "")!!.split("\n").filter { it.isNotBlank() }

    private fun rememberAddress(url: String) {
        val list = ArrayList(savedAddresses())
        list.remove(url)
        list.add(0, url)
        prefs.edit().putString("saved", list.take(MAX_SAVED).joinToString("\n")).apply()
    }

    private fun normalizeAddress(raw: String): String? {
        var s = raw.trim()
        if (s.isEmpty()) return null
        if (!s.contains("://")) s = "http://$s"
        val uri = Uri.parse(s)
        if (uri.host.isNullOrEmpty()) return null
        if (uri.path.isNullOrEmpty()) s += "/"
        return s
    }

    private fun setAddress(raw: String) {
        val url = normalizeAddress(raw)
        if (url == null) {
            Toast.makeText(this, "Indirizzo non valido", Toast.LENGTH_SHORT).show()
            return
        }
        target = url
        prefs.edit().putString("url", url).apply()
        rememberAddress(url)
        reloadTarget()
    }

    // ── Schermo ──────────────────────────────────────────────────────────────

    private fun applyScreenFlags() {
        if (prefs.getBoolean("keepOn", true)) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        applyFullscreen(prefs.getBoolean("fullscreen", true))
    }

    @Suppress("DEPRECATION")
    private fun applyFullscreen(on: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(!on)
            val c = window.insetsController ?: return
            if (on) {
                c.hide(WindowInsets.Type.systemBars())
                c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else {
                c.show(WindowInsets.Type.systemBars())
            }
        } else {
            window.decorView.systemUiVisibility = if (on) {
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            } else {
                View.SYSTEM_UI_FLAG_VISIBLE
            }
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    // ── Download ─────────────────────────────────────────────────────────────

    private fun downloadName(url: String, contentDisposition: String?, mimetype: String?): String {
        if (url.startsWith("blob:")) {
            val ext = when {
                mimetype == null -> "bin"
                mimetype.contains("csv") -> "csv"
                mimetype.contains("json") -> "json"
                mimetype.startsWith("text/") -> "txt"
                else -> "bin"
            }
            return "chronofit_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + "." + ext
        }
        return URLUtil.guessFileName(url, contentDisposition, mimetype)
    }

    private fun saveToDownloads(name: String, mime: String, bytes: ByteArray) {
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, if (mime.isEmpty()) "application/octet-stream" else mime)
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Chronofit")
        }
        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("archivio Download non disponibile")
        contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
            ?: throw IllegalStateException("file non scrivibile")
    }

    // ── Ponte con la pagina ──────────────────────────────────────────────────

    /** Vero solo per la console dell'unità (o la pagina di attesa dell'app): la pagina può chiamare l'app. */
    private fun trusted(): Boolean {
        val u = currentUrl
        if (u.startsWith("about:") || u.startsWith("data:")) return true
        return u.startsWith("http") && Uri.parse(u).host == Uri.parse(target).host
    }

    private inner class Bridge {
        @JavascriptInterface
        fun saveFile(name: String, mime: String, base64: String) {
            if (!trusted()) return
            try {
                saveToDownloads(name, mime, Base64.decode(base64, Base64.DEFAULT))
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Salvato in Download/Chronofit: $name", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Salvataggio non riuscito: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun saveFailed(message: String) {
            if (!trusted()) return
            runOnUiThread {
                Toast.makeText(this@MainActivity, "Download non riuscito", Toast.LENGTH_LONG).show()
            }
        }

        @JavascriptInterface
        fun changeAddress() {
            if (!trusted()) return
            runOnUiThread { askAddress() }
        }
    }
}
