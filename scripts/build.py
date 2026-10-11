#!/usr/bin/env python3
"""Assemble the single-file page.

  dist/page.html   fragment for the Claude Artifact tool (no doctype/head/body; the host wraps it)
  dist/index.html  same page wrapped in a doctype so you can open it directly in a browser

Run from anywhere:  python scripts/build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC, DIST = ROOT / 'src', ROOT / 'dist'

def read(name): return (SRC / name).read_text(encoding='utf-8')

# core.js ends with a CommonJS export used only by the Node tests; disable it in the browser bundle
core = read('core.js').replace("if(typeof module!=='undefined') module.exports", "if(false) module.exports")
fragment = read('head.html') + read('body.html') + '\n<script>\n' + read('data.js') + read('items.js') + core + read('ui.js') + '\n</script>\n'
wrapped = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + fragment + '</body></html>')
DIST.mkdir(exist_ok=True)
(DIST / 'page.html').write_text(fragment, encoding='utf-8')
(DIST / 'index.html').write_text(wrapped, encoding='utf-8')
print(f'dist/page.html {len(fragment):,} bytes, dist/index.html {len(wrapped):,} bytes')
