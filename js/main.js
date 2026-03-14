// ── CLUTTER BYTE — main.js ────────────────────────────────────────────────

// ── CONTACT OVERLAY ───────────────────────────────────────────────────────
(function () {
  var btn      = document.getElementById('header-contact-btn');
  var overlay  = document.getElementById('phone-overlay');
  var backdrop = document.getElementById('phone-backdrop');
  var closeBtn = document.getElementById('phone-overlay-close');
  if (!btn || !overlay || !backdrop) return;

  function open() {
    overlay.classList.add('open');
    backdrop.classList.add('open');
    btn.classList.add('active');
  }
  function close() {
    overlay.classList.remove('open');
    backdrop.classList.remove('open');
    btn.classList.remove('active');
  }
  function toggle() {
    overlay.classList.contains('open') ? close() : open();
  }

  btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  if (closeBtn) closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();

// ── CAROUSEL INIT ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function () {
  if (typeof LOCATION === 'undefined') return;
  var photos = (typeof PHOTOS !== 'undefined' && PHOTOS[LOCATION])
    ? PHOTOS[LOCATION].filter(Boolean) : [];
  initPage(photos);
});

function initPage(photos) {
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
  buildCarousel(section, photos);
  initLightbox(photos);
}

// ── CAROUSEL — 3D coverflow, infinite, fluid, spam-safe ───────────────────
var _photos    = [];
var _total     = 0;
var _idx       = 0;
var _vIdx      = 0;
var _slides    = [];
var _track     = null;
var _snapTimer = null;
var CLONE_COUNT = 8;

function buildCarousel(container, photos) {
  _photos = photos;
  _total  = photos.length;
  _idx    = 0;

  var allReal = [];
  for (var c = 0; c < CLONE_COUNT; c++)
    allReal.push((_total - CLONE_COUNT + c + _total) % _total);
  for (var r = 0; r < _total; r++)
    allReal.push(r);
  for (var a = 0; a < CLONE_COUNT; a++)
    allReal.push(a % _total);

  var slidesHTML = allReal.map(function (realI, vi) {
    return '<div class="cs" data-vi="' + vi + '" data-real="' + realI + '">' +
      '<img src="' + photos[realI] + '"' +
        ' alt="Photo ' + (realI + 1) + '"' +
        ' loading="' + (vi < CLONE_COUNT + 4 ? 'eager' : 'lazy') + '"' +
        ' draggable="false">' +
      '</div>';
  }).join('');

  container.innerHTML =
    '<div class="c-outer">' +
      '<div class="c-track" id="c-track">' + slidesHTML + '</div>' +
      '<div class="c-ui">' +
        '<div class="c-arrows">' +
          '<button class="c-arrow" id="c-prev" aria-label="Previous">&#8592;</button>' +
          '<button class="c-arrow" id="c-next" aria-label="Next">&#8594;</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  _track  = document.getElementById('c-track');
  _slides = Array.from(_track.querySelectorAll('.cs'));
  _vIdx   = CLONE_COUNT;
  wireCarousel();
}

function applyTransforms(instant) {
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

    var tf = 'translateX(' + tx + '%) translateZ(' + tz + 'px) rotateY(' + ry + 'deg) scale(' + scale + ')';

    if (instant) {
      slide.style.transition    = 'none';
      void slide.offsetWidth;
      slide.style.transform     = tf;
      slide.style.opacity       = opacity;
      slide.style.zIndex        = 10 - absOff;
      slide.style.pointerEvents = pe;
      slide.classList.toggle('on', vi === _vIdx);
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        slide.style.transition = '';
      }); });
    } else {
      slide.style.transform     = tf;
      slide.style.opacity       = opacity;
      slide.style.zIndex        = 10 - absOff;
      slide.style.pointerEvents = pe;
      slide.classList.toggle('on', vi === _vIdx);
    }
  });
}

var _lastReal = 0;

function goTo(vIdx, instant) {
  vIdx      = Math.max(0, Math.min(vIdx, _slides.length - 1));
  _vIdx     = vIdx;
  _lastReal = CLONE_COUNT + _total - 1;
  _idx      = parseInt(_slides[_vIdx].dataset.real);
  applyTransforms(instant);

  if (!instant) {
    clearTimeout(_snapTimer);
    _snapTimer = setTimeout(function () {
      if (_vIdx < CLONE_COUNT) {
        _vIdx = CLONE_COUNT + _total - (CLONE_COUNT - _vIdx);
        _idx  = parseInt(_slides[_vIdx].dataset.real);
        applyTransforms(true);
      } else if (_vIdx > _lastReal) {
        _vIdx = CLONE_COUNT + (_vIdx - _lastReal - 1);
        _idx  = parseInt(_slides[_vIdx].dataset.real);
        applyTransforms(true);
      }
    }, 560);
  }
}

function step(dir) {
  _lastReal = CLONE_COUNT + _total - 1;
  if (_vIdx < CLONE_COUNT) {
    clearTimeout(_snapTimer);
    _vIdx = CLONE_COUNT + _total - (CLONE_COUNT - _vIdx);
    _idx  = parseInt(_slides[_vIdx].dataset.real);
    applyTransforms(true);
  } else if (_vIdx > _lastReal) {
    clearTimeout(_snapTimer);
    _vIdx = CLONE_COUNT + (_vIdx - _lastReal - 1);
    _idx  = parseInt(_slides[_vIdx].dataset.real);
    applyTransforms(true);
  }
  goTo(_vIdx + dir, false);
}

function vIdxForReal(realIdx) {
  return CLONE_COUNT + (((realIdx % _total) + _total) % _total);
}

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

    function onStart(x, y) { startX = x; startY = y; moved = false; tracking = true; }
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
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    _track.addEventListener('touchmove', function (e) {
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    _track.addEventListener('touchend', function (e) {
      onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    });
    _track.addEventListener('mousedown', function (e) { onStart(e.clientX, e.clientY); });
    window.addEventListener('mousemove', function (e) { if (tracking) onMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup',   function (e) { onEnd(e.clientX, e.clientY); });

    _track.addEventListener('click', function (e) {
      if (moved) { moved = false; return; }
      var s = e.target.closest('.cs');
      if (!s) return;
      var vi = parseInt(s.dataset.vi);
      if (vi === _vIdx) {
        if (_idx >= 0 && _idx < _total) openLightbox(_idx);
      } else {
        step(vi > _vIdx ? 1 : -1);
      }
    });
  }

  goTo(_vIdx, true);
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

  var lbx = 0;
  lb.addEventListener('touchstart', function (e) { lbx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend',   function (e) {
    var d = e.changedTouches[0].clientX - lbx;
    if (d < -40) lbGo(_lbIdx + 1);
    if (d >  40) lbGo(_lbIdx - 1);
  });
}

function openLightbox(idx) {
  _lbIdx = ((idx % _total) + _total) % _total;
  var lb  = document.getElementById('lightbox');
  var img = document.getElementById('lb-img');
  if (!lb || !img) return;
  img.src = _photos[_lbIdx];
  img.alt = 'Photo ' + (_lbIdx + 1);
  lb.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function lbGo(idx) {
  _lbIdx = ((idx % _total) + _total) % _total;
  var img = document.getElementById('lb-img');
  if (img) { img.src = _photos[_lbIdx]; img.alt = 'Photo ' + (_lbIdx + 1); }
  goTo(vIdxForReal(_lbIdx), false);
}

function closeLightbox() {
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.classList.remove('active');
  document.body.style.overflow = '';
}
