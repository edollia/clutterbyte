// ── CLUTTER BYTE — main.js ────────────────────────────────────────────────

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, function (char) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char];
  });
}

function validPhotoList(rawPhotos) {
  if (!Array.isArray(rawPhotos)) return [];
  return rawPhotos
    .filter(function (src) { return typeof src === 'string' && src.trim(); })
    .map(function (src) { return src.trim(); });
}

function siteOrigin() {
  return window.location.origin || 'https://clutterbyte.com';
}

function absoluteUrl(path) {
  if (!path) return siteOrigin() + '/';
  if (/^https?:\/\//i.test(path)) return path;
  return siteOrigin() + (String(path).charAt(0) === '/' ? path : '/' + path);
}

// ── CONTACT OVERLAY ───────────────────────────────────────────────────────
(function () {
  var btn      = document.getElementById('header-contact-btn');
  var overlay  = document.getElementById('phone-overlay');
  var backdrop = document.getElementById('phone-backdrop');
  var closeBtn = document.getElementById('phone-overlay-close');
  if (!btn || !overlay || !backdrop) return;

  btn.setAttribute('aria-expanded', 'false');
  if (!overlay.id) overlay.id = 'phone-overlay';
  btn.setAttribute('aria-controls', overlay.id);

  function open() {
    overlay.classList.add('open');
    backdrop.classList.add('open');
    btn.classList.add('active');
    btn.setAttribute('aria-expanded', 'true');
  }
  function close() {
    overlay.classList.remove('open');
    backdrop.classList.remove('open');
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggle() { overlay.classList.contains('open') ? close() : open(); }

  btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  if (closeBtn) closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();

// ── PAGE INIT ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function () {
  initSite();
});

async function initSite() {
  var liveData = await loadLiveData();
  var lang = (typeof LANG !== 'undefined' && LANG === 'es') ? 'es' : 'en';
  if (liveData && liveData.settings) applyContactSettings(liveData.settings, lang);
  renderMobileTextCta(liveData && liveData.settings ? liveData.settings : null, lang);
  if (typeof LOCATION === 'undefined') {
    if (document.querySelector('.seller-page')) return;
    initHomeLocations(liveData);
    updateHomeSEO(lang);
    return;
  }

  var source = citySource(LOCATION, liveData);
  initPage(source.photos, source.driveLink, lang, source.ctaBg, source.meta);
}

async function loadLiveData() {
  if (!window.CBCMS || !window.CBCMS.isConfigured || !window.CBCMS.isConfigured()) return null;
  try {
    return await window.CBCMS.loadPublicData();
  } catch (e) {
    return null;
  }
}

function citySource(key, liveData) {
  if (liveData && liveData.cities) {
    var city = liveData.cities.filter(function (item) { return item.slug === key || item.id === key; })[0];
    if (city) {
      return {
        photos: city.photos.map(function (photo) { return photo.src; }),
        driveLink: city.driveLink || '',
        ctaBg: city.ctaBg || '',
        meta: city
      };
    }
  }
  return {
    photos: (typeof PHOTOS !== 'undefined' && PHOTOS[key]) ? validPhotoList(PHOTOS[key]) : [],
    driveLink: (typeof DRIVE_LINKS !== 'undefined' && DRIVE_LINKS[key]) ? DRIVE_LINKS[key] : '',
    ctaBg: (typeof CTA_BACKGROUNDS !== 'undefined' && CTA_BACKGROUNDS[key]) ? CTA_BACKGROUNDS[key] : '',
    meta: (typeof CITY_META !== 'undefined' && CITY_META[key]) ? CITY_META[key] : {}
  };
}

function initHomeLocations(liveData) {
  var grid = document.getElementById('locations-grid');
  if (!grid) return;
  var isEs = document.documentElement.lang === 'es';
  if (liveData && liveData.cities && liveData.cities.length) {
    renderHomeCities(grid, liveData.cities, isEs, true);
    return;
  }
  if (typeof PHOTOS === 'undefined') return;
  var meta = (typeof CITY_META !== 'undefined' && CITY_META) ? CITY_META : {};
  var keys = Object.keys(meta).length ? Object.keys(meta) : Object.keys(PHOTOS);
  keys = keys.filter(function (key) {
    return !(meta[key] && meta[key].active === false);
  });
  if (!keys.length) return;

  renderHomeCities(grid, keys.map(function (key) {
    return {
      slug: key,
      name: meta[key] && meta[key].name ? meta[key].name : titleFromSlug(key),
      saleDate: meta[key] && meta[key].saleDate ? meta[key].saleDate : '',
      photos: validPhotoList(PHOTOS[key])
    };
  }), isEs, false);
}

function renderHomeCities(grid, cities, isEs, liveMode) {
  grid.innerHTML = cities.map(function (city) {
    var key = city.slug || city.id;
    var photos = Array.isArray(city.photos) ? city.photos : [];
    var name = city.name || titleFromSlug(key);
    var href = liveMode
      ? '/sale/?city=' + encodeURIComponent(key) + (isEs ? '&lang=es' : '')
      : '/' + key + (isEs ? '-es' : '');
    var count = photos.length;
    var status = city.saleDate || '';
    var sub = status || (count
      ? (isEs ? 'Ver todas las fotos' : 'View all photos')
      : (isEs ? 'Fotos próximamente' : 'Photos coming soon'));
    return '<a href="' + escapeHTML(href) + '" class="location-card">' +
      '<span class="loc-arrow" aria-hidden="true">↗</span>' +
      '<span class="loc-name">' + escapeHTML(name) + '</span>' +
      '<span class="loc-sub">' + escapeHTML(sub) + '</span>' +
    '</a>';
  }).join('');
}

function legacyHomeLocations() {
  var grid = document.getElementById('locations-grid');
  if (!grid || typeof PHOTOS === 'undefined') return;
  var isEs = document.documentElement.lang === 'es';
  var meta = (typeof CITY_META !== 'undefined' && CITY_META) ? CITY_META : {};
  var keys = Object.keys(meta).length ? Object.keys(meta) : Object.keys(PHOTOS);
  keys = keys.filter(function (key) {
    return !(meta[key] && meta[key].active === false);
  });
  if (!keys.length) return;
  grid.innerHTML = keys.map(function (key) {
    var name = meta[key] && meta[key].name ? meta[key].name : titleFromSlug(key);
    var href = '/' + key + (isEs ? '-es' : '');
    var count = validPhotoList(PHOTOS[key]).length;
    var status = meta[key] && meta[key].saleDate ? meta[key].saleDate : '';
    var sub = status || (count
      ? (isEs ? 'Ver todas las fotos' : 'View all photos')
      : (isEs ? 'Fotos próximamente' : 'Photos coming soon'));
    return '<a href="' + escapeHTML(href) + '" class="location-card">' +
      '<span class="loc-arrow" aria-hidden="true">↗</span>' +
      '<span class="loc-name">' + escapeHTML(name) + '</span>' +
      '<span class="loc-sub">' + escapeHTML(sub) + '</span>' +
    '</a>';
  }).join('');
}

function titleFromSlug(slug) {
  return String(slug || '').split('-').filter(Boolean).map(function (part) {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ') || 'City';
}

function initPage(photos, driveLink, lang, ctaBg, meta) {
  var section = document.getElementById('carousel-section');
  var countEl = document.getElementById('photo-count');
  if (!section) return;
  updatePageMeta(meta, lang);
  renderSaleInfo(meta, lang);
  updateSaleSEO(meta, lang, photos);
  renderSaleViewCounter(meta, lang);

  if (!photos.length) {
    showComingSoon(section, countEl, lang);
    return;
  }

  if (countEl && !(meta && (meta.saleDate || meta.hours))) countEl.style.display = 'none';

  if (section) section.innerHTML =
    '<div class="carousel-loading" id="carousel-loading">' +
      '<div class="carousel-loading-dot"></div>' +
      '<div class="carousel-loading-dot"></div>' +
      '<div class="carousel-loading-dot"></div>' +
    '</div>';

  var loaded = 0;
  var availablePhotos = [];
  photos.forEach(function (src, index) {
    var img = new Image();
    img.onload = function () {
      availablePhotos[index] = src;
      markLoaded();
    };
    img.onerror = markLoaded;
    function markLoaded() {
      loaded++;
      if (loaded === photos.length) {
        var el = document.getElementById('carousel-loading');
        if (el) el.remove();
        var readyPhotos = availablePhotos.filter(Boolean);
        if (!readyPhotos.length) {
          showComingSoon(section, countEl, lang);
          return;
        }
        buildCarousel(section, readyPhotos, driveLink, lang, ctaBg, meta);
        initLightbox();
      }
    }
    img.src = src;
  });
}

function updatePageMeta(meta, lang) {
  if (!meta) return;
  var title = document.querySelector('.page-title');
  var count = document.getElementById('photo-count');
  if (title && meta.name) title.textContent = meta.name;
  if (count && (meta.saleDate || meta.hours)) {
    count.textContent = meta.saleDate || meta.hours;
    count.style.display = '';
  }
  if (meta.name) document.title = 'Clutter Byte — ' + meta.name + (lang === 'es' ? ' ES' : '');
}

function applyContactSettings(settings, lang) {
  var label = document.querySelector('.phone-overlay-label');
  var number = document.querySelector('.phone-overlay-number');
  if (label) label.textContent = lang === 'es'
    ? (settings.contactEs || label.textContent)
    : (settings.contactEn || label.textContent);
  if (number) {
    if (settings.sms) number.href = 'sms:' + settings.sms;
    if (settings.phone) number.textContent = settings.phone;
  }
  renderMobileTextCta(settings, lang);
}

function renderMobileTextCta(settings, lang) {
  if (document.body.classList.contains('admin-body')) return;
  var currentNumber = document.querySelector('.phone-overlay-number');
  var href = settings && settings.sms ? 'sms:' + settings.sms : (currentNumber ? currentNumber.href : 'sms:+13233019200');
  var phone = settings && settings.phone ? settings.phone : (currentNumber ? currentNumber.textContent : '(323) 301-9200');
  var label = lang === 'es'
    ? ((settings && settings.contactEs) || 'Escribe cuando quieras')
    : ((settings && settings.contactEn) || 'Text anytime');
  var cta = document.getElementById('mobile-text-cta');
  if (!cta) {
    cta = document.createElement('a');
    cta.id = 'mobile-text-cta';
    cta.className = 'mobile-text-cta';
    document.body.appendChild(cta);
  }
  cta.href = href;
  cta.innerHTML = '<span>' + escapeHTML(label) + '</span><strong>' + escapeHTML(phone) + '</strong>';
}

function renderSaleInfo(meta, lang) {
  var header = document.querySelector('.page-header');
  if (!header) return;
  var existing = document.getElementById('sale-info-bar');
  if (existing) existing.remove();
  if (!meta) return;

  var items = [];
  var actions = [];
  var isEs = lang === 'es';
  var revealAt = meta.addressRevealAt ? new Date(meta.addressRevealAt) : null;
  var hasRevealCountdown = !!(meta.showAddress && !meta.address && revealAt && revealAt.getTime() > Date.now());
  var hasVisitorInfo = !!(meta.saleDate || meta.hours || hasRevealCountdown || (meta.showAddress && meta.address) || meta.calendarStart);
  if (!hasVisitorInfo) return;

  if (meta.status && meta.status !== 'draft') {
    var statusText = {
      live: isEs ? 'En vivo' : 'Live',
      upcoming: isEs ? 'Próxima' : 'Upcoming',
      done: isEs ? 'Terminada' : 'Done'
    }[meta.status] || meta.status;
    items.push({ label: isEs ? 'Estado' : 'Status', value: statusText });
  }
  if (meta.saleDate) items.push({ label: isEs ? 'Fecha' : 'Date', value: meta.saleDate });
  if (meta.hours) items.push({ label: isEs ? 'Horario' : 'Hours', value: meta.hours });
  if (meta.showAddress && meta.address) {
    items.push({ label: isEs ? 'Dirección' : 'Address', value: meta.address });
    actions.push({ href: mapsHref(meta.address), label: isEs ? 'Abrir mapa' : 'Open map', external: true });
  } else if (hasRevealCountdown) {
    items.push({ label: isEs ? 'Dirección' : 'Address', value: countdownText(revealAt, isEs), id: 'address-countdown' });
  }
  if (meta.calendarStart) {
    actions.push({
      href: calendarHref(meta, isEs),
      label: isEs ? 'Añadir al calendario' : 'Add to calendar',
      download: (meta.slug || 'sale') + '.ics'
    });
  }
  if (!items.length) return;

  var bar = document.createElement('section');
  bar.className = 'sale-info-bar';
  bar.id = 'sale-info-bar';
  bar.setAttribute('aria-label', isEs ? 'Información de venta' : 'Sale information');
  bar.innerHTML = items.map(function (item) {
    return '<span class="sale-info-pill"><em>' + escapeHTML(item.label) + '</em><strong' + (item.id ? ' id="' + item.id + '"' : '') + '>' + escapeHTML(item.value) + '</strong></span>';
  }).join('') + (actions.length
    ? '<span class="sale-info-actions">' + actions.map(function (action) {
        return '<a class="sale-info-action" href="' + escapeHTML(action.href) + '"' +
          (action.external ? ' target="_blank" rel="noopener"' : '') +
          (action.download ? ' download="' + escapeHTML(action.download) + '"' : '') +
          '>' + escapeHTML(action.label) + '</a>';
      }).join('') + '</span>'
    : '');
  header.insertAdjacentElement('afterend', bar);
  if (hasRevealCountdown) startAddressCountdown(revealAt, isEs);
}

async function renderSaleViewCounter(meta, lang) {
  if (!window.CBCMS || !window.CBCMS.isConfigured || !window.CBCMS.isConfigured() || !window.CBCMS.recordSaleView) return;
  var cityId = (meta && (meta.slug || meta.id)) || (typeof LOCATION !== 'undefined' ? LOCATION : '');
  if (!cityId) return;

  var main = document.querySelector('main');
  if (!main) return;
  var counter = document.getElementById('sale-view-counter');
  if (!counter) {
    counter = document.createElement('aside');
    counter.id = 'sale-view-counter';
    counter.className = 'sale-view-counter';
    counter.setAttribute('aria-live', 'polite');
    main.appendChild(counter);
  }
  counter.textContent = lang === 'es' ? 'Contando visitas...' : 'Counting views...';

  try {
    var count = await window.CBCMS.recordSaleView(cityId, lang, visitorKey());
    if (!count) {
      counter.remove();
      return;
    }
    counter.innerHTML =
      '<span>' + escapeHTML(lang === 'es' ? 'Visitas en vivo' : 'Live views') + '</span>' +
      '<strong>' + escapeHTML(formatNumber(count)) + '</strong>';
  } catch (e) {
    counter.remove();
  }
}

function visitorKey() {
  var key = '';
  try {
    key = window.localStorage.getItem('cb-visitor-key') || '';
    if (!key) {
      key = 'v-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
      window.localStorage.setItem('cb-visitor-key', key);
    }
  } catch (e) {
    key = 'volatile-' + Math.random().toString(36).slice(2);
  }
  return key;
}

function formatNumber(value) {
  try { return Number(value || 0).toLocaleString(); } catch (e) { return String(value || 0); }
}

function updateHomeSEO(lang) {
  var isEs = lang === 'es' || document.documentElement.lang === 'es';
  var title = isEs ? 'Clutter Byte — Ventas de garaje y bienes' : 'Clutter Byte — Estate Sales';
  var description = isEs
    ? 'Encuentra ventas de garaje y bienes en Inland Empire con fotos, horarios y enlaces actualizados.'
    : 'Browse Inland Empire estate and garage sales with photos, schedules, and updated sale links.';
  var path = isEs ? '/home-es/' : '/home/';
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:url', absoluteUrl(path));
  setMeta('property', 'og:image', absoluteUrl('/hemet-pics/photo1.jpg'));
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setCanonical(path);
  setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Clutter Byte',
    url: absoluteUrl('/'),
    sameAs: []
  });
}

function updateSaleSEO(meta, lang, photos) {
  meta = meta || {};
  var isEs = lang === 'es';
  var name = meta.name || titleFromSlug(typeof LOCATION !== 'undefined' ? LOCATION : 'sale');
  var title = 'Clutter Byte — ' + name + (isEs ? ' en Español' : '');
  var details = [meta.saleDate, meta.hours].filter(Boolean).join(' · ');
  var description = isEs
    ? (details ? name + ': ' + details + '. Fotos y detalles de la venta.' : name + ': fotos y detalles de la venta.')
    : (details ? name + ': ' + details + '. Photos and sale details.' : name + ': estate sale photos and details.');
  var city = meta.slug || (typeof LOCATION !== 'undefined' ? LOCATION : '');
  var path = window.location.pathname.indexOf('/sale') === 0
    ? '/sale/?city=' + encodeURIComponent(city) + (isEs ? '&lang=es' : '')
    : window.location.pathname;
  var image = photos && photos[0] ? photos[0] : (meta.coverSrc || '/hemet-pics/photo1.jpg');

  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:type', 'article');
  setMeta('property', 'og:url', absoluteUrl(path));
  setMeta('property', 'og:image', absoluteUrl(image));
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setCanonical(path);
  setJsonLd(saleStructuredData(name, description, path, image, meta));
}

function saleStructuredData(name, description, path, image, meta) {
  var data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: name + ' Estate Sale',
    description: description,
    url: absoluteUrl(path),
    image: [absoluteUrl(image)],
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: meta.status === 'done'
      ? 'https://schema.org/EventCompleted'
      : 'https://schema.org/EventScheduled',
    organizer: {
      '@type': 'Organization',
      name: 'Clutter Byte',
      url: absoluteUrl('/')
    }
  };
  if (meta.calendarStart) data.startDate = meta.calendarStart;
  if (meta.calendarEnd) data.endDate = meta.calendarEnd;
  if (meta.address) {
    data.location = {
      '@type': 'Place',
      name: name,
      address: meta.address
    };
  }
  return data;
}

function setJsonLd(data) {
  var tag = document.getElementById('structured-data');
  if (!tag) {
    tag = document.createElement('script');
    tag.id = 'structured-data';
    tag.type = 'application/ld+json';
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(data);
}

function setMeta(kind, key, value) {
  if (!value) return;
  var selector = 'meta[' + kind + '="' + key + '"]';
  var tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(kind, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', value);
}

function setCanonical(path) {
  var link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = absoluteUrl(path);
}

function mapsHref(address) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
}

function calendarHref(meta, isEs) {
  var title = (meta.name || 'Estate Sale') + ' - Clutter Byte';
  var description = [meta.saleDate, meta.hours, absoluteUrl('/sale/?city=' + encodeURIComponent(meta.slug || ''))]
    .filter(Boolean)
    .join('\\n');
  var ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clutter Byte//Sale//EN',
    'BEGIN:VEVENT',
    'UID:' + (meta.slug || 'sale') + '@clutterbyte.com',
    'DTSTAMP:' + icsDate(new Date().toISOString()),
    'DTSTART:' + icsDate(meta.calendarStart),
    meta.calendarEnd ? 'DTEND:' + icsDate(meta.calendarEnd) : '',
    'SUMMARY:' + icsClean(title),
    'DESCRIPTION:' + icsClean(description),
    meta.address ? 'LOCATION:' + icsClean(meta.address) : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
}

function icsDate(value) {
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsClean(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function startAddressCountdown(revealAt, isEs) {
  var node = document.getElementById('address-countdown');
  if (!node) return;
  function tick() {
    node.textContent = countdownText(revealAt, isEs);
    if (revealAt.getTime() <= Date.now()) {
      window.clearInterval(timer);
      node.textContent = isEs ? 'Actualiza para ver la dirección' : 'Refresh to view address';
    }
  }
  tick();
  var timer = window.setInterval(tick, 30000);
}

function countdownText(revealAt, isEs) {
  var diff = revealAt.getTime() - Date.now();
  if (diff <= 0) return isEs ? 'Se revela pronto' : 'Reveals soon';
  var minutes = Math.ceil(diff / 60000);
  var days = Math.floor(minutes / 1440);
  var hours = Math.floor((minutes % 1440) / 60);
  var mins = minutes % 60;
  if (days > 0) return isEs ? days + 'd ' + hours + 'h' : days + 'd ' + hours + 'h';
  if (hours > 0) return isEs ? hours + 'h ' + mins + 'm' : hours + 'h ' + mins + 'm';
  return mins + 'm';
}

function showComingSoon(section, countEl, lang) {
  if (countEl) {
    countEl.style.display = '';
    countEl.textContent = lang === 'es' ? 'Fotos próximamente' : 'Photos coming soon';
  }
  section.innerHTML =
    '<div class="coming-soon">' +
      '<p class="coming-soon-title">' + (lang === 'es' ? 'Próximamente' : 'Coming<br/>Soon') + '</p>' +
      '<p class="coming-soon-sub">' + (lang === 'es' ? 'Vuelve pronto' : 'Check back shortly') + '</p>' +
    '</div>';
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
var _carouselKeyBound = false;
var _dragBoundTrack = null;
var _lbKeyBound = false;

function buildCarousel(container, photos, driveLink, lang, ctaBg, meta) {
  _photos    = photos;
  _total     = photos.length;
  _idx       = 0;
  _vIdx      = 0;
  _hasCta    = !!driveLink;
  _driveLink = driveLink || '';

  var isEs = (lang === 'es');

  // Build photo slides
  var photoHTML = photos.map(function (src, i) {
    var safeSrc = escapeHTML(src);
    return '<div class="cs" data-vi="' + i + '" data-real="' + i + '">' +
      '<img src="' + safeSrc + '" alt="' + (isEs ? 'Foto ' : 'Photo ') + (i + 1) + '"' +
      ' loading="' + (i < 4 ? 'eager' : 'lazy') + '"' +
      ' draggable="false"></div>';
  }).join('');

  // Build CTA card if drive link present
  var ctaHTML = '';
  if (_hasCta) {
    var ctaVi      = _total;
    var bgSrc      = ctaBg; // pre-blurred image supplied via CTA_BACKGROUNDS
    var ctaCount   = meta && meta.ctaCount ? meta.ctaCount : '100+';
    var ctaLabel   = meta && (isEs ? meta.ctaLabelEs : meta.ctaLabelEn)
      ? (isEs ? meta.ctaLabelEs : meta.ctaLabelEn)
      : (isEs ? 'más fotos en Google Drive' : 'more photos on Google Drive');
    var ctaBtnText = meta && (isEs ? meta.ctaButtonEs : meta.ctaButtonEn)
      ? (isEs ? meta.ctaButtonEs : meta.ctaButtonEn)
      : (isEs ? 'Ver Galería Completa ↗' : 'View Full Gallery ↗');
    var ctaBgHTML  = bgSrc
      ? '<div class="cta-bg-wrap">' +
          '<img class="cta-bg-img" src="' + escapeHTML(bgSrc) + '" alt="" aria-hidden="true" draggable="false">' +
        '</div>'
      : '<div class="cta-bg-fallback" aria-hidden="true"></div>';

    ctaHTML =
      '<div class="cs cs-cta" data-vi="' + ctaVi + '" data-cta="true">' +
        ctaBgHTML +
        '<div class="cta-collage-mask"></div>' +
        '<div class="cta-bottom">' +
          '<span class="cta-count shine-text">' + escapeHTML(ctaCount) + '</span>' +
          '<span class="cta-label">' + escapeHTML(ctaLabel) + '</span>' +
          '<a class="cta-link" href="' + escapeHTML(driveLink) + '" target="_blank" rel="noopener">' + escapeHTML(ctaBtnText) + '</a>' +
        '</div>' +
      '</div>';
  }

  container.innerHTML =
    '<div class="c-outer">' +
      '<div class="c-track" id="c-track">' + photoHTML + ctaHTML + '</div>' +
      '<div class="c-ui">' +
        '<div class="c-arrows">' +
          '<button class="c-arrow" id="c-prev" aria-label="' + (isEs ? 'Anterior' : 'Previous') + '" disabled>&#8592;</button>' +
          '<span class="c-counter" id="c-counter">1 / ' + _slidesLabelTotal() + '</span>' +
          '<button class="c-arrow" id="c-next" aria-label="' + (isEs ? 'Siguiente' : 'Next') + '">&#8594;</button>' +
        '</div>' +
        '<div class="c-thumbs" id="c-thumbs" aria-label="' + (isEs ? 'Miniaturas' : 'Thumbnails') + '">' +
          photos.map(function (src, i) {
            return '<button class="c-thumb" type="button" data-thumb-index="' + i + '" aria-label="' + (isEs ? 'Foto ' : 'Photo ') + (i + 1) + '">' +
              '<img src="' + escapeHTML(src) + '" alt="" loading="lazy" draggable="false">' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
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
  var counter = document.getElementById('c-counter');
  if (prev) prev.disabled = (_vIdx === 0);
  if (next) next.disabled = (_vIdx === _slides.length - 1);
  if (counter) counter.textContent = (_vIdx + 1) + ' / ' + _slidesLabelTotal();
  Array.from(document.querySelectorAll('.c-thumb')).forEach(function (thumb) {
    thumb.classList.toggle('active', parseInt(thumb.getAttribute('data-thumb-index'), 10) === _idx && _vIdx < _total);
  });
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
  var thumbs = document.getElementById('c-thumbs');
  if (thumbs) {
    thumbs.addEventListener('click', function (e) {
      var button = e.target.closest('.c-thumb');
      if (!button) return;
      goTo(parseInt(button.getAttribute('data-thumb-index'), 10), false);
    });
  }

  if (!_carouselKeyBound) {
    _carouselKeyBound = true;
    document.addEventListener('keydown', function (e) {
      if (!_slides.length) return;
      var lb = document.getElementById('lightbox');
      if (lb && lb.classList.contains('active')) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft')  step(-1);
    });
  }

  if (_track && _dragBoundTrack !== _track) {
    _dragBoundTrack = _track;
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
      var ctaLink = e.target.closest('.cta-link');

      if (ctaLink && vi !== _vIdx) {
        e.preventDefault();
        step(vi > _vIdx ? 1 : -1);
        return;
      }

      if (vi === _vIdx) {
        // Center slide clicked.
        if (s.dataset.cta) {
          if (ctaLink) return;
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

function _slidesLabelTotal() {
  return _total + (_hasCta ? 1 : 0);
}

// ── LIGHTBOX ──────────────────────────────────────────────────────────────
var _lbIdx = 0;

function initLightbox() {
  var lb    = document.getElementById('lightbox');
  var close = document.getElementById('lb-close');
  var prev  = document.getElementById('lb-prev');
  var next  = document.getElementById('lb-next');
  if (!lb) return;

  if (close) close.addEventListener('click', closeLightbox);
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
  if (prev) prev.addEventListener('click', function () { lbGo(_lbIdx - 1); });
  if (next) next.addEventListener('click', function () { lbGo(_lbIdx + 1); });

  if (!_lbKeyBound) {
    _lbKeyBound = true;
    document.addEventListener('keydown', function (e) {
      var activeLb = document.getElementById('lightbox');
      if (!activeLb || !activeLb.classList.contains('active')) return;
      if (e.key === 'Escape')     closeLightbox();
      if (e.key === 'ArrowRight') lbGo(_lbIdx + 1);
      if (e.key === 'ArrowLeft')  lbGo(_lbIdx - 1);
    });
  }
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
