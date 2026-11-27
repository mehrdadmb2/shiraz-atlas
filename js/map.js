(() => {
  let map, placeLayer, routeLayer, previewLayer, discoveryLayer, userLayer, drawingLine, drawingMarkers;
  let baseLayer, currentBase = 'dark', drawing = false, drawingPoints = [];
  let onMapPoint = () => {}, onPlaceSelect = () => {};
  let providerIndex = 0, tileErrors = 0, tileLoads = 0, autoFailovers = 0, lastFailoverAt = 0;

  // CARTO basemaps now require a key. Use keyless OSM tiles and a separately
  // licensed fallback; dark mode is a local visual treatment, not another API.
  const providers = [
    {
      id: 'osm', label: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
    },
    {
      id: 'opentopo', label: 'OpenTopoMap fallback',
      url: 'https://tile.openmaps.fr/opentopomap/{z}/{x}/{y}.png',
      maxZoom: 17,
      attribution: '&copy; <a href="https://github.com/sletuffe/OpenTopoMap" target="_blank" rel="noreferrer">OpenTopoMap-R</a> · <a href="https://openmaps.fr/donate" target="_blank" rel="noreferrer">Support tiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
    }
  ];

  const setStatus = (message, kind = 'online') => {
    const el = document.getElementById('map-status');
    if (!el) return;
    el.textContent = message;
    el.dataset.state = kind;
  };
  const applyTheme = () => {
    const pane = map?.getPane('tilePane');
    if (pane) pane.classList.toggle('atlas-map-dark', currentBase === 'dark');
  };
  const markerIcon = (emoji = '⌖', discovery = false) => L.divIcon({
    className: '', html: `<div class="atlas-marker ${discovery ? 'discovery-marker' : ''}"><span>${emoji}</span></div>`,
    iconSize: [30, 38], iconAnchor: [15, 36], popupAnchor: [0, -34]
  });
  const popup = (place, categories) => {
    const c = window.AtlasUtils.categoryById(categories, place.categoryId);
    const safeName = window.AtlasUtils.esc(place.name);
    const desc = window.AtlasUtils.esc((place.description || '').slice(0, 120));
    return `<div class="popup-name">${c.icon} ${safeName}</div><div class="popup-meta">${window.AtlasUtils.esc(c.name)} · ${desc || 'بدون توضیحات'}</div><a class="popup-button" href="${window.AtlasUtils.routeGoogleUrl(place)}" target="_blank" rel="noreferrer">مسیریابی ↗</a>`;
  };

  const activateProvider = (index, automatic = false) => {
    if (!map || !providers[index]) return;
    if (baseLayer) {
      map.removeLayer(baseLayer);
      baseLayer.off();
    }
    providerIndex = index;
    const provider = providers[index];
    tileErrors = 0;
    tileLoads = 0;
    baseLayer = L.tileLayer(provider.url, {
      maxZoom: 19,
      maxNativeZoom: provider.maxZoom,
      minZoom: 2,
      attribution: provider.attribution,
      crossOrigin: provider.id === 'osm' ? 'anonymous' : false,
      updateWhenIdle: true,
      keepBuffer: 3,
      detectRetina: false
    });
    baseLayer.on('tileload', () => {
      tileLoads += 1;
      if (navigator.onLine === false) setStatus('آفلاین · نقشه از کاشی‌های ذخیره‌شده', 'offline');
      else setStatus(`آنلاین · ${provider.label}`, index ? 'fallback' : 'online');
    });
    baseLayer.on('tileerror', () => {
      tileErrors += 1;
      const now = Date.now();
      // Avoid switching on one transient tile miss or a cancelled pan request.
      if (tileErrors >= 3 && tileErrors - tileLoads >= 3 && now - lastFailoverAt > 7000) {
        lastFailoverAt = now;
        if (autoFailovers < providers.length - 1) {
          autoFailovers += 1;
          setStatus('منبع اصلی پاسخ نمی‌دهد؛ در حال تغییر منبع نقشه…', 'loading');
          window.setTimeout(() => activateProvider(providerIndex + 1, true), 350);
        } else {
          setStatus('اتصال به سرویس نقشه برقرار نشد؛ نقشه ذخیره‌شده در این دستگاه فقط در محدوده‌های قبلی در دسترس است.', 'error');
        }
      }
    });
    baseLayer.addTo(map);
    if (!automatic) autoFailovers = 0;
    applyTheme();
    if (automatic) setStatus(`منبع جایگزین فعال شد · ${provider.label}`, 'fallback');
    else setStatus(`در حال دریافت نقشه · ${provider.label}`, 'loading');
  };

  const init = (callbacks = {}) => {
    if (!window.L) throw new Error('کتابخانه نقشه بارگذاری نشد. اتصال اینترنت را بررسی کن.');
    onMapPoint = callbacks.onMapPoint || (() => {});
    onPlaceSelect = callbacks.onPlaceSelect || (() => {});
    map = L.map('atlas-map', { zoomControl: true, preferCanvas: true, minZoom: 2 }).setView(window.ATLAS_CONFIG.MAP_CENTER, window.ATLAS_CONFIG.MAP_ZOOM);
    activateProvider(0);
    placeLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    previewLayer = L.layerGroup().addTo(map);
    discoveryLayer = L.layerGroup().addTo(map);
    userLayer = L.layerGroup().addTo(map);
    drawingMarkers = L.layerGroup().addTo(map);
    map.on('click', e => {
      if (drawing) {
        drawingPoints.push([e.latlng.lat, e.latlng.lng]);
        refreshDrawing();
        onMapPoint({ lat: e.latlng.lat, lng: e.latlng.lng, count: drawingPoints.length });
      }
    });
    window.setTimeout(() => map.invalidateSize(), 200);
    window.addEventListener('offline', () => setStatus('آفلاین · تلاش برای نمایش نقشه ذخیره‌شده', 'offline'));
    window.addEventListener('online', () => setStatus('اتصال برگشت؛ در حال به‌روزرسانی نقشه…', 'loading'));
  };

  const renderPlaces = (places, categories = []) => {
    if (!map || !placeLayer) return;
    placeLayer.clearLayers();
    (places || []).forEach(p => {
      if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) return;
      const m = L.marker([Number(p.lat), Number(p.lng)], {
        icon: markerIcon(window.AtlasUtils.categoryById(categories, p.categoryId).icon)
      }).bindPopup(popup(p, categories));
      m.on('click', () => onPlaceSelect(p));
      m.addTo(placeLayer);
    });
  };
  const renderRoutes = routes => {
    if (!map || !routeLayer) return;
    routeLayer.clearLayers();
    (routes || []).forEach(r => {
      const coords = (r.coordinates || []).map(p => Array.isArray(p) ? p : [p.lat, p.lng])
        .filter(p => p.length === 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1]));
      if (coords.length < 2) return;
      const color = r.quality === 'good' ? '#43d8b8' : r.quality === 'bad' ? '#fa7d8b' : '#a799ff';
      L.polyline(coords, { color, weight: 4, opacity: .78, lineCap: 'round', lineJoin: 'round', dashArray: r.quality === 'normal' ? '7 7' : null })
        .bindTooltip(window.AtlasUtils.esc(r.name || 'مسیر ثبت‌شده')).addTo(routeLayer);
    });
  };
  const showRoutePreview = geometry => {
    if (!map || !previewLayer) return;
    previewLayer.clearLayers();
    const coords = (geometry?.coordinates || []).map(p => [p[1], p[0]]);
    if (coords.length < 2) return;
    const line = L.polyline(coords, { color: '#59c9ee', weight: 6, opacity: .95, lineCap: 'round', lineJoin: 'round' }).addTo(previewLayer);
    L.circleMarker(coords[0], { radius: 7, color: '#fff', weight: 2, fillColor: '#4de0c1', fillOpacity: 1 }).addTo(previewLayer);
    L.circleMarker(coords[coords.length - 1], { radius: 7, color: '#fff', weight: 2, fillColor: '#a79bff', fillOpacity: 1 }).addTo(previewLayer);
    map.fitBounds(line.getBounds().pad(.16));
  };
  const clearRoutePreview = () => previewLayer?.clearLayers();
  const renderDiscovery = items => {
    if (!map || !discoveryLayer) return;
    discoveryLayer.clearLayers();
    (items || []).forEach(p => {
      const m = L.marker([p.lat, p.lng], { icon: markerIcon(p.icon || '✧', true) })
        .bindPopup(`<div class="popup-name">${window.AtlasUtils.esc(p.name)}</div><div class="popup-meta">${window.AtlasUtils.esc(p.category || 'پیشنهاد نقشه عمومی')}</div>`);
      m.addTo(discoveryLayer);
    });
  };
  const showUser = pos => {
    if (!map || !userLayer) return;
    userLayer.clearLayers();
    L.marker([pos.lat, pos.lng], {
      icon: L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [20, 20], iconAnchor: [10, 10] })
    }).bindTooltip('موقعیت فعلی شما').addTo(userLayer);
  };
  const focus = (lat, lng, zoom = 16) => { if (map) map.setView([lat, lng], zoom, { animate: true }); };
  const fit = places => {
    if (!map) return;
    const pts = (places || []).map(p => [Number(p.lat), Number(p.lng)]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(.14), { maxZoom: 15 });
    else map.setView(window.ATLAS_CONFIG.MAP_CENTER, window.ATLAS_CONFIG.MAP_ZOOM);
  };
  const toggleLayer = () => {
    if (!map) return currentBase;
    currentBase = currentBase === 'dark' ? 'light' : 'dark';
    applyTheme();
    return currentBase;
  };
  const refreshDrawing = () => {
    if (!map || !drawingMarkers) return;
    drawingMarkers.clearLayers();
    if (drawingLine) map.removeLayer(drawingLine);
    drawingLine = null;
    drawingPoints.forEach((p, i) => L.circleMarker(p, { radius: i === 0 ? 7 : 5, color: '#d4fff4', weight: 2, fillColor: '#39d3b5', fillOpacity: 1 }).addTo(drawingMarkers));
    if (drawingPoints.length > 1) drawingLine = L.polyline(drawingPoints, { color: '#4de0c1', weight: 4, dashArray: '8 6' }).addTo(map);
  };
  const startDrawing = () => { drawing = true; drawingPoints = []; refreshDrawing(); return true; };
  const stopDrawing = () => {
    drawing = false;
    const result = drawingPoints.map(p => [p[0], p[1]]);
    drawingPoints = [];
    drawingMarkers?.clearLayers();
    if (drawingLine && map) map.removeLayer(drawingLine);
    drawingLine = null;
    return result;
  };
  const addDrawingPoint = (lat, lng) => { if (drawing) { drawingPoints.push([lat, lng]); refreshDrawing(); } };
  const getDrawing = () => drawingPoints.map(p => [p[0], p[1]]);

  window.AtlasMap = {
    init, renderPlaces, renderRoutes, renderDiscovery, showUser, focus, fit,
    toggleLayer, startDrawing, stopDrawing, addDrawingPoint, getDrawing,
    showRoutePreview, clearRoutePreview,
    get map() { return map; },
    get provider() { return providers[providerIndex]?.label || 'نامشخص'; }
  };
})();
