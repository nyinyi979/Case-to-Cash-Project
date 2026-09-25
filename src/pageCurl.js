const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Clip a sheet against a line in paper coordinates.
export function clipPaper(points, normal, limit, keepBelow = true) {
  const result = [];
  const distance = ([x, y]) => (x * normal.x + y * normal.y - limit) * (keepBelow ? 1 : -1);
  points.forEach((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const a = distance(previous);
    const b = distance(point);
    if ((a <= 0) !== (b <= 0)) {
      const t = a / (a - b);
      result.push([previous[0] + (point[0] - previous[0]) * t, previous[1] + (point[1] - previous[1]) * t]);
    }
    if (b <= 0) result.push(point);
  });
  return result;
}

const polygon = (points) => points.length < 3
  ? 'polygon(0 0, 0 0, 0 0)'
  : `polygon(${points.map(([x, y]) => `${x.toFixed(3)}px ${y.toFixed(3)}px`).join(',')})`;

function freezeArtwork(source) {
  if (!source) return null;
  const copy = source.cloneNode(true);
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [copy, ...copy.querySelectorAll('*')];
  // Preserve the current illustration frame when lifting an already-open page.
  // Pausing a fresh clone alone would jump every animation back to its first frame.
  const animated = new Set(source.getAnimations({ subtree: true }).map((animation) => animation.effect?.target));
  originals.forEach((element, index) => {
    if (!animated.has(element)) return;
    const style = getComputedStyle(element);
    copies[index].style.setProperty('animation', 'none', 'important');
    ['transform', 'translate', 'rotate', 'scale', 'opacity', 'visibility', 'clip-path', 'filter'].forEach((property) => {
      copies[index].style.setProperty(property, style.getPropertyValue(property));
    });
  });
  return copy;
}

// The bend is a half-cylinder. Narrow strips project its curved surface,
// keeping live HTML artwork crisp without a canvas snapshot or dependencies.
export function createPageCurl({ stage, front, back, bounds, direction, touchY }) {
  const width = bounds.width;
  const height = bounds.height;
  const stageBounds = stage.getBoundingClientRect();
  const sheet = document.createElement('div');
  sheet.className = 'paper-curl';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.inert = true;
  Object.assign(sheet.style, {
    left: `${bounds.left - stageBounds.left}px`, top: `${bounds.top - stageBounds.top}px`,
    width: `${width}px`, height: `${height}px`,
  });
  const rectangle = [[0, 0], [width, 0], [width, height], [0, height]];
  const anchor = { x: direction > 0 ? width : 0, y: clamp(touchY, 0, height) };
  const frontArtwork = freezeArtwork(front);
  const backArtwork = freezeArtwork(back);
  const shadow = document.createElement('div');
  shadow.className = 'curl-cast-shadow';
  const shadowBand = document.createElement('div');
  shadowBand.className = 'curl-shadow-band';
  shadow.appendChild(shadowBand);
  sheet.appendChild(shadow);
  function panel(isBack, shade = 0) {
    const element = document.createElement('div');
    element.className = `curl-panel face ${isBack ? 'back' : 'front'}`;
    const art = (isBack ? backArtwork : frontArtwork)?.cloneNode(true);
    if (art) {
      if (isBack) art.style.transform = 'scaleX(-1)';
      element.appendChild(art);
    } else element.classList.add('curl-blank');
    const light = document.createElement('div');
    light.className = 'curl-light';
    light.style.background = shade < 0 ? `rgba(255,255,255,${-shade})` : `rgba(65,45,31,${shade})`;
    element.appendChild(light);
    sheet.appendChild(element);
    return element;
  }
  const flat = panel(false);
  const folded = panel(true, .035);
  // Full-page DOM copies are costly, especially for illustrated SVG pages.
  const stripCount = width < 400 ? 4 : 6;
  const strips = Array.from({ length: stripCount }, (_, index) => {
    const theta = (index + .5) / stripCount * Math.PI;
    return panel(index >= stripCount / 2, .19 * Math.sin(theta) - .12 * Math.cos(theta));
  });
  stage.appendChild(sheet);

  function render(progress, vertical = 0) {
    const p = clamp(progress, 0, 1);
    const travel = Math.max(.2, width * 2 * p);
    // Flatten the fold at the spine so the last frame exactly fits its destination.
    const dy = (vertical + (height * .5 - anchor.y) * .2 * Math.sin(Math.PI * p)) * Math.sin(Math.PI * p);
    const tip = { x: anchor.x - direction * travel, y: anchor.y + clamp(dy, -height * .32, height * .32) };
    const length = Math.hypot(anchor.x - tip.x, anchor.y - tip.y);
    const normal = { x: (anchor.x - tip.x) / length, y: (anchor.y - tip.y) / length };
    const middle = ((anchor.x + tip.x) * normal.x + (anchor.y + tip.y) * normal.y) / 2;
    const radius = Math.min(width * .065, length * .12) * Math.sin(Math.PI * p);
    const start = middle - Math.PI * radius / 2;
    const end = middle + Math.PI * radius / 2;
    const transform = (scale, offset) => {
      const { x, y } = normal;
      return `matrix(${1 + (scale - 1) * x * x},${(scale - 1) * x * y},${(scale - 1) * x * y},${1 + (scale - 1) * y * y},${offset * x},${offset * y})`;
    };
    flat.style.clipPath = polygon(clipPaper(rectangle, normal, start));
    folded.style.clipPath = polygon(clipPaper(rectangle, normal, end, false));
    folded.style.transform = transform(-1, middle * 2);
    strips.forEach((strip, index) => {
      const lower = start + Math.PI * radius * index / stripCount;
      const upper = start + Math.PI * radius * (index + 1) / stripCount;
      const theta = (index + .5) * Math.PI / stripCount;
      const scale = Math.cos(theta);
      const center = (lower + upper) / 2;
      strip.style.clipPath = polygon(clipPaper(clipPaper(rectangle, normal, lower - .3, false), normal, upper + .3));
      strip.style.transform = transform(scale, start + radius * Math.sin(theta) - scale * center);
      strip.style.visibility = radius < .1 ? 'hidden' : 'visible';
    });
    // A small gradient at the crease avoids filtering the whole moving sheet.
    const extent = width + height;
    shadowBand.style.width = `${Math.max(1, radius * 2)}px`;
    shadowBand.style.height = `${extent * 2}px`;
    shadowBand.style.transform = `matrix(${normal.x},${normal.y},${-normal.y},${normal.x},${normal.x * start + normal.y * extent},${normal.y * start - normal.x * extent})`;
    shadow.style.opacity = Math.sin(Math.PI * p);
  }
  render(0);
  return { render, remove: () => sheet.remove() };
}
