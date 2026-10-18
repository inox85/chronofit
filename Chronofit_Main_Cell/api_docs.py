"""
api_docs.py — genera le pagine HTML del manuale API servite dal dispositivo.

  API_public.md → data/api.html      manuale per l'utente, aperto dalla console (Info → Manuale API)
  API.md        → data/api_dev.html  manuale completo per gli sviluppatori, non collegato dalla UI

Uso (dalla cartella del progetto):
  python api_docs.py

Poi rigenera i .gz con compress_assets.py. Il file è identico in tutti i progetti
Chronofit con UI: se lo modifichi, copialo negli altri.
Converte solo il sottoinsieme di Markdown usato dagli API*.md (titoli, tabelle,
elenchi, blocchi di codice, `codice`, **grassetto**, *corsivo*, [link](url)).
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGES = [
    ('API_public.md', 'api.html', False),
    ('API.md', 'api_dev.html', True),
]


def slug(text, used):
    s = re.sub(r'[^\w\s/-]', '', text.lower(), flags=re.U)
    s = re.sub(r'[\s/]+', '-', s).strip('-') or 'sez'
    base, n = s, 2
    while s in used:
        s = '%s-%d' % (base, n)
        n += 1
    used.add(s)
    return s


def inline(text):
    parts = re.split(r'(`[^`]*`)', text)
    out = []
    for p in parts:
        if len(p) >= 2 and p.startswith('`') and p.endswith('`'):
            out.append('<code>%s</code>' % html.escape(p[1:-1]))
            continue
        p = html.escape(p, quote=False)
        p = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', p)
        p = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', p)
        p = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', r'<a href="\2">\1</a>', p)
        out.append(p)
    return ''.join(out)


def table_row(line):
    line = line.strip()
    if line.startswith('|'):
        line = line[1:]
    if line.endswith('|'):
        line = line[:-1]
    # le barre dentro `codice` non separano le colonne
    cells, buf, code = [], '', False
    for ch in line:
        if ch == '`':
            code = not code
        if ch == '|' and not code:
            cells.append(buf.strip())
            buf = ''
        else:
            buf += ch
    cells.append(buf.strip())
    return cells


def convert(md):
    """Restituisce (titolo, intro_html, sezioni[(id, titolo, html, sottosezioni[(id, titolo)])])."""
    lines = md.replace('\r\n', '\n').split('\n')
    title = 'API'
    used = set()
    intro, sections = [], []
    cur = None          # sezione corrente
    out = intro
    i = 0

    def emit(s):
        out.append(s)

    para = []

    def flush_para():
        if para:
            emit('<p>%s</p>' % '<br>'.join(inline(x.rstrip()) for x in para))
            para.clear()

    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s.startswith('```'):
            flush_para()
            code = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code.append(lines[i])
                i += 1
            emit('<pre><code>%s</code></pre>' % html.escape('\n'.join(code)))
            i += 1
            continue
        m = re.match(r'^(#{1,4})\s+(.*)$', s)
        if m:
            flush_para()
            level, text = len(m.group(1)), m.group(2).strip()
            if level == 1:
                title = re.sub(r'`', '', text)
            elif level == 2:
                cur = {'id': slug(text, used), 'title': text, 'body': [], 'subs': []}
                sections.append(cur)
                out = cur['body']
            else:
                hid = slug(re.sub(r'[🔒`]', '', text), used)
                lock = '🔒' in text
                plain = re.sub(r'\s*🔒\s*', ' ', text).strip()
                if cur is not None and level == 3:
                    cur['subs'].append((hid, re.sub(r'`', '', plain), lock))
                tag = 'h%d' % level
                emit('<%s id="%s"%s>%s%s</%s>' % (tag, hid, ' class="route"' if level == 3 else '',
                                                 inline(plain), ' <span class="lock" title="Richiede il token">🔒</span>' if lock else '', tag))
            i += 1
            continue
        if re.match(r'^-{3,}$', s):
            flush_para()
            i += 1
            continue
        if s.startswith('|') and i + 1 < len(lines) and re.match(r'^\|?\s*:?-{2,}', lines[i + 1].strip()):
            flush_para()
            head = table_row(s)
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append(table_row(lines[i]))
                i += 1
            t = ['<div class="tw"><table><thead><tr>']
            t += ['<th>%s</th>' % inline(c) for c in head]
            t.append('</tr></thead><tbody>')
            for r in rows:
                t.append('<tr>' + ''.join('<td>%s</td>' % inline(c) for c in r) + '</tr>')
            t.append('</tbody></table></div>')
            emit(''.join(t))
            continue
        if re.match(r'^\s*([-*]|\d+\.)\s+', line):
            flush_para()
            ordered = bool(re.match(r'^\s*\d+\.', line))
            items = []
            while i < len(lines) and (re.match(r'^\s*([-*]|\d+\.)\s+', lines[i]) or
                                      (lines[i].startswith('  ') and lines[i].strip() and items)):
                if re.match(r'^\s*([-*]|\d+\.)\s+', lines[i]):
                    items.append(re.sub(r'^\s*([-*]|\d+\.)\s+', '', lines[i]))
                else:
                    items[-1] += ' ' + lines[i].strip()
                i += 1
            tag = 'ol' if ordered else 'ul'
            emit('<%s>%s</%s>' % (tag, ''.join('<li>%s</li>' % inline(x) for x in items), tag))
            continue
        if not s:
            flush_para()
            i += 1
            continue
        para.append(line)
        i += 1
    flush_para()
    return title, '\n'.join(intro), sections


CSS = """
  :root { --primary:#8b0a1a; --text:#222; --muted:#666; --line:#e3e3e3; --bg:#f6f6f4; --card:#fff; --code:#f1f1f1; --pre:#1e1e1e; --pre-fg:#e8e8e8; }
  @media (prefers-color-scheme: dark) {
    :root { --primary:#ff8a95; --text:#e6e6e6; --muted:#a0a0a0; --line:#333; --bg:#151515; --card:#1f1f1f; --code:#2b2b2b; --pre:#0d0d0d; }
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin:0; font-family:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif; color:var(--text); background:var(--bg); line-height:1.55; font-size:16px; }
  header { background:#111; color:#fff; padding:16px 20px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  header img { height:36px; }
  header h1 { font-size:20px; margin:0; font-weight:600; }
  header .sub { color:#bbb; font-size:14px; }
  header .tag { background:var(--primary); color:#fff; border-radius:6px; padding:2px 8px; font-size:12px; font-weight:bold; }
  .print-btn { margin-left:auto; background:#8b0a1a; color:#fff; border:0; border-radius:8px; padding:8px 14px; font-size:14px; cursor:pointer; }
  .layout { display:grid; grid-template-columns:270px 1fr; max-width:1200px; margin:0 auto; gap:24px; padding:24px 16px; }
  nav.toc { position:sticky; top:16px; align-self:start; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; max-height:calc(100vh - 32px); overflow:auto; }
  nav.toc input { width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:8px; font-size:14px; margin-bottom:10px; background:var(--bg); color:var(--text); }
  nav.toc ol { margin:0; padding-left:18px; }
  nav.toc > ol > li { margin:6px 0; font-size:14px; font-weight:600; }
  nav.toc ul { margin:2px 0 4px; padding-left:12px; list-style:none; font-weight:normal; }
  nav.toc ul li { margin:1px 0; font-size:13px; }
  nav.toc a { color:var(--text); text-decoration:none; }
  nav.toc a:hover { color:var(--primary); }
  nav.toc code { background:none; padding:0; font-size:12.5px; }
  main { min-width:0; }
  section { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 22px; margin-bottom:18px; }
  section.intro { border-left:4px solid var(--primary); }
  section h2 { margin:0 0 12px; font-size:21px; color:var(--primary); border-bottom:2px solid var(--line); padding-bottom:6px; }
  h3.route { font-size:17px; margin:22px 0 6px; padding-top:12px; border-top:1px dashed var(--line); }
  section h2 + h3.route, section h2 + p + h3.route { border-top:0; padding-top:0; }
  h3.route code { font-size:16px; background:none; padding:0; color:var(--text); font-weight:700; }
  .lock { font-size:14px; }
  h4 { font-size:15px; margin:14px 0 4px; }
  p { margin:8px 0; }
  ul, ol { margin:6px 0 10px; padding-left:22px; }
  li { margin:3px 0; }
  code { background:var(--code); border-radius:4px; padding:1px 5px; font-family:Consolas,monospace; font-size:14px; }
  pre { background:var(--pre); color:var(--pre-fg); border-radius:8px; padding:12px 14px; overflow:auto; font-size:13.5px; line-height:1.45; }
  pre code { background:none; padding:0; color:inherit; font-size:inherit; }
  .tw { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; margin:8px 0 12px; font-size:14.5px; }
  th, td { text-align:left; padding:6px 9px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-size:12.5px; text-transform:uppercase; letter-spacing:.03em; }
  a { color:var(--primary); }
  .hidden { display:none !important; }
  footer { text-align:center; color:var(--muted); font-size:13px; padding:10px 0 30px; }
  @media (max-width: 860px) {
    .layout { grid-template-columns:1fr; padding:16px; }
    nav.toc { position:static; max-height:none; }
    section { padding:14px 16px; }
  }
  @media print {
    header { background:#fff; color:#000; border-bottom:2px solid #000; }
    .print-btn, nav.toc { display:none; }
    .layout { display:block; padding:0; }
    section { break-inside:auto; border:0; padding:0; }
    pre { background:#f4f4f4; color:#000; }
    body { background:#fff; color:#000; }
  }
"""

SEARCH_JS = """
document.getElementById('api-search').addEventListener('input', function () {
  var q = this.value.trim().toLowerCase();
  document.querySelectorAll('nav.toc ul li').forEach(function (li) {
    li.classList.toggle('hidden', !!q && li.textContent.toLowerCase().indexOf(q) < 0);
  });
  document.querySelectorAll('nav.toc > ol > li').forEach(function (li) {
    var subs = li.querySelectorAll('ul li'), any = false;
    subs.forEach(function (s) { if (!s.classList.contains('hidden')) any = true; });
    li.classList.toggle('hidden', !!q && !any && li.firstElementChild.textContent.toLowerCase().indexOf(q) < 0);
  });
});
"""


def render(md_path, dev):
    title, intro, sections = convert(md_path.read_text(encoding='utf-8'))
    tag = 'Sviluppatori' if dev else 'Utente'
    sub = ('Riferimento completo, comprese le route interne e di assistenza. Pagina non collegata dalla console.'
           if dev else 'Comandi HTTP e WebSocket per integrare il dispositivo con altri programmi.')
    toc = ['<nav class="toc"><input id="api-search" type="search" placeholder="Cerca una route…" aria-label="Cerca una route"><ol>']
    for s in sections:
        toc.append('<li><a href="#%s">%s</a>' % (s['id'], inline(s['title'])))
        if s['subs']:
            toc.append('<ul>' + ''.join('<li><a href="#%s"><code>%s</code>%s</a></li>' % (
                hid, html.escape(t), ' 🔒' if lock else '') for hid, t, lock in s['subs']) + '</ul>')
        toc.append('</li>')
    toc.append('</ol></nav>')
    body = []
    if intro.strip():
        body.append('<section class="intro">%s</section>' % intro)
    for s in sections:
        body.append('<section id="%s"><h2>%s</h2>\n%s</section>' % (s['id'], inline(s['title']), '\n'.join(s['body'])))
    robots = '<meta name="robots" content="noindex, nofollow">\n' if dev else ''
    return """<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{robots}<title>{title}</title>
<link rel="icon" type="image/png" href="/favicon.png">
<!-- Generata da api_docs.py a partire da {src}: non modificare a mano -->
<style>{css}</style>
</head>
<body>
<header>
  <img src="/logo.webp" alt="Chronofit" onerror="this.style.display='none'">
  <div><h1>{title}</h1><div class="sub">{sub}</div></div>
  <span class="tag">{tag}</span>
  <button class="print-btn" onclick="window.print()">🖨 Stampa</button>
</header>
<div class="layout">
{toc}
<main>
{body}
<footer>Le route marcate con 🔒 richiedono l'header <code>X-Token</code> se sul dispositivo è configurato un token.</footer>
</main>
</div>
<script>{js}</script>
</body>
</html>
""".format(robots=robots, title=html.escape(title), src=md_path.name, css=CSS, sub=sub, tag=tag,
           toc='\n'.join(toc), body='\n'.join(body), js=SEARCH_JS)


def main():
    ok = True
    for src, dst, dev in PAGES:
        p = ROOT / src
        if not p.exists():
            print('[SKIP] manca %s' % src)
            ok = False
            continue
        out = ROOT / 'data' / dst
        out.write_text(render(p, dev), encoding='utf-8', newline='\n')
        print('[OK] %s → data/%s (%d byte)' % (src, dst, out.stat().st_size))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
