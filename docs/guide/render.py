"""HTML -> PDF page builder for co-worker SOP guides (US Letter landscape, SealTech house style)."""
import base64, json, os
import subprocess

COMPANY = 'SealTech Insulation'          # cover kicker + footer
BRAND = '#0f3d2e'                         # brand green: cover, header rule + number tile, page titles
ROLE = {                                  # generic roles only, never personal names
    'LS': ('LEAD SPECIALIST', '#6d28d9'),
    'TECH': ('HVAC TECH', '#c2410c'),
    'CREW': ('INSTALL CREW', '#c2410c'),
    'PC': ('PROJECT COORDINATOR', '#0f766e'),
    'AR': ('ACCOUNTS RECEIVABLE', '#be185d'),
    'EST': ('ESTIMATOR', '#0369a1'),
    'OWNER': ('OWNER', '#1f2937'),
    'OFFICE': ('OFFICE', '#0f766e'),
    'LEAD': ('CREW LEAD', '#c2410c'),
    'REV1': ('1ST-PASS REVIEWER', '#0369a1'),
    'ALL': ('EVERYONE', '#4b5563'),
}
MODE = {'AUTO': ('AUTO', '#15803d'), 'HAND': ('BY HAND', '#1f5ce6')}

CSS = """
@page { size: 11in 8.5in; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: Inter, 'DejaVu Sans', Arial, sans-serif; color: #14181f; }
.pg { width: 11in; height: 8.5in; padding: .36in .45in .4in; display: flex; flex-direction: column; gap: .15in;
      position: relative; overflow: hidden; page-break-after: always; }
.pg:last-child { page-break-after: auto }
.hd { display: flex; align-items: center; gap: .17in; border-bottom: 3px solid BRAND; padding-bottom: .1in; flex: 0 0 auto }
.hd .num { flex: 0 0 .64in; height: .64in; border-radius: 12px; background: BRAND; color: #fff; font-size: 30pt;
           font-weight: 800; display: flex; align-items: center; justify-content: center }
.hd .name { font-size: 21pt; font-weight: 800; text-transform: uppercase; line-height: 1.05 }
.hd .sub { font-size: 12pt; color: #4b5563; margin-top: 4px }
.hd .sub b { color: #14181f }
.hd .right { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px }
.hd .cont { font-size: 10pt; color: #6b7280; font-weight: 700; letter-spacing: .06em }
.chip { display: inline-block; font-weight: 800; font-size: 10.5pt; padding: 5px 12px; border-radius: 999px; color: #fff;
        letter-spacing: .04em; white-space: nowrap }
.chip.sm { font-size: 8.5pt; padding: 3px 9px }
.bpill { display:inline-block; font-weight:800; font-size:9.5pt; padding:4px 11px; border-radius:999px; background:#e8eef5;
         color: BRAND; border:1px solid #c8d3df; white-space:nowrap }
.hand { font-size:8.5pt; font-weight:800; color:#6b7280; letter-spacing:.07em; margin-right:6px }
.row { display: flex; gap: .24in; align-items: flex-start; flex: 0 0 auto }
.row.center { align-items: center }
.col { display: flex; flex-direction: column; gap: .13in; min-width: 0 }
.img { display: block; border-radius: 6px; border: 1px solid #cfd5dd; max-width: 100% }
.cap { font-size: 9.5pt; color: #6b7280; margin-top: 3px }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px }
.steps li { display: flex; gap: 10px; align-items: flex-start; font-size: 14pt; line-height: 1.22 }
.steps .n { flex: 0 0 27px; height: 27px; border-radius: 50%; background: #e5322d; color: #fff; font-weight: 800;
            font-size: 12.5pt; display: flex; align-items: center; justify-content: center }
.who { font-size: 9pt; font-weight: 800; letter-spacing: .07em; color: #6b7280; margin-bottom: -2px }
.must { background: #e5322d; color: #fff; border-radius: 10px; padding: 12px 16px }
.must .big { font-size: 22pt; font-weight: 900; line-height: 1.06 }
.must .why { font-size: 12pt; margin-top: 6px; font-weight: 600 }
.must .kick2 { font-size: 11pt; font-weight: 800; letter-spacing: .08em; opacity: .92; margin-bottom: 2px }
.move { display: flex; gap: .2in; align-items: center; background: #f2f6ff; border: 1px solid #d6e2ff; border-radius: 10px; padding: .1in .14in }
.move .lbl { font-size: 9.5pt; font-weight: 800; color: #1f5ce6; letter-spacing: .08em }
.move .what { font-size: 15pt; font-weight: 800; line-height: 1.2; margin-top: 3px }
.move .what .arrow { color: #1f5ce6 }
.move .small { font-size: 11.5pt; color: #374151; margin-top: 6px; line-height: 1.3 }
.note { font-size: 12.5pt; background: #fff7e6; border-left: 5px solid #d98b00; padding: 8px 12px; border-radius: 6px; line-height: 1.3 }
.tasks { border: 2px solid #e5e7eb; border-radius: 10px; padding: 10px 14px }
.tasks ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 7px }
.tasks li { display: flex; gap: 10px; align-items: flex-start; font-size: 14pt; line-height: 1.22 }
.tasks .box { flex: 0 0 18px; height: 18px; border: 2.5px solid #374151; border-radius: 4px; margin-top: 3px }
.handoff { border:3px solid #15803d; background:#f0fdf4; border-radius:10px; padding:9px 13px }
.handoff .lbl, .auto .lbl { font-size:9.5pt; font-weight:800; letter-spacing:.08em; color:#15803d }
.handoff .txt { font-size:13pt; line-height:1.25; margin-top:4px }
.auto { border:2px solid #15803d; border-radius:10px; padding:8px 12px; background:#f6fdf8 }
.auto ul { margin:5px 0 0; padding-left:18px; font-size:12.5pt; line-height:1.3 }
.sec { border-top: 2px dashed #d1d5db; padding-top: .12in }
.foot { position: absolute; bottom: .16in; left: .45in; right: .45in; font-size: 8pt; color: #9aa1ab;
        display: flex; justify-content: space-between }
.cover { background: BRAND; color: #fff; padding: .6in .6in .5in }
.cover .kick { font-size: 10pt; letter-spacing: .14em; font-weight: 700; color: #9fd3b8 }
.cover h1 { font-size: 38pt; margin: 6px 0 4px; line-height: 1.05; font-weight: 800 }
.cover .subt { font-size: 15pt; color: #cfe3d8; margin-bottom: .22in }
.grid { display: grid; gap: .12in }
.tile { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.22); border-radius: 10px; padding: 10px 12px;
        display: flex; flex-direction: column; gap: 7px }
.tile .tn { font-size: 20pt; font-weight: 800; line-height: 1 }
.tile .tname { font-size: 12.5pt; font-weight: 700; line-height: 1.15; min-height: 2.3em }
.tile .from { font-size: 9.5pt; color: #cfe3d8; line-height: 1.25 }
.tile .to { font-size: 9pt; color: #9fd3b8; font-weight: 700; letter-spacing: .04em }
.tile .chips { display: flex; gap: 6px; flex-wrap: wrap }
.legend { display: flex; gap: .3in; align-items: center; flex-wrap: wrap; margin-top: .2in; font-size: 11pt; color: #e6f2ec }
.legend .chip { margin-right: 6px }
.board { margin-top: .16in; font-size: 11.5pt; color: #cfe3d8 }
.board b { color: #fff }
.ptitle { font-size: 24pt; font-weight: 800; color: BRAND; margin: 0 }
.q { font-size: 10pt; font-weight: 800; color: BRAND; letter-spacing: .06em; margin-top: 2px }
.rules { display: flex; flex-direction: column; gap: .12in; margin-top: .05in }
.rule { display: grid; grid-template-columns: 2.05in 1fr 2.45in; gap: .2in; align-items: center; border-left: 8px solid #e5322d;
        background: #fff5f5; border-radius: 8px; padding: .12in .18in }
.rule .big { font-size: 19pt; font-weight: 900; line-height: 1.08; color: #b91c1c }
.rule .why { font-size: 12.5pt; color: #374151; margin-top: 4px; line-height: 1.3 }
.checks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px }
.checks li { display: flex; gap: 12px; font-size: 15pt; line-height: 1.25; align-items: flex-start }
.checks .n { flex: 0 0 30px; height: 30px; border-radius: 8px; background: BRAND; color: #fff; font-weight: 800;
             display: flex; align-items: center; justify-content: center; font-size: 13pt }
table.map { border-collapse:separate; border-spacing:0 7px; width:100% }
table.map td { padding:9px 12px; background:#f6f8fa; font-size:13pt; vertical-align:middle }
table.map td:first-child { border-radius:10px 0 0 10px }
table.map td:last-child { border-radius:0 10px 10px 0 }
table.map th { text-align:left; font-size:9.5pt; color:#6b7280; letter-spacing:.07em; padding:0 12px }
.pnum { display:inline-flex; width:.46in; height:.46in; border-radius:10px; background: BRAND; color:#fff; font-weight:800;
        font-size:18pt; align-items:center; justify-content:center }
table.tl { border-collapse:collapse; width:100%; table-layout:fixed }
table.tl th { font-size:11pt; padding:6px; background: BRAND; color:#fff; border:2px solid #fff }
table.tl td { font-size:11.5pt; padding:7px 8px; border:2px solid #fff; background:#f3f4f6; vertical-align:top; line-height:1.25 }
table.tl td.who { font-weight:800; font-size:10.5pt; background:#fff; color:#374151 }
table.tl td.you { background:#ede9fe } table.tl td.sys { background:#dcfce7 } table.tl td.prog { background:#ffedd5 }
table.tl td.flag { background:#fee2e2; font-weight:700 }
table.pings { border-collapse:collapse; width:100% }
table.pings td, table.pings th { border-bottom:1px solid #e5e7eb; padding:6px 8px; font-size:11.5pt; text-align:left; vertical-align:top }
table.pings th { font-size:9.5pt; color:#6b7280; letter-spacing:.07em }
"""


