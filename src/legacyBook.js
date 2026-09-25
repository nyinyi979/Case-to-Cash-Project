import { BUCKETS, DOODLES, NAMES, NOTE_COLORS, TILE_COLORS } from './bookData.js';
import { PAGE_COUNT, PAGE_META } from './pageManifest.js';

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

function delay(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
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
  let touchStartX = null;
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
      leaf.addEventListener('click', () => go(leaf.classList.contains('turned') ? -1 : 1));
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
    wrap.addEventListener('click', (event) => {
      const bounds = wrap.getBoundingClientRect();
      go(event.clientX < bounds.left + bounds.width * 0.3 ? -1 : 1);
    });
    showSingle();
  }

  async function go(direction) {
    if (busy) return;
    const next = state + direction;
    if (next < 0 || next > maxState()) return;
    busy = true;
    refresh();
    try {
      if (mode === 'book') {
        const requiredPages = [];
        if (next > 0) requiredPages.push(next * 2 - 1);
        if (next < leaves.length) requiredPages.push(next * 2);
        await Promise.all(requiredPages.map(ensurePage));
        const leaf = direction > 0 ? leaves[state] : leaves[state - 1];
        const previousState = state;
        leaf.style.zIndex = 200;
        leaf.classList.toggle('turned', direction > 0);
        state = next;
        leaves.forEach((item, index) =>
          item.classList.toggle('active', index === state || index === state - 1 ||
            index === previousState || index === previousState - 1),
        );
        const book = stage.querySelector('.book');
        book.classList.toggle('closed-front', state === 0);
        book.classList.toggle('closed-back', state === leaves.length);
        refresh();
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Let the paper reveal the prepared scene, then play while it settles.
        await delay(reducedMotion ? 0 : 400);
        requiredPages.forEach((index) => {
          const face = index % 2 === 0 ? '.face.front' : '.face.back';
          playPageScene(leaves[Math.floor(index / 2)]?.querySelector(`${face} .pg`));
        });
        await delay(reducedMotion ? 0 : 450);
        layoutBook();
      } else {
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Load before moving the sheet, so a slow chunk never leaves a blank book.
        const page = await ensurePage(next);
        const outgoing = singleFace;
        const incoming = document.createElement('div');
        incoming.className = 'face';
        incoming.appendChild(createScenePage(page));
        outgoing.parentElement.appendChild(incoming);
        outgoing.setAttribute('aria-hidden', 'true');
        outgoing.style.pointerEvents = 'none';
        const turning = direction > 0 ? outgoing : incoming;
        outgoing.style.zIndex = direction > 0 ? '2' : '1';
        incoming.style.zIndex = direction > 0 ? '1' : '2';
        state = next;
        singleFace = incoming;
        activeScenePages = new Set([state]);
        if (reducedMotion) {
          outgoing.remove();
          playPageScene(incoming.firstElementChild);
        } else {
          // Forward lifts the current sheet; backward lays the previous sheet down.
          // The other page remains flat beneath it throughout the same motion.
          turning.classList.add('turning-sheet');
          const poses = [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-100deg)' }];
          const turn = turning.animate(direction > 0 ? poses : [...poses].reverse(), {
            duration: 680,
            easing: 'cubic-bezier(.32,.05,.22,1)',
            fill: 'both',
          });
          await delay(220);
          playPageScene(incoming.firstElementChild);
          await turn.finished;
          outgoing.remove();
          turn.cancel();
          incoming.classList.remove('turning-sheet');
        }
        incoming.style.removeProperty('z-index');
      }
    } finally {
      busy = false;
      refresh();
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
    if (event.key === 'ArrowRight') go(1);
    if (event.key === 'ArrowLeft') go(-1);
  };
  const handleTouchStart = (event) => { touchStartX = event.touches[0].clientX; };
  const handleTouchEnd = (event) => {
    if (touchStartX === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
    touchStartX = null;
  };

  await Promise.all([ensurePage(0), ensurePage(1)]);
  mode = window.innerWidth < 760 ? 'single' : 'book';
  if (mode === 'book') buildBook();
  else buildSingle();
  prevButton.addEventListener('click', handlePrev);
  nextButton.addEventListener('click', handleNext);
  document.addEventListener('keydown', handleKey);
  stage.addEventListener('touchstart', handleTouchStart, { passive: true });
  stage.addEventListener('touchend', handleTouchEnd);
  window.addEventListener('resize', pickMode);
  refresh();

  return () => {
    prevButton.removeEventListener('click', handlePrev);
    nextButton.removeEventListener('click', handleNext);
    document.removeEventListener('keydown', handleKey);
    stage.removeEventListener('touchstart', handleTouchStart);
    stage.removeEventListener('touchend', handleTouchEnd);
    window.removeEventListener('resize', pickMode);
  };
}
