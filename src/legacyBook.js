import { BUCKETS, DOODLES, NAMES, NOTE_COLORS, TILE_COLORS } from './bookData.js';
import { PAGE_COUNT, PAGE_META } from './pageManifest.js';
import { createPageCurl } from './pageCurl.js';

const PAPERS = ['#fbd9c6', '#fbeaa9', '#f8d0dc', '#e0d5f3', '#fcdcb2', '#d5ecd9', '#f6c9c0', '#fde5c8'];
const rot = (i) => (((i * 37) % 9) - 4) * 0.9;

function preparePage(page, index) {
  const key = PAGE_META[index].key;
  const doodles = DOODLES[key] || [];
  doodles.forEach(([id, position, rotation]) => {
    const viewBox = id === 's-rainbow' ? '0 0 60 34' : '0 0 40 40';
    page.insertAdjacentHTML(
      'beforeend',
      `<svg class="doodle" viewBox="${viewBox}" style="${position};transform:rotate(${rotation}deg)" aria-hidden="true"><use href="#${id}"></use></svg>`,
    );
  });

  const heading = page.querySelector('h2');
  if (heading && !page.classList.contains('backcover') && !page.classList.contains('titlepage')) {
    heading.classList.add('squig');
  }

  page.style.setProperty('--wash', 'rgba(255,255,255,.45)');
  page.style.setProperty('--wash2', 'rgba(255,255,255,.3)');
  if (key && key !== 'wic') {
    const paperIndex = PAGE_META.slice(0, index).filter((item) => item.key && item.key !== 'wic').length;
    page.style.setProperty('--pg-bg', PAPERS[paperIndex % PAPERS.length]);
  }
  if (index % 2) {
    page.style.setProperty('--wx', '12%');
    page.style.setProperty('--wx2', '94%');
  }
  const folio = page.querySelector('.folio');
  if (folio && PAGE_META[index].folio) folio.textContent = PAGE_META[index].folio;

  const wall = page.querySelector('#wall');
  if (wall) {
    NAMES.forEach((name, noteIndex) => {
      const note = document.createElement('div');
      note.className = 'note';
      note.style.transform = `rotate(${rot(noteIndex)}deg)`;
      note.style.setProperty('--note-phase', `${-((noteIndex * 7) % 17) * 0.21}s`);
      note.style.background = NOTE_COLORS[(noteIndex * 5) % NOTE_COLORS.length];
      note.innerHTML = `<i>#${String(noteIndex + 1).padStart(2, '0')}</i><b>${name}</b>`;
      wall.appendChild(note);
    });
  }

  const bucketList = page.querySelector('#buckets');
  if (bucketList) {
    BUCKETS.forEach((bucket) => {
      const row = document.createElement('div');
      row.className = 'bk';
      row.innerHTML = `<span>${bucket.name}</span><span class="dots">${bucket.ideas
        .map((idea, dotIndex) => `<s style="background:${bucket.color};--r:${rot(dotIndex + idea[0])}deg"></s>`)
        .join('')}</span><span class="n">${bucket.ideas.length}</span>`;
      bucketList.appendChild(row);
    });
  }

  page.querySelectorAll('.buckets, .qs, .tracker, .nametags, .tl, .legend').forEach((group) => {
    [...group.children].forEach((item, itemIndex) => {
      item.style.setProperty('--motion-index', itemIndex);
      item.style.setProperty('--motion-delay', `${itemIndex * 145}ms`);
    });
  });

  let tileIndex = index * 11;
  page.querySelectorAll('[data-tiles]').forEach((row) => {
    const size = row.dataset.size;
    [...row.dataset.tiles].forEach((character) => {
      const tile = document.createElement('span');
      if (character === ' ') {
        tile.className = 'tile sp';
        row.appendChild(tile);
        return;
      }
      tile.className = `tile ${size}`;
      tile.style.setProperty('--motion-index', row.querySelectorAll('.tile').length);
      tile.style.setProperty('--motion-delay', `${row.querySelectorAll('.tile').length * 135}ms`);
      tile.textContent = character;
      const color = size === 'q' ? '#f2b632' : TILE_COLORS[((tileIndex++) * 3) % TILE_COLORS.length];
      tile.style.background = color;
      if (color === '#4f78c4' || color === '#e8683a') tile.style.color = '#fbf5ea';
      tile.style.transform = `rotate(${((tileIndex * 53) % 7 - 3) * 1.1}deg)`;
      const jitter = (point) => ((point * 37 + tileIndex * 11) % 5) * 0.9;
      const points = [];
      for (let point = 0; point <= 8; point++) points.push(`${point * 12.5}% ${jitter(point)}%`);
      for (let point = 1; point <= 8; point++) points.push(`${100 - jitter(point + 3)}% ${point * 12.5}%`);
      for (let point = 7; point >= 0; point--) points.push(`${point * 12.5}% ${100 - jitter(point + 5)}%`);
      for (let point = 7; point >= 1; point--) points.push(`${jitter(point + 7)}% ${point * 12.5}%`);
      tile.style.clipPath = `polygon(${points.join(',')})`;
      row.appendChild(tile);
    });
  });
}

