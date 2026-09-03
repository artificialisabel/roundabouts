// Touch controls for the street. Phones and tablets get a one-finger look
// drag, a thumb ring in the lower-left to stroll with, and a tap to stop by
// a roundabout. Desktop keeps pointer lock + WASD untouched.
//
// Everything the walk needs goes through the small additive API on
// player.js (nudgeLook / setMoveAxis / setPointerLockAllowed) so touch
// inherits the same easing, the same turn rate and the same collider
// push-out as the keyboard. At the potting bench the whole thing steps aside so
// OrbitControls keeps its native one-finger orbit and two-finger zoom.

const LOOK_YAW = 0.0052; // radians of yaw per css pixel dragged
const LOOK_PITCH = 0.0042;
const STICK_R = 46; // px the nub may travel from the ring's centre
const DEADZONE = 0.16;
const TAP_SLOP = 12; // px a tap is allowed to wander
const TAP_MS = 340;
const HOME_X = 84; // resting place of the ring, from the left edge
const HOME_UP = 168; // ...and up from the bottom, clear of the garden bar

/** Genuine touch device? A touchscreen laptop with a mouse reports `fine`. */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  return coarse && (navigator.maxTouchPoints ?? 0) > 0;
}

/**
 * @param {object}   o
 * @param {object}   o.player              from createPlayer()
 * @param {Element}  o.canvas              the scene canvas
 * @param {()=>string} [o.getMode]         'walk' | 'tend' | 'transition'
 * @param {()=>void} [o.onInteract]        same action as the E key
 * @param {()=>any}  [o.isNearInteractable] truthy when E would do something
 * @param {boolean}  [o.force]             skip detection (tests); ?touch=1 also works
 * @returns {{enabled:boolean, update:()=>void, refresh:()=>void, dispose:()=>void}}
 */
