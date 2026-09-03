// The field journal — tabs of specimen types, schema-driven sliders and
// swatches, the seed-code row, kept seed packets, and the garden bar.

import { SCHEMAS, TYPE_ORDER, defaultParams, snapValue, randomParams, nameFromCode, PALETTES } from './params.js';
import { encode, parseSeedInput } from './seedcode.js';
import { randomSeed } from './rng.js';

const SHELF_KEY = 'roundabout-shelf-v1';

// Narrow enough that the journal, the bench and the garden cannot share a
// screen — tending splits into two panes instead. Must stay in step with the
// phone breakpoint in style.css.
export const COMPACT_MEDIA = '(max-width: 760px)';

// wobbly little ink sketches, one per specimen type
const ICONS = {
  flower: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="9.5" r="2.1"/><path d="M12 7.4c-.8-2.6.9-4.4 1.9-4.2M14 8.6c2.5-1.2 4.3.3 4.2 1.4M13.9 10.8c2.4 1 2.3 3.3 1.5 4M10.1 10.8c-2.4 1-2.3 3.3-1.5 4M10 8.6C7.5 7.4 5.7 8.9 5.8 10M12 11.6v9"/><path d="M12 16.5c-1.8.2-3-1-3.1-2.2"/></svg>`,
  mushroom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4.5 12.5C4 8 7.5 4.4 12 4.5s8 3.6 7.5 8c-2.6.8-5.2 1.1-7.5 1.1s-4.9-.3-7.5-1.1z"/><path d="M9.8 13.5c-.4 2.6-.3 4.6.3 6.9 1.2.5 2.6.5 3.8 0 .6-2.3.7-4.3.3-6.9"/><path d="M8.3 8.2h.01M13.5 6.8h.01M15.8 9.6h.01"/></svg>`,
  plant: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 21c0-6 0-9 .3-11.5C13 5 15.5 3 18.6 3c.4 3.6-1 7.3-6.3 8.3"/><path d="M11.8 15.5C11 12 8.8 10.4 5.4 10.3c-.2 3 1.3 5.8 6.3 6"/></svg>`,
  tree: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 21v-7.6"/><path d="M12 13.5c-3.8.4-6.6-1.6-6.7-4.6C5.2 5.6 8.2 3.3 12 3.4c3.8.1 6.7 2.3 6.7 5.5-.1 3-2.9 5-6.7 4.6z"/><path d="M8.6 21h6.8"/></svg>`,
  rock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17.5 3.8 14l2.7-5.2 5-2.3 6.2 1.6 2.5 5.4-1.5 4-4.6 1.3z"/><path d="M9.5 8.7l2.6 3.4-.6 5.5"/></svg>`,
  grass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 21c-.4-5.5-.2-10 .4-14.5M12.3 21c2-3.8 4.6-6.2 7.2-7.4-.5 4.2-3 6.9-7 7.4M11.7 21C9.9 16.8 7.6 14.6 4.4 13.6c.3 4.4 3.2 7 7.2 7.4"/></svg>`,
  pond: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><ellipse cx="12" cy="14.5" rx="8.6" ry="4.8"/><path d="M7.6 13.6c1-.9 2.7-.9 3.5 0M13.6 15.8c.9-.8 2.4-.8 3.2 0"/><path d="M13.8 7.2c1.6-1.5 4-1 4.4.8.3 1.4-.9 2.6-2.6 2.6-1.4 0-2.4-1-2.4-2.2 0-.4.2-.9.6-1.2z"/></svg>`,
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function createUI(opts) {
  const state = {
    type: 'flower',
    designs: {},
  };
  const FIRST_SEEDS = { flower: 1130, mushroom: 42, plant: 7, tree: 512, rock: 3, grass: 99, pond: 2026 };
  for (const t of TYPE_ORDER) {
    state.designs[t] = { params: defaultParams(t), seed: FIRST_SEEDS[t] };
  }

  const $tabs = document.getElementById('tabs');
  const $controls = document.getElementById('controls');
  const $seedRow = document.getElementById('seed-row');
  const $shelf = document.getElementById('shelf');
  const $bar = document.getElementById('garden-bar');
  const $toast = document.getElementById('toast');
  const $panePlant = document.getElementById('pane-plant');
  const $paneDesign = document.getElementById('pane-design');

  const design = () => state.designs[state.type];
  const currentCode = () => encode(state.type, design().params, design().seed);

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2200);
  }

  // ---------- tabs ----------
  function renderTabs() {
    $tabs.replaceChildren();
    for (const t of TYPE_ORDER) {
      const b = el('button', 'tab' + (t === state.type ? ' active' : ''));
      b.innerHTML = ICONS[t];
      b.appendChild(el('span', 'tab-label', SCHEMAS[t].label));
      b.title = SCHEMAS[t].label;
      b.addEventListener('click', () => {
        state.type = t;
        renderTabs();
        renderControls();
        syncCode();
        opts.onDesignChange?.();
      });
      $tabs.appendChild(b);
    }
  }

  // ---------- parameter controls ----------

  function setParam(p, v) {
    design().params[p.k] = snapValue(p, v);
    syncCode();
    opts.onDesignChange?.();
  }

  function sliderRow(p) {
    const row = el('div', 'param');
    const head = el('div', 'param-head');
    head.appendChild(el('span', 'param-label', p.label));
    const val = el('span', 'param-value');
    head.appendChild(val);
    row.appendChild(head);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = p.min;
    input.max = p.max;
    input.step = p.type === 'int' ? 1 : (p.max - p.min) / p.steps;
    input.value = design().params[p.k];
    const fmt = (v) => (p.type === 'int' ? String(Math.round(v)) : Number(v).toFixed(2));
    val.textContent = fmt(design().params[p.k]);
    input.addEventListener('input', () => {
      setParam(p, parseFloat(input.value));
      val.textContent = fmt(design().params[p.k]);
    });
    row.appendChild(input);
    return row;
  }

  function colorRow(p) {
    const row = el('div', 'param param-color');
    const head = el('div', 'param-head');
    head.appendChild(el('span', 'param-label', p.label));
    row.appendChild(head);
    const swatches = el('div', 'swatches');
    const custom = document.createElement('input');
    custom.type = 'color';
    custom.value = design().params[p.k];
    custom.title = 'mix your own';
    const markSelected = () => {
      for (const s of swatches.querySelectorAll('.swatch')) {
        s.classList.toggle('selected', s.dataset.hex === design().params[p.k]);
      }
    };
    for (const hex of (PALETTES[p.palette] ?? []).slice(0, 7)) {
      const s = el('button', 'swatch');
      s.style.background = hex;
      s.dataset.hex = snapValue(p, hex);
      s.title = hex;
      s.addEventListener('click', () => {
        setParam(p, hex);
        custom.value = design().params[p.k];
        markSelected();
      });
      swatches.appendChild(s);
    }
    custom.addEventListener('input', () => {
      setParam(p, custom.value);
      markSelected();
    });
    swatches.appendChild(custom);
    row.appendChild(swatches);
    markSelected();
    return row;
  }

  function choiceRow(p) {
    const row = el('div', 'param');
    const head = el('div', 'param-head');
    head.appendChild(el('span', 'param-label', p.label));
    row.appendChild(head);
    const seg = el('div', 'segmented');
    for (const opt of p.options) {
      const b = el('button', 'seg' + (design().params[p.k] === opt ? ' active' : ''), opt);
      b.addEventListener('click', () => {
        setParam(p, opt);
        for (const s of seg.children) s.classList.toggle('active', s === b);
      });
      seg.appendChild(b);
    }
    row.appendChild(seg);
    return row;
  }

  function renderControls() {
    $controls.replaceChildren();
    for (const group of SCHEMAS[state.type].groups) {
      const g = el('div', 'group');
      g.appendChild(el('h3', 'group-title', group.label));
      for (const p of group.params) {
        if (p.type === 'color') g.appendChild(colorRow(p));
        else if (p.type === 'choice') g.appendChild(choiceRow(p));
        else g.appendChild(sliderRow(p));
      }
      $controls.appendChild(g);
    }
  }

  // ---------- seed row ----------

  let codeInput;
  function syncCode() {
    if (codeInput) codeInput.value = currentCode();
  }

  function applyDesign(parsed, note) {
    state.type = parsed.type;
    state.designs[parsed.type] = { params: parsed.params, seed: parsed.seed };
    renderTabs();
    renderControls();
    syncCode();
    opts.onDesignChange?.();
    if (note) toast(note);
  }

  function renderSeedRow() {
    $seedRow.replaceChildren();
    $seedRow.appendChild(el('h3', 'group-title', 'seed'));
    const box = el('div', 'seed-box');
    codeInput = document.createElement('input');
    codeInput.spellcheck = false;
    codeInput.autocomplete = 'off';
    codeInput.placeholder = 'paste a code or a number';
    box.appendChild(codeInput);
    $seedRow.appendChild(box);

    const commit = () => {
      const text = codeInput.value.trim();
      if (!text || text === currentCode()) return;
      const parsed = parseSeedInput(text, state.type);
      if (parsed) applyDesign(parsed, 'seed sprouted ✓');
      else {
        toast("hmm, that seed didn't sprout");
        syncCode();
      }
    };
    codeInput.addEventListener('change', commit);
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
    });

    const actions = el('div', 'seed-actions');
    const mkBtn = (label, title, fn) => {
      const b = el('button', 'chip', label);
      b.title = title;
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    };
    mkBtn('roll', 'roll a whole new design from a random number', () => {
      const n = 1 + (randomSeed() % 999999);
      const { params, seed } = randomParams(state.type, n);
      applyDesign({ type: state.type, params, seed }, `rolled № ${n}`);
    });
    mkBtn('re-pot', 'same design, fresh growth jitter', () => {
      design().seed = randomSeed();
      syncCode();
      opts.onDesignChange?.();
    });
    mkBtn('copy', 'copy the seed code', async () => {
      try {
        await navigator.clipboard.writeText(currentCode());
        toast('seed code tucked away ✓');
      } catch {
        codeInput.select();
        document.execCommand('copy');
        toast('seed code selected — press ⌘C');
      }
    });
    mkBtn('keep ✿', 'save to your seed packets', () => {
      const code = currentCode();
      const shelf = loadShelf();
      if (shelf.some((s) => s.code === code)) {
        toast('already in your packets');
        return;
      }
      const name = nameFromCode(state.type, code);
      shelf.unshift({ code, name, type: state.type });
      saveShelf(shelf.slice(0, 40));
      renderShelf();
      toast(`kept “${name}”`);
    });
    $seedRow.appendChild(actions);
    syncCode();
  }

  // ---------- shelf ----------

  function loadShelf() {
    try {
      return JSON.parse(localStorage.getItem(SHELF_KEY)) ?? [];
    } catch {
      return [];
    }
  }
  function saveShelf(shelf) {
    try {
      localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
    } catch {
      /* fine */
    }
  }

  function renderShelf() {
    $shelf.replaceChildren();
    const shelf = loadShelf();
    if (!shelf.length) {
      $shelf.appendChild(el('p', 'shelf-empty', 'nothing kept yet — grow something you love, then “keep ✿”'));
      return;
    }
    for (const item of shelf) {
      const chip = el('button', 'packet');
      const ic = el('span', 'packet-icon');
      ic.innerHTML = ICONS[item.type] ?? '';
      chip.appendChild(ic);
      chip.appendChild(el('span', 'packet-name', item.name));
      const x = el('span', 'packet-x', '×');
      x.title = 'toss this packet';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        saveShelf(loadShelf().filter((s) => s.code !== item.code));
        renderShelf();
      });
      chip.appendChild(x);
      chip.title = item.code;
      chip.addEventListener('click', () => {
        const parsed = parseSeedInput(item.code, state.type);
        if (parsed) applyDesign(parsed, `“${item.name}” unpacked`);
      });
      $shelf.appendChild(chip);
    }
  }

  // ---------- garden bar ----------

  const settings = { time: 0.42, wind: 0.5 };
  let countLabel, twirlBtn, weatherBtn;

  function renderBar() {
    $bar.replaceChildren();

    // Two rows: what the garden is like, then what you can do to it. On a
    // wide screen they are `display: contents` and the bar is the single
    // strip it has always been; on a phone they become real rows so the
    // menu can stack instead of wrapping into a blob.
    const rowA = el('div', 'bar-row bar-row-a');
    const rowB = el('div', 'bar-row bar-row-b');
    $bar.append(rowA, rowB);

    weatherBtn = el('button', 'chip weather-chip', '· fair');
    weatherBtn.title = 'the weather does its own thing — click to hold sun / rain / storm';
    weatherBtn.addEventListener('click', () => opts.onWeatherToggle?.());
    rowA.appendChild(weatherBtn);
    rowA.appendChild(el('span', 'bar-sep'));

    const mkSlider = (label, value, oninput, title) => {
      const wrap = el('div', 'bar-group');
      wrap.appendChild(el('span', 'bar-label', label));
      const input = document.createElement('input');
      input.type = 'range';
      input.min = 0;
      input.max = 1;
      input.step = 0.01;
      input.value = value;
      input.title = title;
      input.addEventListener('input', () => oninput(parseFloat(input.value)));
      wrap.appendChild(input);
      rowA.appendChild(wrap);
      return input;
    };

    mkSlider('time', settings.time, (v) => {
      settings.time = v;
      opts.onTimeChange?.(v);
    }, 'dawn → noon → golden hour → night');
    mkSlider('breeze', settings.wind, (v) => {
      settings.wind = v;
    }, 'breeziness — scales however hard the weather is blowing');

    rowA.appendChild(el('span', 'bar-sep'));

    const mkBtn = (label, title, fn) => {
      const b = el('button', 'chip', label);
      b.title = title;
      b.addEventListener('click', fn);
      rowB.appendChild(b);
      return b;
    };

    const bedOnly = [];
    bedOnly.push(mkBtn('re-sow', 'roll a new number and grow the whole bed again', () => opts.onResow?.()));
    twirlBtn = mkBtn('twirl', 'let the camera wander in circles', () => {
      const active = twirlBtn.classList.toggle('active');
      opts.onOrbitToggle?.(active);
    });
    bedOnly.push(twirlBtn);

    countLabel = el('span', 'bar-count tend-only', '');
    rowB.appendChild(countLabel);
    for (const b of bedOnly) b.classList.add('tend-only');
  }

  // ---------- public ----------

  renderTabs();
  renderControls();
  renderSeedRow();
  renderShelf();
  renderBar();

  // ---------- street chrome ----------

  const $chip = document.getElementById('interact-chip');
  const $overlay = document.getElementById('walk-overlay');
  const $streetBtn = document.getElementById('street-btn');

  // ---------- the two phone panes ----------
  //
  // 'bench' is the potting bench — the preview and the sliders, filling the
  // screen. 'bed' is the garden itself with just the bottom menu. A wide
  // screen shows both at once and these classes do nothing at all, so the
  // rest of the app can set them without asking how big the window is.

  function showPane(next) {
    const bench = next === 'bench';
    document.body.classList.toggle('pane-bench', bench);
    document.body.classList.toggle('pane-bed', !bench);
  }
  $panePlant.addEventListener('click', () => opts.onDoneDesigning?.());
  $paneDesign.addEventListener('click', () => showPane('bench'));
  showPane('bed');

  // `mode-*` is swapped rather than assigned wholesale: touch.js's
  // `touch-input` and the pane classes above have to survive a mode change.
  function setAppMode(mode) {
    for (const c of [...document.body.classList]) {
      if (c.startsWith('mode-')) document.body.classList.remove(c);
    }
    document.body.classList.add(`mode-${mode}`);
    if (mode !== 'tend') showPane('bed'); // arrive at the bed, not mid-design
    $streetBtn.hidden = mode !== 'tend';
  }

  // `key` is the keyboard shortcut that would do this, if there is one. It
  // shows as an "E — " prefix on a keyboard and is dropped on a phone, where
  // there is no E to press. The label and the have-a-key flag also go out as
  // data attributes: touch.js builds its own tappable chip from them, and
  // reading them beats scraping the prefix back off the rendered text.
  function setInteractChip(text, key) {
    if (!text) {
      $chip.hidden = true;
      return;
    }
    $chip.replaceChildren();
    if (key) $chip.appendChild(el('span', 'chip-key', `${key} — `));
    $chip.appendChild(document.createTextNode(text));
    $chip.dataset.label = text;
    $chip.dataset.act = key ? '1' : '';
    $chip.hidden = false;
  }

  function setWalkOverlay(show) {
    $overlay.hidden = !show;
  }

  $streetBtn.addEventListener('click', () => opts.onBackToStreet?.());

  return {
    toast,
    currentDesign: () => ({ type: state.type, params: design().params, seed: design().seed }),
    currentCode,
    applyDesign,
    setAppMode,
    showPane,
    setInteractChip,
    setWalkOverlay,
    setWeatherLabel: (text, held) => {
      if (!weatherBtn) return;
      weatherBtn.textContent = `· ${text}`;
      weatherBtn.classList.toggle('active', !!held);
    },
    // what is growing in the bed, and the number it grew from
    setBed: (count, seed) => {
      if (countLabel) countLabel.textContent = `${count} growing · № ${seed}`;
    },
    getSettings: () => ({ ...settings }),
  };
}
