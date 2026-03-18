// ── CLUTTER BYTE — main.js ────────────────────────────────────────────────

// ── CONTACT OVERLAY ───────────────────────────────────────────────────────
(function () {
  var btn      = document.getElementById('header-contact-btn');
  var overlay  = document.getElementById('phone-overlay');
  var backdrop = document.getElementById('phone-backdrop');
  var closeBtn = document.getElementById('phone-overlay-close');
  if (!btn || !overlay || !backdrop) return;

  function open()   { overlay.classList.add('open'); backdrop.classList.add('open'); btn.classList.add('active'); }
  function close()  { overlay.classList.remove('open'); backdrop.classList.remove('open'); btn.classList.remove('active'); }
  function toggle() { overlay.classList.contains('open') ? close() : open(); }

  btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  if (closeBtn) closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();

// ── PAGE INIT ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function () {
  if (typeof LOCATION === 'undefined') return;
  var photos    = (typeof PHOTOS !== 'undefined' && PHOTOS[LOCATION])
    ? PHOTOS[LOCATION].filter(Boolean) : [];
  var driveLink = (typeof DRIVE_LINKS !== 'undefined' && DRIVE_LINKS[LOCATION])
    ? DRIVE_LINKS[LOCATION] : '';
  initPage(photos, driveLink);
});

function initPage(photos, driveLink) {
  var section = document.getElementById('carousel-section');
  var countEl = document.getElementById('photo-count');

  if (!photos.length) {
    if (countEl) countEl.textContent = 'Photos coming soon';
    if (section) section.innerHTML =
      '<div class="coming-soon">' +
        '<p class="coming-soon-title">Coming<br/>Soon</p>' +
        '<p class="coming-soon-sub">Check back shortly</p>' +
      '</div>';
    return;
  }

  if (countEl) countEl.style.display = 'none';

  if (section) section.innerHTML =
    '<div class="carousel-loading" id="carousel-loading">' +
      '<div class="carousel-loading-dot"></div>' +
      '<div class="carousel-loading-dot"></div>' +
      '<div class="carousel-loading-dot"></div>' +
    '</div>';

  var loaded = 0;
  photos.forEach(function (src) {
    var img = new Image();
    img.onload = img.onerror = function () {
      loaded++;
      if (loaded === photos.length) {
        var el = document.getElementById('carousel-loading');
        if (el) el.remove();
        buildCarousel(section, photos, driveLink);
        initLightbox(photos);
      }
    };
    img.src = src;
  });
}

// ── CAROUSEL — finite, no clones ──────────────────────────────────────────
var _photos    = [];
var _total     = 0;    // number of real photos
var _idx       = 0;    // current real photo index (for lightbox)
var _vIdx      = 0;    // current slide index (photos + optional CTA card)
var _slides    = [];   // all slide elements
var _track     = null;
var _hasCta    = false;
var _driveLink = '';

