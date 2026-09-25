// Run at /tests/page-curl.html with the Vite server. Real app, real DOM,
// synthetic pointer events; pointer capture is stubbed only in this test frame.
const frame = document.querySelector('#app');
const output = document.querySelector('#results');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let doc;
let win;
let errors = [];
let held;
function lock(locked) {
  document.querySelector('#run').disabled = locked;
  document.querySelector('#preview').disabled = locked;
  document.querySelector('#release').disabled = locked;
}
const report = (message) => { output.textContent += `${message}\n`; };
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  report(`PASS: ${message}`);
};
async function until(check) {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > 7000) throw new Error('Timed out waiting for the app');
    await sleep(30);
  }
}
async function reset(width, fullMotion = true) {
  frame.style.width = `${width}px`;
  frame.src = `/?curl-test=${Date.now()}`;
  await new Promise((resolve) => { frame.onload = resolve; });
  win = frame.contentWindow;
  doc = win.document;
  win.addEventListener('error', (event) => errors.push(event.message));
  win.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
  await until(() => doc.querySelector('.loading-screen.loaded'));
  const stage = doc.querySelector('#stage');
  stage.setPointerCapture = () => {};
  stage.hasPointerCapture = () => false;
  if (fullMotion && doc.documentElement.dataset.motion !== 'full') {
    doc.querySelector('[data-motion-option="full"]').click();
    await until(() => doc.documentElement.dataset.motion === 'full');
  }
}
const state = () => doc.querySelector('#count').textContent;
async function idle() {
  await until(() => !doc.querySelector('.is-turning') && !state().includes('กำลัง'));
  // Include cover centering, which follows the paper turn.
  await sleep(900);
}
function pointer(type, target, x, y) {
  target.dispatchEvent(new win.PointerEvent(type, {
    bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch',
    button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
  }));
}
function rightFace() {
  return doc.querySelector('.single > .face') || [...doc.querySelectorAll('.leaf.active:not(.turned) .front')][0];
}
function leftFace() {
  return doc.querySelector('.single > .face') || [...doc.querySelectorAll('.leaf.active.turned .back')].at(-1);
}
async function drag({ backward = false, amount = .62, cancel = false, top = false, hold = false }) {
  const face = backward ? leftFace() : rightFace();
  const bounds = face.getBoundingClientRect();
  const x = backward ? bounds.left + 20 : bounds.right - 20;
  const y = bounds.top + bounds.height * (top ? .12 : .85);
  const endX = x + (backward ? 1 : -1) * bounds.width * amount;
  const endY = y + (top ? 40 : -55);
  pointer('pointerdown', face, x, y);
  await sleep(30);
  pointer('pointermove', doc.querySelector('#stage'), endX, endY);
  await until(() => doc.querySelector('.paper-curl'));
  await sleep(180);
  const panels = [...doc.querySelectorAll('.curl-panel')];
  assert(panels.length >= 6 && panels.length <= 8, 'Curved paper uses at most eight surfaces');
  assert(panels.every((panel) => !panel.style.transform.includes('NaN') && !panel.style.clipPath.includes('NaN')), 'Fold geometry stays finite');
  held = { x: endX, y: endY };
  if (hold) return;
  pointer(cancel ? 'pointercancel' : 'pointerup', doc.querySelector('#stage'), endX, endY);
  await idle();
  assert(!doc.querySelector('.paper-curl, .curl-source'), 'Temporary curl surfaces are cleaned up');
}
async function checkMediumReveal(backward) {
  const before = state();
  const face = backward ? leftFace() : rightFace();
  const leaf = face.closest('.leaf');
  const arriving = leaf.querySelector(backward ? '.front' : '.back');
  const bounds = face.getBoundingClientRect();
  const x = backward ? bounds.left + 20 : bounds.right - 20;
  const y = bounds.top + bounds.height * .5;
  const endX = x + (backward ? 1 : -1) * bounds.width * 1.5;
  pointer('pointerdown', face, x, y);
  pointer('pointermove', doc.querySelector('#stage'), endX, y);
  await until(() => leaf.classList.contains('light-turn') && arriving.getBoundingClientRect().width > bounds.width * .6);
  const shown = arriving.getBoundingClientRect();
  const hit = doc.elementFromPoint(shown.left + shown.width * .5, shown.top + shown.height * .5);
  assert(hit?.closest('.face') === arriving,
    `${backward ? 'Backward' : 'Forward'} turn shows the arriving face above the old page before release`);
  assert(!arriving.querySelector('.pg').classList.contains('scene-pending'), 'Arriving page animation starts during the turn');
  pointer('pointercancel', doc.querySelector('#stage'), endX, y);
  await idle();
  assert(state() === before, 'Cancelling a partial Medium turn restores the original spread');
  assert(!leaf.querySelector('.face[style*="transform"]'), 'Cancelling restores both resting faces');
}
document.querySelector('#run').onclick = async () => {
  lock(true);
  output.textContent = 'Running…\n';
  errors = [];
  const savedMotion = localStorage.getItem('c2c-motion');
  try {
    await reset(1100);
    assert(doc.querySelector('.book'), 'Desktop uses an open-book layout');
    assert(doc.querySelector('#prev').disabled, 'Cannot turn before the cover');
    doc.querySelector('#next').click();
    await idle();
    const firstSpread = state();
    assert(firstSpread !== 'ปก', 'Next button opens the cover');
    await drag({ amount: .12 });
    assert(state() === firstSpread, 'A short drag settles back');
    await drag({ cancel: true });
    assert(state() === firstSpread, 'Pointer cancellation restores the page');
    await drag({ top: true });
    assert(state() !== firstSpread, 'A top-edge drag turns forward');
    await drag({ backward: true });
    assert(state() === firstSpread, 'A left-page drag turns backward');
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await idle();
    assert(state() !== firstSpread, 'Arrow key turns forward');
    doc.querySelector('#prev').click();
    await idle();
    assert(state() === firstSpread, 'Previous button turns backward');
    await drag({ hold: true });
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pointer('pointercancel', doc.querySelector('#stage'), held.x, held.y);
    await idle();
    assert(state() === firstSpread, 'Escape cancels a held page');
    doc.querySelector('[data-motion-option="medium"]').click();
    await until(() => doc.documentElement.dataset.motion === 'medium');
    await checkMediumReveal(false);
    await checkMediumReveal(true);
    await reset(390);
    assert(doc.querySelector('.single'), 'Mobile uses a single-page layout');
    await drag({ top: true });
    assert(state() !== 'ปก', 'Mobile swipe turns forward');
    await drag({ backward: true });
    assert(state() === 'ปก', 'Mobile swipe turns backward');
    const face = rightFace();
    const bounds = face.getBoundingClientRect();
    pointer('pointerdown', face, bounds.right - 20, bounds.top + 60);
    pointer('pointerup', doc.querySelector('#stage'), bounds.right - 20, bounds.top + 60);
    await idle();
    assert(state() !== 'ปก', 'A tap turns exactly one page');
    assert(doc.querySelectorAll('.single > .face').length === 1, 'Mobile leaves exactly one page mounted');
    doc.querySelector('[data-motion-option="none"]').click();
    await until(() => doc.documentElement.dataset.motion === 'none');
    assert(doc.querySelector('[data-motion-option="none"]').getAttribute('aria-pressed') === 'true', 'Motion toggle exposes its enabled state');
    const beforeReducedTurn = state();
    doc.querySelector('#next').click();
    await until(() => state() !== beforeReducedTurn && !state().includes('กำลัง'));
    assert(!doc.querySelector('.paper-curl'), 'Reduced motion turns without creating a curl');
    assert(doc.querySelector('#stage').getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running'), 'Reduced motion stops decorative animations');
    await reset(390, false);
    assert(doc.documentElement.dataset.motion === 'none', 'Motion preference survives a reload');
    const toggleBounds = doc.querySelector('.motion-control').getBoundingClientRect();
    assert(toggleBounds.right <= win.innerWidth && toggleBounds.top >= 0, 'Toggle fits in the top-right corner on mobile');
    doc.querySelector('[data-motion-option="full"]').click();
    await until(() => doc.documentElement.dataset.motion === 'full');
    const beforeToggle = state();
    await drag({ hold: true });
    doc.querySelector('[data-motion-option="none"]').click();
    await until(() => doc.documentElement.dataset.motion === 'none');
    assert(!doc.querySelector('.paper-curl, .curl-source, .is-turning'), 'Changing motion mode cleans up a held page');
    assert(state() === beforeToggle, 'Changing motion mode keeps the current page');
    doc.querySelector('[data-motion-option="medium"]').click();
    await until(() => doc.documentElement.dataset.motion === 'medium');
    const beforeMediumTurn = state();
    doc.querySelector('#next').click();
    await until(() => doc.querySelector('.light-turn'));
    assert(!doc.querySelector('.paper-curl'), 'Medium animates one sheet without cloning artwork');
    await idle();
    assert(state() !== beforeMediumTurn, 'Medium still animates and completes the page turn');
    assert(!doc.querySelector('.light-turn'), 'Medium clears its temporary animation styles');
    const artworkAnimationSettings = () => [...doc.querySelectorAll('#stage .pg, #stage .pg *')].map((element) => {
      const style = win.getComputedStyle(element);
      return [style.animationName, style.animationDuration, style.animationDelay,
        style.animationTimingFunction, style.animationIterationCount, style.animationPlayState];
    });
    const mediumAnimations = JSON.stringify(artworkAnimationSettings());
    doc.querySelector('[data-motion-option="full"]').click();
    await until(() => doc.documentElement.dataset.motion === 'full');
    assert(JSON.stringify(artworkAnimationSettings()) === mediumAnimations,
      'Medium preserves exactly the same page animations and timing as Full');
    doc.querySelector('[data-motion-option="medium"]').click();
    await until(() => doc.documentElement.dataset.motion === 'medium');
    assert(errors.length === 0, `No browser errors (${errors.join(', ') || 'none'})`);
    report('ALL CHECKS PASSED');
  } catch (error) { report(`FAIL: ${error.message}`); }
  finally {
    if (savedMotion === null) localStorage.removeItem('c2c-motion');
    else localStorage.setItem('c2c-motion', savedMotion);
    lock(false);
  }
};
document.querySelector('#preview').onclick = async () => {
  lock(true);
  output.textContent = '';
  await reset(1100);
  doc.querySelector('#next').click();
  await idle();
  await drag({ amount: .8, top: true, hold: true });
  report('Curl held for visual inspection');
  document.querySelector('#release').disabled = false;
};
document.querySelector('#release').onclick = async () => {
  if (!held) return;
  pointer('pointerup', doc.querySelector('#stage'), held.x, held.y);
  await idle();
  report('Released');
  lock(false);
};
