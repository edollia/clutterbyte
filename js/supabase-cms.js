// ── CLUTTER BYTE — Supabase CMS bridge ─────────────────────────────────────

(function () {
  var config = window.ED_SUPABASE_CONFIG || {};
  var client = null;

  function isConfigured() {
    return !!(config.url && config.anonKey && window.supabase && window.supabase.createClient);
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client) {
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return client;
  }

  async function getSession() {
    var api = getClient();
    if (!api) return null;
    var result = await api.auth.getSession();
    if (result.error) throw result.error;
    return result.data.session || null;
  }

  async function signIn(email, password) {
    var api = getClient();
    if (!api) throw new Error('Supabase config missing');
    var result = await api.auth.signInWithPassword({ email: email, password: password });
    if (result.error) throw result.error;
    return result.data.session;
  }

  async function signOut() {
    var api = getClient();
    if (!api) return;
    var result = await api.auth.signOut();
    if (result.error) throw result.error;
  }

  async function verifyAdmin() {
    var api = getClient();
    if (!api) return false;
    var result = await api.rpc('is_ed_admin');
    if (result.error) throw result.error;
    return result.data === true;
  }

  function onAuthStateChange(callback) {
    var api = getClient();
    if (!api) return function () {};
    var result = api.auth.onAuthStateChange(function (event, session) {
      callback(event, session);
    });
    return function () {
      try { result.data.subscription.unsubscribe(); } catch (e) {}
    };
  }

  async function loadPublicData() {
    var api = getClient();
    if (!api) return null;

    var locationsResult = await api
      .from('ed_public_locations')
      .select('id,display_name,drive_link,cta_background,status,sale_date,hours,public_address,show_address,address_reveal_at,address_revealed,cover_src,sort_order,is_active,metadata')
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });
    if (locationsResult.error) throw locationsResult.error;

    var photosResult = await api
      .from('ed_photos')
      .select('id,location_id,src,original_name,kind,storage_bucket,storage_path,alt_text,size_bytes,mime_type,sort_order,is_featured,is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (photosResult.error) throw photosResult.error;

    var settingsResult = await api
      .from('ed_site_settings')
      .select('key,value')
      .eq('key', 'public_contact')
      .maybeSingle();
    if (settingsResult.error) throw settingsResult.error;

    return stateFromRows(
      settingsResult.data ? [settingsResult.data] : [],
      locationsResult.data || [],
      photosResult.data || [],
      true
    );
  }

  async function loadEditorData() {
    var api = getClient();
    if (!api) return null;

    var settingsResult = await api
      .from('ed_site_settings')
      .select('*')
      .in('key', ['editor', 'public_contact']);
    if (settingsResult.error) throw settingsResult.error;

    var locationsResult = await api
      .from('ed_locations')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });
    if (locationsResult.error) throw locationsResult.error;

    var photosResult = await api
      .from('ed_photos')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (photosResult.error) throw photosResult.error;

    return stateFromRows(settingsResult.data || [], locationsResult.data || [], photosResult.data || [], false);
  }

  async function saveState(state) {
    var api = getClient();
    if (!api) throw new Error('Supabase config missing');

    var settings = state.settings || {};
    await checked(
      api.from('ed_site_settings').upsert([
        {
          key: 'editor',
          value: {
            phone: settings.phone || '',
            sms: settings.sms || '',
            contactEn: settings.contactEn || '',
            contactEs: settings.contactEs || '',
            notes: settings.notes || ''
          }
        },
        {
          key: 'public_contact',
          value: {
            phone: settings.phone || '',
            sms: settings.sms || '',
            contactEn: settings.contactEn || '',
            contactEs: settings.contactEs || ''
          }
        }
      ], { onConflict: 'key' })
    );

    var locationRows = state.cities.map(function (city, index) {
      var cover = city.photos.filter(function (photo) { return photo.id === city.coverId; })[0];
      return {
        id: city.slug,
        display_name: city.name,
        folder: '/' + city.slug + '-pics/',
        english_path: '/sale/?city=' + encodeURIComponent(city.slug),
        spanish_path: '/sale/?city=' + encodeURIComponent(city.slug) + '&lang=es',
        drive_link: city.driveLink || '',
        cta_background: city.ctaBg || '',
        status: city.status || 'draft',
        sale_date: city.saleDate || '',
        hours: city.hours || '',
        address_note: city.address || '',
        show_address: !!city.showAddress,
        address_reveal_at: city.addressRevealAt || null,
        cover_src: cover ? cover.src : '',
        sort_order: (index + 1) * 10,
        is_active: !!city.active,
        metadata: {
          localId: city.id,
          lastEditedFrom: '/ed',
          ctaCount: city.ctaCount || '',
          ctaLabelEn: city.ctaLabelEn || '',
          ctaLabelEs: city.ctaLabelEs || '',
          ctaButtonEn: city.ctaButtonEn || '',
          ctaButtonEs: city.ctaButtonEs || '',
          calendarStart: city.calendarStart || '',
          calendarEnd: city.calendarEnd || ''
        }
      };
    });

    if (locationRows.length) {
      await checked(api.from('ed_locations').upsert(locationRows, { onConflict: 'id' }));
      await archiveMissingLocations(api, locationRows.map(function (row) { return row.id; }));
    }

    for (var i = 0; i < state.cities.length; i++) {
      await savePhotosForCity(api, state.cities[i]);
    }
  }

  async function archiveMissingLocations(api, currentIds) {
    var existing = await api.from('ed_locations').select('id');
    if (existing.error) throw existing.error;
    var keep = {};
    currentIds.forEach(function (id) { keep[id] = true; });
    var stale = (existing.data || []).filter(function (row) { return !keep[row.id]; });
    for (var i = 0; i < stale.length; i++) {
      await checked(
        api.from('ed_locations')
          .update({ is_active: false, status: 'draft' })
          .eq('id', stale[i].id)
      );
    }
  }

  async function savePhotosForCity(api, city) {
    await checked(
      api.from('ed_photos')
        .update({ is_active: false })
        .eq('location_id', city.slug)
    );

    if (!city.photos.length) return;

    var photos = (city.photos || []).slice().sort(function (a, b) {
      return photoSlot(a, 0) - photoSlot(b, 0);
    });
    var rows = photos.map(function (photo, index) {
      var slot = photoSlot(photo, index);
      return {
        location_id: city.slug,
        src: photo.src,
        kind: photo.kind || 'path',
        storage_bucket: photo.storageBucket || '',
        storage_path: photo.storagePath || '',
        original_name: photo.name || '',
        alt_text: photo.alt || '',
        size_bytes: photo.size || 0,
        mime_type: photo.mime || '',
        sort_order: (slot + 1) * 10,
        is_featured: photo.id === city.coverId,
        is_active: photo.kind !== 'upload',
        metadata: {
          editorId: photo.id,
          slot: slot,
          replacedAt: photo.replacedAt || ''
        }
      };
    });

    await checked(api.from('ed_photos').upsert(rows, { onConflict: 'location_id,src' }));
  }

  async function uploadPhoto(city, file, progress) {
    var api = getClient();
    if (!api) throw new Error('Supabase config missing');
    var bucket = config.bucket || 'estate-sale-photos';
    var path = city.slug + '/' + Date.now().toString(36) + '-' + randomToken() + uploadExtension(file);
    if (progress) progress(15, 'Preparing upload');
    var upload = await api.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: uploadContentType(file),
      cacheControl: '31536000'
    });
    if (upload.error) throw upload.error;
    if (progress) progress(90, 'Finalizing');
    var publicResult = api.storage.from(bucket).getPublicUrl(path);
    return {
      src: publicResult.data.publicUrl,
      storageBucket: bucket,
      storagePath: path,
      kind: 'storage'
    };
  }

  async function deleteStorageObject(bucket, path) {
    var api = getClient();
    if (!api || !bucket || !path) return;
    await api.storage.from(bucket).remove([path]);
  }

  async function recordSaleView(locationId, lang, visitorKey) {
    var api = getClient();
    if (!api || !locationId || !visitorKey) return 0;
    var result = await api.rpc('record_ed_sale_view', {
      p_location_id: locationId,
      p_lang: lang === 'es' ? 'es' : 'en',
      p_visitor_key: visitorKey
    });
    if (result.error) throw result.error;
    return result.data || 0;
  }

  function stateFromRows(settingsRows, locationRows, photoRows, publicOnly) {
    var settings = {
      phone: '(323) 301-9200',
      sms: '+13233019200',
      contactEn: 'Text anytime',
      contactEs: 'Escribe cuando quieras',
      notes: ''
    };

    settingsRows.forEach(function (row) {
      var value = row.value || {};
      if (row.key === 'editor' || row.key === 'public_contact') {
        settings.phone = value.phone || settings.phone;
        settings.sms = value.sms || settings.sms;
        settings.contactEn = value.contactEn || settings.contactEn;
        settings.contactEs = value.contactEs || settings.contactEs;
        if (!publicOnly) settings.notes = value.notes || settings.notes;
      }
    });

    var photosByCity = {};
    photoRows.forEach(function (row) {
      if (!photosByCity[row.location_id]) photosByCity[row.location_id] = [];
      var photoIndex = photosByCity[row.location_id].length;
      photosByCity[row.location_id].push({
        id: row.id,
        src: row.src,
        name: row.original_name || fileName(row.src),
        kind: row.kind || 'path',
        storageBucket: row.storage_bucket || '',
        storagePath: row.storage_path || '',
        alt: row.alt_text || '',
        size: row.size_bytes || 0,
        mime: row.mime_type || '',
        slot: slotFromSort(row.sort_order, photoIndex),
        sortOrder: row.sort_order || 0,
        featured: !!row.is_featured
      });
    });

    var cities = locationRows.map(function (row, index) {
      var photos = photosByCity[row.id] || [];
      var featured = photos.filter(function (photo) {
        return photo.featured || photo.src === row.cover_src;
      })[0];
      var metadata = row.metadata || {};
      return {
        id: row.id,
        name: row.display_name || titleFromSlug(row.id),
        slug: row.id,
        active: row.is_active !== false,
        status: row.status || 'draft',
        saleDate: row.sale_date || '',
        hours: row.hours || '',
        address: publicOnly ? (row.public_address || '') : (row.address_note || ''),
        showAddress: !!row.show_address,
        addressRevealAt: row.address_reveal_at || '',
        addressRevealed: row.address_revealed !== false,
        driveLink: row.drive_link || '',
        ctaBg: row.cta_background || '',
        ctaCount: metadata.ctaCount || '100+',
        ctaLabelEn: metadata.ctaLabelEn || 'more photos on Google Drive',
        ctaLabelEs: metadata.ctaLabelEs || 'más fotos en Google Drive',
        ctaButtonEn: metadata.ctaButtonEn || 'View Full Gallery ↗',
        ctaButtonEs: metadata.ctaButtonEs || 'Ver Galería Completa ↗',
        calendarStart: metadata.calendarStart || '',
        calendarEnd: metadata.calendarEnd || '',
        coverId: featured ? featured.id : (photos[0] ? photos[0].id : ''),
        sortOrder: row.sort_order || (index + 1) * 10,
        photos: photos
      };
    });

    return {
      version: 3,
      source: 'supabase',
      settings: settings,
      cities: cities
    };
  }

  async function checked(request) {
    var result = await request;
    if (result.error) throw result.error;
    return result.data;
  }

  function uploadExtension(file) {
    var type = String(file && file.type || '').toLowerCase();
    if (type.indexOf('png') >= 0) return '.png';
    if (type.indexOf('webp') >= 0) return '.webp';
    if (type.indexOf('gif') >= 0) return '.gif';
    if (type.indexOf('heic') >= 0) return '.heic';
    if (type.indexOf('heif') >= 0) return '.heif';
    var match = String(file && file.name || '').match(/\.(jpe?g|png|webp|gif|heic|heif)$/i);
    return match ? '.' + match[1].toLowerCase().replace('jpeg', 'jpg') : '.jpg';
  }

  function uploadContentType(file) {
    var type = String(file && file.type || '').toLowerCase();
    if (type) return type;
    var ext = uploadExtension(file);
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.heic') return 'image/heic';
    if (ext === '.heif') return 'image/heif';
    return 'image/jpeg';
  }

  function randomToken() {
    try {
      var bytes = new Uint32Array(2);
      window.crypto.getRandomValues(bytes);
      return bytes[0].toString(36) + bytes[1].toString(36);
    } catch (e) {
      return Math.random().toString(36).slice(2, 12);
    }
  }

  function fileName(path) {
    return String(path || '').split('/').filter(Boolean).pop() || 'photo.jpg';
  }

  function photoSlot(photo, fallbackIndex) {
    var slot = parseInt(photo && photo.slot, 10);
    if (slot >= 0 && slot < 10) return slot;
    return Math.max(0, Math.min(9, fallbackIndex || 0));
  }

  function slotFromSort(sortOrder, fallbackIndex) {
    var order = parseInt(sortOrder, 10);
    if (order > 0) return Math.max(0, Math.min(9, Math.round(order / 10) - 1));
    return Math.max(0, Math.min(9, fallbackIndex || 0));
  }

  function titleFromSlug(slug) {
    return String(slug || 'City').split('-').filter(Boolean).map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' ') || 'City';
  }

  window.CBCMS = {
    config: config,
    isConfigured: isConfigured,
    getClient: getClient,
    getSession: getSession,
    signIn: signIn,
    signOut: signOut,
    verifyAdmin: verifyAdmin,
    onAuthStateChange: onAuthStateChange,
    loadPublicData: loadPublicData,
    loadEditorData: loadEditorData,
    saveState: saveState,
    uploadPhoto: uploadPhoto,
    deleteStorageObject: deleteStorageObject,
    recordSaleView: recordSaleView
  };
})();