function buildCarousel(container, photos, driveLink) {
  _photos    = photos;
  _total     = photos.length;
  _idx       = 0;
  _vIdx      = 0;
  _hasCta    = !!driveLink;
  _driveLink = driveLink || '';

  // Build photo slides
  var photoHTML = photos.map(function (src, i) {
    return '<div class="cs" data-vi="' + i + '" data-real="' + i + '">' +
      '<img src="' + src + '" alt="Photo ' + (i + 1) + '"' +
      ' loading="' + (i < 4 ? 'eager' : 'lazy') + '"' +
      ' draggable="false"></div>';
  }).join('');

  // Build CTA card if drive link present
  var ctaHTML = '';
  if (_hasCta) {
    // Pick 6 photos spread across the set for the collage
    var picks = [];
    var step  = Math.max(1, Math.floor(_total / 6));
    for (var p = 0; p < 6 && p * step < _total; p++)
      picks.push(photos[p * step]);
    // If fewer than 6, repeat from start
    while (picks.length < 6) picks.push(photos[picks.length % _total]);

    var collageImgs = picks.map(function (src, ci) {
      return '<img class="coll-img coll-' + (ci + 1) + '" src="' + src + '" alt="" aria-hidden="true" draggable="false">';
    }).join('');

    var ctaVi = _total;
    ctaHTML =
      '<div class="cs cs-cta" data-vi="' + ctaVi + '" data-cta="true">' +
        '<div class="cta-collage">' +
          '<div class="cta-collage-inner">' + collageImgs + '</div>' +
          '<div class="cta-collage-mask"></div>' +
        '</div>' +
        '<div class="cta-bottom">' +
          '<span class="cta-count shine-text">100+</span>' +
          '<span class="cta-label">more photos on Google Drive</span>' +
          '<a class="cta-link" href="' + driveLink + '" target="_blank" rel="noopener">View Full Gallery ↗</a>' +
        '</div>' +
      '</div>';
  }

  container.innerHTML =
    '<div class="c-outer">' +
      '<div class="c-track" id="c-track">' + photoHTML + ctaHTML + '</div>' +
      '<div class="c-ui"><div class="c-arrows">' +
        '<button class="c-arrow" id="c-prev" aria-label="Previous" disabled>&#8592;</button>' +
        '<button class="c-arrow" id="c-next" aria-label="Next">&#8594;</button>' +
      '</div></div>' +
    '</div>';

  _track  = document.getElementById('c-track');
  _slides = Array.from(_track.querySelectorAll('.cs'));
  _vIdx   = 0;
  wireCarousel();
}

// ── TRANSFORMS ────────────────────────────────────────────────────────────
function applyTransforms(instant) {
  if (instant) {
    _slides.forEach(function (s) { s.style.transition = 'none'; });
    void _track.offsetWidth;
  }

  _slides.forEach(function (slide, vi) {
    var offset = vi - _vIdx;
    var absOff = Math.abs(offset);
    var tx, tz, ry, opacity, scale, pe;

    if (absOff === 0) {
      tx=0;      tz=0;    ry=0;     opacity=1;    scale=1;    pe='auto';
    } else if (absOff === 1) {
      var d1 = offset > 0 ? 1 : -1;
      tx=d1*60;  tz=-130; ry=d1*-26; opacity=0.52; scale=0.80; pe='auto';
    } else if (absOff === 2) {
      var d2 = offset > 0 ? 1 : -1;
      tx=d2*92;  tz=-210; ry=d2*-38; opacity=0.18; scale=0.64; pe='none';
    } else {
      var d3 = offset > 0 ? 1 : -1;
      tx=d3*110; tz=-280; ry=d3*-46; opacity=0;    scale=0.52; pe='none';
    }

    slide.style.transform     = 'translateX('+tx+'%) translateZ('+tz+'px) rotateY('+ry+'deg) scale('+scale+')';
    slide.style.opacity       = opacity;
    slide.style.zIndex        = 10 - absOff;
    slide.style.pointerEvents = pe;
    slide.classList.toggle('on', vi === _vIdx);
  });

  if (instant) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        _slides.forEach(function (s) { s.style.transition = ''; });
      });
    });
  }
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
function goTo(vi, instant) {
  vi    = Math.max(0, Math.min(vi, _slides.length - 1));
  _vIdx = vi;
  // Update real photo index only for photo slides
  if (!_slides[vi].dataset.cta) _idx = vi;
  applyTransforms(instant);
  updateArrows();
}

function updateArrows() {
  var prev = document.getElementById('c-prev');
  var next = document.getElementById('c-next');
  if (prev) prev.disabled = (_vIdx === 0);
  if (next) next.disabled = (_vIdx === _slides.length - 1);
}

function step(dir) {
  goTo(_vIdx + dir, false);
}

