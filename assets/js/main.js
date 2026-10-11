(() => {
  'use strict';

  const BW = window.BW || {};
  const studio = BW.studio || {};
  const films = BW.films || [];
  const doc = document.documentElement;
  const page = document.body.dataset.page;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const connection = navigator.connection || {};
  // Only genuinely slow 2G switches film off. Chrome labels many high-latency Indian broadband and 4G links "3g",
  // so those still get film — just fewer players at once and fetched closer to the screen.
  const slowNetwork = /(^|-)2g$/.test(connection.effectiveType || '');
  const modestNetwork = connection.effectiveType === '3g';
  const cssOk = q => !!(window.CSS && CSS.supports && CSS.supports(q));
  const motionVideo = !reduceMotion && !connection.saveData && !slowNetwork && cssOk('width: 1cqw') && cssOk('translate: 1px');

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stillName = f => f.still || 'maxresdefault';
  // Stills are served with the site (assets/stills/<slug>.webp) so pages look complete even where YouTube is blocked;
  // YouTube's copy of the same frame is only the fallback, e.g. for a newly added film without a local still yet.
  const still = f => `assets/stills/${f.slug}.webp`;
  const stillJpeg = f => `assets/stills/${f.slug}.jpg|https://i.ytimg.com/vi/${f.youtube}/${stillName(f)}.jpg`;
  const focusOf = f => String(f.focus || '').replace(/[^0-9.% a-z]/gi, '').trim();
  const stillVars = f => {
    const [px, py] = focusOf(f).split(/\s+/);
    return [
      f.zoom && f.zoom !== 1 ? `--z:${Number(f.zoom)}` : '',
      focusOf(f) ? `--pos:${focusOf(f)}` : '',
      px ? `--px:${px}` : '',
      py ? `--py:${py}` : ''
    ].filter(Boolean).join(';');
  };
  const applyStillVars = (el, f) => {
    el.style.setProperty('--z', f.zoom || 1);
    if (focusOf(f)) el.style.setProperty('--pos', focusOf(f)); else el.style.removeProperty('--pos');
  };
  const filmHref = f => `film.html?f=${encodeURIComponent(f.slug)}`;
  const bySlug = slug => films.find(f => f.slug === slug);
  const numberOf = f => pad2(films.indexOf(f) + 1);
  const metaOf = f => [f.category, f.place].filter(Boolean).join(' · ');
  const titleHTML = t => esc(t).replace(/&amp;/g, '<em class="amp">&amp;</em>');
  const watchUrl = f => `https://www.youtube.com/watch?v=${encodeURIComponent(f.youtube)}`;
  const imgHTML = (f, { cls = '', eager = false } = {}) => {
    const vars = stillVars(f);
    return `<img${cls ? ` class="${cls}"` : ''}${vars ? ` style="${vars}"` : ''} src="${still(f)}" data-fallback="${stillJpeg(f)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  };
  const blockedHTML = f => `
    <div class="player__blocked">
      <p class="eyebrow">This film plays on YouTube</p>
      <a class="btn" href="${watchUrl(f)}" target="_blank" rel="noopener">Watch ${esc(f.title)}</a>
    </div>`;

  // A still that fails to load tries the next source in its data-fallback list ('a|b|c').
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
    const rest = img.dataset.fallback.split('|').filter(Boolean);
    const next = rest.shift();
    img.dataset.fallback = rest.join('|');
    if (next) img.src = next;
  }, true);

  /* ---------- Holds: anything that should pause every moving film ---------- */

  const holds = new Set();
  const MOTION_KEY = 'bw-motion-paused';
  try { if (localStorage.getItem(MOTION_KEY) === '1') holds.add('user'); } catch (err) { /* storage unavailable */ }
  const setHold = (reason, on) => {
    const had = holds.has(reason);
    if (on === had) return;
    if (on) holds.add(reason); else holds.delete(reason);
    document.dispatchEvent(new CustomEvent('bw:holds'));
  };
  const held = () => holds.size > 0;
  document.addEventListener('visibilitychange', () => setHold('hidden', document.hidden));
  if (document.hidden) holds.add('hidden');

  /* ---------- YouTube ---------- */

  const YT_API = 'https://www.youtube.com/iframe_api';
  let ytReady = null;
  const loadYouTube = () => ytReady || (ytReady = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return; }
    let api = document.querySelector(`script[src="${YT_API}"]`);
    const fail = () => {
      clearTimeout(timer);
      if (api) api.remove();
      ytReady = null;
      reject(new Error('YouTube is unavailable on this network'));
    };
    const timer = setTimeout(fail, 10000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); if (typeof previous === 'function') previous(); resolve(window.YT); };
    if (api) return;
    api = document.createElement('script');
    api.src = YT_API;
    api.async = true;
    api.onerror = fail;
    document.head.appendChild(api);
  }));

  const QUIET_VARS = { autoplay: 1, mute: 1, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, iv_load_policy: 3, fs: 0, cc_load_policy: 0 };
  const hideCaptions = p => { try { p.unloadModule('captions'); p.unloadModule('cc'); } catch (err) { /* module absent */ } };
  // 100: removed/private, 101/150: owner disallows embedding, 153: missing referrer.
  const BLOCKED_CODES = [100, 101, 150, 153];

  // Plays a film with sound. If YouTube cannot be reached or refuses the film, onBlocked shows a link out instead,
  // so the visitor never faces an endless black box.
  function mountPlayer(container, f, onBlocked) {
    const slot = document.createElement('div');
    Array.prototype.slice.call(container.children).forEach(el => { if (!el.classList.contains('player__poster')) el.remove(); });
    container.appendChild(slot);
    let settled = false;
    const blocked = () => { if (settled) return; settled = true; onBlocked(); };
    const watchdog = setTimeout(blocked, 15000);
    return loadYouTube().then(YT => (!slot.isConnected ? null : new YT.Player(slot, {
      videoId: f.youtube,
      host: 'https://www.youtube-nocookie.com',
      playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, origin: location.origin },
      events: {
        onReady: e => {
          settled = true;
          clearTimeout(watchdog);
          e.target.getIframe().setAttribute('title', `${f.title} — film`);
          e.target.playVideo();
        },
        onError: e => { if (BLOCKED_CODES.includes(e.data)) { settled = false; blocked(); } }
      }
    }))).catch(() => { clearTimeout(watchdog); blocked(); return null; });
  }

  /* ---------- Background film loops ---------- */

  // YouTube draws its own buttons and title for about 4s whenever a film starts, resumes, seeks or rebuffers.
  // A film is only ever shown once it has played cleanly for longer than that, and before any jump back to the
  // start of its loop it first fades out to its still — so YouTube's buttons are never seen.
  const CLEAN_MS = 4700;
  const FADE_MS = 1300;
  const OUTRO_MARGIN = 8;
  const PREVIEW_LENGTH = 30;
  const DEFAULT_PREVIEW_START = 30;

  function quietLoop(player, YT, { start, end, onStart = () => {}, onClean, onDirty }) {
    const S = YT.PlayerState;
    let since = 0;
    let started = false;
    let jumping = false;
    let afterJump = false;
    let timer = 0;
    let fallback = 0;
    let poll = 0;
    const clearTimers = () => { clearTimeout(timer); clearTimeout(fallback); timer = 0; fallback = 0; };
    const arm = reason => {
      clearTimers();
      since = performance.now();
      started = true;
      onStart(reason);
      timer = setTimeout(() => { if (!jumping) onClean(); }, CLEAN_MS);
    };
    const disarm = () => { clearTimers(); since = 0; onDirty(); };
    const loopEnd = () => {
      const duration = player.getDuration ? player.getDuration() : 0;
      return Math.min(end, duration ? duration - OUTRO_MARGIN : Infinity);
    };
    const jumpBack = () => {
      jumping = true;
      disarm();
      setTimeout(() => {
        jumping = false;
        afterJump = true;
        player.seekTo(start, true);
        player.playVideo();
        // A seek inside already-buffered footage may not report a fresh PLAYING state; re-arm regardless.
        fallback = setTimeout(() => { if (!since && player.getPlayerState() === S.PLAYING) { afterJump = false; arm('loop'); } }, 900);
      }, FADE_MS);
    };
    const tick = () => {
      if (jumping || !since) return;
      const stop = loopEnd();
      if (stop > start && player.getCurrentTime() >= stop - FADE_MS / 1000) jumpBack();
    };
    const onState = state => {
      if (state === S.PLAYING) {
        hideCaptions(player);
        if (!poll) poll = setInterval(tick, 250);
        if (!since && !jumping) {
          const reason = afterJump ? 'loop' : started ? 'resume' : 'start';
          afterJump = false;
          arm(reason);
        }
      } else if (state === S.BUFFERING || state === S.PAUSED) {
        // A stall shows YouTube's spinner and a pause shows its play button: fall back to the still.
        if (since && !jumping) disarm();
      } else if (state === S.ENDED) {
        if (!jumping) jumpBack();
      }
    };
    return { onState, dispose: () => { clearTimers(); clearInterval(poll); poll = 0; } };
  }

  /* ---------- Scroll-triggered film previews ---------- */

  // Films near the viewport get a muted player that keeps playing just off-screen, so by the time a still
  // scrolls into view its film is already clean and dissolves in straight away.
  const MAX_ALIVE = modestNetwork ? 2 : finePointer ? 5 : 3;
  // On the home page the hero film gets the connection first; tile players wait until it is showing.
  let previewsOpen = true;
  const openPreviews = () => { if (previewsOpen) return; previewsOpen = true; updatePreviews(); };
  const previews = new Map();
  let previewFrame = 0;
  let previewObserver = null;
  let warmObserver = null;
  let scrollDir = 1;
  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y !== lastScrollY) scrollDir = y > lastScrollY ? 1 : -1;
    lastScrollY = y;
  }, { passive: true });

  // How far a film is from being on screen; films in the direction of travel count as closer.
  const distanceOf = s => {
    const r = s.host.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) return -s.ratio;
    const below = r.top >= window.innerHeight;
    const gap = below ? r.top - window.innerHeight : -r.bottom;
    return (below === (scrollDir > 0) ? 1 : 2.5) * gap;
  };

  const canPreview = f => motionVideo && !!f && (!!f.clip || f.embed !== false);
  const previewStartOf = f => (typeof f.previewStart === 'number' ? f.previewStart : DEFAULT_PREVIEW_START);
  const previewEndOf = f => (typeof f.previewEnd === 'number' ? f.previewEnd : previewStartOf(f) + PREVIEW_LENGTH);

  function destroyPreview(s) {
    if (s.loop) s.loop.dispose();
    if (s.player && s.player.destroy) s.player.destroy();
    if (s.video) { s.video.pause(); s.video.removeAttribute('src'); s.video.load(); }
    if (s.layer) s.layer.remove();
    Object.assign(s, { player: null, video: null, layer: null, loop: null, ready: false });
    s.host.classList.remove('is-previewing');
  }

  function createPreview(s) {
    const layer = document.createElement('div');
    layer.className = 'preview';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    layer.setAttribute('style', stillVars(s.f));
    s.host.insertBefore(layer, s.host.querySelector('.player__btn, .next-film__inner'));
    s.layer = layer;
    const show = () => s.host.classList.add('is-previewing');
    const hide = () => s.host.classList.remove('is-previewing');

    if (s.f.clip) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.addEventListener('playing', show);
      v.addEventListener('error', () => { s.disabled = true; destroyPreview(s); }, { once: true });
      v.src = s.f.clip;
      layer.appendChild(v);
      s.video = v;
      s.ready = true;
      if (!held()) v.play().catch(() => {});
      return;
    }

    const slot = document.createElement('div');
    layer.appendChild(slot);
    loadYouTube().then(YT => {
      if (!slot.isConnected) return;
      const start = previewStartOf(s.f);
      s.player = new YT.Player(slot, {
        videoId: s.f.youtube,
        host: 'https://www.youtube-nocookie.com',
        playerVars: Object.assign({}, QUIET_VARS, { start: start, origin: location.origin }),
        events: {
          onReady: e => {
            const frame = e.target.getIframe();
            frame.setAttribute('tabindex', '-1');
            frame.setAttribute('title', `${s.f.title} — preview`);
            e.target.mute();
            s.ready = true;
            if (held()) e.target.pauseVideo(); else e.target.playVideo();
          },
          onStateChange: e => { if (s.loop) s.loop.onState(e.data); },
          onError: () => { s.disabled = true; destroyPreview(s); }
        }
      });
      s.loop = quietLoop(s.player, YT, { start, end: previewEndOf(s.f), onClean: show, onDirty: hide });
    }).catch(() => { s.disabled = true; destroyPreview(s); });
  }

  function resumePreview(s) {
    if (!s.ready) return;
    if (s.video) { if (s.video.paused) s.video.play().catch(() => {}); return; }
    if (s.player.getPlayerState && s.player.getPlayerState() !== 1) s.player.playVideo();
  }

  function holdPreview(s) {
    if (!s.ready) return;
    if (s.video) { s.video.pause(); s.host.classList.remove('is-previewing'); return; }
    s.player.pauseVideo();
  }

  function forgetPreview(s) {
    destroyPreview(s);
    if (previewObserver) previewObserver.unobserve(s.host);
    if (warmObserver) warmObserver.unobserve(s.host);
    previews.delete(s.host);
  }

  function updatePreviews() {
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      previews.forEach(s => { if (!s.host.isConnected) forgetPreview(s); });
      const states = [...previews.values()].filter(s => !s.disabled);
      if (held()) { states.forEach(holdPreview); return; }
      if (!previewsOpen) return;
      // Visible films first, then the nearest ones ahead of the scroll so they are already clean when they arrive.
      const keep = states
        .filter(s => s.ratio > 0 || s.near)
        .map(s => [s, distanceOf(s)])
        .sort((x, y) => x[1] - y[1])
        .slice(0, MAX_ALIVE)
        .map(([s]) => s);
      states.forEach(s => {
        if (!keep.includes(s)) { if (s.layer) destroyPreview(s); return; }
        if (!s.layer) createPreview(s); else resumePreview(s);
      });
    });
  }
  document.addEventListener('bw:holds', updatePreviews);

  function registerPreview(host, f) {
    if (!host || !f || previews.has(host)) return;
    if (!canPreview(f)) {
      if (!reduceMotion) host.classList.add('is-drifting');
      return;
    }
    if (!('IntersectionObserver' in window)) return;
    previewObserver = previewObserver || new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const s = previews.get(entry.target);
        if (s) s.ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      });
      updatePreviews();
    }, { threshold: [0, 0.01, 0.25, 0.5, 0.75, 1] });
    warmObserver = warmObserver || new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const s = previews.get(entry.target);
        if (s) s.near = entry.isIntersecting;
      });
      updatePreviews();
    }, { rootMargin: modestNetwork ? '50% 0px 50% 0px' : finePointer ? '250% 0px 250% 0px' : '100% 0px 100% 0px' });
    previews.set(host, { host, f, ratio: 0, near: false, disabled: false, layer: null, player: null, video: null, loop: null, ready: false });
    previewObserver.observe(host);
    warmObserver.observe(host);
  }

  function unregisterPreview(host) {
    const s = previews.get(host);
    if (s) forgetPreview(s);
  }

  /* ---------- Shared chrome ---------- */

  const NAV = [
    { href: 'index.html', label: 'Home', page: 'home' },
    { href: 'films.html', label: 'Films', page: 'films' },
    { href: 'about.html', label: 'About', page: 'about' },
    { href: 'contact.html', label: 'Contact', page: 'contact' }
  ];

  const socialLinks = () => [['Instagram', studio.instagram], ['YouTube', studio.youtube]]
    .filter(([, url]) => url)
    .map(([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${label} ↗</a>`)
    .join('');
  const telHref = n => `tel:${esc(String(n).replace(/\s+/g, ''))}`;

  function renderChrome() {
    document.body.insertAdjacentHTML('afterbegin', `
      <a class="skip-link" href="#main" data-skip>Skip to content</a>
      <header class="site-header">
        <a class="brand" href="index.html" aria-label="${esc(studio.name)} — home">
          <picture class="brand__word"><source srcset="assets/wordmark.webp" type="image/webp"><img src="assets/wordmark.png" alt="" width="186" height="44"></picture>
        </a>
        <nav class="top-nav" aria-label="Primary">
          ${NAV.map(n => `<a class="top-nav__link" href="${n.href}"${n.page === page ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')}
        </nav>
        <div class="site-header__right">
          <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-menu">
            <span class="sr-only">Open menu</span><span class="plus" aria-hidden="true"></span>
          </button>
        </div>
      </header>
      <div class="menu" id="site-menu" inert>
        <div class="menu__inner">
          <nav class="menu__nav" aria-label="Menu">
            ${NAV.map((n, i) => `
              <a class="menu__link" href="${n.href}" style="--i:${i}" data-menu-img="${i}"${n.page === page ? ' aria-current="page"' : ''}>
                <span class="menu__num">${pad2(i + 1)}</span>
                <span class="menu__mask"><span class="menu__text">${n.label}</span></span>
              </a>`).join('')}
          </nav>
          <div class="menu__media" aria-hidden="true">
            ${films.length ? NAV.map((n, i) => imgHTML(films[i % films.length], { cls: i === 0 ? 'is-active' : '' })).join('') : ''}
          </div>
          <div class="menu__foot">
            ${studio.email ? `<a href="mailto:${esc(studio.email)}">${esc(studio.email)}</a>` : ''}
            ${studio.phone ? `<a href="${telHref(studio.phone)}">${esc(studio.phone)}</a>` : ''}
            ${socialLinks()}
          </div>
        </div>
      </div>`);

    const socials = socialLinks();
    document.body.insertAdjacentHTML('beforeend', `
      <footer class="site-footer" id="site-footer">
        <div class="footer__top">
          <div class="footer__col footer__col--wide">
            <h2 class="eyebrow">Enquiries</h2>
            ${studio.email
              ? `<a class="footer__mail" href="mailto:${esc(studio.email)}">${esc(studio.email)}</a>`
              : `<a class="footer__mail" href="contact.html">Get in touch</a>`}
            ${studio.phone ? `<a href="${telHref(studio.phone)}">${esc(studio.phone)}</a>` : ''}
          </div>
          <nav class="footer__col" aria-label="Footer">
            <h2 class="eyebrow">Menu</h2>
            ${NAV.map(n => `<a href="${n.href}">${n.label}</a>`).join('')}
          </nav>
          ${socials ? `<div class="footer__col"><h2 class="eyebrow">Follow</h2>${socials}</div>` : ''}
        </div>
        <div class="footer__brand" aria-hidden="true">
          <picture class="footer__word"><source srcset="assets/wordmark-lg.webp" type="image/webp"><img src="assets/wordmark-lg.png" alt="" width="1187" height="281" loading="lazy" decoding="async"></picture>
        </div>
        <div class="footer__bottom">
          <span>© ${new Date().getFullYear()} ${esc(studio.name)}</span>
          <span>${esc(studio.tagline)}</span>
          ${reduceMotion ? '' : '<button class="motion-btn" type="button" data-motion-toggle>Pause motion</button>'}
          <a href="#main" data-to-top>Back to top ↑</a>
        </div>
      </footer>
      <div class="lightbox" role="dialog" aria-modal="true" aria-label="Film player" inert>
        <button class="lightbox__close" type="button" data-lightbox-close>Close <span aria-hidden="true">×</span></button>
        <div class="lightbox__frame" data-lightbox-frame></div>
      </div>
      <div class="cursor" aria-hidden="true"><span class="cursor__label"></span></div>`);
  }

  // Everything behind a modal layer (menu or lightbox) becomes inert while it is open.
  const pageLayers = () => [$('[data-skip]'), $('#main'), $('#site-footer')].filter(Boolean);

  /* ---------- Motion toggle (WCAG 2.2.2) ---------- */

  function initMotionToggle() {
    // With reduced motion nothing moves, so there is nothing to pause.
    if (reduceMotion) $$('[data-motion-toggle]').forEach(b => b.remove());
    const buttons = $$('[data-motion-toggle]');
    if (!buttons.length) return;
    const sync = () => {
      const paused = holds.has('user');
      doc.classList.toggle('motion-off', paused);
      buttons.forEach(b => { b.textContent = paused ? 'Play motion' : 'Pause motion'; });
    };
    buttons.forEach(b => b.addEventListener('click', () => {
      const paused = !holds.has('user');
      try { localStorage.setItem(MOTION_KEY, paused ? '1' : '0'); } catch (err) { /* storage unavailable */ }
      setHold('user', paused);
      sync();
    }));
    sync();
  }

  /* ---------- Menu ---------- */

  let setMenu = () => {};

  function initMenu() {
    const btn = $('.menu-btn');
    const menu = $('#site-menu');
    const imgs = $$('.menu__media img', menu);
    const label = $('.sr-only', btn);

    setMenu = (open, { restoreFocus = true } = {}) => {
      const wasOpen = doc.classList.contains('menu-open');
      if (open === wasOpen) return;
      doc.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
      label.textContent = open ? 'Close menu' : 'Open menu';
      menu.inert = !open;
      pageLayers().forEach(el => { el.inert = open; });
      setHold('menu', open);
      if (open) setTimeout(() => {
        const first = $('.menu__link', menu);
        if (doc.classList.contains('menu-open') && first) first.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 400);
      else if (restoreFocus && menu.contains(document.activeElement)) btn.focus({ preventScroll: true });
    };

    btn.addEventListener('click', () => setMenu(!doc.classList.contains('menu-open')));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && doc.classList.contains('menu-open')) { setMenu(false); btn.focus({ preventScroll: true }); }
    });

    const show = link => imgs.forEach((img, i) => img.classList.toggle('is-active', String(i) === link.dataset.menuImg));
    $$('.menu__link', menu).forEach(link => {
      link.addEventListener('mouseenter', () => show(link));
      link.addEventListener('focus', () => show(link));
    });
  }

  /* ---------- Header hide-on-scroll ---------- */

  function initHeader() {
    const header = $('.site-header');
    let lastY = window.scrollY;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        header.classList.toggle('is-scrolled', y > 40);
        if (Math.abs(y - lastY) > 4) {
          header.classList.toggle('is-hidden', y > lastY && y > 160);
          lastY = y;
        }
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------- Page transitions ---------- */

  function initTransitions() {
    const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      doc.classList.remove('is-loading');
      doc.classList.add('is-ready');
    }));
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise(r => setTimeout(r, 250))]).then(reveal);

    window.addEventListener('pageshow', e => {
      if (!e.persisted) return;
      doc.classList.remove('is-leaving', 'is-loading');
      doc.classList.add('is-ready');
      closeLightbox({ restoreFocus: false });
      setMenu(false, { restoreFocus: false });
    });

    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) {
        // In-page jumps (skip link, back to top) must not touch the Films filter held in the hash.
        if (url.hash === '#main') {
          e.preventDefault();
          const main = $('#main');
          if (a.hasAttribute('data-to-top')) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
          main.setAttribute('tabindex', '-1');
          main.focus({ preventScroll: a.hasAttribute('data-to-top') });
        }
        return;
      }
      if (reduceMotion) return;
      e.preventDefault();
      doc.classList.add('is-leaving');
      setTimeout(() => { location.href = url.href; }, 380);
    });
  }

  /* ---------- Scroll reveals ---------- */

  let revealObserver;
  function observeReveals(root = document) {
    const els = $$('.reveal:not(.is-in)', root);
    if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
    // Content is only hidden for reveal once this script is running, so a script failure never blanks the page.
    doc.classList.add('reveals-on');
    revealObserver = revealObserver || new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    els.forEach(el => revealObserver.observe(el));
  }

  /* ---------- Cursor follower ---------- */

  function initCursor() {
    if (!finePointer || !cssOk('scale: 1')) return;
    const cursor = $('.cursor');
    const label = $('.cursor__label', cursor);
    let x = -200, y = -200, cx = x, cy = y, raf = 0;
    let dismissed = null;
    const loop = () => {
      cx += (x - cx) * 0.22;
      cy += (y - cy) * 0.22;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = Math.abs(x - cx) > 0.1 || Math.abs(y - cy) > 0.1 ? requestAnimationFrame(loop) : 0;
    };
    window.addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY;
      if (!cursor.classList.contains('is-on') || reduceMotion) { cx = x; cy = y; }
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener('pointerover', e => {
      const target = e.target.closest && e.target.closest('[data-cursor]');
      if (target && target !== dismissed) { dismissed = null; label.textContent = target.dataset.cursor; cursor.classList.add('is-on'); }
      else if (!target) { dismissed = null; cursor.classList.remove('is-on'); }
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !cursor.classList.contains('is-on')) return;
      cursor.classList.remove('is-on');
      dismissed = document.querySelector('[data-cursor]:hover');
    });
    doc.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
  }

  /* ---------- Lightbox ---------- */

  let lastFocus = null;
  let lightboxPlayer = null;

  function openLightbox(film, trigger) {
    const box = $('.lightbox');
    const frame = $('[data-lightbox-frame]', box);
    lastFocus = trigger || document.activeElement;
    const showBlocked = () => { frame.innerHTML = blockedHTML(film); };
    if (film.embed === false) showBlocked();
    else lightboxPlayer = mountPlayer(frame, film, showBlocked);
    box.setAttribute('aria-label', `${film.title} — film`);
    box.inert = false;
    box.classList.add('is-open');
    doc.classList.add('lightbox-open');
    [...pageLayers(), $('.site-header')].forEach(el => { if (el) el.inert = true; });
    setHold('lightbox', true);
    $('[data-lightbox-close]', box).focus({ preventScroll: true });
  }

  function closeLightbox({ restoreFocus = true } = {}) {
    const box = $('.lightbox');
    if (!box || !box.classList.contains('is-open')) return;
    box.classList.remove('is-open');
    box.inert = true;
    doc.classList.remove('lightbox-open');
    if (lightboxPlayer) lightboxPlayer.then(p => p && p.destroy && p.destroy());
    lightboxPlayer = null;
    $('[data-lightbox-frame]', box).innerHTML = '';
    [...pageLayers(), $('.site-header')].forEach(el => { if (el) el.inert = false; });
    setHold('lightbox', false);
    if (restoreFocus && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function initLightbox() {
    const box = $('.lightbox');
    $('[data-lightbox-close]', box).addEventListener('click', () => closeLightbox());
    box.addEventListener('click', e => { if (e.target === box) closeLightbox(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
  }

  /* ---------- Film markup ---------- */

  const tileHTML = (f, { kicker = false, num = numberOf(f) } = {}) => `
    <a class="tile reveal" href="${filmHref(f)}" data-cursor="Watch">
      <figure class="tile__media">${imgHTML(f)}</figure>
      <span class="tile__cap">
        <span class="tile__num">${num}</span>
        <span class="tile__title">${titleHTML(f.title)}</span>
        <span class="tile__meta">${esc(metaOf(f))}</span>
        ${kicker && f.kicker ? `<span class="tile__kicker">${esc(f.kicker)}</span>` : ''}
      </span>
    </a>`;

  const rowHTML = f => `
    <li class="reveal">
      <a href="${filmHref(f)}" data-slug="${esc(f.slug)}">
        <span class="idx__num">${numberOf(f)}</span>
        <span class="idx__title">${titleHTML(f.title)}</span>
        <span class="idx__cat">${esc(f.category)}</span>
        <span class="idx__place">${esc(f.place || '—')}</span>
        <span class="idx__arrow" aria-hidden="true">→</span>
      </a>
    </li>`;

  /* ---------- Home ---------- */

  function initHero() {
    const hero = $('[data-hero]');
    if (!hero) return;
    const film = bySlug(studio.heroFilm) || films[0];
    if (!film) return;

    const poster = $('[data-hero-poster]', hero);
    applyStillVars(poster, film);
    poster.dataset.fallback = stillJpeg(film);
    if (poster.getAttribute('src') !== still(film)) poster.src = still(film);
    $('[data-hero-name]', hero).textContent = film.title;
    $('[data-play-hero]', hero).addEventListener('click', e => openLightbox(film, e.currentTarget));

    if (!canPreview(film)) return;

    previewsOpen = false;
    setTimeout(openPreviews, 9000);
    const layer = $('.hero__video', hero);
    applyStillVars(layer, film);
    // While the film gets ready the still stays sharp and a ring fills around the play button; the film
    // crossfades in only once YouTube's own buttons have gone, so it is never shown half-ready.
    hero.style.setProperty('--fill-ms', `${CLEAN_MS}ms`);
    hero.classList.add('is-loading-film');
    const giveUp = () => { hero.classList.remove('is-loading-film', 'is-starting'); openPreviews(); };
    const giveUpTimer = setTimeout(giveUp, 15000);
    let play = () => {};
    let pause = () => {};
    let visible = true;
    const sync = () => {
      if (held()) hero.classList.remove('is-loading-film');
      if (visible && !held()) play(); else pause();
    };
    const starting = reason => {
      clearTimeout(giveUpTimer);
      if (reason !== 'loop') hero.classList.add('is-starting');
      sync();
    };
    const show = () => {
      hero.classList.add('is-playing');
      hero.classList.remove('is-loading-film', 'is-starting');
      openPreviews();
    };
    const hide = () => hero.classList.remove('is-playing', 'is-starting');
    const start = Number(studio.heroStart) || 0;
    const end = Number(studio.heroEnd) > start ? Number(studio.heroEnd) : start + 60;

    if (film.clip) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.addEventListener('playing', () => { clearTimeout(giveUpTimer); show(); });
      v.addEventListener('error', giveUp, { once: true });
      v.src = film.clip;
      $('#hero-player', hero).replaceWith(v);
      play = () => { if (v.paused) v.play().catch(() => {}); };
      pause = () => { v.pause(); };
      sync();
    } else {
      loadYouTube().then(YT => {
        // index.html starts this player while the page is still loading; attach to it rather than creating a second one.
        const early = $('iframe#hero-player', hero);
        let loop = null;
        const player = new YT.Player('hero-player', Object.assign(early ? {} : {
          videoId: film.youtube,
          host: 'https://www.youtube-nocookie.com',
          playerVars: Object.assign({}, QUIET_VARS, { start: start, origin: location.origin })
        }, {
          events: {
            onReady: e => {
              const frame = e.target.getIframe();
              frame.setAttribute('tabindex', '-1');
              frame.setAttribute('title', `${film.title} — background film`);
              e.target.mute();
              play = () => { if (player.getPlayerState() !== YT.PlayerState.PLAYING) player.playVideo(); };
              pause = () => { if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo(); };
              if (player.getPlayerState() === YT.PlayerState.PLAYING) loop.onState(YT.PlayerState.PLAYING);
              sync();
            },
            onStateChange: e => loop.onState(e.data),
            onError: () => { hide(); giveUp(); }
          }
        }));
        loop = quietLoop(player, YT, { start, end, onStart: starting, onClean: show, onDirty: hide });
      }).catch(giveUp);
    }

    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(hero);
    document.addEventListener('bw:holds', sync);
  }

  function renderHome() {
    const grid = $('[data-films="home"]');
    if (!grid) return;
    // The home portfolio shows only films that can play right here; the rest are on the Films page.
    const shown = films.filter(f => f.clip || f.embed !== false).slice(0, 8);
    grid.innerHTML = shown.map((f, i) => tileHTML(f, { kicker: true, num: pad2(i + 1) })).join('');
    $$('.tile__media', grid).forEach((host, i) => registerPreview(host, shown[i]));
    const count = $('[data-film-total]');
    if (count) count.textContent = pad2(films.length);
  }

  /* ---------- Films page ---------- */

  function initHoverPreview(list) {
    if (!finePointer || !cssOk('scale: 1')) return;
    const box = $('.hover-preview');
    const img = $('img', box);
    let x = 0, y = 0, cx = 0, cy = 0, raf = 0;
    let current = null;
    let dismissed = null;
    const loop = () => {
      cx += (x - cx) * 0.18;
      cy += (y - cy) * 0.18;
      box.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = Math.abs(x - cx) > 0.1 || Math.abs(y - cy) > 0.1 ? requestAnimationFrame(loop) : 0;
    };
    list.addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY;
      if (!box.classList.contains('is-on') || reduceMotion) { cx = x; cy = y; }
      if (!raf) raf = requestAnimationFrame(loop);
    });
    list.addEventListener('pointerover', e => {
      const a = e.target.closest('a[data-slug]');
      if (!a) { if (e.target === list) box.classList.remove('is-on'); return; }
      if (a === dismissed) return;
      dismissed = null;
      const f = bySlug(a.dataset.slug);
      if (!f) return;
      if (current !== f) {
        current = f;
        box.classList.remove('is-on');
        img.onload = () => { if (current === f) { applyStillVars(img, f); box.classList.add('is-on'); } };
        img.dataset.fallback = stillJpeg(f);
        img.src = still(f);
        if (img.complete && img.naturalWidth) img.onload();
      } else {
        box.classList.add('is-on');
      }
    });
    list.addEventListener('pointerleave', () => box.classList.remove('is-on'));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !box.classList.contains('is-on')) return;
      box.classList.remove('is-on');
      dismissed = list.querySelector('a[data-slug]:hover');
    });
  }

  function initFilmsPage() {
    const grid = $('[data-films="all"]');
    if (!grid) return;
    const list = $('[data-film-index]');
    const chips = $('[data-chips]');
    const count = $('[data-count]');
    const status = $('[data-films-status]');
    const viewButtons = $$('[data-view]');
    const labels = BW.categoryLabels || {};
    const cats = [...new Set(films.map(f => f.category))];
    const labelOf = key => (key === 'all' ? 'All films' : labels[cats.find(c => slugify(c) === key)] || key);

    chips.innerHTML = [['all', 'All', films.length], ...cats.map(c => [slugify(c), labels[c] || c, films.filter(f => f.category === c).length])]
      .map(([key, label, n]) => `<button class="chip" type="button" data-cat="${key}" aria-pressed="false">${esc(label)}<sup aria-hidden="true">${pad2(n)}</sup></button>`)
      .join('');

    let cat = 'all';
    let view = 'grid';

    const readHash = () => {
      const params = new URLSearchParams(location.hash.slice(1));
      cat = params.get('cat') || 'all';
      if (cat !== 'all' && !cats.some(c => slugify(c) === cat)) cat = 'all';
      view = params.get('view') === 'index' ? 'index' : 'grid';
    };
    const writeHash = () => {
      const params = new URLSearchParams();
      if (cat !== 'all') params.set('cat', cat);
      if (view !== 'grid') params.set('view', view);
      const hash = params.toString();
      history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
    };
    const render = (announce = false) => {
      const shown = films.filter(f => cat === 'all' || slugify(f.category) === cat);
      if (revealObserver) [...$$('.reveal', grid), ...$$('.reveal', list)].forEach(el => revealObserver.unobserve(el));
      grid.innerHTML = shown.map(f => tileHTML(f)).join('');
      list.innerHTML = shown.map(rowHTML).join('');
      grid.hidden = view !== 'grid';
      list.hidden = view !== 'index';
      if (view === 'grid') $$('.tile__media', grid).forEach((host, i) => registerPreview(host, shown[i]));
      updatePreviews();
      $$('.chip', chips).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));
      viewButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
      count.textContent = pad2(shown.length);
      if (announce && status) status.textContent = `${shown.length} film${shown.length === 1 ? '' : 's'} · ${labelOf(cat)} · ${view} view`;
      observeReveals(view === 'grid' ? grid : list);
    };

    chips.addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b || b.dataset.cat === cat) return;
      cat = b.dataset.cat;
      writeHash();
      render(true);
    });
    viewButtons.forEach(b => b.addEventListener('click', () => {
      if (b.dataset.view === view) return;
      view = b.dataset.view;
      writeHash();
      render(true);
    }));
    window.addEventListener('hashchange', () => {
      const params = new URLSearchParams(location.hash.slice(1));
      if (location.hash && !params.has('cat') && !params.has('view')) return;
      readHash();
      render();
    });

    readHash();
    render();
    initHoverPreview(list);
  }

  /* ---------- Single film page ---------- */

  function initFilmPage() {
    const root = $('[data-film-page]');
    if (!root) return;
    const slug = new URLSearchParams(location.search).get('f');
    const i = films.findIndex(f => f.slug === slug);

    if (i < 0) {
      document.title = `Film not found — ${studio.name}`;
      root.innerHTML = `
        <section class="film-hero">
          <p class="eyebrow">Film not found</p>
          <h1 class="page-title">We couldn’t find <em>that film.</em></h1>
          <p class="film-hero__kicker"><a class="link-arrow" href="films.html">See all films</a></p>
        </section>`;
      return;
    }

    const f = films[i];
    const next = films[(i + 1) % films.length];
    document.title = `${f.title} — ${studio.name}`;
    const description = $('meta[name="description"]');
    if (description) description.setAttribute('content', f.note || f.kicker || '');

    root.innerHTML = `
      <section class="film-hero">
        <a class="back-link" href="films.html">← All films</a>
        <p class="eyebrow">${numberOf(f)} / ${pad2(films.length)} — ${esc(metaOf(f))}</p>
        <h1 class="page-title film-hero__title">${titleHTML(f.title)}</h1>
        ${f.kicker ? `<p class="film-hero__kicker">${esc(f.kicker)}</p>` : ''}
      </section>
      <div class="player reveal" data-player>
        ${imgHTML(f, { cls: 'player__poster', eager: true })}
        ${f.embed === false ? `
        <a class="player__btn" href="${watchUrl(f)}" target="_blank" rel="noopener" aria-label="Watch ${esc(f.title)} on YouTube (opens in a new tab)">
          <span class="player__disc" aria-hidden="true"><span class="player__tri"></span>YouTube ↗</span>
        </a>` : `
        <button class="player__btn" type="button" aria-label="Play ${esc(f.title)}">
          <span class="player__disc" aria-hidden="true"><span class="player__tri"></span>Play</span>
        </button>`}
      </div>
      <section class="film-info grid-12">
        <p class="film-info__text reveal">${esc(f.note || f.kicker || '')}</p>
        <dl class="film-info__meta reveal">
          <div><dt>Film</dt><dd>${esc(f.title)}</dd></div>
          <div><dt>Type</dt><dd>${esc(f.category)}</dd></div>
          ${f.place ? `<div><dt>Location</dt><dd>${esc(f.place)}</dd></div>` : ''}
          ${f.channel ? `<div><dt>${esc(f.creditLabel || 'Filmed for')}</dt><dd>${esc(f.channel)}</dd></div>` : ''}
          <div><dt>Watch</dt><dd><a href="${watchUrl(f)}" target="_blank" rel="noopener">YouTube ↗</a></dd></div>
        </dl>
      </section>
      ${next && next !== f ? `
      <a class="next-film" href="${filmHref(next)}" data-cursor="Next">
        ${imgHTML(next)}
        <span class="next-film__inner">
          <span class="eyebrow">Next film — ${numberOf(next)}</span>
          <span class="next-film__title">${titleHTML(next.title)}</span>
          <span class="next-film__meta">${esc(metaOf(next))}</span>
        </span>
      </a>` : ''}`;

    const player = $('[data-player]', root);
    registerPreview(player, f);
    registerPreview($('.next-film', root), next);
    if (f.embed === false) return;
    $('button.player__btn', player).addEventListener('click', () => {
      unregisterPreview(player);
      player.classList.remove('is-drifting');
      player.classList.add('is-playing');
      mountPlayer(player, f, () => {
        player.classList.remove('is-playing');
        player.innerHTML = imgHTML(f, { cls: 'player__poster' }) + blockedHTML(f);
      }).then(p => { if (p) p.getIframe().focus(); });
    });
  }

  /* ---------- Studio facts and collaborators ---------- */

  function fillFacts() {
    const facts = BW.facts || [];
    $$('[data-facts]').forEach(el => {
      el.innerHTML = facts.map(x => `<div class="fact reveal"><dt class="eyebrow">${esc(x.label)}</dt><dd class="fact__value">${esc(x.value)}</dd></div>`).join('');
    });
    const studios = BW.workedWith || [];
    $$('[data-worked-with]').forEach(el => {
      el.innerHTML = studios.map(n => `<li>${esc(n)}</li>`).join('');
    });
  }

  /* ---------- Founder ---------- */

  function fillFounder() {
    const founder = BW.founder || {};
    $$('[data-founder-photo]').forEach(img => {
      const src = img.dataset.founderPhoto === 'small' ? founder.photoSmall || founder.photo : founder.photo;
      if (src) img.src = src;
      img.alt = founder.name ? `${founder.name}, ${founder.role || 'founder of ' + studio.name}` : `${founder.role || 'Founder'}, ${studio.name}`;
    });
    $$('[data-founder-name]').forEach(el => {
      if (founder.name) el.textContent = founder.name;
      else el.remove();
    });
    $$('[data-founder-role]').forEach(el => { if (founder.role) el.textContent = founder.role; });
  }

  /* ---------- Stills on static pages ---------- */

  function fillStills() {
    $$('[data-film-still]').forEach(img => {
      const f = bySlug(img.dataset.filmStill) || films[0];
      if (!f) return;
      img.dataset.fallback = stillJpeg(f);
      applyStillVars(img, f);
      img.src = still(f);
    });
  }

  /* ---------- Product demos (self-hosted AI concept films) ---------- */

  // Each card shows its opening frame as a still; the film streams in (faststart MP4 from the site itself), fades in
  // once it is really playing and, a moment before the end, fades back to that same opening frame to loop seamlessly.
  const DEMO_DIP = 0.8;

  function initDemos() {
    const cards = $$('[data-demo]');
    // Reduced motion, data saver or a slow connection: the still stays and no film is downloaded.
    if (!cards.length || reduceMotion || connection.saveData || slowNetwork || !('IntersectionObserver' in window)) return;
    const visible = new Set();
    const load = video => { if (!video.getAttribute('src')) { video.preload = 'auto'; video.src = video.dataset.src; } };
    const sync = () => cards.forEach(card => {
      const video = $('video', card);
      if (visible.has(card) && !held()) {
        load(video);
        const playing = video.play();
        if (playing && playing.catch) playing.catch(() => {});
      } else if (!video.paused) video.pause();
    });
    // Start fetching ahead, so a film is already moving by the time it scrolls in.
    const warm = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      load($('video', e.target));
      warm.unobserve(e.target);
    }), { rootMargin: modestNetwork ? '60% 0px' : '200% 0px' });
    const seen = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); });
      sync();
    }, { threshold: 0.2 });
    cards.forEach(card => {
      const video = $('video', card);
      video.muted = true;
      video.addEventListener('playing', () => card.classList.add('is-playing'));
      video.addEventListener('timeupdate', () => {
        if (video.duration && video.currentTime > video.duration - DEMO_DIP) card.classList.add('is-dipping');
      });
      video.addEventListener('ended', () => { video.currentTime = 0; sync(); });
      video.addEventListener('seeked', () => { if (video.currentTime < 1) card.classList.remove('is-dipping'); });
      video.addEventListener('error', () => card.classList.remove('is-playing'));
      warm.observe(card);
      seen.observe(card);
    });
    document.addEventListener('bw:holds', sync);
    // Some phones (e.g. iPhone in Low Power Mode) refuse to autoplay until the visitor first touches the page.
    const retry = () => { sync(); ['pointerdown', 'keydown'].forEach(t => document.removeEventListener(t, retry, true)); };
    ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, retry, true));
  }

  /* ---------- Contact ---------- */

  function initContact() {
    const form = $('[data-enquiry]');
    if (!form) return;
    const status = $('[data-form-status]');

    const fill = (sel, value, href) => $$(sel).forEach(el => {
      if (!value) { const row = el.closest('[data-contact-row]'); if (row) row.remove(); return; }
      el.textContent = value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      el.href = href;
    });
    fill('[data-studio-email]', studio.email, `mailto:${studio.email}`);
    fill('[data-studio-phone]', studio.phone, `tel:${String(studio.phone).replace(/\s+/g, '')}`);
    fill('[data-studio-instagram]', studio.instagram, studio.instagram);

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (!studio.email) { status.textContent = 'Add an email address in assets/js/data.js to receive enquiries.'; return; }
      const d = new FormData(form);
      const get = k => String(d.get(k) || '').trim();
      const subject = `${get('type') || 'Film'} enquiry — ${get('names')}${get('date') ? ` — ${get('date')}` : ''}`;
      const body = [
        `Names: ${get('names')}`,
        `Email: ${get('email')}`,
        `Date: ${get('date') || '—'}`,
        `City / venue: ${get('venue') || '—'}`,
        `Looking for: ${get('type') || '—'}`,
        '',
        get('message')
      ].join('\n');
      status.textContent = 'Opening your email app…';
      location.href = `mailto:${studio.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  /* ---------- Boot ---------- */

  // Fetch the YouTube player API straight away so the first film can start as soon as possible.
  if (motionVideo && $('[data-hero], [data-films], [data-film-page]')) loadYouTube().catch(() => {});

  // One failing piece must never take the rest of the page down with it.
  [renderChrome, initMotionToggle, initMenu, initHeader, initTransitions, initCursor, initLightbox,
    initHero, renderHome, initFilmsPage, initFilmPage, fillStills, fillFacts, fillFounder, initDemos, initContact, observeReveals]
    .forEach(fn => { try { fn(); } catch (err) { console.error(err); } });
})();
