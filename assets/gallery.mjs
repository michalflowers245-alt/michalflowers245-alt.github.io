// Native figures and original-image links remain usable without enhancement.
export function initGalleries(signal) {
  const controllers = new Map();
  const compactImage = matchMedia('(max-width: 600px)');
  const on = (element, type, fn, options = {}) => element?.addEventListener(type, fn, { ...options, signal });
  let modulePromise, viewer, requestId = 0, pendingTrigger = null;

  function isPlainImageClick(event, link = event.currentTarget) {
    return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
      && !link.hasAttribute('download') && (!link.target || link.target.toLowerCase() === '_self');
  }
  function readFocus(slide) {
    const value = (compactImage.matches && slide?.dataset.focusMobile) || slide?.dataset.focus;
    try { return value ? JSON.parse(value) : null; } catch { return null; }
  }
  function finishPending() {
    pendingTrigger?.removeAttribute('aria-busy');
    pendingTrigger?.removeAttribute('data-media-loading');
    pendingTrigger = null;
  }
  function cancelPending() { requestId++; finishPending(); }
  on(window, 'keydown', event => {
    if (pendingTrigger && event.key === 'Escape') { event.preventDefault(); cancelPending(); }
    else if (viewer?.isOpen && event.key === 'Escape') viewer.close();
  });
  signal.addEventListener('abort', () => { cancelPending(); viewer?.destroy(); }, { once: true });

  function open(controller, trigger) {
    const moduleURL = document.querySelector('script[data-media-module]')?.dataset.mediaModule;
    if (!moduleURL?.startsWith('/assets/runtime/')) return false;
    const id = ++requestId;
    finishPending();
    pendingTrigger = trigger;
    trigger?.setAttribute('aria-busy', 'true');
    trigger?.setAttribute('data-media-loading', '');
    const index = controller.index;
    const items = controller.slides.map(slide => {
      const image = slide.querySelector('img');
      const parse = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
      return {
        id: slide.dataset.imageId,
        src: slide.querySelector('[data-lightbox]').href,
        width: Number(slide.dataset.originalWidth || image.getAttribute('width')),
        height: Number(slide.dataset.originalHeight || image.getAttribute('height')),
        alt: image.alt,
        msrc: image.currentSrc || image.src,
        caption: (slide.querySelector('.gallery-caption-full') || slide.querySelector('figcaption'))?.textContent || '',
        focus: parse(slide.dataset.focus), focusMobile: parse(slide.dataset.focusMobile),
        kind: slide.dataset.kind
      };
    });
    const originalURL = items[index].src;
    const fromTrack = controller.slides.some(slide => slide.querySelector('[data-lightbox]') === trigger);
    modulePromise ||= import(moduleURL).catch(error => { modulePromise = null; throw error; });
    modulePromise.then(module => {
      if (signal.aborted || id !== requestId) return;
      viewer ||= module.createMediaViewer({ signal });
      finishPending();
      if (!viewer.open({ items, index, trigger, galleryId: controller.root.dataset.gallery,
        restoreFocusTarget: selected => fromTrack ? controller.slides[selected]?.querySelector('[data-lightbox]') : trigger,
        onIndexChange: selected => controller.select(items[selected].id) })) location.assign(originalURL);
    }).catch(() => {
      if (signal.aborted || id !== requestId) return;
      finishPending();
      // The unmodified original is the recovery path if the viewer cannot load.
      location.assign(originalURL);
    });
    return true;
  }

  document.querySelectorAll('[data-gallery]').forEach(root => {
    const track = root.querySelector('.gallery-track');
    const slides = [...root.querySelectorAll('.gallery-slide')];
    if (!track || !slides.length) return;
    const previous = root.querySelector('[data-previous]'), next = root.querySelector('[data-next]');
    const thumbs = [...root.querySelectorAll('[data-image-select]')];
    const focusEntry = root.querySelector('.gallery-focus-entry');
    let index = 0, frame = 0;
    const measurable = () => track.clientWidth > 0 && root.getClientRects().length > 0;
    function syncFocusLabel() {
      if (!focusEntry) return;
      const focus = readFocus(slides[index]);
      focusEntry.hidden = !focus;
      if (focus) focusEntry.querySelector('[data-focus-label]').textContent = focus.label;
    }
    on(compactImage, 'change', syncFocusLabel);
    function fitTrack() {
      if (measurable()) {
        root.style.setProperty('--gallery-height', `${slides[index].offsetHeight}px`);
        if (track.scrollTop) track.scrollTop = 0;
      }
    }
    function renderSelection(announce = true) {
      if (previous) previous.disabled = index === 0;
      if (next) next.disabled = index === slides.length - 1;
      const count = root.querySelector('[data-gallery-count]');
      if (count) count.textContent = `${index + 1} / ${slides.length}`;
      root.dataset.currentImage = slides[index].dataset.imageId;
      syncFocusLabel(); fitTrack();
      thumbs.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      const thumbnail = thumbs[index], strip = thumbnail?.parentElement;
      if (strip && measurable()) {
        const item = thumbnail.getBoundingClientRect(), bounds = strip.getBoundingClientRect();
        if (item.left < bounds.left + 4) strip.scrollLeft -= bounds.left + 4 - item.left;
        else if (item.right > bounds.right - 4) strip.scrollLeft += item.right - bounds.right + 4;
      }
      slides.forEach((slide, i) => { for (const target of slide.querySelectorAll('a,button')) target.tabIndex = i === index ? 0 : -1; });
      if (announce) root.dispatchEvent(new CustomEvent('gallery:change', { bubbles: true }));
    }
    const controller = {
      root, slides,
      get index() { return index; },
      get imageId() { return slides[index].dataset.imageId; },
      select(value) {
        const n = typeof value === 'string' ? slides.findIndex(slide => slide.dataset.imageId === value) : value;
        if (!Number.isFinite(n) || n < 0) return;
        const selected = Math.max(0, Math.min(slides.length - 1, Math.trunc(n)));
        const changed = selected !== index;
        index = selected;
        // A hidden world preview has zero offsets; retain its logical selection.
        if (measurable()) track.scrollTo({ left: slides[index].offsetLeft, behavior: 'instant' });
        renderSelection(changed);
      },
      measure() {
        if (measurable()) track.scrollTo({ left: slides[index].offsetLeft, behavior: 'instant' });
        renderSelection(false);
      }
    };
    function syncFromTrack() {
      frame = 0;
      if (!measurable()) return;
      const selected = slides.reduce((best, slide, i) => Math.abs(slide.offsetLeft - track.scrollLeft) < Math.abs(slides[best].offsetLeft - track.scrollLeft) ? i : best, 0);
      if (selected !== index) { index = selected; renderSelection(); }
    }
    on(track, 'scroll', () => { if (!frame) frame = requestAnimationFrame(syncFromTrack); }, { passive: true });
    on(previous, 'click', () => controller.select(index - 1));
    on(next, 'click', () => controller.select(index + 1));
    thumbs.forEach((button, i) => on(button, 'click', () => controller.select(i)));
    on(root.querySelector('[data-enlarge]'), 'click', event => open(controller, event.currentTarget));
    slides.forEach((slide, i) => {
      const image = slide.querySelector('img'), error = slide.querySelector('.media-error');
      let retryId = 0;
      const fail = () => { if (error) error.hidden = false; slide.dataset.loadState = 'error'; };
      on(image, 'error', fail);
      on(image, 'load', () => { if (error) error.hidden = true; slide.dataset.loadState = 'loaded'; fitTrack(); });
      if (image.complete && !image.naturalWidth) fail();
      on(slide.querySelector('[data-retry]'), 'click', () => {
        const id = ++retryId;
        if (error) error.hidden = true;
        slide.dataset.loadState = 'loading';
        const src = image.getAttribute('src'), srcset = image.getAttribute('srcset');
        image.removeAttribute('srcset'); image.removeAttribute('src');
        requestAnimationFrame(() => {
          if (signal.aborted || id !== retryId) return;
          if (srcset) image.setAttribute('srcset', srcset);
          if (src) image.src = src;
        });
      });
      on(slide.querySelector('[data-lightbox]'), 'click', event => {
        if (!isPlainImageClick(event)) return;
        controller.select(i);
        if (open(controller, event.currentTarget)) event.preventDefault();
      });
    });
    const controls = root.querySelector('.gallery-controls');
    if (controls) controls.hidden = false;
    if (slides.length === 1) { if (previous) previous.hidden = true; if (next) next.hidden = true; }
    const strip = root.querySelector('.gallery-thumbs');
    if (strip) strip.hidden = false;
    root.dataset.enhanced = 'true';
    const observer = new ResizeObserver(() => controller.measure());
    observer.observe(track); slides.forEach(slide => observer.observe(slide));
    signal.addEventListener('abort', () => { observer.disconnect(); cancelAnimationFrame(frame); }, { once: true });
    controllers.set(root.dataset.gallery, controller);
    renderSelection();
  });

  // One original-image link can point into the existing gallery from a world
  // preview or case introduction. Event delegation also covers revealed panels.
  on(document, 'click', event => {
    const link = event.target.closest?.('a[data-gallery-preview][data-gallery-image]');
    if (!link || !isPlainImageClick(event, link)) return;
    const controller = controllers.get(link.dataset.galleryPreview);
    const slide = controller?.slides.find(item => item.dataset.imageId === link.dataset.galleryImage);
    if (!slide || slide.querySelector('[data-lightbox]').href !== link.href) return;
    controller.select(link.dataset.galleryImage);
    if (open(controller, link)) event.preventDefault();
  });
  on(window, 'world:selection', event => controllers.get(event.detail?.gallery)?.measure());
  return controllers;
}
