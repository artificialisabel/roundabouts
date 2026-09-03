// When there is no WebGL there is no town — say so plainly instead of leaving
// a blank cream page with instructions for keys that do nothing.

export function showNoWebGL() {
  for (const id of ['scene', 'hud', 'hint', 'garden-bar', 'journal', 'bench']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  // styles inline so this works on both entry pages without a stylesheet hunt
  const css = document.createElement('style');
  css.textContent = `
    #no-webgl { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; }
    .no-webgl-card { max-width: 380px; padding: 22px 24px; text-align: center; }
    .no-webgl-card h2 { margin: 0 0 10px; font-size: 14px; font-weight: 700; letter-spacing: 0.2em; }
    .no-webgl-card p { margin: 0 0 8px; font-size: 10px; line-height: 1.7; letter-spacing: 0.04em; }
    .no-webgl-hint { color: var(--ink-soft, rgba(58,53,47,0.6)); }`;
  document.head.appendChild(css);

  const wrap = document.createElement('div');
  wrap.id = 'no-webgl';
  wrap.innerHTML = `
    <div class="wobble-a no-webgl-card">
      <h2>the town needs a window</h2>
      <p>
        this little neighbourhood is drawn with WebGL, and this browser
        can't open it right now.
      </p>
      <p class="no-webgl-hint">
        it's usually hardware acceleration being switched off — try enabling it
        in your browser settings, or stop by on a different browser ♡
      </p>
    </div>`;
  document.body.appendChild(wrap);
}