export async function initializeBook({ pageLoaders }) {
  const pagesHolder = document.getElementById('pages');
  const stage = document.getElementById('stage');
  const prevButton = document.getElementById('prev');
  const nextButton = document.getElementById('next');
  const count = document.getElementById('count');
  const pages = new Array(PAGE_COUNT);
  const pendingLoads = new Map();
  let mode = null;
  let state = 0;
  let leaves = [];
  let singleFace = null;
  let busy = false;
  let gesture = null;
  let activeTurn = null;
  let frame = 0;
  let disposed = false;
  const motionMode = () => document.documentElement.dataset.motion || 'medium';
  let activeScenePages = new Set();

  function createScenePage(page) {
    const scene = page.cloneNode(true);
    // Apply the first animation frame before the page can be painted.
    scene.classList.add('scene-play', 'scene-pending');
    return scene;
  }

  function mountInBook(index) {
    if (!pages[index] || mode !== 'book') return;
    const leaf = leaves[Math.floor(index / 2)];
    if (!leaf) return;
    const face = leaf.querySelector(index % 2 === 0 ? '.face.front' : '.face.back');
    face.replaceChildren(createScenePage(pages[index]));
  }

  async function ensurePage(index) {
    if (index < 0 || index >= PAGE_COUNT) return null;
    if (pages[index]) return pages[index];
    if (!pendingLoads.has(index)) {
      pendingLoads.set(index, (async () => {
        const module = await pageLoaders[index]();
        const wrapper = document.createElement('template');
        wrapper.innerHTML = module.default;
        const page = wrapper.content.firstElementChild;
        if (!page) throw new Error(`Page ${index + 1} is empty`);
        preparePage(page, index);
        page.querySelectorAll('img').forEach((image) => {
          image.loading = 'lazy';
          image.decoding = 'async';
        });
        pages[index] = page;
        pagesHolder.appendChild(page);
        mountInBook(index);
        return page;
      })());
    }
    return pendingLoads.get(index);
  }

  const lastPage = PAGE_COUNT - 1;
  function folioOf(index) {
    return PAGE_META[index]?.folio || null;
  }
  function maxState() {
    return mode === 'book' ? leaves.length : lastPage;
  }
  function labelFor() {
    if (busy) return 'กำลังเปิด…';
    if (mode === 'book') {
      if (state === 0) return 'ปก';
      if (state === leaves.length) return 'ปกหลัง';
      const folios = [folioOf(state * 2 - 1), folioOf(state * 2)].filter(Boolean);
      return folios.length ? `หน้า ${folios.join('–')}` : 'หน้าแรก';
    }
    if (state === 0) return 'ปก';
    if (state === lastPage) return 'ปกหลัง';
    return folioOf(state) ? `หน้า ${folioOf(state)}` : 'หน้าแรก';
  }
  function refresh() {
    prevButton.disabled = busy || state === 0;
    nextButton.disabled = busy || state === maxState();
    count.textContent = labelFor();
  }

  function playPageScene(page) {
    if (!page) return;
    // Resume the prepared scene without resetting its animation timeline.
    page.classList.remove('scene-pending');
  }

  function visibleBookPages() {
    const visibleIndices = [];
    if (state > 0) visibleIndices.push(state * 2 - 1);
    if (state < leaves.length) visibleIndices.push(state * 2);
    const nextVisible = new Set(visibleIndices);
    activeScenePages.forEach((index) => {
      if (!nextVisible.has(index)) {
        const leaf = leaves[Math.floor(index / 2)];
        const face = index % 2 === 0 ? '.face.front' : '.face.back';
        leaf?.querySelector(`${face} .pg`)?.classList.add('scene-pending');
      }
    });
    visibleIndices.forEach((index) => {
      if (activeScenePages.has(index)) return;
      const leaf = leaves[Math.floor(index / 2)];
      const face = index % 2 === 0 ? '.face.front' : '.face.back';
      playPageScene(leaf?.querySelector(`${face} .pg`));
    });
    activeScenePages = nextVisible;
  }

  function layoutBook() {
    const book = stage.querySelector('.book');
    leaves.forEach((leaf, index) => {
      leaf.style.zIndex = index < state ? index + 1 : leaves.length - index + 1;
      leaf.classList.toggle('active', index === state || index === state - 1);
    });
    book.classList.toggle('closed-front', state === 0);
    book.classList.toggle('closed-back', state === leaves.length);
    refresh();
    visibleBookPages();
  }

  function buildBook() {
    activeScenePages = new Set();
    stage.innerHTML = '';
    leaves = [];
    const book = document.createElement('div');
    book.className = 'book';
    for (let index = 0; index < PAGE_COUNT; index += 2) {
      const leaf = document.createElement('div');
      leaf.className = 'leaf';
      const front = document.createElement('div');
      front.className = 'face front';
      const back = document.createElement('div');
      back.className = 'face back';
      leaf.append(front, back);
      book.appendChild(leaf);
      leaves.push(leaf);
    }
    stage.appendChild(book);
    state = Math.min(state, leaves.length);
    leaves.forEach((leaf, index) => {
      leaf.classList.toggle('turned', index < state);
      mountInBook(index * 2);
      mountInBook(index * 2 + 1);
    });
    layoutBook();
  }

  async function showSingle({ play = true } = {}) {
    const page = await ensurePage(state);
    if (!page || !singleFace) return;
    singleFace.replaceChildren(createScenePage(page));
    const shown = singleFace.firstElementChild;
    if (play) playPageScene(shown);
    activeScenePages = new Set([state]);
    refresh();
  }

  function buildSingle() {
    activeScenePages = new Set();
    stage.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'single';
    singleFace = document.createElement('div');
    singleFace.className = 'face';
    wrap.appendChild(singleFace);
    stage.appendChild(wrap);
    showSingle();
  }

  function finishTurn(turn, commit) {
    if (activeTurn !== turn) return;
    cancelAnimationFrame(frame);
    turn.curl?.remove();
    turn.restoreFaces?.();
    if (!commit) turn.previewPages?.forEach(({ page }) => page.classList.add('scene-pending'));
    turn.source.classList.remove('light-turn');
    ['transform', 'opacity', 'transform-origin'].forEach((property) => turn.source.style.removeProperty(property));
    if (commit) state += turn.direction;
    if (mode === 'book') {
      turn.source.classList.toggle('turned', state > turn.leafIndex);
      turn.source.classList.remove('curl-source');
      layoutBook();
      turn.book.style.removeProperty('transform');
      turn.book.style.removeProperty('transition');
    } else {
      if (commit) {
        turn.source.remove();
        singleFace = turn.incoming;
        playPageScene(singleFace.firstElementChild);
        activeScenePages = new Set([state]);
      } else {
        turn.incoming.remove();
        turn.source.classList.remove('curl-source');
      }
    }
    activeTurn = null;
    busy = false;
    stage.classList.remove('is-turning');
    refresh();
    if (!disposed) void pickMode();
  }

  function settleTurn(turn, commit) {
    if (activeTurn !== turn || turn.settling) return;
    turn.settling = true;
    turn.commit = commit;
    const from = turn.progress;
    const to = commit ? 1 : 0;
    const vertical = turn.vertical;
    const started = performance.now();
    if (turn.motion === 'none') {
      finishTurn(turn, commit);
      return;
    }
    const medium = turn.motion === 'medium';
    const remaining = Math.abs(to - from);
    // Give the simple sheet time to accelerate and settle instead of snapping
    // through most of its rotation in the first few frames.
    const duration = medium
      ? (commit ? 600 : 360) * Math.max(.55, Math.sqrt(remaining))
      : (commit ? 560 : 280) * Math.max(.4, remaining);
    function tick(now) {
      if (disposed || activeTurn !== turn) return;
      const time = duration ? Math.min(1, (now - started) / duration) : 1;
      const eased = medium
        ? (1 - Math.cos(Math.PI * time)) / 2
        : 1 - Math.pow(1 - time, 3);
      turn.progress = from + (to - from) * eased;
      turn.render?.(turn.progress, vertical * (1 - eased));
      if (time < 1) frame = requestAnimationFrame(tick);
      else finishTurn(turn, commit);
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  }

  function followGesture(turn, drag) {
    const distance = -turn.direction * (drag.x - drag.startX);
    turn.progress = Math.max(.015, Math.min(.98, distance / (turn.bounds.width * 2)));
    turn.vertical = drag.y - drag.startY;
    turn.render?.(turn.progress, turn.vertical);
    if (drag.ended) {
      const flick = distance > 45 && -turn.direction * drag.velocity > .45;
      settleTurn(turn, !drag.cancelled && (!drag.moved || turn.progress > .23 || flick));
    }
  }

  async function go(direction, drag = null) {
    if (busy || disposed) return;
    const next = state + direction;
    if (next < 0 || next > maxState()) return;
    busy = true;
    refresh();
    let incoming;
    try {
      const requiredPages = mode === 'book'
        ? [next * 2 - 1, next * 2, direction > 0 ? state * 2 : state * 2 - 1]
        : [next];
      await Promise.all(requiredPages.map(ensurePage));
      if (disposed) return;
      const leafIndex = direction > 0 ? state : state - 1;
      const source = mode === 'book' ? leaves[leafIndex] : singleFace;
      const book = mode === 'book' ? stage.querySelector('.book') : null;
      if (book) {
        // A second turn can begin while a closed cover is still centering.
        // Hold the binding still so its paper stays attached during the drag.
        book.style.transform = getComputedStyle(book).transform;
        book.style.transition = 'none';
      }
      const face = mode === 'book' ? source.querySelector(direction > 0 ? '.front' : '.back') : source;
      const back = mode === 'book' ? source.querySelector(direction > 0 ? '.back .pg' : '.front .pg') : null;
      const bounds = face.getBoundingClientRect();
      if (mode === 'single') {
        incoming = document.createElement('div');
        incoming.className = 'face';
        incoming.appendChild(createScenePage(pages[next]));
        source.parentElement.insertBefore(incoming, source);
      }
      const turn = { source, incoming, book, leafIndex, direction, bounds, progress: 0, vertical: 0, motion: motionMode() };
      activeTurn = turn;
      if (mode === 'book') {
        // Only paint the current spread and the pages being uncovered.
        leaves.forEach((leaf, index) => leaf.classList.toggle('active',
          index === state || index === state - 1 || index === next || index === next - 1));
      }
      if (turn.motion === 'full') {
        turn.curl = createPageCurl({
          stage, front: face.querySelector('.pg'), back, bounds, direction,
          touchY: drag ? drag.startY - bounds.top : bounds.height * .8,
        });
        source.classList.add('curl-source');
        turn.render = turn.curl.render;
      } else if (turn.motion === 'medium') {
        // Move one existing sheet; no artwork clones, clip paths, or blur filters.
        source.classList.add('light-turn');
        if (mode === 'book') {
          source.style.zIndex = '200';
          const frontFace = source.querySelector('.front');
          const backFace = source.querySelector('.back');
          // Project each face independently. Rotating the parent can flatten
          // or cull its back face, leaving the old left page exposed until commit.
          source.style.transform = 'none';
          turn.restoreFaces = () => {
            [frontFace, backFace].forEach((item) => item.style.removeProperty('transform'));
          };
          turn.previewPages = [
            { index: direction > 0 ? next * 2 : next * 2 - 1, after: 0 },
            { index: direction > 0 ? leafIndex * 2 + 1 : leafIndex * 2, after: .5 },
          ].map((entry) => ({
            ...entry,
            page: leaves[Math.floor(entry.index / 2)]?.querySelector(entry.index % 2 === 0 ? '.front .pg' : '.back .pg'),
          })).filter(({ index, page }) => page && !activeScenePages.has(index));
          turn.render = (progress) => {
            const position = direction > 0 ? progress : 1 - progress;
            const projectedWidth = Math.cos(Math.PI * position);
            frontFace.style.transform = `scaleX(${Math.max(0, projectedWidth)})`;
            backFace.style.transform = `translateX(${Math.min(0, projectedWidth) * bounds.width}px) scaleX(${Math.max(0, -projectedWidth)})`;
            turn.previewPages.forEach((entry) => {
              const revealed = progress > entry.after;
              if (entry.revealed === revealed) return;
              entry.revealed = revealed;
              entry.page.classList.toggle('scene-pending', !revealed);
            });
          };
        } else {
          source.style.transformOrigin = direction > 0 ? 'left center' : 'right center';
          turn.render = (progress) => {
            source.style.transform = `rotateY(${-direction * 88 * progress}deg)`;
            // Keep the sheet solid until it approaches the edge-on position.
            source.style.opacity = 1 - Math.pow(progress, 4);
          };
        }
        turn.render(0);
      }
      stage.classList.add('is-turning');
      if (drag) followGesture(turn, drag);
      else settleTurn(turn, true);
    } catch (error) {
      console.error('Could not turn the page:', error);
      if (activeTurn) finishTurn(activeTurn, false);
      else {
        incoming?.remove();
        busy = false;
        refresh();
      }
    }
  }

  async function pickMode() {
    const nextMode = window.innerWidth < 760 ? 'single' : 'book';
    if (nextMode === mode || busy) return;
    if (mode === 'book' && nextMode === 'single') state = Math.min(state === 0 ? 0 : state * 2 - 1, lastPage);
    else if (mode === 'single' && nextMode === 'book') state = Math.min(Math.ceil(state / 2), Math.ceil(PAGE_COUNT / 2));
    mode = nextMode;
    if (mode === 'book') {
      const requiredPages = [];
      if (state > 0) requiredPages.push(state * 2 - 1);
      if (state < Math.ceil(PAGE_COUNT / 2)) requiredPages.push(state * 2);
      await Promise.all(requiredPages.map(ensurePage));
      buildBook();
    } else {
      await ensurePage(state);
      buildSingle();
    }
    refresh();
  }

  const handlePrev = () => go(-1);
  const handleNext = () => go(1);
  const handleKey = (event) => {
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'Escape' && activeTurn && !activeTurn.settling) {
      if (gesture) gesture.cancelled = true;
      settleTurn(activeTurn, false);
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      go(event.key === 'ArrowRight' ? 1 : -1);
    }
  };
  const handlePointerDown = (event) => {
    if (busy || gesture || !event.isPrimary || event.button !== 0 ||
        event.target.closest('a, button, input, textarea, select')) return;
    const face = event.target.closest('.face');
    if (!face) return;
    const bounds = face.getBoundingClientRect();
    const direction = mode === 'book'
      ? (face.closest('.leaf').classList.contains('turned') ? -1 : 1)
      : (event.clientX < bounds.left + bounds.width * .3 ? -1 : 1);
    gesture = {
      id: event.pointerId, direction, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, time: event.timeStamp, velocity: 0, moved: false, started: false,
    };
    stage.setPointerCapture(event.pointerId);
    // A held touch gently lifts the paper even before the reader starts dragging.
    gesture.timer = window.setTimeout(() => {
      if (!gesture || gesture.started) return;
      gesture.started = true;
      void go(gesture.direction, gesture);
    }, 100);
  };
  const handlePointerMove = (event) => {
    const drag = gesture;
    if (!drag || drag.id !== event.pointerId || drag.ended) return;
    drag.velocity = (event.clientX - drag.x) / Math.max(1, event.timeStamp - drag.time);
    drag.time = event.timeStamp;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) drag.moved = true;
    if (!drag.started && drag.moved) {
      clearTimeout(drag.timer);
      if (mode === 'single') drag.direction = drag.x < drag.startX ? 1 : -1;
      drag.started = true;
      void go(drag.direction, drag);
    }
    if (activeTurn && !activeTurn.settling) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (activeTurn && !activeTurn.settling) followGesture(activeTurn, drag);
      });
    }
  };
  const handlePointerEnd = (event) => {
    const drag = gesture;
    if (!drag || drag.id !== event.pointerId) return;
    clearTimeout(drag.timer);
    drag.ended = true;
    drag.cancelled ||= event.type !== 'pointerup';
    if (event.timeStamp - drag.time > 100) drag.velocity = 0;
    gesture = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (!drag.started && !drag.cancelled) void go(drag.direction, drag);
    else if (activeTurn && !activeTurn.settling) followGesture(activeTurn, drag);
  };
  const handleResize = () => {
    if (gesture) {
      clearTimeout(gesture.timer);
      gesture.cancelled = true;
      gesture.ended = true;
      gesture = null;
    }
    if (activeTurn) finishTurn(activeTurn, false);
    else void pickMode();
  };
  const handleMotionChange = () => {
    if (gesture) {
      clearTimeout(gesture.timer);
      gesture.cancelled = true;
      gesture.ended = true;
      const id = gesture.id;
      gesture = null;
      if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    }
    if (activeTurn) finishTurn(activeTurn, activeTurn.settling && activeTurn.commit);
  };

  await Promise.all([ensurePage(0), ensurePage(1)]);
  mode = window.innerWidth < 760 ? 'single' : 'book';
  if (mode === 'book') buildBook();
  else buildSingle();
  prevButton.addEventListener('click', handlePrev);
  nextButton.addEventListener('click', handleNext);
  document.addEventListener('keydown', handleKey);
  stage.addEventListener('pointerdown', handlePointerDown);
  stage.addEventListener('pointermove', handlePointerMove);
  stage.addEventListener('pointerup', handlePointerEnd);
  stage.addEventListener('pointercancel', handlePointerEnd);
  stage.addEventListener('lostpointercapture', handlePointerEnd);
  window.addEventListener('resize', handleResize);
  window.addEventListener('c2c-motion-change', handleMotionChange);
  refresh();

  return () => {
    disposed = true;
    clearTimeout(gesture?.timer);
    cancelAnimationFrame(frame);
    activeTurn?.curl?.remove();
    prevButton.removeEventListener('click', handlePrev);
    nextButton.removeEventListener('click', handleNext);
    document.removeEventListener('keydown', handleKey);
    stage.removeEventListener('pointerdown', handlePointerDown);
    stage.removeEventListener('pointermove', handlePointerMove);
    stage.removeEventListener('pointerup', handlePointerEnd);
    stage.removeEventListener('pointercancel', handlePointerEnd);
    stage.removeEventListener('lostpointercapture', handlePointerEnd);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('c2c-motion-change', handleMotionChange);
  };
}