export function initTouch({
  player,
  canvas,
  getMode,
  onInteract,
  isNearInteractable,
  force,
} = {}) {
  const q = typeof location !== 'undefined' ? location.search : '';
  const forced = force ?? (/[?&]touch=1(&|$)/.test(q) ? true : /[?&]touch=0(&|$)/.test(q) ? false : null);
  const enabled = forced ?? isTouchDevice();

  const noop = { enabled: false, update() {}, refresh() {}, dispose() {} };
  if (!enabled || !player || !canvas) return noop;

  // No pointer lock, ever, on a device with no pointer to lock.
  player.setPointerLockAllowed?.(false);
  document.body.classList.add('touch-input');

  // the mouse verbs in the chrome mean nothing to a thumb
  const benchHint = document.querySelector('.bench-hint');
  if (benchHint) benchHint.textContent = 'drag to turn it · pinch to zoom';

  // ---------- chrome ----------

  const layer = document.createElement('div');
  layer.id = 'touch-layer';
  layer.setAttribute('aria-hidden', 'true');

  const ring = document.createElement('div');
  ring.id = 'touch-stick';
  const nub = document.createElement('div');
  nub.id = 'touch-nub';
  ring.appendChild(nub);

  const chip = document.createElement('button');
  chip.id = 'touch-interact';
  chip.type = 'button';
  chip.hidden = true;

  layer.append(ring, chip);
  document.body.appendChild(layer);

  // ---------- ring placement ----------

  let homeX = HOME_X;
  let homeY = 0;
  function measureHome() {
    homeX = HOME_X;
    homeY = (window.innerHeight || 800) - HOME_UP;
  }
  function placeRing(x, y) {
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
  }
  function setNub(dx, dy) {
    nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  function restRing() {
    measureHome();
    placeRing(homeX, homeY);
    setNub(0, 0);
    ring.classList.remove('active');
  }
  restRing();

  // The stick zone: the lower-left of the canvas, generous but not greedy.
  function inStickZone(x, y) {
    const w = window.innerWidth || 400;
    const h = window.innerHeight || 800;
    return x < Math.min(w * 0.55, 340) && y > h - Math.min(h * 0.5, 340);
  }

  // ---------- mode ----------

  function readMode() {
    if (typeof getMode === 'function') return getMode();
    return document.body.className.match(/mode-([a-z]+)/)?.[1] ?? 'walk';
  }
  const isWalking = () => readMode() === 'walk';

  // ---------- pointers ----------

  let lookId = null;
  let lookX = 0;
  let lookY = 0;
  let lookDrift = 0;
  let lookAt = 0;

  let stickId = null;
  let originX = 0;
  let originY = 0;

  function applyAxes(dx, dy) {
    const nx = dx / STICK_R;
    const ny = dy / STICK_R;
    const mag = Math.hypot(nx, ny);
    if (mag < DEADZONE) {
      player.setMoveAxis?.(0, 0);
      return;
    }
    const k = (mag - DEADZONE) / (1 - DEADZONE) / mag;
    // up on the ring walks forward; left on the ring turns left, like A/D
    player.setMoveAxis?.(-ny * k, -nx * k);
  }

  function dropStick() {
    if (stickId === null) return;
    try {
      canvas.releasePointerCapture(stickId);
    } catch { /* already gone */ }
    stickId = null;
    player.setMoveAxis?.(0, 0);
    restRing();
  }

  function dropLook() {
    if (lookId === null) return;
    try {
      canvas.releasePointerCapture(lookId);
    } catch { /* already gone */ }
    lookId = null;
  }

  function releaseAll() {
    dropStick();
    dropLook();
  }

  function overlayUp() {
    const o = document.getElementById('walk-overlay');
    return !!o && !o.hidden;
  }

  function fireInteract() {
    if (!isWalking()) return;
    if (typeof isNearInteractable === 'function' && !isNearInteractable()) return;
    if (typeof onInteract === 'function') onInteract();
    // fallback: player.js already listens for KeyE on document
    else document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  }

  function onDown(e) {
    if (e.pointerType === 'mouse') return; // a stylus or finger only
    if (!isWalking()) return; // the potting bench belongs to OrbitControls

    if (stickId === null && inStickZone(e.clientX, e.clientY)) {
      stickId = e.pointerId;
      originX = e.clientX;
      originY = e.clientY;
      placeRing(originX, originY);
      setNub(0, 0);
      ring.classList.add('active');
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch { /* fine */ }
      e.preventDefault(); // no stray click from the thumb
      return;
    }

    if (lookId !== null) return; // a second look finger must not teleport the view
    lookId = e.pointerId;
    lookX = e.clientX;
    lookY = e.clientY;
    lookDrift = 0;
    lookAt = performance.now();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch { /* fine */ }
    // deliberately no preventDefault: main.js dismisses the walk overlay on click
  }

  function onMove(e) {
    if (e.pointerId === stickId) {
      let dx = e.clientX - originX;
      let dy = e.clientY - originY;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        dx = (dx / d) * STICK_R;
        dy = (dy / d) * STICK_R;
      }
      setNub(dx, dy);
      applyAxes(dx, dy);
      return;
    }
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lookX;
    const dy = e.clientY - lookY;
    lookX = e.clientX;
    lookY = e.clientY;
    lookDrift += Math.hypot(dx, dy);
    // feed the targets, never yaw/pitch — the ease in player.update() does the rest
    player.nudgeLook?.(-dx * LOOK_YAW, -dy * LOOK_PITCH);
  }

  function onUp(e) {
    if (e.pointerId === stickId) {
      dropStick();
      return;
    }
    if (e.pointerId !== lookId) return;
    const tapped = lookDrift <= TAP_SLOP && performance.now() - lookAt <= TAP_MS;
    dropLook();
    // the very first tap is spent dismissing the prompt
    if (tapped && actionable && !overlayUp()) fireInteract();
  }

  function onCancel(e) {
    if (e.pointerId === stickId) dropStick();
    else if (e.pointerId === lookId) dropLook();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', releaseAll);
  window.addEventListener('resize', restRing);

  chip.addEventListener('click', (e) => {
    e.preventDefault();
    fireInteract();
  });

  // ---------- the tappable chip mirrors main.js's own prompt ----------

  const srcChip = document.getElementById('interact-chip');
  let actionable = false;
  let lastRaw = null;
  let lastAct = null;
  let lastWalk = null;

  function sync() {
    // Keep the touch marker present if another view class is swapped.
    if (!document.body.classList.contains('touch-input')) document.body.classList.add('touch-input');

    const walking = isWalking();
    if (!walking) releaseAll();
    layer.classList.toggle('idle', !walking);

    // Coming back from a garden, exitGarden() re-raises the walk prompt from
    // `!player.isLocked()` — always true here, and there is no tap-to-lock to
    // clear it. The prompt is pointer-lock chrome; a touch walk never wants it.
    if (walking && lastWalk === false) {
      const o = document.getElementById('walk-overlay');
      if (o) o.hidden = true;
    }

    // ui.setInteractChip() publishes the bare label and whether it is
    // something you can act on; the rendered text carries a "E — " prefix
    // that means nothing here.
    const live = srcChip && !srcChip.hidden;
    const raw = live ? (srcChip.dataset.label || '').trim() : '';
    const act = live && srcChip.dataset.act === '1';
    if (raw === lastRaw && act === lastAct && walking === lastWalk) return;
    lastRaw = raw;
    lastAct = act;
    lastWalk = walking;

    if (!walking || !raw) {
      chip.hidden = true;
      actionable = false;
      return;
    }
    actionable = act;
    chip.textContent = raw;
    chip.classList.toggle('passive', !actionable);
    chip.hidden = false;
  }

  const observers = [];
  if (srcChip) {
    const o = new MutationObserver(sync);
    o.observe(srcChip, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'data-label', 'data-act'],
    });
    observers.push(o);
  }
  const bodyObs = new MutationObserver(sync);
  bodyObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  observers.push(bodyObs);
  sync();

  return {
    enabled: true,
    /** optional — safe to call from the render loop; sync is event-driven */
    update: sync,
    refresh: sync,
    dispose() {
      releaseAll();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', releaseAll);
      window.removeEventListener('resize', restRing);
      for (const o of observers) o.disconnect();
      layer.remove();
      document.body.classList.remove('touch-input');
      player.setPointerLockAllowed?.(true);
    },
  };
}
