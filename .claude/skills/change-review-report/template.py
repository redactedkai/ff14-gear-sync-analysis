# Skeleton for a per-change UI review report. Copy next to the report, edit the mock and CHANGES, run:
#   python build.py        (writes index.html beside it)
# Rules are in SKILL.md. Replace the toy "card" UI in mock() with a reproduction of the real UI.

import pathlib

TITLE = 'Report title'
TARGETS = 'prototype A and prototype B'  # where an approved change gets applied
INTRO = (
    'Based on your screenshots of the &lt;area&gt;. Numbers come from the screenshots. '
    'Red dashed outlines mark what changes. These are mocks, not the live page. Dark theme only.'
)

# Applied state of the UI so far. Later changes start from this (CURRENT), not from the original.
CURRENT = {'label': 'Total', 'subtitle': True, 'rows': True}
ORIGINAL = {**CURRENT, 'label': 'Totals'}


def variant(base, **kw):
    o = dict(base)
    o.update(kw)
    return o


def hl(marks, key):
    # Red dashed outline (outline, not border: layout must not shift) on every part named in marks.
    return ' hl' if key in marks else ''


def mock(o, marks=()):
    # Small HTML/CSS reproduction of the real UI with the real numbers. One class hook per markable part.
    sub = f'<div class="dim{hl(marks, "subtitle")}">gear + food</div>' if o['subtitle'] else ''
    rows = f'<tr class="{hl(marks, "rows").strip()}"><td>Crit</td><td class="n">3314</td></tr>' if o['rows'] else ''
    return (
        f'<div class="box"><div class="b{hl(marks, "label")}">{o["label"]}</div>{sub}'
        f'<table>{rows}<tr><td>Det</td><td class="n">2806</td></tr></table></div>'
    )


# status per change number. Absent = pending. Values: 'applied', 'replaced:<n>', 'dropped'.
STATUS = {}

# One entry per change. b/a = before/after option dicts, bm/am = mark sets, cap_* = one caption each.
CHANGES = [
    {
        'n': '1',
        'title': 'Rename the label',
        'size': 'small',
        'space': 'none',
        'see': 'The card says "Totals" while the table holds one total.',
        'why': 'The plural makes the reader look for a second total.',
        'fix': 'Say "Total".',
        'b': ORIGINAL,
        'bm': {'label'},
        'a': CURRENT,
        'am': {'label'},
        'cap_b': 'Red: the label.',
        'cap_a': 'Red: the same label, reworded.',
    },
]

CSS = """
:root{--bg:#0d1517;--surface:#142023;--fg:#e5eeed;--muted:#92a5a5;--line:#2b3d40;--mark:#ff5a52}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:24px;max-width:1380px}
h1{font-size:1.3rem}h2{font-size:1.1rem;margin:0 0 6px}p{color:var(--muted);max-width:1000px}
table{border-collapse:collapse}.f{width:100%}.f td,.f th{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
.tag{display:inline-block;padding:0 8px;border-radius:999px;background:#17383a;color:#4cc2b6;font-size:.78rem}
.tag.done{background:#1b3a2a;color:#7fd6a0}.tag.wait{background:#3a3217;color:#e8c766}
.sec{border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:18px 0;background:#101a1d}
details.applied{opacity:.55}details.applied[open]{opacity:.8}details.applied summary{cursor:pointer;list-style:none}
details.applied summary h2{display:inline-block}
tr.applied td{opacity:.55;text-decoration:line-through}tr.applied td:last-child{text-decoration:none}
.why{display:grid;grid-template-columns:auto 1fr;gap:2px 14px;max-width:1100px}.why b{color:var(--muted);font-weight:500}
.lbl{font-weight:600;font-size:.82rem;text-transform:uppercase;color:var(--muted);margin:10px 0 4px}
.cap{font-size:.8rem;color:#ff9a94;margin:0 0 10px}
.box{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:6px 10px}.box td{padding:4px 10px}
.n{text-align:right;font-family:monospace}.dim{color:var(--muted)}
.hl{outline:2px dashed var(--mark);outline-offset:-2px}
"""


def status_of(n):
    s = STATUS.get(n, 'pending')
    return s.split(':')[0], s.split(':')[1] if ':' in s else ''


def tag(n):
    kind, by = status_of(n)
    if kind == 'applied':
        return f'<span class="tag done">Applied to {TARGETS}</span>'
    if kind == 'replaced':
        return f'<span class="tag done">Replaced by change {by}</span>'
    if kind == 'dropped':
        return '<span class="tag done">Dropped</span>'
    return '<span class="tag wait">Pending your review</span>'


def section(c):
    body = (
        f'<div class="why"><b>What the screenshots show</b><span>{c["see"]}</span>'
        f'<b>Why it costs attention</b><span>{c["why"]}</span>'
        f'<b>Change</b><span>{c["fix"]}</span><b>Space</b><span>{c["space"]}</span></div>'
        f'<div class="lbl">Before</div>{mock(c["b"], c["bm"])}<div class="cap">{c["cap_b"]}</div>'
        f'<div class="lbl">After</div>{mock(c["a"], c["am"])}<div class="cap">{c["cap_a"]}</div>'
    )
    head = f'{c["n"]}. {c["title"]} <span class="tag">{c["size"]}</span> {tag(c["n"])}'
    if status_of(c['n'])[0] != 'pending':  # settled: collapsed, greyed, kept for history
        return f'<details class="sec applied"><summary><h2>{head}</h2></summary>{body}</details>'
    return f'<div class="sec"><h2>{head}</h2>{body}</div>'


def summary_table():
    rows = ''
    for c in CHANGES:
        kind, by = status_of(c['n'])
        labels = {'applied': 'Applied', 'replaced': 'Replaced by ' + by, 'dropped': 'Dropped'}
        row_class = '' if kind == 'pending' else 'applied'
        rows += (
            f'<tr class="{row_class}"><td>{c["n"]}</td><td><b>{c["title"]}</b></td><td>{c["fix"]}</td>'
            f'<td><span class="tag">{c["size"]}</span></td><td>{c["space"]}</td><td>{labels.get(kind, "Pending")}</td></tr>'
        )
    return (
        f'<table class="f"><tr><th>#</th><th>Change</th><th>What it does</th><th>Size</th><th>Space</th><th>Status</th></tr>{rows}</table>'
    )


# Closing sections: edit by hand and keep current whenever STATUS changes.
LEFT = 'Change 1 is pending.'
KEEP = ['The parts that say something the numbers cannot.']
PICK = 'Change 1 is small and loses nothing.'
QUESTIONS = ['Change 1: is the plural deliberate?']

pending = [c for c in CHANGES if status_of(c['n'])[0] == 'pending']
keep_items = ''.join(f'<li>{k}</li>' for k in KEEP)
question_items = ''.join(f'<li>{q}</li>' for q in QUESTIONS)
sections = ''.join(section(c) for c in CHANGES)
html = f"""<!doctype html><meta charset=utf-8><title>{TITLE}</title><style>{CSS}</style>
<h1>{TITLE}</h1><p>{INTRO}</p>{summary_table()}{sections}
<h2>What is left</h2><p>{LEFT}</p><div class="lbl">Now</div>{mock(CURRENT)}
<h2>What I would keep</h2><ul>{keep_items}</ul>
<h2>My pick</h2><p>{PICK}</p>
<h2>Open questions</h2><ul>{question_items}</ul>"""
pathlib.Path('index.html').write_text(html, encoding='utf-8')