// ── WIRE ──────────────────────────────────────────────────────────────────
function wireCarousel() {
  var prev = document.getElementById('c-prev');
  var next = document.getElementById('c-next');
  if (prev) prev.addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
  if (next) next.addEventListener('click', function (e) { e.stopPropagation(); step(1); });

  document.addEventListener('keydown', function (e) {
    var lb = document.getElementById('lightbox');
    if (lb && lb.classList.contains('active')) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft')  step(-1);
  });

  if (_track) {
    var startX = 0, startY = 0, moved = false, tracking = false;

    function onStart(x, y) { startX=x; startY=y; moved=false; tracking=true; }
    function onMove(x, y) {
      if (!tracking) return;
      var dx = x - startX, dy = y - startY;
      if (!moved && Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        moved = true; tracking = false;
        step(dx < 0 ? 1 : -1);
      }
    }
    function onEnd(x, y) {
      if (!tracking) return;
      tracking = false;
      var dx = x - startX, dy = y - startY;
      if (!moved && Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy)) {
        moved = true;
        step(dx < 0 ? 1 : -1);
      }
    }

    _track.addEventListener('touchstart', function (e) {
      var lb = document.getElementById('lightbox');
      if (lb && lb.classList.contains('active')) return;
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    _track.addEventListener('touchmove', function (e) {
      var lb = document.getElementById('lightbox');
      if (lb && lb.classList.contains('active')) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    _track.addEventListener('touchend', function (e) {
      var lb = document.getElementById('lightbox');
      if (lb && lb.classList.contains('active')) return;
      onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    });
    _track.addEventListener('mousedown',  function (e) { onStart(e.clientX, e.clientY); });
    window.addEventListener('mousemove',  function (e) { if (tracking) onMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup',    function (e) { onEnd(e.clientX, e.clientY); });

    _track.addEventListener('click', function (e) {
      if (moved) { moved = false; return; }
      var s = e.target.closest('.cs');
      if (!s) return;
      var vi = parseInt(s.dataset.vi);
      if (vi === _vIdx) {
        // Center slide clicked
        if (s.dataset.cta) {
          // CTA card — open Drive link (link inside handles it, but fallback)
          window.open(_driveLink, '_blank', 'noopener');
        } else {
          if (_idx >= 0 && _idx < _total) openLightbox(_idx);
        }
      } else {
        step(vi > _vIdx ? 1 : -1);
      }
    });
  }

  goTo(0, true);
}

// ── LIGHTBOX ──────────────────────────────────────────────────────────────
var _lbIdx = 0;

function initLightbox(photos) {
  var lb    = document.getElementById('lightbox');
  var close = document.getElementById('lb-close');
  var prev  = document.getElementById('lb-prev');
  var next  = document.getElementById('lb-next');
  if (!lb) return;

  close.addEventListener('click', closeLightbox);
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
  if (prev) prev.addEventListener('click', function () { lbGo(_lbIdx - 1); });
  if (next) next.addEventListener('click', function () { lbGo(_lbIdx + 1); });

  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('active')) return;
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowRight') lbGo(_lbIdx + 1);
    if (e.key === 'ArrowLeft')  lbGo(_lbIdx - 1);
  });
  // No touch swipe — native pinch-zoom must work freely. Buttons only.
}

function openLightbox(idx) {
  _lbIdx = Math.max(0, Math.min(idx, _total - 1));
  var lb  = document.getElementById('lightbox');
  var img = document.getElementById('lb-img');
  if (!lb || !img) return;
  img.src = _photos[_lbIdx];
  img.alt = 'Photo ' + (_lbIdx + 1);
  lb.classList.add('active');
  document.body.style.overflow = 'hidden';
  lbArrows();
}

function lbGo(idx) {
  _lbIdx = Math.max(0, Math.min(idx, _total - 1));
  var img = document.getElementById('lb-img');
  if (img) { img.src = _photos[_lbIdx]; img.alt = 'Photo ' + (_lbIdx + 1); }
  // Sync carousel — only for photo slides
  if (_lbIdx < _slides.length && !_slides[_lbIdx].dataset.cta) goTo(_lbIdx, false);
  lbArrows();
}

function lbArrows() {
  var p = document.getElementById('lb-prev');
  var n = document.getElementById('lb-next');
  if (p) p.style.opacity = _lbIdx === 0          ? '0.25' : '1';
  if (n) n.style.opacity = _lbIdx === _total - 1 ? '0.25' : '1';
}

function closeLightbox() {
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.classList.remove('active');
  document.body.style.overflow = '';
}
