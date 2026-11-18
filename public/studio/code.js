// Small code editor: a transparent textarea over a highlighted <pre>, with line numbers.
// Enough for live-coding script layers without pulling an editor library.

const KW = new Set('const let var function return if else for while do of in new class extends this typeof instanceof break continue switch case default try catch finally throw await async yield true false null undefined'.split(' '));
const escH = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|([{}()[\];,.=+\-*/%<>!&|?:^~]+)/g;

export function highlight(src) {
  let out = '', last = 0, prevDot = false;
  for (const m of src.matchAll(TOKEN)) {
    out += escH(src.slice(last, m.index));
    last = m.index + m[0].length;
    const t = escH(m[0]);
    if (m[1]) out += `<i class="c">${t}</i>`;
    else if (m[2]) out += `<i class="s">${t}</i>`;
    else if (m[3]) out += `<i class="n">${t}</i>`;
    else if (m[4]) out += KW.has(m[4]) ? `<i class="k">${t}</i>` : `<i class="${prevDot ? 'm' : 'f'}">${t}</i>`;
    else if (m[5]) out += KW.has(m[5]) ? `<i class="k">${t}</i>` : prevDot ? `<i class="p">${t}</i>` : t;
    else out += `<i class="o">${t}</i>`;
    prevDot = m[6] ? m[6].endsWith('.') : false;
  }
  return out + escH(src.slice(last)) + '\n';
}

export function codeEditor(host, value, { onChange, onApply } = {}) {
  host.innerHTML = `<div class="ce"><div class="ce-gutter"></div><div class="ce-body">
    <pre class="ce-hl" aria-hidden="true"><code></code></pre>
    <textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Code du calque"></textarea></div></div>`;
  const ta = host.querySelector('textarea');
  const code = host.querySelector('code');
  const pre = host.querySelector('.ce-hl');
  const gutter = host.querySelector('.ce-gutter');
  let errLine = null;
  ta.value = value;

  const paint = () => {
    code.innerHTML = highlight(ta.value);
    const n = ta.value.split('\n').length;
    let g = '';
    for (let i = 1; i <= n; i++) g += `<span${i === errLine ? ' class="err"' : ''}>${i}</span>`;
    gutter.innerHTML = g;
    sync();
  };
  const sync = () => {
    pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
  };
  const edit = (text, s0, s1, caret0, caret1 = caret0) => {
    ta.setRangeText(text, s0, s1);
    ta.setSelectionRange(caret0, caret1);
    paint();
    onChange?.(ta.value);
  };

  ta.addEventListener('input', () => { paint(); onChange?.(ta.value); });
  ta.addEventListener('scroll', sync);
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const { selectionStart: a, selectionEnd: b, value: v } = ta;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onApply?.(ta.value);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const ls = v.lastIndexOf('\n', a - 1) + 1;
      if (a === b && !e.shiftKey) return edit('  ', a, b, a + 2);
      const le = b;
      const block = v.slice(ls, le);
      const next = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ');
      edit(next, ls, le, ls, ls + next.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const ls = v.lastIndexOf('\n', a - 1) + 1;
      let ind = /^ */.exec(v.slice(ls, a))[0];
      if (/[{([]\s*$/.test(v.slice(ls, a))) ind += '  ';
      edit('\n' + ind, a, b, a + 1 + ind.length);
    } else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      const ls = v.lastIndexOf('\n', a - 1) + 1;
      const block = v.slice(ls, b);
      const on = block.split('\n').every((l) => /^\s*\/\//.test(l) || !l.trim());
      const next = on ? block.replace(/^(\s*)\/\/ ?/gm, '$1') : block.replace(/^(\s*)(?=\S)/gm, '$1// ');
      edit(next, ls, b, ls, ls + next.length);
    }
  });
  paint();
  return {
    get value() { return ta.value; },
    set value(v) { if (v !== ta.value) { ta.value = v; paint(); } },
    setError(line) { if (line !== errLine) { errLine = line; paint(); } },
    focused: () => document.activeElement === ta,
  };
}