def chip(code, small=False):
    t, c = ROLE[code] if code in ROLE else MODE[code]
    return f'<span class="chip{" sm" if small else ""}" style="background:{c}">{t}</span>'


class Guide:
    RW = 3.6   # steps column width (in): identical on every page so the red step numbers line up page to page

    def __init__(self, asset_dir, footer):
        self.asset_dir, self.footer = asset_dir, footer
        p = os.path.join(asset_dir, 'sizes.json')
        self.sizes = json.load(open(p)) if os.path.exists(p) else {}
        self.pages, self.missing, self.extra_css = [], [], ''

    # ---------- cells ----------
    def src(self, key):
        return 'data:image/jpeg;base64,' + base64.b64encode(open(os.path.join(self.asset_dir, key + '.jpg'), 'rb').read()).decode()

    def img(self, key, w, cap=None):
        """Annotated screenshot `key` at width w inches (height from sizes.json). Missing -> dashed placeholder."""
        if key not in self.sizes:
            self.missing.append(key)
            return (f'<div class="img" style="width:{w:.2f}in;height:{w * .55:.2f}in;border:2px dashed #9ca3af;display:flex;'
                    f'align-items:center;justify-content:center;color:#6b7280;font-size:11pt">screenshot: {key}</div>')
        W, H = self.sizes[key]
        c = f'<div class="cap">{cap}</div>' if cap else ''
        return f'<div><img class="img" style="width:{w:.2f}in;height:{w * H / W:.2f}in" src="{self.src(key)}">{c}</div>'

    def _pic(self, key, w):
        if key not in self.sizes:
            self.missing.append(key)
            return f'<div style="width:{w:.2f}in;height:{w * .62:.2f}in;border:2px dashed #9ca3af;border-radius:6px">{key}</div>'
        W, H = self.sizes[key]
        return f'<img style="width:{w:.2f}in;height:{w * H / W:.2f}in;border-radius:6px" src="{self.src(key)}">'

    @staticmethod
    def steps(items, who=None):
        """items: [(n, html)]; n must equal the badge number on the screenshot. who: small grey path label."""
        w = f'<div class="who">{who}</div>' if who else ''
        return w + '<ol class="steps">' + ''.join(f'<li><span class="n">{n}</span><span>{t}</span></li>' for n, t in items) + '</ol>'

    @staticmethod
    def must(big, why, kicker=None, size=None):
        """Red MUST box: kicker (LEAD SOURCE MUST BE) / big word (CE HVAC, 22-34pt) / one-line consequence."""
        k = f'<div class="kick2">{kicker}</div>' if kicker else ''
        st = f' style="font-size:{size}pt"' if size else ''
        return f'<div class="must">{k}<div class="big"{st}>{big}</div><div class="why">{why}</div></div>'

    def move(self, key, w, frm, to, small='', label='CARD MOVE'):
        return (f'<div class="move">{self._pic(key, w)}<div><div class="lbl">{label}</div>'
                f'<div class="what">{frm} <span class="arrow">→</span> {to}</div><div class="small">{small}</div></div></div>')

    def move_v(self, key, w, frm, to, small='', label='CARD MOVE'):
        return (f'<div class="move" style="flex-direction:column;align-items:flex-start"><div><div class="lbl">{label}</div>'
                f'<div class="what">{frm} <span class="arrow">→</span> {to}</div></div>{self._pic(key, w)}'
                f'<div class="small" style="margin-top:0">{small}</div></div>')

    @staticmethod
    def tasks(role, items, title=None):
        t = f'<div class="who">{title}</div>' if title else chip(role)
        return f'<div class="tasks">{t}<ul>' + ''.join(f'<li><span class="box"></span><span>{i}</span></li>' for i in items) + '</ul></div>'

    @staticmethod
    def note(html):
        return f'<div class="note">{html}</div>'

    @staticmethod
    def handoff(role, text):
        return (f'<div class="handoff"><div class="lbl">HANDOFF — YOUR PART ENDS HERE</div>'
                f'<div class="txt">{chip(role, True)} {text}</div></div>')

    @staticmethod
    def auto(items, title='HAPPENS BY ITSELF'):
        return f'<div class="auto"><div class="lbl">{title}</div><ul>' + ''.join(f'<li>{t}</li>' for t in items) + '</ul></div>'

    @staticmethod
    def col(*cells, w=None, flex=None):
        st = ([f'flex:0 0 {w}in;width:{w}in'] if w else []) + ([f'flex:{flex}'] if flex else [])
        return f'<div class="col" style="{";".join(st)}">{"".join(cells)}</div>'

    @staticmethod
    def row(*cols, center=False):
        return f'<div class="row{" center" if center else ""}">{"".join(cols)}</div>'

    # ---------- headers ----------
    @staticmethod
    def header(num, name, sub, roles, mode, cont=False):
        """Pipeline-stage header: number tile, NAME, what moves the card; right: mode chip + role chips."""
        c = '<div class="cont">CONTINUED</div>' if cont else ''
        return (f'<div class="hd"><div class="num">{num}</div><div><div class="name">{name}</div><div class="sub">{sub}</div></div>'
                f'<div class="right">{c}<div>{chip(mode)}</div><div>{" ".join(chip(r) for r in roles)}</div></div></div>')

    @staticmethod
    def phead(num, name, sub, board, to, cont=False):
        """Pathway header (workbook): right side = board pill + HANDS OFF TO role chip."""
        c = '<div class="cont">CONTINUED</div>' if cont else ''
        return (f'<div class="hd"><div class="num">{num}</div><div><div class="name">{name}</div><div class="sub">{sub}</div></div>'
                f'<div class="right">{c}<div><span class="bpill">{board}</span></div>'
                f'<div><span class="hand">HANDS OFF TO</span>{chip(to)}</div></div></div>')

    # ---------- pages ----------
    def page(self, body, cls=''):
        self.pages.append((cls, body))

    def two_col(self, head, left, right, below=()):
        """Screenshots + card move on the left (flexible); ONE fixed-width steps column on the right."""
        self.page(head + f'<div class="row"><div class="col" style="flex:1">{"".join(left)}</div>'
                         f'<div class="col" style="flex:0 0 {self.RW}in;width:{self.RW}in">{"".join(right)}</div></div>'
                  + ''.join(below))

    def stage2(self, num, name, sub, roles, mode, left, right, cont=False, below=()):
        self.two_col(self.header(num, name, sub, roles, mode, cont), left, right, below)

    def path2(self, num, name, sub, board, to, left, right, cont=False, below=()):
        self.two_col(self.phead(num, name, sub, board, to, cont), left, right, below)

    def cover_stages(self, title, subtitle, stages, board, cols=3, kicker=None):
        """stages: [(n, name, role, 'AUTO'|'HAND')]."""
        tiles = ''.join(f'<div class="tile"><div class="tn">{n}</div><div class="tname">{nm}</div>'
                        f'<div class="chips">{chip(r, True)}{chip(m, True)}</div></div>' for n, nm, r, m in stages)
        self.page(f'<div class="kick">{kicker or COMPANY.upper() + " · STANDARD OPERATING PROCEDURE"}</div><h1>{title}</h1>'
                  f'<div class="subt">{subtitle}</div><div class="grid" style="grid-template-columns:repeat({cols},1fr)">{tiles}</div>'
                  f'<div class="legend"><span>{chip("AUTO", True)} moves by itself 1–2 min after the step</span>'
                  f'<span>{chip("HAND", True)} drag the card on the board</span></div>'
                  f'<div class="board">Board: <b>{board}</b>  ·  The role on each stage moves the card into it.</div>', 'cover')

    def cover_paths(self, title, subtitle, paths, tools_line, cols=4, kicker=None):
        """paths: [(n, name, where it comes from, board, handoff role)]."""
        tiles = ''.join(f'<div class="tile"><div class="tn">{n}</div><div class="tname" style="min-height:0;font-weight:800">{nm}</div>'
                        f'<div class="from">{fr}</div><div class="to">{b.upper()}</div><div>{chip(to, True)}</div></div>'
                        for n, nm, fr, b, to in paths)
        self.page(f'<div class="kick">{kicker or COMPANY.upper()}</div><h1>{title}</h1><div class="subt">{subtitle}</div>'
                  f'<div class="grid" style="grid-template-columns:repeat({cols},1fr)">{tiles}</div>'
                  f'<div class="legend"><span>Each pathway ends with a handoff: the role on the tile takes it from there.</span></div>'
                  f'<div class="board">{tools_line}</div>', 'cover')

    def rules_page(self, title, rules):
        """rules: [(role, 'RULE IN CAPS', 'one-line consequence', thumbnail key, thumbnail width in)]."""
        rr = ''.join(f'<div class="rule"><div>{chip(r)}</div><div><div class="big">{big}</div><div class="why">{why}</div></div>'
                     f'<div>{self.img(k, w)}</div></div>' for r, big, why, k, w in rules)
        self.page(f'<div class="ptitle">{title}</div><div class="rules">{rr}</div>')

    def chooser_page(self, title, lead, rows, note_html=None):
        """rows (ascending): [(situation html, pathway n, board, handoff role)]."""
        mr = ''.join(f'<tr><td>{s}</td><td style="width:.8in;text-align:center"><span class="pnum">{n}</span></td>'
                     f'<td style="width:2.4in"><span class="bpill">{b}</span></td><td style="width:2.3in">{chip(to)}</td></tr>'
                     for s, n, b, to in rows)
        self.page(f'<div class="ptitle">{title}</div><div class="q">{lead}</div><table class="map"><tr><th>WHERE IT CAME FROM</th>'
                  f'<th>PATHWAY</th><th>BOARD</th><th>HANDS OFF TO</th></tr>{mr}</table>' + (self.note(note_html) if note_html else ''))

    def checks_page(self, title, checks, side_html=''):
        """Troubleshooting: numbered checks, most common first; last = 'Still stuck: drag the card by hand and report it.'"""
        ch = ''.join(f'<li><span class="n">{i + 1}</span><div style="flex:1">{c}</div></li>' for i, c in enumerate(checks))
        self.page(f'<div class="ptitle">{title}</div><div class="row"><div class="col" style="flex:1.3"><ol class="checks">{ch}</ol></div>'
                  f'<div class="col" style="flex:1">{side_html}</div></div>')

    # ---------- output ----------
    def html(self):
        n, out = len(self.pages), []
        for i, (cls, body) in enumerate(self.pages):
            foot = '' if 'cover' in cls else f'<div class="foot"><span>{self.footer}</span><span>Page {i + 1} of {n}</span></div>'
            out.append(f'<div class="pg {cls}">{body}{foot}</div>')
        css = (CSS + self.extra_css).replace('BRAND', BRAND)
        return f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>{"".join(out)}</body></html>'

    def render(self, pdf_path, html_path):
        """Writes the HTML, renders the PDF with Node Playwright (pdf.cjs). Returns overflowing pages -> must be []."""
        open(html_path, 'w').write(self.html())
        r = subprocess.run(['node', 'pdf.cjs', html_path, pdf_path], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr)
        over = json.loads(r.stdout)
        return [(i, bt, ht) for i, bt, ht in over if bt > ht - 34]
