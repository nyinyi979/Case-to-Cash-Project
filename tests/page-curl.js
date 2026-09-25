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
async function reset(width) {
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
  assert(panels.length === 14, 'Curved paper surface appears during the drag');
  assert(panels.every((panel) => !panel.style.transform.includes('NaN') && !panel.style.clipPath.includes('NaN')), 'Fold geometry stays finite');
  held = { x: endX, y: endY };
  if (hold) return;
  pointer(cancel ? 'pointercancel' : 'pointerup', doc.querySelector('#stage'), endX, endY);
  await idle();
  assert(!doc.querySelector('.paper-curl, .curl-source'), 'Temporary curl surfaces are cleaned up');
}
document.querySelector('#run').onclick = async () => {
  lock(true);
  output.textContent = 'Running…\n';
  errors = [];
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
    assert(errors.length === 0, `No browser errors (${errors.join(', ') || 'none'})`);
    report('ALL CHECKS PASSED');
  } catch (error) { report(`FAIL: ${error.message}`); }
  finally { lock(false); }
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
