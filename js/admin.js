// ── CLUTTER BYTE — /ed estate editor ─────────────────────────────────────

(function () {
  var STORAGE_KEY = 'cb-ed-editor-v3';
  var LEGACY_KEY = 'cb-ed-editor-v2';
  var HISTORY_KEY = 'cb-ed-history-v1';
  var HISTORY_LIMIT = 40;
  var PHOTO_LIMIT = 20;

  var selectedCityId = '';
  var state = null;
  var objectUrls = {};
  var drag = {};
  var statusTimer = 0;
  var cloudTimer = 0;
  var history = [];
  var lastHistoryAt = 0;
  var cloudSession = null;
  var cloudAuthorized = false;
  var authCheckPromise = null;
  var authCheckId = 0;
  var hydrating = false;
  var syncing = false;
  var previewLang = 'en';
  var replacePhotoId = '';
  var uploadSlotIndex = -1;
  var scanResults = {};
  var cms = window.CBCMS || null;

  var DEFAULTS = {
    temecula: { name: 'Temecula', slug: 'temecula' },
    hemet: { name: 'Hemet', slug: 'hemet' }
  };

  var DEFAULT_SETTINGS = {
    phone: '(323) 301-9200',
    sms: '+13233019200',
    contactEn: 'Text anytime',
    contactEs: 'Escribe cuando quieras',
    notes: ''
  };

  var DEFAULT_CTA = {
    count: '100+',
    labelEn: 'more photos on Google Drive',
    labelEs: 'más fotos en Google Drive',
    buttonEn: 'View Full Gallery ↗',
    buttonEs: 'Ver Galería Completa ↗'
  };

  document.addEventListener('DOMContentLoaded', function () {
    state = loadState();
    history = loadHistory();
    selectedCityId = state.cities[0] ? state.cities[0].id : '';
    bindEvents();
    render();
    initCloud();
  });

  function bindEvents() {
    bind('download-package', 'click', function () { downloadText('clutterbyte-package.json', JSON.stringify(exportManifest(), null, 2)); });
    bind('city-add', 'click', addCity);
    bind('city-delete', 'click', deleteSelectedCity);
    bind('city-duplicate', 'click', duplicateSelectedCity);
    bind('publish-city', 'click', publishSelectedCity);
    bind('run-checks', 'click', runChecks);
    bind('copy-preview-link', 'click', function (button) { copyText(previewLink(previewLang), button); });
    bind('text-preview-link', 'click', textPreviewLink);
    bind('download-flyer', 'click', function () { var city = selectedCity(); if (city) downloadText(city.slug + '-flyer.html', generateFlyer(city)); });

    bind('mode-simple', 'click', function () { setMode('simple'); });
    bind('mode-advanced', 'click', function () { setMode('advanced'); });
    bind('preview-en', 'click', function () { previewLang = 'en'; renderPreview(); });
    bind('preview-es', 'click', function () { previewLang = 'es'; renderPreview(); });
    bind('undo-last', 'click', undoLast);
    bind('make-snapshot', 'click', makeSnapshot);

    var loginForm = byId('ed-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        loginToCloud();
      });
    }
    bind('ed-sync-now', 'click', function () { syncCloudNow('Cloud synced'); });
    bind('ed-sign-out', 'click', signOutCloud);

    [
      'city-name', 'city-slug', 'city-status', 'city-date', 'city-hours',
      'city-drive', 'city-cta', 'city-cta-count', 'city-cta-label-en',
      'city-cta-label-es', 'city-cta-button-en', 'city-cta-button-es',
      'city-address', 'city-address-reveal', 'city-calendar-start',
      'city-calendar-end'
    ].forEach(function (id) {
      bind(id, 'input', updateCityFromFields);
      bind(id, 'change', updateCityFromFields);
    });
    bind('city-active', 'change', updateCityFromFields);
    bind('city-show-address', 'change', updateCityFromFields);

    bind('photo-add-path', 'click', addPhotoPath);
    bind('photo-path', 'keydown', function (node, event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        addPhotoPath();
      }
    });
    bind('photo-upload', 'change', function (node) {
      var files = Array.from(node.files || []);
      if (uploadSlotIndex >= 0) {
        addUploadsAt(files, uploadSlotIndex, false);
        uploadSlotIndex = -1;
      } else {
        addUploads(files);
      }
      node.value = '';
    });
    bind('photo-replace-input', 'change', function (node) {
      var file = node.files && node.files[0];
      if (file && replacePhotoId) replacePhoto(file, replacePhotoId);
      node.value = '';
      replacePhotoId = '';
    });
    bind('photo-sort-name', 'click', sortPhotosByName);
    bind('photo-renumber', 'click', compactPhotoSlots);
    bind('photo-clean-alt', 'click', cleanAltText);
    bind('photo-clear', 'click', clearPhotos);

    bind('copy-photos-js', 'click', function (button) { copyText(generatePhotosJs(), button); });
    bind('download-photos-js', 'click', function () { downloadText('photos.js', generatePhotosJs()); });
    bind('download-en-page', 'click', function () { var city = selectedCity(); if (city) downloadText(city.slug + '-index.html', generateCityPage(city, 'en')); });
    bind('download-es-page', 'click', function () { var city = selectedCity(); if (city) downloadText(city.slug + '-es-index.html', generateCityPage(city, 'es')); });
    bind('download-manifest', 'click', function () { downloadText('clutterbyte-ed-manifest.json', JSON.stringify(exportManifest(), null, 2)); });
    bind('reset-editor', 'click', resetDraft);

    bind('copy-snippet', 'click', function (button) { copyText(snippetText(), button); });

    ['setting-phone', 'setting-sms', 'setting-contact-en', 'setting-contact-es', 'editor-notes'].forEach(function (id) {
      bind(id, 'input', updateSettingsFromFields);
      bind(id, 'change', updateSettingsFromFields);
    });

    var cityList = byId('city-list');
    if (cityList) {
      cityList.addEventListener('click', function (event) {
        var button = event.target.closest('[data-city-id]');
        if (!button) return;
        selectedCityId = button.getAttribute('data-city-id');
        render();
      });
      cityList.addEventListener('dragstart', function (event) {
        var button = event.target.closest('[data-city-id]');
        if (!button) return;
        drag.cityId = button.getAttribute('data-city-id');
        event.dataTransfer.effectAllowed = 'move';
      });
      cityList.addEventListener('dragover', function (event) {
        if (drag.cityId) event.preventDefault();
      });
      cityList.addEventListener('drop', function (event) {
        var target = event.target.closest('[data-city-id]');
        if (!target || !drag.cityId) return;
        event.preventDefault();
        moveCityBefore(drag.cityId, target.getAttribute('data-city-id'));
        drag.cityId = '';
      });
      cityList.addEventListener('dragend', function () { drag.cityId = ''; });
    }

    var photoList = byId('photo-list');
    if (photoList) {
      photoList.addEventListener('click', function (event) {
        var button = event.target.closest('[data-photo-action]');
        if (!button) return;
        handlePhotoAction(button.getAttribute('data-photo-action'), button.getAttribute('data-photo-id'), button);
      });
      photoList.addEventListener('dragstart', function (event) {
        var item = event.target.closest('[data-photo-id]');
        if (!item) return;
        drag.photoId = item.getAttribute('data-photo-id');
        event.dataTransfer.effectAllowed = 'move';
      });
      photoList.addEventListener('dragover', function (event) {
        var item = event.target.closest('[data-slot-index]');
        if (!item) return;
        if (drag.photoId || hasDraggedFiles(event)) {
          event.preventDefault();
          item.classList.add('drop-target');
        }
      });
      photoList.addEventListener('dragleave', function (event) {
        var item = event.target.closest('[data-slot-index]');
        if (item) item.classList.remove('drop-target');
      });
      photoList.addEventListener('drop', function (event) {
        var item = event.target.closest('[data-slot-index]');
        if (!item) return;
        event.preventDefault();
        item.classList.remove('drop-target');
        var slotIndex = parseInt(item.getAttribute('data-slot-index'), 10);
        var files = Array.from(event.dataTransfer.files || []).filter(isUploadableImage);
        if (files.length) {
          addUploadsAt(files, slotIndex, !!item.getAttribute('data-photo-id'));
          return;
        }
        if (drag.photoId) {
          movePhotoToSlot(drag.photoId, slotIndex);
          drag.photoId = '';
        }
      });
      photoList.addEventListener('dragend', function () { drag.photoId = ''; });
    }

    var dropzone = byId('photo-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(function (eventName) {
        dropzone.addEventListener(eventName, function (event) {
          event.preventDefault();
          dropzone.classList.add('dragging');
        });
      });
      ['dragleave', 'drop'].forEach(function (eventName) {
        dropzone.addEventListener(eventName, function () { dropzone.classList.remove('dragging'); });
      });
      dropzone.addEventListener('drop', function (event) {
        event.preventDefault();
        addUploads(Array.from(event.dataTransfer.files || []).filter(isUploadableImage));
      });
    }

    document.addEventListener('click', function (event) {
      var mobile = event.target.closest('[data-mobile-view]');
      if (mobile) setMobileView(mobile.getAttribute('data-mobile-view'));

      var restore = event.target.closest('[data-history-action]');
      if (restore) handleHistoryAction(restore.getAttribute('data-history-action'), parseInt(restore.getAttribute('data-history-index'), 10));
    });
  }

  function bind(id, eventName, handler) {
    var node = byId(id);
    if (!node) return;
    if (node.tagName === 'BUTTON') node.dataset.label = node.textContent;
    node.addEventListener(eventName, function (event) { handler(event.currentTarget, event); });
  }

  async function initCloud() {
    renderAuth();
    if (!cloudConfigured()) {
      setDashboardLocked(true);
      markSaved('Locked');
      renderAuth();
      return;
    }

    try {
      cloudSession = await cms.getSession();
      cloudAuthorized = false;
      renderAuth();
      if (cloudSession) await loadCloudState();
    } catch (error) {
      markSaved('Cloud unavailable');
      renderAuth('Dashboard connection unavailable.');
    }

    cms.onAuthStateChange(function (event, session) {
      if (!session && !hydrating) {
        authCheckId++;
        authCheckPromise = null;
        cloudSession = null;
        cloudAuthorized = false;
        setDashboardLocked(true);
        renderAuth();
        return;
      }

      if (session) {
        cloudSession = session;
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') cloudAuthorized = false;
      }
      renderAuth();
      if (session && !hydrating && !cloudAuthorized) loadCloudState();
    });
  }

  async function loginToCloud() {
    if (hydrating) return;
    if (!cloudConfigured()) {
      renderAuth('Login is temporarily unavailable.');
      markSaved('Locked');
      return;
    }
    var email = readValue('ed-login-email');
    var password = readRawValue('ed-login-password');
    if (!email || !password) {
      renderAuth('Enter email and password');
      return;
    }
    markSaved('Logging in...');
    try {
      cloudSession = await cms.signIn(email, password);
      cloudAuthorized = false;
      setValue('ed-login-password', '');
      var unlocked = await loadCloudState();
      markSaved(unlocked ? 'Logged in' : 'Locked');
    } catch (error) {
      renderAuth('Login failed. Check email and password.');
      markSaved('Login failed');
    }
  }

  async function signOutCloud() {
    if (!cloudConfigured()) return;
    authCheckId++;
    authCheckPromise = null;
    try {
      await cms.signOut();
    } catch (e) {}
    cloudSession = null;
    cloudAuthorized = false;
    hydrating = false;
    setDashboardLocked(true);
    renderAuth();
  }

  async function loadCloudState() {
    if (!cloudConfigured() || !cloudSession) return false;
    if (authCheckPromise) return authCheckPromise;
    authCheckPromise = doLoadCloudState();
    try {
      return await authCheckPromise;
    } finally {
      authCheckPromise = null;
    }
  }

  async function doLoadCloudState() {
    var checkId = ++authCheckId;
    var finalMessage = '';
    hydrating = true;
    setDashboardLocked(true);
    renderAuth();
    markSaved('Checking access...');
    try {
      var allowed = await withTimeout(
        cms.verifyAdmin ? cms.verifyAdmin() : Promise.resolve(false),
        12000,
        'access-timeout'
      );
      if (checkId !== authCheckId) return false;
      if (!allowed) throw new Error('not-admin');

      var cloudState = await withTimeout(cms.loadEditorData(), 16000, 'data-timeout');
      if (checkId !== authCheckId) return false;
      if (cloudState && cloudState.cities && cloudState.cities.length) {
        state = normalizeState(cloudState);
        selectedCityId = state.cities[0] ? state.cities[0].id : '';
        persist();
      }
      cloudAuthorized = true;
      setDashboardLocked(false);
      markSaved('Cloud loaded');
      renderAuth();
      render();
      return true;
    } catch (error) {
      if (checkId !== authCheckId) return false;
      cloudAuthorized = false;
      cloudSession = null;
      try { await cms.signOut(); } catch (e) {}
      setDashboardLocked(true);
      markSaved('Cloud load failed');
      finalMessage = error && error.message === 'not-admin'
        ? 'This account is not allowed to open the dashboard.'
        : (error && /timeout/.test(error.message)
          ? 'Dashboard check timed out. Try again.'
          : 'Dashboard connection unavailable.');
      return false;
    } finally {
      if (checkId === authCheckId) {
        hydrating = false;
        renderAuth(finalMessage || undefined);
      }
    }
  }

  function renderAuth(errorText) {
    var configured = cloudConfigured();
    var loggedIn = !!cloudSession;
    var status = byId('ed-cloud-status');
    var loginForm = byId('ed-login-form');
    var actions = document.querySelector('.ed-cloud-actions');
    var syncButton = byId('ed-sync-now');

    if (status) {
      status.textContent = errorText || (configured
        ? (loggedIn
          ? (cloudAuthorized ? 'Signed in. Cloud autosave is active.' : 'Checking dashboard access...')
          : 'Log in, upload photos, publish.')
        : 'Log in, upload photos, publish.');
    }
    if (loginForm) loginForm.style.display = !loggedIn ? 'grid' : 'none';
    if (actions) actions.style.display = configured && loggedIn ? 'flex' : 'none';
    if (syncButton) syncButton.style.display = configured && loggedIn && cloudAuthorized ? '' : 'none';
    var submitButton = byId('ed-login-submit');
    if (submitButton) {
      submitButton.disabled = hydrating;
      submitButton.textContent = hydrating ? 'Checking...' : 'Log in';
    }
    document.body.classList.toggle('ed-cloud-ready', configured && loggedIn && cloudAuthorized);
    document.body.classList.toggle('ed-local-only', !configured);
    setDashboardLocked(!(configured && loggedIn && cloudAuthorized));
  }

  function setDashboardLocked(locked) {
    document.body.classList.toggle('ed-locked', !!locked);
    document.querySelectorAll('[data-ed-gated]').forEach(function (node) {
      node.hidden = !!locked;
    });
  }

  function cloudConfigured() {
    return !!(cms && cms.isConfigured && cms.isConfigured());
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = window.setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error(message || 'timeout'));
      }, ms);
      Promise.resolve(promise).then(function (value) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(value);
      }).catch(function (error) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        reject(error);
      });
    });
  }

  function loadState() {
    var loaded = null;
    try {
      loaded = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_KEY) || 'null');
    } catch (e) {
      loaded = null;
    }
    return normalizeState(loaded || defaultState());
  }

  function defaultState() {
    var keys = [];
    if (typeof PHOTOS !== 'undefined') keys = keys.concat(Object.keys(PHOTOS));
    if (typeof CITY_META !== 'undefined') keys = keys.concat(Object.keys(CITY_META));
    keys = keys.filter(function (key, index) { return keys.indexOf(key) === index; });
    if (!keys.length) keys = ['temecula', 'hemet'];

    return {
      version: 3,
      settings: Object.assign({}, DEFAULT_SETTINGS),
      cities: keys.map(function (key, index) {
        var meta = Object.assign({}, DEFAULTS[key] || {}, (typeof CITY_META !== 'undefined' && CITY_META[key]) || {});
        var slug = meta.slug || slugify(key);
        var photos = (typeof PHOTOS !== 'undefined' && Array.isArray(PHOTOS[key])) ? PHOTOS[key] : [];
        return {
          id: slug,
          name: meta.name || titleFromSlug(slug),
          slug: slug,
          active: meta.active !== false,
          status: meta.status || (photos.length ? 'live' : 'draft'),
          saleDate: meta.saleDate || '',
          hours: meta.hours || '',
          address: meta.address || '',
          showAddress: !!meta.showAddress,
          addressRevealAt: meta.addressRevealAt || '',
          calendarStart: meta.calendarStart || '',
          calendarEnd: meta.calendarEnd || '',
          driveLink: valueFrom(typeof DRIVE_LINKS !== 'undefined' ? DRIVE_LINKS : null, key),
          ctaBg: valueFrom(typeof CTA_BACKGROUNDS !== 'undefined' ? CTA_BACKGROUNDS : null, key),
          ctaCount: meta.ctaCount || DEFAULT_CTA.count,
          ctaLabelEn: meta.ctaLabelEn || DEFAULT_CTA.labelEn,
          ctaLabelEs: meta.ctaLabelEs || DEFAULT_CTA.labelEs,
          ctaButtonEn: meta.ctaButtonEn || DEFAULT_CTA.buttonEn,
          ctaButtonEs: meta.ctaButtonEs || DEFAULT_CTA.buttonEs,
          coverId: '',
          sortOrder: (index + 1) * 10,
          photos: photos.filter(Boolean).map(function (src, photoIndex) { return photoFromPath(src, photoIndex); })
        };
      })
    };
  }

  function normalizeState(raw) {
    var stateIn = raw || {};
    var seen = {};
    var cities = Array.isArray(stateIn.cities) ? stateIn.cities : [];
    cities = cities.map(function (city, index) {
      var slug = slugify(city.slug || city.name || city.id || 'city');
      slug = uniqueId(slug, seen);
      var photos = Array.isArray(city.photos) ? city.photos : [];
      photos = photos.map(function (photo, photoIndex) {
        if (typeof photo === 'string') return photoFromPath(photo, photoIndex);
        return {
          id: photo.id || uid(),
          src: photo.src || '',
          name: photo.name || fileName(photo.src),
          kind: photo.kind || 'path',
          storageBucket: photo.storageBucket || '',
          storagePath: photo.storagePath || '',
          size: photo.size || 0,
          mime: photo.mime || '',
          alt: photo.alt || '',
          state: photo.state || '',
          slot: Number.isFinite(parseInt(photo.slot, 10)) ? parseInt(photo.slot, 10) : slotFromSort(photo.sortOrder, photoIndex),
          sortOrder: photo.sortOrder || (photoIndex + 1) * 10
        };
      }).filter(function (photo) { return photo.src; });
      photos = normalizePhotoSlots(photos);

      var coverId = city.coverId || (photos[0] ? photos[0].id : '');
      if (coverId && !photos.some(function (photo) { return photo.id === coverId; })) {
        coverId = photos[0] ? photos[0].id : '';
      }

      return {
        id: slug,
        name: city.name || titleFromSlug(slug),
        slug: slug,
        active: city.active !== false,
        status: city.status || 'draft',
        saleDate: city.saleDate || city.date || '',
        hours: city.hours || '',
        address: city.address || '',
        showAddress: !!city.showAddress,
        addressRevealAt: city.addressRevealAt || '',
        calendarStart: city.calendarStart || '',
        calendarEnd: city.calendarEnd || '',
        driveLink: city.driveLink || '',
        ctaBg: city.ctaBg || '',
        ctaCount: city.ctaCount || DEFAULT_CTA.count,
        ctaLabelEn: city.ctaLabelEn || DEFAULT_CTA.labelEn,
        ctaLabelEs: city.ctaLabelEs || DEFAULT_CTA.labelEs,
        ctaButtonEn: city.ctaButtonEn || DEFAULT_CTA.buttonEn,
        ctaButtonEs: city.ctaButtonEs || DEFAULT_CTA.buttonEs,
        coverId: coverId,
        sortOrder: city.sortOrder || (index + 1) * 10,
        photos: photos
      };
    });
    cities.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    if (!cities.length) cities = defaultState().cities;

    return {
      version: 3,
      settings: Object.assign({}, DEFAULT_SETTINGS, stateIn.settings || {}),
      cities: cities
    };
  }

  function render() {
    if (!selectedCityId && state.cities[0]) selectedCityId = state.cities[0].id;
    if (!selectedCity()) selectedCityId = state.cities[0] ? state.cities[0].id : '';
    state.cities.forEach(ensureCityPhotoSlots);
    renderAuth();
    renderMetrics();
    renderCities();
    renderCityFields();
    renderPhotos();
    renderChecks();
    renderSnippet();
    renderSettings();
    renderOutput();
    renderPreview();
    renderHistory();
  }

  function renderMetrics() {
    var root = byId('ed-metrics');
    if (!root) return;
    var active = state.cities.filter(function (city) { return city.active; }).length;
    var uploads = allPhotos().filter(function (photo) { return photo.kind === 'upload'; }).length;
    var city = selectedCity();
    var slots = city ? Math.max(0, PHOTO_LIMIT - city.photos.length) : PHOTO_LIMIT;
    root.innerHTML =
      metricHTML(state.cities.length, 'cities') +
      metricHTML(totalPhotos(), 'photos') +
      metricHTML(active, 'visible') +
      metricHTML(uploads, 'pending') +
      metricHTML(slots, 'slots left');
  }

  function metricHTML(value, label) {
    return '<span><strong>' + escapeHTML(value) + '</strong>' + escapeHTML(label) + '</span>';
  }

  function renderCities() {
    var list = byId('city-list');
    if (!list) return;
    list.innerHTML = '';
    state.cities.forEach(function (city) {
      var button = document.createElement('button');
      button.type = 'button';
      button.draggable = true;
      button.className = 'ed-city-button' + (city.id === selectedCityId ? ' active' : '') + (city.active ? '' : ' muted');
      button.setAttribute('data-city-id', city.id);
      button.innerHTML =
        '<span class="ed-city-name">' + escapeHTML(city.name) + '</span>' +
        '<span class="ed-city-meta">' + city.photos.length + ' photos - ' + escapeHTML(city.status) + '</span>';
      list.appendChild(button);
    });
  }

  function renderCityFields() {
    var city = selectedCity();
    if (!city) return;
    setValue('city-name', city.name);
    setValue('city-slug', city.slug);
    setValue('city-status', city.status);
    setChecked('city-active', city.active);
    setValue('city-date', city.saleDate);
    setValue('city-hours', city.hours);
    setValue('city-drive', city.driveLink);
    setValue('city-cta', city.ctaBg);
    setValue('city-cta-count', city.ctaCount);
    setValue('city-cta-label-en', city.ctaLabelEn);
    setValue('city-cta-label-es', city.ctaLabelEs);
    setValue('city-cta-button-en', city.ctaButtonEn);
    setValue('city-cta-button-es', city.ctaButtonEs);
    setValue('city-address', city.address);
    setChecked('city-show-address', city.showAddress);
    setValue('city-address-reveal', toDatetimeInput(city.addressRevealAt));
    setValue('city-calendar-start', toDatetimeInput(city.calendarStart));
    setValue('city-calendar-end', toDatetimeInput(city.calendarEnd));

    var route = byId('city-route-label');
    if (route) route.textContent = cloudConfigured() ? '/sale/?city=' + city.slug : '/' + city.slug + ' and /' + city.slug + '-es';
    var en = byId('city-open-en');
    var es = byId('city-open-es');
    if (en) en.href = previewLink('en');
    if (es) es.href = previewLink('es');
    var cover = city.photos.filter(function (photo) { return photo.id === city.coverId; })[0];
    var coverIndex = cover ? cover.slot : -1;
    var coverLabel = byId('cover-label');
    if (coverLabel) coverLabel.textContent = cover ? 'Cover: slot ' + (coverIndex + 1) : 'No cover';
  }

  function renderPhotos() {
    var city = selectedCity();
    var list = byId('photo-list');
    var count = byId('photo-count-label');
    if (!city || !list) return;
    if (count) count.textContent = city.photos.length + ' / ' + PHOTO_LIMIT + ' slots used';
    list.innerHTML = '';

    var duplicates = duplicatePhotoIds(city);
    for (var index = 0; index < PHOTO_LIMIT; index++) {
      var photo = slotPhoto(city, index);
      var item = document.createElement('article');
      item.className = 'ed-photo-item ed-slot' + (photo ? ' filled' : ' empty');
      item.setAttribute('data-slot-index', index);

      if (!photo) {
        item.innerHTML =
          '<div class="ed-slot-empty">' +
            '<strong>Slot ' + (index + 1) + '</strong>' +
            '<span>Empty</span>' +
            '<button class="admin-row-action" data-photo-action="upload-slot" data-slot-index="' + index + '" type="button">Upload here</button>' +
          '</div>';
        list.appendChild(item);
        continue;
      }

      item.className += (photo.id === city.coverId ? ' cover' : '') + (duplicates[photo.id] ? ' duplicate' : '');
      item.draggable = true;
      item.setAttribute('data-photo-id', photo.id);
      var img = document.createElement('img');
      img.className = 'ed-photo-thumb';
      img.src = photoDisplaySrc(photo);
      img.alt = photo.alt || photo.name || photo.src;
      img.loading = index < 8 ? 'eager' : 'lazy';
      bindPhotoLoadState(img, item);

      var label = photo.kind === 'storage' ? 'uploaded' : (photo.kind === 'upload' ? 'pending upload' : 'site path');
      if (duplicates[photo.id]) label += ' - duplicate';
      var body = document.createElement('div');
      body.className = 'ed-photo-body';
      body.innerHTML =
        '<strong>Slot ' + (index + 1) + '</strong>' +
        '<span>' + escapeHTML(label) + (photo.id === city.coverId ? ' - cover' : '') + '</span>' +
        '<small>Drop a file here to replace</small>' +
        '<em class="ed-photo-src">' + escapeHTML(photo.src) + '</em>';

      var actions = document.createElement('div');
      actions.className = 'ed-photo-actions';
      actions.appendChild(action('cover', photo.id, photo.id === city.coverId ? 'Cover' : 'Make cover'));
      actions.appendChild(action('replace', photo.id, 'Replace'));
      actions.appendChild(action('up', photo.id, 'Up'));
      actions.appendChild(action('down', photo.id, 'Down'));
      actions.appendChild(action('top', photo.id, 'Top'));
      actions.appendChild(action('copy', photo.id, 'Copy'));
      actions.appendChild(action('remove', photo.id, 'Delete'));

      item.appendChild(img);
      item.appendChild(body);
      item.appendChild(actions);
      list.appendChild(item);
    }
  }

  function renderChecks() {
    var city = selectedCity();
    var root = byId('publish-checks');
    if (!root || !city) return;
    var duplicateCount = Object.keys(duplicatePhotoIds(city)).length;
    var brokenCount = scanResults[city.id] && scanResults[city.id].broken ? scanResults[city.id].broken.length : 0;
    var checks = [];
    checks.push(check(city.active, 'Visible on home', 'Hidden from home'));
    checks.push(check(!!city.name, 'City name set', 'Missing city name'));
    checks.push(check(!!city.slug, 'Routes ready', 'Missing slug'));
    checks.push(check(city.photos.length > 0 && city.photos.length <= PHOTO_LIMIT, city.photos.length + ' photos', city.photos.length ? 'Max ' + PHOTO_LIMIT + ' photos' : 'No photos yet'));
    checks.push(check(!!city.coverId, 'Cover selected', 'Choose a cover'));
    checks.push(check(validGalleryLink(city.driveLink), 'Gallery link valid', 'Gallery link looks wrong'));
    checks.push(check(pendingUploads(city).length === 0, 'No pending uploads', pendingUploads(city).length + ' pending uploads'));
    checks.push(check(!duplicateCount, 'No duplicate photos', duplicateCount + ' duplicate flags'));
    checks.push(check(!brokenCount, 'No broken photos found', brokenCount + ' broken photos'));
    checks.push(check(city.showAddress ? !!city.address : true, 'Address privacy clear', 'Address reveal is on but blank'));
    checks.push(check(currentSiteHasCity(city.slug), 'Live route ready', 'Needs dynamic /sale route or page files'));
    checks.push(check(uniqueSlugs(), 'Unique city URLs', 'Duplicate city URLs'));
    root.innerHTML = checks.map(function (item) {
      return '<div class="ed-check ' + (item.ok ? 'ok' : 'warn') + '">' +
        '<span>' + escapeHTML(item.label) + '</span>' +
        '<strong>' + (item.ok ? 'OK' : 'Fix') + '</strong>' +
      '</div>';
    }).join('') + '<div class="ed-change-summary">' + escapeHTML(changeSummary()) + '</div>';
  }

  function renderSnippet() {
    var output = byId('snippet-output');
    if (output) output.textContent = snippetText();
  }

  function renderSettings() {
    setValue('setting-phone', state.settings.phone);
    setValue('setting-sms', state.settings.sms);
    setValue('setting-contact-en', state.settings.contactEn);
    setValue('setting-contact-es', state.settings.contactEs);
    setValue('editor-notes', state.settings.notes);
  }

  function renderOutput() {
    var output = byId('photos-output');
    if (output) output.textContent = generatePhotosJs();
  }

  function renderPreview() {
    var city = selectedCity();
    var root = byId('ed-preview');
    if (!root || !city) return;
    var photos = city.photos.slice();
    var cover = city.photos.filter(function (photo) { return photo.id === city.coverId; })[0] || photos[0];
    var title = previewLang === 'es' ? city.name + ' - Espanol' : city.name;
    var contact = previewLang === 'es' ? state.settings.contactEs : state.settings.contactEn;
    root.innerHTML =
      '<div class="ed-preview-device">' +
        '<div class="ed-preview-hero" style="background-image:' + cssBackgroundImage(photoDisplaySrc(cover)) + '">' +
          '<span>' + escapeHTML(city.status) + '</span>' +
          '<strong>' + escapeHTML(title) + '</strong>' +
          '<em>' + escapeHTML(city.saleDate || city.hours || contact) + '</em>' +
        '</div>' +
        '<div class="ed-preview-grid">' +
          photos.slice(0, 6).map(function (photo) {
            return '<img src="' + escapeHTML(photoDisplaySrc(photo)) + '" alt="' + escapeHTML(photo.alt || '') + '"/>';
          }).join('') +
        '</div>' +
        '<a class="admin-link" href="' + escapeHTML(previewLink(previewLang)) + '" target="_blank" rel="noopener">Open preview</a>' +
      '</div>';
  }

  function renderHistory() {
    var root = byId('history-list');
    if (!root) return;
    if (!history.length) {
      root.innerHTML = '<div class="admin-empty">No snapshots yet</div>';
      return;
    }
    root.innerHTML = history.slice(0, 8).map(function (entry, index) {
      return '<div class="ed-history-row">' +
        '<span><strong>' + escapeHTML(entry.label) + '</strong><em>' + escapeHTML(shortTime(entry.createdAt)) + '</em></span>' +
        '<button class="admin-row-action" data-history-action="restore" data-history-index="' + index + '" type="button">Restore</button>' +
      '</div>';
    }).join('');
  }

  function updateCityFromFields() {
    var city = selectedCity();
    if (!city) return;
    remember('Before city edit', true);
    city.name = readValue('city-name') || city.name;
    city.slug = uniqueSlug(slugify(readValue('city-slug') || city.slug), city.id);
    city.id = city.slug;
    selectedCityId = city.id;
    city.status = readValue('city-status') || 'draft';
    city.active = checked('city-active');
    city.saleDate = readValue('city-date');
    city.hours = readValue('city-hours');
    city.driveLink = readValue('city-drive');
    city.ctaBg = readValue('city-cta');
    city.ctaCount = readValue('city-cta-count') || DEFAULT_CTA.count;
    city.ctaLabelEn = readValue('city-cta-label-en') || DEFAULT_CTA.labelEn;
    city.ctaLabelEs = readValue('city-cta-label-es') || DEFAULT_CTA.labelEs;
    city.ctaButtonEn = readValue('city-cta-button-en') || DEFAULT_CTA.buttonEn;
    city.ctaButtonEs = readValue('city-cta-button-es') || DEFAULT_CTA.buttonEs;
    city.address = readValue('city-address');
    city.showAddress = checked('city-show-address');
    city.addressRevealAt = fromDatetimeInput(readRawValue('city-address-reveal'));
    city.calendarStart = fromDatetimeInput(readRawValue('city-calendar-start'));
    city.calendarEnd = fromDatetimeInput(readRawValue('city-calendar-end'));
    autosave('City updated');
    render();
  }

  function updateSettingsFromFields() {
    remember('Before settings edit', true);
    state.settings.phone = readValue('setting-phone');
    state.settings.sms = readValue('setting-sms');
    state.settings.contactEn = readValue('setting-contact-en');
    state.settings.contactEs = readValue('setting-contact-es');
    state.settings.notes = readRawValue('editor-notes');
    autosave('Defaults updated');
    renderOutput();
  }

  function addCity() {
    remember('Before city added');
    var base = uniqueSlug('new-city', '');
    var city = {
      id: base,
      name: 'New City',
      slug: base,
      active: false,
      status: 'draft',
      saleDate: '',
      hours: '',
      address: '',
      showAddress: false,
      addressRevealAt: '',
      calendarStart: '',
      calendarEnd: '',
      driveLink: '',
      ctaBg: '',
      ctaCount: DEFAULT_CTA.count,
      ctaLabelEn: DEFAULT_CTA.labelEn,
      ctaLabelEs: DEFAULT_CTA.labelEs,
      ctaButtonEn: DEFAULT_CTA.buttonEn,
      ctaButtonEs: DEFAULT_CTA.buttonEs,
      coverId: '',
      sortOrder: (state.cities.length + 1) * 10,
      photos: []
    };
    state.cities.push(city);
    selectedCityId = city.id;
    autosave('City added');
    render();
    focusField('city-name');
  }

  function duplicateSelectedCity() {
    var city = selectedCity();
    if (!city) return;
    remember('Before city duplicated');
    var slug = uniqueSlug(city.slug + '-copy', '');
    var copy = JSON.parse(JSON.stringify(city));
    copy.id = slug;
    copy.slug = slug;
    copy.name = city.name + ' Copy';
    copy.active = false;
    copy.sortOrder = (state.cities.length + 1) * 10;
    var originalCoverId = copy.coverId;
    copy.coverId = '';
    copy.photos = copy.photos.map(function (photo) {
      var wasCover = photo.id === originalCoverId;
      photo.id = uid();
      if (wasCover) copy.coverId = photo.id;
      return photo;
    });
    ensureCityPhotoSlots(copy);
    if (!copy.coverId) copy.coverId = copy.photos[0] ? copy.photos[0].id : '';
    state.cities.push(copy);
    selectedCityId = copy.id;
    autosave('City duplicated');
    render();
  }

  function deleteSelectedCity() {
    var city = selectedCity();
    if (!city || state.cities.length < 2) {
      markSaved('Keep at least one city');
      return;
    }
    if (!window.confirm('Delete ' + city.name + ' from this draft?')) return;
    remember('Before city deleted');
    revokeCityPreviews(city);
    state.cities = state.cities.filter(function (item) { return item.id !== city.id; });
    selectedCityId = state.cities[0] ? state.cities[0].id : '';
    autosave('City deleted');
    render();
  }

  function publishSelectedCity() {
    var city = selectedCity();
    if (!city) return;
    if (!city.photos.length || city.photos.length > PHOTO_LIMIT) {
      markSaved(city.photos.length ? 'Max ' + PHOTO_LIMIT + ' photos' : 'Add at least 1 photo');
      renderChecks();
      return;
    }
    remember('Before publish');
    city.active = true;
    city.status = 'live';
    if (!city.coverId && city.photos[0]) city.coverId = city.photos[0].id;
    autosave('City published');
    render();
    syncCloudNow('Published');
  }

  function addPhotoPath() {
    var city = selectedCity();
    var input = byId('photo-path');
    var path = input ? input.value.trim() : '';
    if (!city || !path) return;
    ensureCityPhotoSlots(city);
    var openSlot = nextOpenSlot(city, 0);
    if (openSlot < 0 || city.photos.length >= PHOTO_LIMIT) {
      markSaved('Max ' + PHOTO_LIMIT + ' photos');
      return;
    }
    if (city.photos.some(function (photo) { return photo.src === path; })) {
      markSaved('Duplicate photo skipped');
      return;
    }
    remember('Before slot path added');
    var photo = photoFromPath(path, openSlot);
    photo.alt = altFor(city, openSlot);
    city.photos.push(photo);
    if (!city.coverId) city.coverId = photo.id;
    if (input) input.value = '';
    autosave('Slot path added');
    render();
  }

  async function addUploads(files) {
    return addUploadsAt(files, 0, false);
  }

  async function addUploadsAt(files, slotIndex, replaceExisting) {
    var city = selectedCity();
    files = Array.from(files || []).filter(isUploadableImage);
    if (!city || !files.length) return;

    ensureCityPhotoSlots(city);
    slotIndex = Math.max(0, Math.min(PHOTO_LIMIT - 1, parseInt(slotIndex, 10) || 0));
    var willReplace = !!(replaceExisting && slotPhoto(city, slotIndex));
    var slots = PHOTO_LIMIT - city.photos.length + (willReplace ? 1 : 0);
    if (slots <= 0) {
      markSaved('Max ' + PHOTO_LIMIT + ' photos');
      return;
    }
    if (files.length > slots) {
      files = files.slice(0, slots);
      markSaved('Only ' + slots + ' slots open');
    }
    remember(willReplace ? 'Before slot replaced' : 'Before photos uploaded');
    var added = 0;
    var replaced = false;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (i === 0 && willReplace) {
        if (await replacePhotoAtSlot(city, slotIndex, file, true)) {
          added++;
          replaced = true;
          render();
        }
        continue;
      }

      var openSlot = nextOpenSlot(city, slotIndex);
      if (openSlot < 0) {
        markSaved('No open slots');
        break;
      }
      var photo = await uploadedPhotoFromFile(city, file, openSlot);
      city.photos.push(photo);
      ensureCityPhotoSlots(city);
      if (!city.coverId) city.coverId = photo.id;
      added++;
      render();
    }
    if (!added) {
      render();
      return;
    }
    updateProgress(100, added + (added === 1 ? ' slot ready' : ' slots ready'));
    autosave(replaced ? 'Slot replaced' : added + (added === 1 ? ' photo added' : ' photos added'));
    render();
  }

  async function replacePhoto(file, photoId) {
    var city = selectedCity();
    if (!city) return;
    var photo = city.photos.filter(function (item) { return item.id === photoId; })[0];
    var slotIndex = photo ? photo.slot : -1;
    if (slotIndex < 0) return;
    remember('Before photo replaced');
    await replacePhotoAtSlot(city, slotIndex, file, false);
  }

  async function replacePhotoAtSlot(city, slotIndex, file, batchMode) {
    var photo = slotPhoto(city, slotIndex);
    if (!photo) return;
    var oldBucket = photo.storageBucket;
    var oldPath = photo.storagePath;
    var prepared = await compressImage(file);
    updateProgress(20, 'Replacing slot ' + (slotIndex + 1));
    if (cloudConfigured() && cloudAuthorized) {
      var uploaded;
      try {
        uploaded = await cms.uploadPhoto(city, prepared, function (percent, label) {
          updateProgress(percent, label);
        });
      } catch (error) {
        updateProgress(100, 'Upload failed');
        markSaved('Upload failed');
        return false;
      }
      revokePreview(photo.id);
      photo.src = uploaded.src;
      photo.kind = uploaded.kind;
      photo.storageBucket = uploaded.storageBucket;
      photo.storagePath = uploaded.storagePath;
      if (oldBucket && oldPath) cms.deleteStorageObject(oldBucket, oldPath);
    } else {
      objectUrls[photo.id] = URL.createObjectURL(prepared);
      photo.src = '/' + city.slug + '-pics/slot-' + (slotIndex + 1) + (extension(prepared.name || file.name) || '.jpg');
      photo.kind = 'upload';
    }
    photo.name = prepared.name || file.name;
    photo.size = prepared.size || file.size;
    photo.mime = prepared.type || file.type;
    photo.alt = altFor(city, slotIndex);
    photo.slot = slotIndex;
    photo.sortOrder = (slotIndex + 1) * 10;
    photo.replacedAt = new Date().toISOString();
    if (!batchMode) {
      autosave('Slot ' + (slotIndex + 1) + ' replaced');
      render();
    }
    return true;
  }

  async function uploadedPhotoFromFile(city, file, slotIndex) {
    updateProgress(15, 'Preparing slot ' + (slotIndex + 1));
    var prepared = await compressImage(file);
    var id = uid();
    var ext = extension(prepared.name || file.name) || '.jpg';
    var photo = {
      id: id,
      src: '/' + city.slug + '-pics/slot-' + (slotIndex + 1) + ext,
      name: prepared.name || file.name,
      kind: 'upload',
      size: prepared.size || file.size,
      mime: prepared.type || file.type,
      alt: altFor(city, slotIndex),
      slot: slotIndex,
      sortOrder: (slotIndex + 1) * 10
    };

    if (cloudConfigured() && cloudAuthorized) {
      try {
        var uploaded = await cms.uploadPhoto(city, prepared, function (percent, label) {
          updateProgress(percent, label + ' ' + file.name);
        });
        photo.src = uploaded.src;
        photo.kind = uploaded.kind;
        photo.storageBucket = uploaded.storageBucket;
        photo.storagePath = uploaded.storagePath;
      } catch (error) {
        markSaved('Upload failed');
        objectUrls[id] = URL.createObjectURL(prepared);
      }
    } else {
      objectUrls[id] = URL.createObjectURL(prepared);
    }

    return photo;
  }

  function sortPhotosByName() {
    var city = selectedCity();
    if (!city) return;
    remember('Before slots sorted');
    city.photos.sort(function (a, b) { return a.src.localeCompare(b.src); });
    city.photos.forEach(function (photo, index) {
      photo.slot = index;
      photo.sortOrder = (index + 1) * 10;
      photo.alt = photo.alt || altFor(city, index);
    });
    ensureCityPhotoSlots(city);
    autosave('Slots sorted');
    render();
  }

  function compactPhotoSlots() {
    var city = selectedCity();
    if (!city || !city.photos.length) return;
    remember('Before slots compacted');
    ensureCityPhotoSlots(city);
    city.photos.forEach(function (photo, index) {
      photo.slot = index;
      photo.sortOrder = (index + 1) * 10;
      photo.alt = altFor(city, index);
    });
    ensureCityPhotoSlots(city);
    autosave('Slots compacted');
    render();
  }

  function cleanAltText() {
    var city = selectedCity();
    if (!city) return;
    remember('Before alt text cleanup');
    ensureCityPhotoSlots(city);
    city.photos.forEach(function (photo) {
      photo.alt = altFor(city, photo.slot);
    });
    autosave('Alt text cleaned');
    render();
  }

  function clearPhotos() {
    var city = selectedCity();
    if (!city || !city.photos.length) return;
    if (!window.confirm('Remove all photos from ' + city.name + ' in this draft?')) return;
    remember('Before photos cleared');
    city.photos.forEach(function (photo) {
      if (cloudConfigured() && cloudAuthorized && photo.storageBucket && photo.storagePath) {
        cms.deleteStorageObject(photo.storageBucket, photo.storagePath);
      }
    });
    revokeCityPreviews(city);
    city.photos = [];
    city.coverId = '';
    autosave('Photos cleared');
    render();
  }

  function handlePhotoAction(actionName, photoId, button) {
    var city = selectedCity();
    if (!city) return;
    if (actionName === 'upload-slot') {
      uploadSlotIndex = Math.max(0, Math.min(PHOTO_LIMIT - 1, parseInt(button.getAttribute('data-slot-index'), 10) || 0));
      var uploadInput = byId('photo-upload');
      if (uploadInput) uploadInput.click();
      return;
    }

    var index = city.photos.findIndex(function (photo) { return photo.id === photoId; });
    var photo = city.photos[index];
    if (!photo) return;
    var slotIndex = photo.slot;

    if (actionName === 'copy') {
      copyText(photo.src, button);
      return;
    }
    if (actionName === 'replace') {
      replacePhotoId = photo.id;
      var input = byId('photo-replace-input');
      if (input) input.click();
      return;
    }

    remember('Before photos updated');
    if (actionName === 'cover') {
      city.coverId = photo.id;
    } else if (actionName === 'up' && slotIndex > 0) {
      movePhotoToSlot(photo.id, slotIndex - 1, true);
    } else if (actionName === 'down' && slotIndex < PHOTO_LIMIT - 1) {
      movePhotoToSlot(photo.id, slotIndex + 1, true);
    } else if (actionName === 'top' && slotIndex > 0) {
      movePhotoToSlot(photo.id, 0, true);
    } else if (actionName === 'remove') {
      city.photos.splice(index, 1);
      revokePreview(photo.id);
      if (cloudConfigured() && cloudAuthorized && photo.storageBucket && photo.storagePath) {
        cms.deleteStorageObject(photo.storageBucket, photo.storagePath);
      }
      if (city.coverId === photo.id) city.coverId = city.photos[0] ? city.photos[0].id : '';
    }

    ensureCityPhotoSlots(city);
    autosave('Photos updated');
    render();
  }

  function movePhotoToSlot(sourceId, targetIndex, skipSave) {
    var city = selectedCity();
    if (!city) return;
    var source = city.photos.filter(function (photo) { return photo.id === sourceId; })[0];
    if (!source) return;
    targetIndex = Math.max(0, Math.min(parseInt(targetIndex, 10) || 0, PHOTO_LIMIT - 1));
    if (source.slot === targetIndex) return;
    if (!skipSave) remember('Before photos reordered');
    var target = slotPhoto(city, targetIndex);
    var oldSlot = source.slot;
    source.slot = targetIndex;
    source.sortOrder = (targetIndex + 1) * 10;
    if (target && target.id !== source.id) {
      target.slot = oldSlot;
      target.sortOrder = (oldSlot + 1) * 10;
    }
    ensureCityPhotoSlots(city);
    if (!skipSave) {
      autosave('Photos reordered');
      render();
    }
  }

  function moveCityBefore(sourceId, targetId) {
    if (sourceId === targetId) return;
    var sourceIndex = state.cities.findIndex(function (city) { return city.id === sourceId; });
    var targetIndex = state.cities.findIndex(function (city) { return city.id === targetId; });
    if (sourceIndex < 0 || targetIndex < 0) return;
    remember('Before cities reordered');
    var item = state.cities.splice(sourceIndex, 1)[0];
    targetIndex = state.cities.findIndex(function (city) { return city.id === targetId; });
    state.cities.splice(targetIndex, 0, item);
    state.cities.forEach(function (city, index) { city.sortOrder = (index + 1) * 10; });
    autosave('Cities reordered');
    render();
  }

  async function runChecks(button) {
    var city = selectedCity();
    if (!city) return;
    flash(button, 'Checking');
    var broken = [];
    for (var i = 0; i < city.photos.length; i++) {
      var photo = city.photos[i];
      if (photo.kind === 'upload') continue;
      var ok = await checkImage(photo.src);
      if (!ok) broken.push(photo.src);
    }
    scanResults[city.id] = { broken: broken, checkedAt: new Date().toISOString() };
    flash(button, broken.length ? 'Found issues' : 'Clean');
    renderChecks();
  }

  function autosave(message) {
    markDirty();
    if (persist()) markSaved(message || 'Autosaved');
    scheduleCloudSync();
  }

  function persist() {
    var clean = cleanState(state);
    clean.savedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      return true;
    } catch (e) {
      markSaved('Draft too large for local save');
      return false;
    }
  }

  function scheduleCloudSync() {
    if (hydrating || !cloudConfigured() || !cloudAuthorized) return;
    clearTimeout(cloudTimer);
    cloudTimer = window.setTimeout(function () {
      syncCloudNow('Cloud saved');
    }, 650);
  }

  async function syncCloudNow(message) {
    if (syncing || !cloudConfigured() || !cloudAuthorized) return;
    syncing = true;
    markSaved('Syncing cloud...');
    try {
      await cms.saveState(cleanState(state));
      markSaved(message || 'Cloud saved');
    } catch (error) {
      markSaved('Cloud sync failed');
      renderAuth(error.message || 'Cloud sync failed');
    } finally {
      syncing = false;
    }
  }

  function markDirty() {
    var node = byId('ed-save-state');
    if (node) node.textContent = 'Saving...';
  }

  function markSaved(text) {
    var node = byId('ed-save-state');
    if (node) node.textContent = text || 'Autosaved';
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(function () {
      if (node) node.textContent = cloudConfigured() && cloudAuthorized ? 'Cloud autosaved' : 'Autosaved';
    }, 1800);
  }

  async function resetDraft(button) {
    if (!window.confirm('Reset everything in /ed back to the current site/cloud data?')) return;
    remember('Before reset');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_KEY);
    } catch (e) {}
    revokeAllPreviews();
    if (cloudConfigured() && cloudAuthorized) {
      await loadCloudState();
      flash(button, 'Cloud reset');
      return;
    }
    state = defaultState();
    selectedCityId = state.cities[0] ? state.cities[0].id : '';
    persist();
    render();
    flash(button, 'Reset');
  }

  function remember(label, compact) {
    if (!state || hydrating) return;
    var now = Date.now();
    if (compact && now - lastHistoryAt < 1300) return;
    lastHistoryAt = now;
    history.unshift({
      label: label || 'Snapshot',
      createdAt: new Date().toISOString(),
      state: cleanState(state)
    });
    history = history.slice(0, HISTORY_LIMIT);
    saveHistory();
  }

  function makeSnapshot(button) {
    remember('Manual snapshot');
    renderHistory();
    flash(button, 'Saved');
  }

  function undoLast(button) {
    if (!history.length) {
      flash(button, 'No undo');
      return;
    }
    var entry = history.shift();
    saveHistory();
    state = normalizeState(entry.state);
    selectedCityId = state.cities[0] ? state.cities[0].id : '';
    autosave('Undo restored');
    render();
  }

  function handleHistoryAction(actionName, index) {
    if (actionName !== 'restore' || !history[index]) return;
    var entry = history[index];
    history.splice(index, 1);
    saveHistory();
    state = normalizeState(entry.state);
    selectedCityId = state.cities[0] ? state.cities[0].id : '';
    autosave('Snapshot restored');
    render();
  }

  function loadHistory() {
    try {
      var loaded = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(loaded) ? loaded : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory() {
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
  }

  function setMode(mode) {
    document.body.classList.toggle('simple-mode', mode !== 'advanced');
    document.body.classList.toggle('advanced-mode', mode === 'advanced');
    byId('mode-simple').classList.toggle('active', mode !== 'advanced');
    byId('mode-advanced').classList.toggle('active', mode === 'advanced');
  }

  function setMobileView(view) {
    ['cities', 'photos', 'publish', 'settings', 'preview'].forEach(function (name) {
      document.body.classList.toggle('ed-mobile-view-' + name, view === name);
    });
    Array.from(document.querySelectorAll('[data-mobile-view]')).forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-mobile-view') === view);
    });
  }

  function updateProgress(percent, label) {
    var root = byId('upload-progress');
    var bar = byId('upload-progress-bar');
    var text = byId('upload-progress-label');
    if (root) root.classList.add('active');
    if (bar) bar.style.width = Math.max(0, Math.min(100, percent || 0)) + '%';
    if (text) text.textContent = label || 'Working';
    if (percent >= 100) {
      window.setTimeout(function () {
        if (root) root.classList.remove('active');
      }, 1800);
    }
  }

  function snippetText() {
    var city = selectedCity();
    if (!city) return '';
    var lines = [];
    ensureCityPhotoSlots(city);
    for (var i = 0; i < PHOTO_LIMIT; i++) {
      var photo = slotPhoto(city, i);
      lines.push('Slot ' + (i + 1) + ': ' + (photo ? photo.src : 'empty'));
    }
    return lines.join('\n');
  }

  function revokePreview(id) {
    if (!objectUrls[id]) return;
    URL.revokeObjectURL(objectUrls[id]);
    delete objectUrls[id];
  }

  function revokeCityPreviews(city) {
    city.photos.forEach(function (photo) { revokePreview(photo.id); });
  }

  function revokeAllPreviews() {
    Object.keys(objectUrls).forEach(revokePreview);
  }

  function generatePhotosJs() {
    var lines = [
      '// -------------------------------------------------------------------------',
      '//  CLUTTER BYTE - PHOTOS',
      '//  Generated from /ed',
      '// -------------------------------------------------------------------------',
      '',
      'var PHOTOS = {',
      ''
    ];

    state.cities.forEach(function (city, cityIndex) {
      ensureCityPhotoSlots(city);
      lines.push('  ' + jsString(city.slug) + ': [');
      city.photos.forEach(function (photo) {
        lines.push('    ' + jsString(photo.src) + ',');
      });
      lines.push('  ]' + (cityIndex === state.cities.length - 1 ? '' : ','));
      lines.push('');
    });

    lines.push('};');
    lines.push('');
    lines.push('var CITY_META = {');
    state.cities.forEach(function (city, index) {
      var cover = city.photos.filter(function (photo) { return photo.id === city.coverId; })[0];
      var meta = {
        name: city.name,
        active: city.active,
        status: city.status,
        saleDate: city.saleDate,
        hours: city.hours,
        address: city.showAddress ? city.address : '',
        showAddress: city.showAddress,
        addressRevealAt: city.addressRevealAt,
        calendarStart: city.calendarStart,
        calendarEnd: city.calendarEnd,
        cover: cover ? cover.src : '',
        ctaCount: city.ctaCount,
        ctaLabelEn: city.ctaLabelEn,
        ctaLabelEs: city.ctaLabelEs,
        ctaButtonEn: city.ctaButtonEn,
        ctaButtonEs: city.ctaButtonEs
      };
      lines.push('  ' + jsString(city.slug) + ': ' + objectLiteral(meta) + (index === state.cities.length - 1 ? '' : ','));
    });
    lines.push('};');
    lines.push('');
    lines.push('var DRIVE_LINKS = {');
    state.cities.forEach(function (city, index) {
      lines.push('  ' + jsString(city.slug) + ': ' + jsString(city.driveLink) + (index === state.cities.length - 1 ? '' : ','));
    });
    lines.push('};');
    lines.push('');
    lines.push('var CTA_BACKGROUNDS = {');
    state.cities.forEach(function (city, index) {
      lines.push('  ' + jsString(city.slug) + ': ' + jsString(city.ctaBg) + (index === state.cities.length - 1 ? '' : ','));
    });
    lines.push('};');
    return lines.join('\n');
  }

  function generateCityPage(city, lang) {
    var isEs = lang === 'es';
    var home = isEs ? '/home-es' : '/home';
    var title = 'Clutter Byte - ' + city.name;
    var contact = isEs ? 'Contacto' : 'Contact';
    var label = isEs ? state.settings.contactEs : state.settings.contactEn;
    var pitch = isEs ? 'Organizando una venta de garaje o bienes? Podemos publicarla aqui.' : 'Hosting a garage or estate sale? We can list it here for you.';
    var close = isEs ? 'Cerrar' : 'Close';
    var back = isEs ? 'Volver' : 'Back';
    var homeLabel = isEs ? 'Inicio' : 'Home';
    var prev = isEs ? 'Anterior' : 'Previous';
    var next = isEs ? 'Siguiente' : 'Next';
    var hint = isEs ? 'esc / flechas para navegar' : 'esc / arrows to navigate';
    var vars = "var LOCATION = '" + city.slug + "';" + (isEs ? " var LANG = 'es';" : '');
    var assetVersion = '?v=20260701-dashboard-polish';

    return '<!DOCTYPE html>\n' +
      '<html lang="' + (isEs ? 'es' : 'en') + '">\n<head>\n' +
      '  <meta charset="UTF-8"/>\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n' +
      '  <meta name="description" content="' + escapeHTML(city.name + ' estate sale photos and details from Clutter Byte.') + '"/>\n' +
      '  <meta name="theme-color" content="#1c1c1a"/>\n' +
      '  <title>' + escapeHTML(title) + '</title>\n' +
      '  <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>\n' +
      '  <link rel="manifest" href="/site.webmanifest"/>\n' +
      '  <link rel="stylesheet" href="../css/theme.css' + assetVersion + '"/>\n' +
      '</head>\n<body>\n\n' +
      '  <header class="cb-header">\n' +
      '    <a href="' + home + '" class="logo"><span class="logo-icon"></span><span class="logo-text">Clutter Byte</span></a>\n' +
      '    <div class="header-right"><button class="header-contact-btn" id="header-contact-btn">' + contact + '</button></div>\n' +
      '  </header>\n\n' +
      '  <div class="phone-overlay" id="phone-overlay" role="dialog" aria-label="' + contact + '">\n' +
      '    <div class="phone-overlay-left">\n' +
      '      <span class="phone-overlay-label">' + escapeHTML(label) + '</span>\n' +
      '      <a href="sms:' + escapeHTML(state.settings.sms) + '" class="phone-overlay-number">' + escapeHTML(state.settings.phone) + '</a>\n' +
      '      <span class="phone-overlay-sub shine-text">' + pitch + '</span>\n' +
      '    </div>\n' +
      '    <button class="phone-overlay-close" id="phone-overlay-close">' + close + '</button>\n' +
      '  </div>\n' +
      '  <div class="phone-backdrop" id="phone-backdrop"></div>\n\n' +
      '  <main>\n' +
      '    <div class="page-header">\n' +
      '      <a href="' + home + '" class="btn back">' + back + '</a>\n' +
      '      <h2 class="page-title">' + escapeHTML(city.name) + '</h2>\n' +
      '      <p class="page-meta" id="photo-count"></p>\n' +
      '    </div>\n' +
      '    <section class="carousel-section" id="carousel-section"></section>\n' +
      '  </main>\n\n' +
      '  <footer class="cb-footer"><span>Clutter Byte</span><a href="' + home + '" class="footer-link">' + homeLabel + '</a></footer>\n' +
      '  <div class="lightbox" id="lightbox" role="dialog" aria-modal="true">\n' +
      '    <button class="lb-close" id="lb-close">' + close + '</button>\n' +
      '    <div class="lb-nav"><button class="lb-arrow" id="lb-prev" aria-label="' + prev + '">&#8592;</button><button class="lb-arrow" id="lb-next" aria-label="' + next + '">&#8594;</button></div>\n' +
      '    <img class="lightbox-img" id="lb-img" src="" alt=""/><span class="lb-hint">' + hint + '</span>\n' +
      '  </div>\n\n' +
      '  <script>' + vars + '</script>\n' +
      '  <script src="../js/ed-config.js' + assetVersion + '"></script>\n' +
      '  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n' +
      '  <script src="../js/supabase-cms.js' + assetVersion + '"></script>\n' +
      '  <script src="../js/photos.js' + assetVersion + '"></script>\n' +
      '  <script src="../js/main.js' + assetVersion + '"></script>\n\n' +
      '</body>\n</html>\n';
  }

  function generateFlyer(city) {
    var link = previewLink('en');
    var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(link);
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escapeHTML(city.name) + ' Flyer</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:56px;margin:0 0 8px;text-transform:uppercase}p{font-size:20px}.qr{display:grid;gap:10px;margin-top:24px;max-width:260px}.qr img{width:220px;height:220px}.qr small{font-size:12px;word-break:break-all}@media print{button{display:none}}</style></head>' +
      '<body><button onclick="print()">Print</button><h1>' + escapeHTML(city.name) + '</h1><p>' + escapeHTML(city.saleDate || city.hours || 'Estate sale photos online') + '</p><p>' + escapeHTML(state.settings.contactEn) + ': ' + escapeHTML(state.settings.phone) + '</p><div class="qr"><img src="' + escapeHTML(qr) + '" alt="QR code"/><small>' + escapeHTML(link) + '</small></div></body></html>';
  }

  function exportManifest() {
    return {
      generatedAt: new Date().toISOString(),
      settings: state.settings,
      cities: state.cities,
      photosJs: generatePhotosJs(),
      previewLink: previewLink('en'),
      pendingUploads: allPhotos().filter(function (photo) { return photo.kind === 'upload'; }).map(function (photo) { return photo.src; })
    };
  }

  function action(name, photoId, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-row-action photo-action-' + name;
    button.dataset.label = label;
    button.setAttribute('data-photo-action', name);
    button.setAttribute('data-photo-id', photoId);
    button.textContent = label;
    return button;
  }

  function bindPhotoLoadState(img, item) {
    img.onerror = function () { item.classList.add('missing'); };
    img.onload = function () { item.classList.add('loaded'); };
  }

  function check(ok, good, bad) {
    return { ok: !!ok, label: ok ? good : bad };
  }

  function selectedCity() {
    return state.cities.filter(function (city) { return city.id === selectedCityId; })[0] || state.cities[0];
  }

  function allPhotos() {
    return state.cities.reduce(function (list, city) { return list.concat(city.photos); }, []);
  }

  function pendingUploads(city) {
    return city.photos.filter(function (photo) { return photo.kind === 'upload'; });
  }

  function ensureCityPhotoSlots(city) {
    if (!city) return;
    city.photos = normalizePhotoSlots(city.photos || []);
    if (city.coverId && !city.photos.some(function (photo) { return photo.id === city.coverId; })) {
      city.coverId = city.photos[0] ? city.photos[0].id : '';
    }
  }

  function normalizePhotoSlots(photos) {
    var used = {};
    var result = [];
    (photos || []).forEach(function (photo, index) {
      if (!photo || !photo.src) return;
      var slot = Number.isFinite(parseInt(photo.slot, 10))
        ? parseInt(photo.slot, 10)
        : slotFromSort(photo.sortOrder, index);
      if (slot < 0 || slot >= PHOTO_LIMIT || used[slot]) slot = firstOpenSlot(used);
      if (slot < 0) return;
      used[slot] = true;
      photo.slot = slot;
      photo.sortOrder = (slot + 1) * 10;
      result.push(photo);
    });
    return result.sort(function (a, b) { return a.slot - b.slot; });
  }

  function slotFromSort(sortOrder, fallbackIndex) {
    var order = parseInt(sortOrder, 10);
    if (order > 0) return Math.max(0, Math.min(PHOTO_LIMIT - 1, Math.round(order / 10) - 1));
    return Math.max(0, Math.min(PHOTO_LIMIT - 1, fallbackIndex || 0));
  }

  function firstOpenSlot(used) {
    for (var i = 0; i < PHOTO_LIMIT; i++) {
      if (!used[i]) return i;
    }
    return -1;
  }

  function slotPhoto(city, slotIndex) {
    return (city.photos || []).filter(function (photo) {
      return photo.slot === slotIndex;
    })[0] || null;
  }

  function nextOpenSlot(city, startSlot) {
    startSlot = Math.max(0, Math.min(PHOTO_LIMIT - 1, parseInt(startSlot, 10) || 0));
    var used = {};
    (city.photos || []).forEach(function (photo) { used[photo.slot] = true; });
    for (var i = startSlot; i < PHOTO_LIMIT; i++) {
      if (!used[i]) return i;
    }
    for (var j = 0; j < startSlot; j++) {
      if (!used[j]) return j;
    }
    return -1;
  }

  function duplicatePhotoIds(city) {
    var seen = {};
    var dupes = {};
    city.photos.forEach(function (photo) {
      var key = String(photo.src || photo.name || '').toLowerCase();
      if (!key) return;
      if (seen[key]) {
        dupes[seen[key]] = true;
        dupes[photo.id] = true;
      } else {
        seen[key] = photo.id;
      }
    });
    return dupes;
  }

  function isUploadableImage(file) {
    if (!file) return false;
    if (/^image\//i.test(file.type || '')) return true;
    return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || '');
  }

  function hasDraggedFiles(event) {
    try {
      return Array.from(event.dataTransfer.types || []).indexOf('Files') >= 0;
    } catch (e) {
      return false;
    }
  }

  function uniqueSlugs() {
    var seen = {};
    return state.cities.every(function (city) {
      if (seen[city.slug]) return false;
      seen[city.slug] = true;
      return true;
    });
  }

  function currentSiteHasCity(slug) {
    return cloudConfigured() || !!DEFAULTS[slug];
  }

  function totalPhotos() {
    return allPhotos().length;
  }

  function photoFromPath(src, index) {
    index = Math.max(0, Math.min(PHOTO_LIMIT - 1, parseInt(index, 10) || 0));
    return {
      id: uid(),
      src: src,
      name: fileName(src),
      kind: 'path',
      size: 0,
      alt: '',
      slot: index,
      sortOrder: (index + 1) * 10
    };
  }

  function cleanState(raw) {
    if (raw && Array.isArray(raw.cities)) raw.cities.forEach(ensureCityPhotoSlots);
    return JSON.parse(JSON.stringify(raw));
  }

  function changeSummary() {
    var city = selectedCity();
    if (!city) return 'No city selected';
    var bits = [];
    bits.push(city.status.toUpperCase());
    bits.push(city.active ? 'visible' : 'hidden');
    bits.push(city.photos.length + ' photos');
    if (!city.photos.length) bits.push('needs photos');
    if (city.photos.length > PHOTO_LIMIT) bits.push('too many photos');
    if (pendingUploads(city).length) bits.push(pendingUploads(city).length + ' pending');
    if (Object.keys(duplicatePhotoIds(city)).length) bits.push('duplicates flagged');
    return 'Current: ' + bits.join(' / ');
  }

  function previewLink(lang) {
    var city = selectedCity();
    if (!city) return '/home';
    if (cloudConfigured()) {
      return absolutePath('/sale/?city=' + encodeURIComponent(city.slug) + (lang === 'es' ? '&lang=es' : ''));
    }
    return absolutePath('/' + city.slug + (lang === 'es' ? '-es' : ''));
  }

  function textPreviewLink() {
    var city = selectedCity();
    var body = (city ? city.name + ': ' : '') + previewLink(previewLang);
    window.location.href = 'sms:?&body=' + encodeURIComponent(body);
  }

  function validGalleryLink(url) {
    if (!url) return true;
    return /^https?:\/\//i.test(url);
  }

  function checkImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      var timer = window.setTimeout(function () {
        if (done) return;
        done = true;
        resolve(false);
      }, 7000);
      img.onload = function () {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(true);
      };
      img.onerror = function () {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(false);
      };
      img.src = assetUrl(src);
    });
  }

  function compressImage(file) {
    var cfg = (window.ED_SUPABASE_CONFIG || {});
    var maxSide = cfg.maxImageSide || 1800;
    var quality = cfg.imageQuality || 0.82;
    if (!file || !/^image\//.test(file.type || '') || /gif|svg/i.test(file.type || '')) return Promise.resolve(file);

    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) {
            resolve(file);
            return;
          }
          var name = fileName(file.name).replace(/\.[a-z0-9]+$/i, '') + '.jpg';
          try {
            resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
          } catch (e) {
            blob.name = name;
            resolve(blob);
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function altFor(city, index) {
    return city.name + ' estate sale photo ' + (index + 1);
  }

  function emptyBox(text) {
    var node = document.createElement('div');
    node.className = 'admin-empty';
    node.textContent = text;
    return node;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setValue(id, value) {
    var node = byId(id);
    if (node && node.value !== String(value || '')) node.value = value || '';
  }

  function readValue(id) {
    var node = byId(id);
    return node ? node.value.trim() : '';
  }

  function readRawValue(id) {
    var node = byId(id);
    return node ? node.value : '';
  }

  function setChecked(id, value) {
    var node = byId(id);
    if (node) node.checked = !!value;
  }

  function checked(id) {
    var node = byId(id);
    return !!(node && node.checked);
  }

  function focusField(id) {
    var node = byId(id);
    if (node) {
      node.focus();
      node.select();
    }
  }

  function copyText(text, button) {
    function done(ok) { flash(button, ok ? 'Copied' : 'Copy failed'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallbackCopy(text, done); });
      return;
    }
    fallbackCopy(text, done);
  }

  function fallbackCopy(text, callback) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(textarea);
    callback(ok);
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function flash(button, label) {
    if (!button) return;
    var original = button.dataset.label || button.textContent;
    button.textContent = label;
    window.setTimeout(function () { button.textContent = original; }, 1200);
  }

  function assetUrl(path) {
    if (window.location.protocol !== 'file:' || String(path).indexOf('/') !== 0) return path;
    return '..' + path;
  }

  function photoDisplaySrc(photo) {
    if (!photo) return '';
    return objectUrls[photo.id] || assetUrl(photo.src);
  }

  function cssUrl(path) {
    return "'" + assetUrl(path).replace(/'/g, "%27") + "'";
  }

  function cssBackgroundImage(path) {
    return path ? 'url(' + cssUrl(path) + ')' : 'none';
  }

  function absolutePath(path) {
    if (window.location.origin && window.location.origin !== 'null') return window.location.origin + path;
    return path;
  }

  function valueFrom(source, key) {
    try { return source && source[key] ? source[key] : ''; } catch (e) { return ''; }
  }

  function uniqueSlug(slug, currentId) {
    var seen = {};
    state.cities.forEach(function (city) {
      if (city.id !== currentId) seen[city.slug] = true;
    });
    return uniqueId(slug, seen);
  }

  function uniqueId(base, seen) {
    var root = base || 'city';
    var next = root;
    var count = 2;
    while (seen[next]) {
      next = root + '-' + count;
      count++;
    }
    seen[next] = true;
    return next;
  }

  function uid() {
    return 'id' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function slugify(value) {
    return String(value || 'city')
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'city';
  }

  function titleFromSlug(slug) {
    return String(slug || 'City').split('-').map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' ');
  }

  function fileName(path) {
    return String(path || '').split('/').filter(Boolean).pop() || 'photo.jpg';
  }

  function extension(path) {
    var match = String(path || '').match(/\.[a-z0-9]+$/i);
    return match ? match[0].toLowerCase() : '';
  }

  function toDatetimeInput(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    var offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function fromDatetimeInput(value) {
    if (!value) return '';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  function shortTime(value) {
    try { return new Date(value).toLocaleString(); } catch (e) { return ''; }
  }

  function jsString(value) {
    return "'" + String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }

  function objectLiteral(object) {
    var parts = Object.keys(object).map(function (key) {
      var value = object[key];
      if (typeof value === 'boolean') return key + ': ' + (value ? 'true' : 'false');
      return key + ': ' + jsString(value);
    });
    return '{ ' + parts.join(', ') + ' }';
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }
})();
