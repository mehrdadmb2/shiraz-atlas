const VERSION = '1.4.0';
const MAX_DATA_BYTES = 850 * 1024; // keep margin below GitHub Contents API's 1 MiB response boundary
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const loginAttempts = new Map();
const routeCache = new Map();
let lastNominatimRequestAt = 0;

const DEFAULT_CATEGORIES = [
  { id: 'cafe', name: 'کافه', icon: '☕', color: '#69d9c2' },
  { id: 'restaurant', name: 'رستوران و غذا', icon: '🍽️', color: '#f3b96c' },
  { id: 'nature', name: 'طبیعت و باغ', icon: '🌿', color: '#71df9d' },
  { id: 'historical', name: 'تاریخی و فرهنگی', icon: '🏛️', color: '#b5a5ff' },
  { id: 'entertainment', name: 'تفریح و سرگرمی', icon: '🎡', color: '#72c9f2' },
  { id: 'viewpoint', name: 'منظره و بام', icon: '🌇', color: '#f2a5b7' },
  { id: 'family', name: 'خانوادگی', icon: '👨‍👩‍👧', color: '#7fdbd1' },
  { id: 'shopping', name: 'خرید', icon: '🛍️', color: '#d8a8f4' },
  { id: 'sports', name: 'ورزشی و فعالیت', icon: '🚴', color: '#8ed1f1' },
  { id: 'hidden', name: 'کشف ناشناخته', icon: '✧', color: '#b8c8d5' }
];
const DEFAULT_TAGS = ['دوستانه', 'پشتو', 'تاریک', 'Skybit'];
const DEFAULT_BOUNDS = { south: 29.47, west: 52.42, north: 29.73, east: 52.78, step: 0.004 };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
function text(data, status = 200, headers = {}) {
  return new Response(data, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers } });
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || env.SITE_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-max-age': '86400',
    'vary': 'Origin'
  };
}
function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  const allowed = (env.ALLOWED_ORIGINS || env.SITE_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(origin);
}
function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function safeText(value, max = 1200) { return String(value ?? '').trim().slice(0, max); }
function number(value, min = -Infinity, max = Infinity) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}
function slug(value) {
  const s = safeText(value, 80).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return s || `item-${crypto.randomUUID().slice(0, 8)}`;
}
function makeId(prefix = 'id') { return `${prefix}_${crypto.randomUUID()}`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function normalizeDigits(value) {
  return String(value || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}
function parseCoordinates(input) {
  const s = normalizeDigits(input).replace(/\u00a0/g, ' ');
  const latDms = [...s.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′’]\s*(\d+(?:\.\d+)?)?\s*["″”]?\s*([NS])/gi)];
  const lonDms = [...s.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′’]\s*(\d+(?:\.\d+)?)?\s*["″”]?\s*([EW])/gi)];
  if (latDms.length && lonDms.length) {
    const cv = m => (Number(m[1]) + Number(m[2]) / 60 + Number(m[3] || 0) / 3600) * (/[SW]/i.test(m[4]) ? -1 : 1);
    const lat = cv(latDms[0]), lng = cv(lonDms[0]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  const patterns = [
    /@\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?)[,%2C ]+(-?\d{1,3}(?:\.\d+)?)/i,
    /(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/
  ];
  for (const re of patterns) {
    const match = s.match(re);
    if (match) {
      const lat = Number(match[1]), lng = Number(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  const osm = s.match(/[?&]mlat=(-?\d+(?:\.\d+)?).*?[?&]mlon=(-?\d+(?:\.\d+)?)/i);
  if (osm) return { lat: Number(osm[1]), lng: Number(osm[2]) };
  const hash = s.match(/#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i);
  if (hash) return { lat: Number(hash[1]), lng: Number(hash[2]) };
  return null;
}
function haversine(a, b) {
  const rad = v => v * Math.PI / 180, R = 6371000;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const ACCESS_MODES = ['walking', 'car', 'motorcycle', 'public_transport', 'bicycle'];
const ACCESS_MODE_LABELS = {
  walking: 'پیاده‌روی', car: 'خودرو / سواری', motorcycle: 'موتورسیکلت',
  public_transport: 'حمل‌ونقل عمومی', bicycle: 'دوچرخه'
};
function normalizeAccessModes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(x => safeText(x, 32)).filter(x => ACCESS_MODES.includes(x)))];
}
function duplicateThreshold(value, fallback = 35) {
  return Math.round(Math.max(25, Math.min(50, Number(value) || fallback)));
}
function hasValidCoordinates(place) {
  if (!place || place.lat === null || place.lat === undefined || place.lng === null || place.lng === undefined) return false;
  if (String(place.lat).trim() === '' || String(place.lng).trim() === '') return false;
  const lat = Number(place.lat), lng = Number(place.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function placeCompleteness(place, visitCount = 0) {
  const fields = ['address','description','imageUrl','website','phone','bestTime','accessNotes'];
  const tags = Array.isArray(place?.tags) ? place.tags.length : 0;
  const accessModes = Array.isArray(place?.accessModes) ? place.accessModes.length : 0;
  return fields.filter(key => String(place?.[key] || '').trim()).length + tags * 0.25 + accessModes * 0.5 + visitCount * 2 + (needsAutoName(place?.name) ? 0 : 3);
}
function nearbyPlaces(data, point, threshold = 35, excludeId = '') {
  return (data.places || []).filter(place => place?.id !== excludeId && hasValidCoordinates(place))
    .map(place => ({ id: place.id, name: place.name, lat: Number(place.lat), lng: Number(place.lng), exactDistance: haversine(point, place) }))
    .filter(item => item.exactDistance <= threshold)
    .sort((a, b) => a.exactDistance - b.exactDistance)
    .map(({ exactDistance, ...item }) => ({ ...item, distanceMeters: Math.round(exactDistance) }));
}
class NearbyDuplicateError extends Error {
  constructor(matches, threshold) {
    super(`این مختصات با ${matches.length} مکان ثبت‌شده در فاصلهٔ حداکثر ${threshold} متر هم‌پوشانی دارد.`);
    this.name = 'NearbyDuplicateError'; this.status = 409; this.details = { code: 'NEARBY_DUPLICATE', threshold, matches };
  }
}
function assertNoNearbyDuplicate(data, point, payload, excludeId = '') {
  if (payload.confirmNearDuplicate === true) return;
  const threshold = duplicateThreshold(payload.duplicateThreshold, duplicateThreshold(data.settings?.duplicateThreshold, 35));
  const matches = nearbyPlaces(data, point, threshold, excludeId);
  if (matches.length) throw new NearbyDuplicateError(matches, threshold);
}
function findDuplicateGroups(data, threshold = 35) {
  const places = (data.places || []).filter(hasValidCoordinates);
  const visitCounts = new Map();
  for (const visit of data.visits || []) visitCounts.set(visit.placeId, (visitCounts.get(visit.placeId) || 0) + 1);
  const ranked = [...places].sort((a, b) =>
    placeCompleteness(b, visitCounts.get(b.id) || 0) - placeCompleteness(a, visitCounts.get(a.id) || 0) ||
    String(a.name || '').localeCompare(String(b.name || ''), 'fa')
  );
  // Complete-link clusters: every member must be within threshold of every other
  // member. This avoids unsafe chain-merges where A~B and B~C but A is far from C.
  const clusters = [];
  for (const place of ranked) {
    let best = null, bestDistance = Infinity;
    for (const cluster of clusters) {
      const distances = cluster.map(member => haversine(place, member));
      if (distances.every(distance => distance <= threshold)) {
        const score = Math.max(...distances);
        if (score < bestDistance) { best = cluster; bestDistance = score; }
      }
    }
    if (best) best.push(place);
    else clusters.push([place]);
  }
  return clusters.filter(cluster => cluster.length > 1).map(cluster => {
    const keep = cluster[0];
    return {
      keep: { id: keep.id, name: keep.name || 'مکان بدون نام', lat: Number(keep.lat), lng: Number(keep.lng) },
      duplicates: cluster.slice(1).map(place => ({
        id: place.id, name: place.name || 'مکان بدون نام',
        distanceMeters: Math.round(haversine(keep, place))
      })),
      threshold,
      memberCount: cluster.length
    };
  });
}
function mergePlaceData(keep, duplicate) {
  if (needsAutoName(keep.name) && !needsAutoName(duplicate.name)) { const previousName = keep.name; keep.name = duplicate.name; if (previousName) keep.alternateNames = [...new Set([...(keep.alternateNames || []), previousName])].slice(0, 20); }
  for (const key of ['address','description','bestTime','phone','website','imageUrl','accessNotes','source','nameSource','nameConfidence']) {
    if (!String(keep[key] || '').trim() && String(duplicate[key] || '').trim()) keep[key] = duplicate[key];
  }
  if (keep.entryFee == null && duplicate.entryFee != null) keep.entryFee = duplicate.entryFee;
  if (keep.estimatedCost == null && duplicate.estimatedCost != null) keep.estimatedCost = duplicate.estimatedCost;
  if (keep.rating == null && duplicate.rating != null) keep.rating = duplicate.rating;
  if (keep.categoryId === 'hidden' && duplicate.categoryId && duplicate.categoryId !== 'hidden') keep.categoryId = duplicate.categoryId;
  const keepTags = Array.isArray(keep.tags) ? keep.tags : [];
  const duplicateTags = Array.isArray(duplicate.tags) ? duplicate.tags : [];
  keep.tags = [...new Set([...keepTags, ...duplicateTags].map(x => safeText(x, 40)).filter(Boolean))].slice(0, 20);
  const keepAlternateNames = Array.isArray(keep.alternateNames) ? keep.alternateNames : [];
  const duplicateAlternateNames = Array.isArray(duplicate.alternateNames) ? duplicate.alternateNames : [];
  keep.alternateNames = [...new Set([...keepAlternateNames, ...(duplicate.name && duplicate.name !== keep.name ? [duplicate.name] : []), ...duplicateAlternateNames].map(x => safeText(x, 120)).filter(Boolean))].slice(0, 20);
  keep.accessModes = normalizeAccessModes([...(Array.isArray(keep.accessModes) ? keep.accessModes : []), ...(Array.isArray(duplicate.accessModes) ? duplicate.accessModes : [])]);
  keep.visibility = (keep.visibility === 'private' || duplicate.visibility === 'private') ? 'private' : 'public';
  if (duplicate.notes) keep.notes = [keep.notes, `ادغام‌شده از ${duplicate.name}: ${duplicate.notes}`].filter(Boolean).join('\n').slice(0, 1200);
  keep.mergedPlaceIds = [...new Set([...(Array.isArray(keep.mergedPlaceIds) ? keep.mergedPlaceIds : []), duplicate.id, ...(Array.isArray(duplicate.mergedPlaceIds) ? duplicate.mergedPlaceIds : [])])].slice(-100);
}
function coordsToPoints(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 1500).map(p => {
    if (Array.isArray(p) && p.length >= 2) return [number(p[0], -90, 90), number(p[1], -180, 180)];
    if (p && typeof p === 'object') return [number(p.lat, -90, 90), number(p.lng, -180, 180)];
    return [null, null];
  }).filter(p => p[0] !== null && p[1] !== null);
}
function routeDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine({ lat: points[i - 1][0], lng: points[i - 1][1] }, { lat: points[i][0], lng: points[i][1] });
  return Math.round(total);
}
function defaultData() {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    settings: {
      city: 'Shiraz', cityFa: 'شیراز', center: { lat: 29.5918, lng: 52.5837 }, explorationBounds: { ...DEFAULT_BOUNDS },
      privacy: { visitsPrivateByDefault: true, routesPrivateByDefault: true }, duplicateThreshold: 35
    },
    categories: clone(DEFAULT_CATEGORIES), tags: [...DEFAULT_TAGS], places: [], visits: [], routes: [],
    meta: { lastTelegramUpdateId: 0, processedTelegramUpdateIds: [], telegramAdmins: [], telegramEditSessions: {}, createdAt: new Date().toISOString() }
  };
}
function normalizeData(data) {
  const base = defaultData();
  if (!data || typeof data !== 'object') return base;
  const out = { ...base, ...data };
  out.settings = { ...base.settings, ...(data.settings || {}) };
  out.settings.duplicateThreshold = duplicateThreshold(out.settings.duplicateThreshold, 35);
  out.settings.center = { ...base.settings.center, ...(data.settings?.center || {}) };
  out.settings.explorationBounds = { ...DEFAULT_BOUNDS, ...(data.settings?.explorationBounds || {}) };
  out.categories = Array.isArray(data.categories) ? data.categories : clone(DEFAULT_CATEGORIES);
  out.tags = Array.isArray(data.tags) ? data.tags : [...DEFAULT_TAGS];
  out.places = Array.isArray(data.places) ? data.places : [];
  out.visits = Array.isArray(data.visits) ? data.visits : [];
  out.routes = Array.isArray(data.routes) ? data.routes : [];
  out.meta = { lastTelegramUpdateId: 0, processedTelegramUpdateIds: [], telegramAdmins: [], telegramEditSessions: {}, ...(data.meta || {}) };
  if (!Array.isArray(out.meta.telegramAdmins)) out.meta.telegramAdmins = [];
  if (!Array.isArray(out.meta.processedTelegramUpdateIds)) out.meta.processedTelegramUpdateIds = [];
  if (!out.meta.telegramEditSessions || typeof out.meta.telegramEditSessions !== 'object' || Array.isArray(out.meta.telegramEditSessions)) out.meta.telegramEditSessions = {};
  return out;
}
function githubConfig(env) {
  const owner = safeText(env.GITHUB_OWNER, 100), repo = safeText(env.GITHUB_DATA_REPO, 100);
  const branch = safeText(env.GITHUB_BRANCH || 'main', 100), path = safeText(env.GITHUB_DATA_PATH || 'atlas.json', 300);
  if (!owner || !repo || !env.GITHUB_TOKEN) throw new Error('تنظیمات GitHub کامل نیستند؛ GITHUB_OWNER، GITHUB_DATA_REPO و GITHUB_TOKEN را بررسی کن.');
  return { owner, repo, branch, path };
}
async function githubRequest(env, path, options = {}) {
  const cfg = githubConfig(env);
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Shiraz-Atlas-Cloudflare-Worker',
      ...(options.headers || {})
    }
  });
  return response;
}
function encodeBase64Utf8(value) {
  const bytes = encoder.encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function decodeBase64Utf8(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return decoder.decode(bytes);
}
async function readData(env) {
  const cfg = githubConfig(env);
  const path = cfg.path.split('/').map(encodeURIComponent).join('/');
  const response = await githubRequest(env, `contents/${path}?ref=${encodeURIComponent(cfg.branch)}`);
  if (response.status === 404) throw new Error(`فایل ${cfg.path} در ریپوی خصوصی ${cfg.repo} پیدا نشد. فایل atlas.json اولیه را طبق راهنما در آن ریپو قرار بده.`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `GitHub API خطا داد (${response.status}).`);
  if (Number(body.size || 0) > MAX_DATA_BYTES) throw new Error('فایل atlas.json از حد امن ۸۵۰ کیلوبایت بزرگ‌تر شده است. تاریخچه مسیرها را بایگانی کن یا ذخیره‌سازی را به Cloudflare D1 منتقل کن.');
  if (!body.content) throw new Error('GitHub فایل داده را برنگرداند یا فایل خالی است.');
  return { data: normalizeData(JSON.parse(decodeBase64Utf8(body.content))), sha: body.sha, cfg };
}
async function writeData(env, data, sha, message, cfg) {
  const path = cfg.path.split('/').map(encodeURIComponent).join('/');
  const serialized = JSON.stringify(data, null, 2) + '\n';
  if (encoder.encode(serialized).byteLength > MAX_DATA_BYTES) throw new Error('فایل atlas.json به سقف امن ۸۵۰ کیلوبایت رسیده است. تاریخچه قدیمی را بایگانی کن یا به Cloudflare D1 مهاجرت کن تا داده‌ها از دست نروند.');
  const response = await githubRequest(env, `contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Shiraz Atlas: ${safeText(message, 90)}`, content: encodeBase64Utf8(serialized), sha, branch: cfg.branch })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `ذخیره در GitHub ناموفق بود (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}
async function updateData(env, mutator, message) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readData(env);
    const data = clone(current.data);
    const result = await mutator(data);
    data.updatedAt = new Date().toISOString();
    try {
      await writeData(env, data, current.sha, message, current.cfg);
      return { data, result };
    } catch (error) {
      lastError = error;
      if (![409, 422].includes(error.status) || attempt === 2) throw error;
    }
  }
  throw lastError || new Error('ذخیره داده کامل نشد.');
}
function publicData(data) {
  return {
    schemaVersion: data.schemaVersion, updatedAt: data.updatedAt,
    settings: { city: data.settings.city, cityFa: data.settings.cityFa, center: data.settings.center, explorationBounds: data.settings.explorationBounds },
    categories: data.categories, tags: data.tags,
    places: data.places.filter(p => p.visibility !== 'private').map(({ notes, ...place }) => place),
    // Only explicitly public tracks are shared; personal notes and visits stay private.
    visits: [], routes: data.routes.filter(r => r.visibility === 'public').map(({ notes, ...route }) => route), isAdmin: false
  };
}
async function hmacSign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(sig));
}
function bytesToBase64Url(bytes) {
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64UrlToString(s) {
  const normalized = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return decoder.decode(bytes);
}
async function issueToken(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET باید حداقل ۳۲ کاراکتر باشد.');
  const now = Math.floor(Date.now() / 1000);
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ sub: 'atlas-admin', iat: now, exp: now + 8 * 60 * 60, nonce: crypto.randomUUID() })));
  const sig = await hmacSign(payload, env.SESSION_SECRET);
  return `${payload}.${sig}`;
}
function constantTimeStringEqual(a, b) {
  const left = encoder.encode(String(a || '')), right = encoder.encode(String(b || ''));
  let diff = left.length ^ right.length; const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}
async function requireAdmin(request, env) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !env.SESSION_SECRET) return false;
  const [payloadPart, signature] = match[1].split('.');
  if (!payloadPart || !signature) return false;
  try {
    const expected = await hmacSign(payloadPart, env.SESSION_SECRET);
    if (!constantTimeStringEqual(expected, signature)) return false;
    const payload = JSON.parse(base64UrlToString(payloadPart));
    return payload.sub === 'atlas-admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
async function passwordMatches(input, expected) {
  if (!expected) return false;
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(String(input))), crypto.subtle.digest('SHA-256', encoder.encode(String(expected)))]);
  const x = new Uint8Array(a), y = new Uint8Array(b); let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function loginRateLimited(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.until) { loginAttempts.delete(ip); return false; }
  return entry.count >= 8;
}
function recordLoginFailure(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.until) loginAttempts.set(ip, { count: 1, until: now + 10 * 60 * 1000 });
  else entry.count++;
  if (loginAttempts.size > 2000) loginAttempts.clear();
}
function clearLoginFailures(request) { loginAttempts.delete(request.headers.get('CF-Connecting-IP') || 'unknown'); }
function requireDataEnv(env) { githubConfig(env); }

function mutateAtlas(data, action, payload = {}) {
  const now = new Date().toISOString();
  const categories = data.categories;
  if (action === 'place.create') {
    const name = safeText(payload.name, 120) || 'مکان بدون نام', lat = number(payload.lat, -90, 90), lng = number(payload.lng, -180, 180);
    if (!name || lat === null || lng === null) throw new Error('نام و مختصات معتبر برای مکان ضروری است.');
    assertNoNearbyDuplicate(data, { lat, lng }, payload);
    const place = {
      id: makeId('pl'), name, lat, lng, categoryId: safeText(payload.categoryId, 80) || 'hidden', address: safeText(payload.address, 250),
      description: safeText(payload.description, 1200), tags: Array.isArray(payload.tags) ? payload.tags.map(t => safeText(t, 40)).filter(Boolean).slice(0, 20) : [], alternateNames: Array.isArray(payload.alternateNames) ? [...new Set(payload.alternateNames.map(x => safeText(x, 120)).filter(Boolean))].slice(0, 20) : [],
      entryFee: number(payload.entryFee, 0, 100000000000) ?? null, estimatedCost: number(payload.estimatedCost, 0, 100000000000) ?? null,
      rating: number(payload.rating, 0, 5) ?? null, bestTime: safeText(payload.bestTime, 120), phone: safeText(payload.phone, 60), website: safeText(payload.website, 500),
      imageUrl: safeText(payload.imageUrl, 1000), notes: safeText(payload.notes, 1200), accessModes: normalizeAccessModes(payload.accessModes), accessNotes: safeText(payload.accessNotes, 500), status: ['active','planned','closed'].includes(payload.status) ? payload.status : 'active',
      visibility: payload.visibility === 'private' ? 'private' : 'public', createdAt: now, updatedAt: now, source: safeText(payload.source || 'website', 40), nameSource: safeText(payload.nameSource || 'manual', 40), nameConfidence: safeText(payload.nameConfidence || '', 30)
    };
    if (!categories.some(c => c.id === place.categoryId)) place.categoryId = categories[0]?.id || 'hidden';
    for (const tag of place.tags) if (!data.tags.some(t => t.toLowerCase() === tag.toLowerCase())) data.tags.push(tag);
    data.places.unshift(place); return { id: place.id, place };
  }
  if (action === 'place.update') {
    const place = data.places.find(p => p.id === payload.id); if (!place) throw new Error('مکان موردنظر پیدا نشد.');
    const previousCoordinates = { lat: Number(place.lat), lng: Number(place.lng) };
    const fields = ['name','categoryId','address','description','bestTime','phone','website','imageUrl','notes','status','visibility','accessNotes','source'];
    for (const key of fields) if (Object.prototype.hasOwnProperty.call(payload, key)) place[key] = safeText(payload[key], key === 'description' || key === 'notes' ? 1200 : key === 'website' || key === 'imageUrl' ? 1000 : 250);
    if (Object.prototype.hasOwnProperty.call(payload, 'lat')) { const v = number(payload.lat, -90, 90); if (v === null) throw new Error('عرض جغرافیایی معتبر نیست.'); place.lat = v; }
    if (Object.prototype.hasOwnProperty.call(payload, 'lng')) { const v = number(payload.lng, -180, 180); if (v === null) throw new Error('طول جغرافیایی معتبر نیست.'); place.lng = v; }
    for (const key of ['entryFee','estimatedCost','rating']) if (Object.prototype.hasOwnProperty.call(payload, key)) place[key] = payload[key] === '' || payload[key] === null ? null : number(payload[key], 0, key === 'rating' ? 5 : 100000000000);
    if (Object.prototype.hasOwnProperty.call(payload, 'accessModes')) place.accessModes = normalizeAccessModes(payload.accessModes);
    if (Object.prototype.hasOwnProperty.call(payload, 'alternateNames')) place.alternateNames = Array.isArray(payload.alternateNames) ? [...new Set(payload.alternateNames.map(x => safeText(x, 120)).filter(Boolean))].slice(0, 20) : [];
    if (Object.prototype.hasOwnProperty.call(payload, 'tags')) {
      place.tags = Array.isArray(payload.tags) ? payload.tags.map(t => safeText(t, 40)).filter(Boolean).slice(0, 20) : [];
      for (const tag of place.tags) if (!data.tags.some(t => t.toLowerCase() === tag.toLowerCase())) data.tags.push(tag);
    }
    if (!categories.some(c => c.id === place.categoryId)) throw new Error('دسته‌بندی انتخاب‌شده معتبر نیست.');
    if ((Object.prototype.hasOwnProperty.call(payload, 'lat') || Object.prototype.hasOwnProperty.call(payload, 'lng')) && (previousCoordinates.lat !== Number(place.lat) || previousCoordinates.lng !== Number(place.lng))) assertNoNearbyDuplicate(data, { lat: place.lat, lng: place.lng }, payload, place.id);
    if (!['active','planned','closed'].includes(place.status)) place.status = 'active';
    place.visibility = place.visibility === 'private' ? 'private' : 'public'; place.updatedAt = now; return { id: place.id };
  }
  if (action === 'place.delete') {
    const index = data.places.findIndex(p => p.id === payload.id); if (index < 0) throw new Error('مکان موردنظر پیدا نشد.');
    const [removed] = data.places.splice(index, 1); return { id: removed.id };
  }
  if (action === 'place.merge') {
    const keep = data.places.find(p => p.id === payload.keepId);
    if (!keep) throw new Error('مکان اصلی برای ادغام پیدا نشد.');
    const ids = [...new Set((payload.duplicateIds || []).filter(id => id && id !== keep.id))];
    if (!ids.length || ids.length > 100) throw new Error('فهرست مکان‌های تکراری معتبر نیست.');
    const threshold = duplicateThreshold(payload.threshold, duplicateThreshold(data.settings?.duplicateThreshold, 35));
    const duplicates = ids.map(id => data.places.find(p => p.id === id));
    if (duplicates.some(p => !p)) throw new Error('یکی از مکان‌های انتخابی دیگر وجود ندارد؛ فهرست را دوباره بررسی کن.');
    for (const duplicate of duplicates) {
      const distance = haversine(keep, duplicate);
      if (distance > threshold) throw new Error(`مکان «${duplicate.name}» در فاصلهٔ ${Math.round(distance)} متر است و از آستانهٔ ${threshold} متر بیشتر است.`);
    }
    for (const duplicate of duplicates) {
      mergePlaceData(keep, duplicate);
      for (const tag of keep.tags || []) if (!data.tags.some(existing => existing.toLowerCase() === tag.toLowerCase())) data.tags.push(tag);
      for (const visit of data.visits || []) if (visit.placeId === duplicate.id) visit.placeId = keep.id;
    }
    const removed = new Set(ids);
    data.places = data.places.filter(place => !removed.has(place.id));
    keep.updatedAt = now;
    return { keepId: keep.id, removedIds: ids, movedVisits: (data.visits || []).filter(v => v.placeId === keep.id).length, mergedCount: ids.length };
  }
  if (action === 'telegram.edit-session.set') {
    const key = `${safeText(payload.chatId, 40)}:${safeText(payload.userId, 40)}`;
    if (!key || !data.places.some(p => p.id === payload.placeId)) throw new Error('مکان و نشست ویرایش معتبر نیست.');
    data.meta.telegramEditSessions[key] = { chatId: String(payload.chatId), userId: String(payload.userId), placeId: payload.placeId, field: payload.field, createdAt: now };
    return { ok: true };
  }
  if (action === 'telegram.edit-session.clear') {
    const key = `${safeText(payload.chatId, 40)}:${safeText(payload.userId, 40)}`;
    delete data.meta.telegramEditSessions[key]; return { ok: true };
  }
  if (action === 'visit.create') {
    const place = data.places.find(p => p.id === payload.placeId); if (!place) throw new Error('مکان بازدید در داده‌ها موجود نیست.');
    const visit = { id: makeId('vs'), placeId: place.id, visitedAt: payload.visitedAt && !Number.isNaN(Date.parse(payload.visitedAt)) ? new Date(payload.visitedAt).toISOString() : now,
      quality: ['good','normal','bad'].includes(payload.quality) ? payload.quality : 'normal', note: safeText(payload.note, 1200), durationMinutes: number(payload.durationMinutes, 0, 100000) ?? null,
      visibility: payload.visibility === 'public' ? 'public' : 'private', createdAt: now };
    data.visits.unshift(visit); return { id: visit.id };
  }
  if (action === 'visit.update') {
    const visit = data.visits.find(v => v.id === payload.id); if (!visit) throw new Error('بازدید پیدا نشد.');
    if (payload.quality) visit.quality = ['good','normal','bad'].includes(payload.quality) ? payload.quality : visit.quality;
    if (Object.prototype.hasOwnProperty.call(payload, 'note')) visit.note = safeText(payload.note, 1200);
    if (Object.prototype.hasOwnProperty.call(payload, 'durationMinutes')) visit.durationMinutes = number(payload.durationMinutes, 0, 100000) ?? null;
    if (payload.visitedAt && !Number.isNaN(Date.parse(payload.visitedAt))) visit.visitedAt = new Date(payload.visitedAt).toISOString();
    return { id: visit.id };
  }
  if (action === 'visit.delete') {
    const index = data.visits.findIndex(v => v.id === payload.id); if (index < 0) throw new Error('بازدید پیدا نشد.');
    data.visits.splice(index, 1); return { id: payload.id };
  }
  if (action === 'route.create') {
    const coords = coordsToPoints(payload.coordinates);
    if (coords.length < 2) throw new Error('برای ثبت مسیر حداقل دو نقطه لازم است.');
    const route = { id: makeId('rt'), name: safeText(payload.name || 'مسیر ثبت‌شده', 120), coordinates: coords,
      distanceMeters: routeDistance(coords), quality: ['good','normal','bad'].includes(payload.quality) ? payload.quality : 'normal',
      mode: ['driving','walking','cycling','motorcycle','other'].includes(payload.mode) ? payload.mode : 'other', notes: safeText(payload.notes, 1200),
      visitedAt: payload.visitedAt && !Number.isNaN(Date.parse(payload.visitedAt)) ? new Date(payload.visitedAt).toISOString() : now,
      visibility: payload.visibility === 'public' ? 'public' : 'private', createdAt: now };
    data.routes.unshift(route); return { id: route.id, distanceMeters: route.distanceMeters };
  }
  if (action === 'route.update') {
    const route = data.routes.find(r => r.id === payload.id); if (!route) throw new Error('مسیر پیدا نشد.');
    if (Object.prototype.hasOwnProperty.call(payload, 'coordinates')) { const coords = coordsToPoints(payload.coordinates); if (coords.length < 2) throw new Error('مسیر باید حداقل دو نقطه داشته باشد.'); route.coordinates = coords; route.distanceMeters = routeDistance(coords); }
    if (payload.name) route.name = safeText(payload.name, 120);
    if (payload.quality) route.quality = ['good','normal','bad'].includes(payload.quality) ? payload.quality : route.quality;
    if (payload.mode) route.mode = ['driving','walking','cycling','motorcycle','other'].includes(payload.mode) ? payload.mode : route.mode;
    if (Object.prototype.hasOwnProperty.call(payload, 'notes')) route.notes = safeText(payload.notes, 1200);
    if (payload.visitedAt && !Number.isNaN(Date.parse(payload.visitedAt))) route.visitedAt = new Date(payload.visitedAt).toISOString();
    if (Object.prototype.hasOwnProperty.call(payload, 'visibility')) route.visibility = payload.visibility === 'public' ? 'public' : 'private';
    return { id: route.id, distanceMeters: route.distanceMeters };
  }
  if (action === 'route.delete') {
    const index = data.routes.findIndex(r => r.id === payload.id); if (index < 0) throw new Error('مسیر پیدا نشد.');
    data.routes.splice(index, 1); return { id: payload.id };
  }
  if (action === 'category.create') {
    const name = safeText(payload.name, 50); if (!name) throw new Error('نام دسته‌بندی الزامی است.');
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) throw new Error('این دسته‌بندی از قبل وجود دارد.');
    const id = slug(name); if (categories.some(c => c.id === id)) throw new Error('شناسه تکراری است؛ نام دیگری انتخاب کن.');
    const category = { id, name, icon: safeText(payload.icon || '✦', 8), color: safeText(payload.color || '#63d8bd', 20) }; categories.push(category); return { id };
  }
  if (action === 'category.update') {
    const cat = categories.find(c => c.id === payload.id); if (!cat) throw new Error('دسته‌بندی پیدا نشد.');
    if (Object.prototype.hasOwnProperty.call(payload, 'name')) { const name = safeText(payload.name, 50); if (!name) throw new Error('نام دسته‌بندی نمی‌تواند خالی باشد.'); if (categories.some(c => c.id !== cat.id && c.name.toLowerCase() === name.toLowerCase())) throw new Error('این نام برای دسته‌بندی دیگری استفاده شده است.'); cat.name = name; } if (payload.icon) cat.icon = safeText(payload.icon, 8); return { id: cat.id };
  }
  if (action === 'category.delete') {
    if (data.places.some(p => p.categoryId === payload.id)) throw new Error('این دسته‌بندی به مکان‌هایی اختصاص دارد؛ ابتدا دسته‌بندی مکان‌ها را تغییر بده.');
    const index = categories.findIndex(c => c.id === payload.id); if (index < 0) throw new Error('دسته‌بندی پیدا نشد.'); categories.splice(index, 1); return { id: payload.id };
  }
  if (action === 'tag.create') {
    const tag = safeText(payload.name, 50); if (!tag) throw new Error('نام برچسب الزامی است.');
    if (data.tags.some(t => t.toLowerCase() === tag.toLowerCase())) throw new Error('این برچسب قبلاً ثبت شده است.'); data.tags.push(tag); return { name: tag };
  }
  if (action === 'tag.rename') {
    const oldName = safeText(payload.oldName, 50), newName = safeText(payload.newName, 50);
    if (!newName) throw new Error('نام جدید برچسب الزامی است.');
    const index = data.tags.findIndex(t => t.toLowerCase() === oldName.toLowerCase()); if (index < 0) throw new Error('برچسب پیدا نشد.');
    if (data.tags.some(t => t.toLowerCase() === newName.toLowerCase())) throw new Error('این نام از قبل وجود دارد.');
    data.tags[index] = newName; data.places.forEach(p => { p.tags = (p.tags || []).map(t => t.toLowerCase() === oldName.toLowerCase() ? newName : t); }); return { oldName, newName };
  }
  if (action === 'tag.delete') {
    const tag = safeText(payload.name, 50); const index = data.tags.findIndex(t => t.toLowerCase() === tag.toLowerCase()); if (index < 0) throw new Error('برچسب پیدا نشد.');
    data.tags.splice(index, 1); data.places.forEach(p => { p.tags = (p.tags || []).filter(t => t.toLowerCase() !== tag.toLowerCase()); }); return { name: tag };
  }
  if(action==='admin.add'){
 const id=safeText(payload.userId,32);if(!/^\d{5,20}$/.test(id))throw new Error('شناسه عددی معتبر نیست.');
 if(data.meta.telegramAdmins.includes(id))throw new Error('این کاربر از قبل ادمین است.');
 data.meta.telegramAdmins.push(id);return{userId:id};
 }
 if(action==='admin.remove'){
 const id=safeText(payload.userId,32),i=data.meta.telegramAdmins.indexOf(id);
 if(i<0)throw new Error('شناسه در فهرست ادمین‌های افزوده‌شده نیست.');
 data.meta.telegramAdmins.splice(i,1);return{userId:id};
 }
  if (action === 'settings.update') {
    if (payload.explorationBounds) {
      const b = payload.explorationBounds;
      const next = { south: number(b.south, -90, 90), west: number(b.west, -180, 180), north: number(b.north, -90, 90), east: number(b.east, -180, 180), step: number(b.step, .001, .05) };
      if (Object.values(next).some(v => v === null) || next.south >= next.north || next.west >= next.east) throw new Error('محدوده نقشه معتبر نیست.');
      data.settings.explorationBounds = next;
    }
    return { ok: true };
  }
  throw new Error('نوع عملیات پشتیبانی نمی‌شود.');
}

async function reversePlaceName(env, lat, lng) {
  const latitude = number(lat, -90, 90), longitude = number(lng, -180, 180);
  if (latitude === null || longitude === null) return null;
  const key = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}&zoom=18&addressdetails=1&extratags=1&namedetails=1`;
  try {
    const cache = caches.default;
    const cacheRequest = new Request(key, { headers: { 'Accept': 'application/json' } });
    let response = await cache.match(cacheRequest);
    if (!response) {
      if (Date.now() - lastNominatimRequestAt < 1100) return null;
      lastNominatimRequestAt = Date.now();
      response = await fetch(key, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'ShirazAtlas/1.4 (+https://github.com/mehrdadmb2/shiraz-atlas)' },
        signal: AbortSignal.timeout(4500)
      });
      if (!response.ok) return null;
      const copy = new Response(await response.clone().text(), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=43200' }
      });
      try { await cache.put(cacheRequest, copy); } catch {}
    }
    const result = await response.json();
    const name = safeText(result?.namedetails?.['name:fa'] || result?.namedetails?.name || result?.name, 120);
    if (!name) return null;
    const category = String(result.category || '').toLowerCase();
    const type = String(result.type || '').toLowerCase();
    const addressType = String(result.addresstype || '').toLowerCase();
    const eligible = ['tourism','historic','leisure','amenity','shop','natural'].includes(category) ||
      /attraction|museum|monument|garden|park|castle|square|restaurant|cafe|market|place_of_worship|water/.test(`${type} ${addressType}`);
    if (!eligible) return null;
    const featureLat = Number(result.lat), featureLng = Number(result.lon);
    if (!Number.isFinite(featureLat) || !Number.isFinite(featureLng)) return null;
    const distanceMeters = haversine({ lat: latitude, lng: longitude }, { lat: featureLat, lng: featureLng });
    // Never name a pin after a distant neighbour. Reverse-geocoding is a suggestion, not proof.
    if (distanceMeters > 65) return null;
    const address = safeText(result.display_name, 250);
    return { name, address, distanceMeters: Math.round(distanceMeters), source: 'openstreetmap-reverse', confidence: distanceMeters <= 25 ? 'high' : 'medium' };
  } catch (error) {
    console.warn(JSON.stringify({ level: 'warn', event: 'reverse_geocode_failed', message: error?.message || String(error) }));
    return null;
  }
}
function needsAutoName(name) {
  const value = String(name || '').trim();
  return !value || /^(?:مکان\s*(?:ذخیره.?شده|ثبت.?شده|بدون.?نام|جدید)|unknown|unnamed|place)(?:\s|$)/i.test(value);
}
async function preparePlacePayload(env, action, payload) {
  if (action !== 'place.create' || !needsAutoName(payload?.name)) return payload;
  const suggestion = await reversePlaceName(env, payload.lat, payload.lng);
  if (suggestion) return {
    ...payload, name: suggestion.name,
    address: payload.address || suggestion.address,
    nameSource: suggestion.source, nameConfidence: suggestion.confidence,
    description: payload.description || `نام پیشنهادی از OpenStreetMap؛ فاصلهٔ نقطهٔ ثبت‌شده تا مرکز عارضه حدود ${suggestion.distanceMeters} متر است.`
  };
  return { ...payload, name: 'مکان بدون نام', nameSource: 'unresolved', nameConfidence: 'none' };
}

async function handleMutation(request, env) {
  if (!originAllowed(request, env)) return json({ error: 'Origin مجاز نیست.' }, 403);
  if (!await requireAdmin(request, env)) return json({ error: 'نشست ادمین معتبر نیست؛ دوباره وارد شو.' }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== 'string' || !body.payload || typeof body.payload !== 'object') return json({ error: 'درخواست تغییر داده معتبر نیست.' }, 400);
  try {
    const preparedPayload = await preparePlacePayload(env, body.action, body.payload);
    const saved = await updateData(env, data => mutateAtlas(data, body.action, preparedPayload), body.action);
    return json({ ok: true, result: saved.result, updatedAt: saved.data.updatedAt });
  } catch (error) { return json({ error: error.message || 'ذخیره‌سازی انجام نشد.', ...(error.details || {}) }, error.status === 403 ? 502 : (error.status || 400)); }
}

function overpassCategory(tags) {
  if (tags.amenity === 'cafe') return 'کافه';
  if (tags.amenity === 'restaurant' || tags.amenity === 'fast_food') return 'رستوران';
  if (tags.tourism || tags.historic) return 'گردشگری / تاریخی';
  if (tags.leisure || tags.natural) return 'طبیعت / تفریح';
  if (tags.shop) return 'خرید';
  return 'مکان عمومی';
}
async function discoverNearby(url) {
  const lat = number(url.searchParams.get('lat'), -90, 90), lng = number(url.searchParams.get('lng'), -180, 180);
  const radius = number(url.searchParams.get('radius') || 3000, 250, 10000);
  if (lat === null || lng === null || radius === null) return json({ error: 'مختصات یا شعاع جست‌وجو معتبر نیست.' }, 400);
  const query = `[out:json][timeout:22];(nwr(around:${Math.round(radius)},${lat},${lng})["amenity"~"cafe|restaurant|fast_food|cinema|theatre|arts_centre|marketplace"];nwr(around:${Math.round(radius)},${lat},${lng})["tourism"];nwr(around:${Math.round(radius)},${lat},${lng})["leisure"~"park|garden|sports_centre|water_park"];nwr(around:${Math.round(radius)},${lat},${lng})["historic"];nwr(around:${Math.round(radius)},${lat},${lng})["shop"~"mall|department_store"];);out center tags;`;
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'user-agent': 'ShirazAtlas/1.0 (+https://github.com/mehrdadmb2/shiraz-atlas)' }, body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(24000) });
      if (!response.ok) { lastError = new Error(`سرویس نقشه (${response.status})`); continue; }
      const body = await response.json();
      const items = (body.elements || []).map(el => {
        const tags = el.tags || {}, center = el.center || el;
        if (!center.lat || !center.lon) return null;
        const name = tags.name || tags['name:fa'] || tags.brand || tags.operator;
        if (!name) return null;
        return { id: `osm-${el.type}-${el.id}`, name: safeText(name, 120), lat: Number(center.lat), lng: Number(center.lon), category: overpassCategory(tags), tags: { amenity: tags.amenity || '', tourism: tags.tourism || '', leisure: tags.leisure || '', historic: tags.historic || '', shop: tags.shop || '' }, address: [tags['addr:street'], tags['addr:suburb'], tags['addr:city']].filter(Boolean).join('، '), source: 'OpenStreetMap' };
      }).filter(Boolean).slice(0, 70);
      return json({ ok: true, source: 'OpenStreetMap', count: items.length, items, note: 'اطلاعات ممکن است ناقص یا قدیمی باشد؛ پیش از مراجعه بررسی کن.' }, 200, { 'cache-control': 'public, max-age=300' });
    } catch (error) { lastError = error; }
  }
  return json({ error: lastError?.message || 'در حال حاضر سرویس جست‌وجوی مکان‌های اطراف در دسترس نیست.' }, 502);
}
async function routePreview(url) {
  const fromLat = number(url.searchParams.get('fromLat'), -90, 90), fromLng = number(url.searchParams.get('fromLng'), -180, 180);
  const toLat = number(url.searchParams.get('toLat'), -90, 90), toLng = number(url.searchParams.get('toLng'), -180, 180);
  const mode = url.searchParams.get('mode') || 'driving';
  if ([fromLat, fromLng, toLat, toLng].some(v => v === null)) return json({ error: 'مبدأ یا مقصد معتبر نیست.' }, 400);
  if (mode !== 'driving') return json({ error: 'پیش‌نمایش داخل اطلس در حال حاضر برای خودرو فعال است؛ برای پیاده‌روی و دوچرخه از مسیریابی Google Maps استفاده کن.' }, 400);
  const key = [fromLat, fromLng, toLat, toLng, mode].map(v => Number(v).toFixed(5)).join(':');
  const cached = routeCache.get(key);
  if (cached && cached.expires > Date.now()) return json({ ...cached.value, cached: true }, 200, { 'cache-control': 'public, max-age=180' });
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const target = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false`;
  try {
    const response = await fetch(target, { headers: { 'user-agent': 'ShirazAtlas/1.0 (+https://github.com/mehrdadmb2/shiraz-atlas)' }, signal: AbortSignal.timeout(18000) });
    if (!response.ok) return json({ error: `سرویس مسیریابی پاسخ ${response.status} داد.` }, 502);
    const body = await response.json();
    const route = body.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return json({ error: 'برای این مبدأ و مقصد مسیر رانندگی پیدا نشد.' }, 404);
    const result = { ok: true, profile: 'driving', distanceMeters: Math.round(route.distance), durationSeconds: Math.round(route.duration), geometry: route.geometry, source: 'OSRM / OpenStreetMap' };
    routeCache.set(key, { value: result, expires: Date.now() + 5 * 60 * 1000 });
    if (routeCache.size > 250) { const first = routeCache.keys().next().value; routeCache.delete(first); }
    return json(result, 200, { 'cache-control': 'public, max-age=180' });
  } catch {
    return json({ error: 'سرویس مسیریابی فعلاً در دسترس نیست؛ از لینک Google Maps برای مسیر زنده استفاده کن.' }, 502);
  }
}

async function weatherFor(url) {
  const lat = number(url.searchParams.get('lat'), -90, 90), lng = number(url.searchParams.get('lng'), -180, 180);
  if (lat === null || lng === null) return json({ error: 'مختصات هواشناسی معتبر نیست.' }, 400);
  const target = new URL('https://api.open-meteo.com/v1/forecast');
  target.search = new URLSearchParams({
    latitude: String(lat), longitude: String(lng),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto', forecast_days: '3'
  }).toString();
  const cacheKey = new Request(target.toString(), { method: 'GET' });
  const edgeCache = globalThis.caches?.default;
  try {
    if (edgeCache) {
      const cached = await edgeCache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('x-atlas-weather-cache', 'HIT');
        return new Response(cached.body, { status: cached.status, headers });
      }
    }
  } catch (error) { console.warn('Weather edge-cache read failed:', error?.message || error); }
  try {
    const response = await fetch(target, {
      headers: { 'user-agent': 'ShirazAtlas/1.2 (+https://github.com/mehrdadmb2/shiraz-atlas)' },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return json({ error: `سرویس هواشناسی پاسخ ${response.status} داد.` }, 502);
    const payload = await response.text();
    // Detect upstream error pages before they are cached as valid weather data.
    const parsed = JSON.parse(payload);
    if (!parsed?.current || !Array.isArray(parsed?.daily?.time)) return json({ error: 'ساختار پاسخ هواشناسی معتبر نیست.' }, 502);
    const result = new Response(payload, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800',
        'x-atlas-weather-cache': 'MISS'
      }
    });
    try { if (edgeCache) await edgeCache.put(cacheKey, result.clone()); }
    catch (error) { console.warn('Weather edge-cache write failed:', error?.message || error); }
    return result;
  } catch (error) {
    console.warn('Weather upstream request failed:', error?.message || error);
    return json({ error: 'دریافت وضعیت هوا ممکن نشد.' }, 502);
  }
}

async function telegramCall(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN تنظیم نشده است.');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.description || `Telegram ${method} failed`);
  return body.result;
}
async function isAdmin(userId, env, knownData = null) {
 const bootstrap=(env.TELEGRAM_ADMIN_IDS||'').split(/[\s,;]+/).filter(Boolean);
 if(bootstrap.includes(String(userId)))return true;
 try{const d=knownData||await getBotData(env);return(d.meta?.telegramAdmins||[]).includes(String(userId));}
 catch(e){console.error(JSON.stringify({level:'error',event:'admin_lookup_failed',message:e.message}));return false;}
}
function isOwner(userId,env){const id=String(env.TELEGRAM_OWNER_ID||(env.TELEGRAM_ADMIN_IDS||'').split(/[\s,;]+/).filter(Boolean)[0]||'');return !!id&&id===String(userId);}
function botKeyboard(admin,owner){
 const rows=[
 [{text:'📍 مکان‌ها',callback_data:'menu:places'},{text:'🎲 مقصد شانسی',callback_data:'menu:random'}],
 [{text:'🗂 دسته‌بندی‌ها',callback_data:'menu:categories'},{text:'🌤 آب‌وهوا',callback_data:'menu:weather'}],
 [{text:'📌 نزدیک من',callback_data:'menu:near'},{text:'🌐 نقشه اطلس',url:'https://mehrdadmb2.github.io/shiraz-atlas/'}]
 ];
 if(admin)rows.push([{text:'➕ ثبت مکان',callback_data:'admin:add'},{text:'🛠 پنل مدیریت',callback_data:'admin:panel'}],[{text:'🔎 بررسی مکان‌های تکراری',callback_data:'admin:duplicates'},{text:'🧪 تست سلامت پروژه',callback_data:'admin:test'}]);
 if(owner)rows.push([{text:'👥 مدیریت ادمین‌ها',callback_data:'owner:admins'}]);
 return{inline_keyboard:rows};
}
function tgEscape(value) { return String(value ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
async function tgMessage(env, chatId, message, options = {}) {
  return telegramCall(env, 'sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true, ...options });
}
function formatPlace(place, data, includePrivate = false) {
  const category = data.categories.find(c => c.id === place.categoryId);
  const missing = '<i>ثبت نشده</i>';
  const access = place.accessModes?.length ? place.accessModes.map(mode => ACCESS_MODE_LABELS[mode]).filter(Boolean).join('، ') : missing;
  const lines = [
    `${category?.icon || '📍'} <b>${tgEscape(place.name || 'مکان بدون نام')}</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `🗂 <b>دسته‌بندی:</b> ${tgEscape(category?.name || 'بدون دسته‌بندی')}`,
    `📌 <b>وضعیت:</b> ${tgEscape(({active:'فعال',planned:'در برنامه بازدید',closed:'تعطیل / نامشخص'})[place.status] || 'نامشخص')}`,
    `📍 <b>آدرس:</b> ${place.address ? tgEscape(place.address) : missing}`,
    `🧭 <b>مختصات:</b> <code>${Number(place.lat).toFixed(6)}, ${Number(place.lng).toFixed(6)}</code>`,
    `🚶 <b>دسترسی:</b> ${access}`,
    `🎟 <b>ورودی:</b> ${place.entryFee != null ? `${Number(place.entryFee).toLocaleString('en-US')} تومان` : missing}`,
    `💰 <b>هزینه تقریبی:</b> ${place.estimatedCost != null ? `${Number(place.estimatedCost).toLocaleString('en-US')} تومان` : missing}`,
    `⭐ <b>امتیاز شخصی:</b> ${place.rating != null ? `${place.rating}/5` : missing}`,
    `🕒 <b>بهترین زمان:</b> ${place.bestTime ? tgEscape(place.bestTime) : missing}`,
    `🏷 <b>برچسب‌ها:</b> ${place.tags?.length ? tgEscape(place.tags.join('، ')) : missing}`,
    `📝 <b>توضیحات:</b>`,
    place.description ? `<blockquote>${tgEscape(place.description)}</blockquote>` : missing,
    `🛣 <b>توضیح دسترسی:</b> ${place.accessNotes ? tgEscape(place.accessNotes) : missing}`,
    `☎️ <b>تماس:</b> ${place.phone ? `<code>${tgEscape(place.phone)}</code>` : missing}`,
    `🌐 <b>وب‌سایت:</b> ${place.website ? tgEscape(place.website) : missing}`,
    place.alternateNames?.length ? `🔤 <b>نام‌های دیگر:</b> ${tgEscape(place.alternateNames.join('، '))}` : '',
    `\n🧭 <a href="https://www.google.com/maps/dir/?api=1&amp;destination=${place.lat},${place.lng}">مسیریابی در Google Maps</a>`,
    `<code>ID: ${tgEscape(place.id)}</code>`
  ].filter(Boolean);
  if (includePrivate && place.notes) lines.splice(lines.length - 2, 0, `🔒 <b>یادداشت خصوصی:</b>\n<blockquote>${tgEscape(place.notes)}</blockquote>`);
  return lines.join('\n');
}
async function sendPlace(env, chatId, place, data, admin = false) {
  const rows = [[{ text: '🧭 مسیریابی', url: `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}` }, { text: '🗺️ نقشه اطلس', url: `${env.PUBLIC_SITE_URL || 'https://mehrdadmb2.github.io/shiraz-atlas/'}?place=${encodeURIComponent(place.id)}` }]];
  if (admin) rows.push([{ text: '🛠 ویرایش جزئیات این مکان', callback_data: `peditmenu:${place.id}` }]);
  await tgMessage(env, chatId, formatPlace(place, data, admin), { reply_markup: { inline_keyboard: rows } });
  await telegramCall(env, 'sendLocation', { chat_id: chatId, latitude: place.lat, longitude: place.lng });
}
async function adminMutation(env, action, payload, updateId) {
  payload = await preparePlacePayload(env, action, payload);
  return updateData(env, data => {
    const id = Number(updateId || 0);
    const seen = data.meta.processedTelegramUpdateIds || [];
    // Telegram may deliver webhook requests concurrently and out of order.
    // Store a bounded set of processed IDs instead of dropping older updates.
    if (id && seen.includes(id)) return { duplicate: true };
    const result = mutateAtlas(data, action, payload);
    if (id) {
      data.meta.lastTelegramUpdateId = Math.max(Number(data.meta.lastTelegramUpdateId || 0), id);
      data.meta.processedTelegramUpdateIds = [...seen, id].slice(-500);
    }
    return result;
  }, `telegram ${action}`);
}
function parseKeyValues(parts) {
  const out = {};
  for (const part of parts) {
    const i = part.indexOf('='); if (i < 1) continue;
    const key = part.slice(0, i).trim().toLowerCase(), value = part.slice(i + 1).trim();
    const map = { name: 'name', title: 'name', category: 'categoryId', cat: 'categoryId', fee: 'entryFee', entry: 'entryFee', cost: 'estimatedCost', rating: 'rating', tags: 'tags', description: 'description', desc: 'description', address: 'address', phone: 'phone', website: 'website', status: 'status', lat: 'lat', lng: 'lng', visibility: 'visibility', notes: 'notes' };
    if (map[key]) out[map[key]] = map[key] === 'tags' ? value.split(/[,،]/).map(s => s.trim()).filter(Boolean) : (['entryFee','estimatedCost','rating','lat','lng'].includes(map[key]) ? Number(normalizeDigits(value).replace(/[,٬\s]/g, '')) : value);
  }
  return out;
}
function coordinateTitle(raw) {
  const cleaned = String(raw || '').replace(/https?:\/\/\S+/g, ' ').replace(/\d{1,3}\s*[°º][\s\S]*$/g, ' ').replace(/-?\d{1,2}\.\d+\s*[,;]\s*-?\d{1,3}\.\d+/g, ' ').replace(/-?\d{1,2}\s*[,;]\s*-?\d{1,3}(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
  return safeText(cleaned, 120) || `مکان ذخیره‌شده ${new Date().toLocaleDateString('fa-IR')}`;
}
function categoryLookup(data, value) {
  const s = safeText(value, 80).toLowerCase();
  if (!s) return data.categories[0]?.id || 'hidden';
  return data.categories.find(c => c.id.toLowerCase() === s || c.name.toLowerCase() === s)?.id || slug(s);
}
async function runDiagnostics(env){
 const checks=[],add=(name,ok,detail)=>checks.push({name,ok:!!ok,detail:safeText(detail,180)});
 add('GitHub credentials',!!(env.GITHUB_OWNER&&env.GITHUB_DATA_REPO&&env.GITHUB_TOKEN),'Owner / private repo / token');
 add('Session security',!!(env.SESSION_SECRET&&env.SESSION_SECRET.length>=32),'SESSION_SECRET >= 32 chars');
 add('Telegram token',!!env.TELEGRAM_BOT_TOKEN,'Bot token configured');
 add('Webhook secret',!!env.TELEGRAM_WEBHOOK_SECRET,'Webhook secret configured');
 try{const repoRes=await fetch(`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER||'mehrdadmb2')}/shiraz-atlas`,{headers:{'Accept':'application/vnd.github+json','User-Agent':'Shiraz-Atlas-Diagnostics'}});add('Public source repository',repoRes.ok,`GitHub API HTTP ${repoRes.status}`);}catch(e){add('Public source repository',false,e.message);}
 try {
  const metaRes=await githubRequest(env,'');
  const meta=await metaRes.json().catch(()=>({}));
  const canWrite=metaRes.ok&&(meta.permissions?.push===true||meta.permissions?.admin===true);
  add('GitHub data write permission',canWrite,metaRes.ok?`push=${Boolean(meta.permissions?.push)} · admin=${Boolean(meta.permissions?.admin)}`:`GitHub API HTTP ${metaRes.status}`);
 } catch(e) { add('GitHub data write permission',false,e.message); }
 if(env.PUBLIC_SITE_URL)try{const pageRes=await fetch(env.PUBLIC_SITE_URL,{headers:{'user-agent':'ShirazAtlas-Diagnostics/1.1'}});add('GitHub Pages website',pageRes.ok,`HTTP ${pageRes.status} · ${env.PUBLIC_SITE_URL}`);}catch(e){add('GitHub Pages website',false,e.message);}

 try{const{data,cfg}=await readData(env);add('Private data repository',true,`${cfg.owner}/${cfg.repo}/${cfg.path}`);add('Data integrity',Array.isArray(data.places)&&Array.isArray(data.routes)&&Array.isArray(data.visits),`places=${data.places.length}, routes=${data.routes.length}, visits=${data.visits.length}`);}
 catch(e){add('Private data repository',false,e.message);}
 if(env.TELEGRAM_BOT_TOKEN)try{const me=await telegramCall(env,'getMe',{});add('Telegram Bot API',true,`@${me.username}`);const wh=await telegramCall(env,'getWebhookInfo',{});add('Telegram webhook',!!wh.url,wh.url?`pending=${wh.pending_update_count||0}`:'Webhook URL is empty');if(wh.last_error_message)add('Webhook last error',false,wh.last_error_message);}catch(e){add('Telegram Bot API',false,e.message);}
 console.log(JSON.stringify({level:'info',event:'diagnostics',at:new Date().toISOString(),checks}));return checks;
}
async function sendHome(env, chatId, fromId) {
  const admin = await isAdmin(fromId, env);
  return tgMessage(env, chatId, `<b>🧭 Shiraz Atlas</b>
اطلس شخصی کشف مکان‌ها و ثبت ماجراجویی‌های تو

از دکمه‌های زیر استفاده کن؛ /help راهنمای کامل است.`, { reply_markup: botKeyboard(admin, isOwner(fromId, env)) });
}
function formatHelp(admin, owner = false) {
  const lines = [
    '<b>🧭 راهنمای Shiraz Atlas</b>',
    '<blockquote>اطلس شخصی کشف مکان‌ها، برنامه‌ریزی مقصدها و ثبت مسیرهای شیراز</blockquote>',
    '<b>🌍 دستورات عمومی</b>',
    '<code>/start</code> — منوی اصلی و دکمه‌ها',
    '<code>/help</code> — راهنمای دستورات',
    '<code>/myid</code> — شناسه عددی تلگرام',
    '<code>/places</code> — فهرست مکان‌ها',
    '<code>/search عبارت</code> — جست‌وجوی مکان',
    '<code>/random</code> — مقصد تصادفی',
    '<code>/near lat,lng</code> — مکان‌های نزدیک',
    '<code>/categories</code> — دسته‌بندی‌ها',
    '<code>/weather</code> — وضعیت آب‌وهوا'
  ];
  if (admin) lines.push(
    '', '<b>🔐 ابزارهای مدیریت</b>',
    '<code>/add نام | lat,lng | دسته | ورودی | توضیحات</code>',
    '<blockquote>از /places یک مکان را باز کن و برای تغییر هر فیلد، دکمهٔ ویرایش همان فیلد را بزن؛ مقدار جدید را بدون دستور ارسال کن.</blockquote>',
    '<code>/delete ID</code> — حذف با تأیید',
    '<code>/visit ID | good/normal/bad | یادداشت</code>',
    '<code>/route نام | کیفیت | lat,lng;lat,lng | یادداشت</code>',
    '<code>/categoryadd نام | ایموجی</code>',
    '<code>/tagadd نام</code>',
    '<code>/stats</code> — آمار خصوصی',
    '<code>/duplicates</code> — اسکن کامل و ادغام تکراری‌ها با تأیید',
    '<code>/test</code> — تست سلامت پروژه',
    '<blockquote>📍 برای ثبت سریع، موقعیت مکانی یا مختصات را مستقیماً ارسال کن.</blockquote>'
  );
  if (owner) lines.push(
    '', '<b>👑 مدیریت مالک اصلی</b>',
    '<code>/admins</code> — فهرست ادمین‌ها',
    '<code>/adminadd 123456789</code> — افزودن ادمین',
    '<code>/adminremove 123456789</code> — حذف ادمین'
  );
  if (!admin) lines.push('', '<blockquote>برای دسترسی به امکانات مدیریت، باید ادمین باشی.</blockquote>');
  lines.push('', '<a href="https://mehrdadmb2.github.io/shiraz-atlas/">🌐 باز کردن نقشه اطلس</a>');
  return lines.join('\n');
}
async function getBotData(env) { return (await readData(env)).data; }

const TELEGRAM_EDIT_FIELDS = {
  name: '✏️ نام مکان', categoryId: '🗂 دسته‌بندی', address: '📍 آدرس / محله', description: '📝 توضیحات',
  coordinates: '🧭 مختصات', entryFee: '🎟 هزینه ورودی', estimatedCost: '💰 هزینه تقریبی', rating: '⭐ امتیاز شخصی',
  bestTime: '🕒 بهترین زمان', tags: '🏷 برچسب‌ها', alternateNames: '🔤 نام‌های جایگزین', source: '🧾 منبع ثبت', accessModes: '🚶 نوع دسترسی', accessNotes: '🛣 توضیح مسیر دسترسی',
  phone: '☎️ شماره تماس', website: '🌐 وب‌سایت', imageUrl: '🖼️ لینک تصویر', notes: '🔒 یادداشت خصوصی', status: '📌 وضعیت', visibility: '👁 نمایش عمومی / خصوصی'
};
function placeEditKeyboard(placeId) {
  const keys = Object.entries(TELEGRAM_EDIT_FIELDS).map(([field, label]) => ({ text: label, callback_data: `pef:${placeId}:${field}` }));
  const rows = []; for (let i = 0; i < keys.length; i += 2) rows.push(keys.slice(i, i + 2));
  rows.push([{ text: '🔄 نمایش دوباره مکان', callback_data: `pview:${placeId}` }]);
  return { inline_keyboard: rows };
}
function parseTelegramAccessModes(raw) {
  const parts = String(raw || '').split(/[,،؛;|]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const modes = new Set();
  for (const part of parts) {
    if (/پیاده|walk/.test(part)) modes.add('walking');
    else if (/سواری|خودرو|ماشین|اتومبیل|car/.test(part)) modes.add('car');
    else if (/موتور|motor/.test(part)) modes.add('motorcycle');
    else if (/اتوبوس|مترو|تاکسی|حمل.?ونقل|عمومی|transport/.test(part)) modes.add('public_transport');
    else if (/دوچرخه|bicycle|bike/.test(part)) modes.add('bicycle');
    else throw new Error(`نوع دسترسی «${part}» شناخته نشد. از پیاده‌روی، خودرو، موتورسیکلت، حمل‌ونقل عمومی یا دوچرخه استفاده کن.`);
  }
  return [...modes];
}
async function sendPlaceEditMenu(env, chatId, place) {
  return tgMessage(env, chatId, `<b>🛠 ویرایش مکان</b>
${tgEscape(place.name)}

فقط روی فیلدی که می‌خواهی تغییر کند بزن. سپس مقدار جدید را به‌صورت یک پیام معمولی بفرست؛ نیازی به نوشتن دستور یا شناسه نیست.`, { reply_markup: placeEditKeyboard(place.id) });
}
async function storeTelegramEditSession(env, chatId, userId, placeId, field, updateId) {
  if (!Object.prototype.hasOwnProperty.call(TELEGRAM_EDIT_FIELDS, field)) throw new Error('فیلد ویرایش معتبر نیست.');
  await adminMutation(env, 'telegram.edit-session.set', { chatId, userId, placeId, field }, updateId);
}
async function applyTelegramEditReply(message, update, env, session) {
  const chatId = message.chat.id, userId = message.from.id, raw = String(message.text || '').trim();
  if (!raw) return tgMessage(env, chatId, 'مقدار خالی است. لطفاً مقدار جدید را به‌صورت متن بفرست.');
  const data = await getBotData(env), place = data.places.find(p => p.id === session.placeId);
  if (!place) { await adminMutation(env, 'telegram.edit-session.clear', { chatId, userId }, update.update_id); return tgMessage(env, chatId, 'مکان دیگر وجود ندارد؛ نشست ویرایش پاک شد.'); }
  const patch = { id: place.id };
  const clear = ['—','-','ندارد','پاک شود','حذف'].includes(raw);
  switch (session.field) {
    case 'name': patch.name = raw; break;
    case 'categoryId': { const category = clear ? data.categories[0] : data.categories.find(c => c.id.toLowerCase() === raw.toLowerCase() || c.name.toLowerCase() === raw.toLowerCase()); if (!category) return tgMessage(env, chatId, `دسته‌بندی پیدا نشد. یکی از این موارد را دقیق بفرست:\n${data.categories.map(c => `${c.icon || '✦'} ${tgEscape(c.name)}`).join('\n')}`); patch.categoryId = category.id; break; }
    case 'address': case 'description': case 'bestTime': case 'phone': case 'website': case 'imageUrl': case 'notes': case 'accessNotes': patch[session.field] = clear ? '' : raw; break;
    case 'coordinates': { const point = parseCoordinates(raw); if (!point) return tgMessage(env, chatId, 'مختصات قابل تشخیص نیست. به شکل <code>29.72, 52.53</code> ارسال کن.'); patch.lat = point.lat; patch.lng = point.lng; break; }
    case 'entryFee': case 'estimatedCost': case 'rating': {
      if (clear) { patch[session.field] = null; break; }
      const value = Number(normalizeDigits(raw).replace(/[,٬\s]/g, ''));
      const max = session.field === 'rating' ? 5 : 100000000000;
      if (!Number.isFinite(value) || value < 0 || value > max) return tgMessage(env, chatId, `مقدار عددی معتبر نیست${session.field === 'rating' ? '؛ امتیاز باید بین صفر تا پنج باشد.' : '؛ فقط عدد مثبت بفرست.'}`);
      patch[session.field] = value; break;
    }
    case 'tags': patch.tags = clear ? [] : raw.split(/[,،؛;]/).map(x => x.trim()).filter(Boolean); break;
    case 'alternateNames': patch.alternateNames = clear ? [] : raw.split(/[,،؛;]/).map(x => x.trim()).filter(Boolean); break;
    case 'source': patch.source = clear ? '' : raw; break;
    case 'accessModes': try { patch.accessModes = clear ? [] : parseTelegramAccessModes(raw); } catch (error) { return tgMessage(env, chatId, tgEscape(error.message)); } break;
    case 'status': { const v = raw.toLowerCase(); patch.status = /تعطیل|بسته|غیرفعال|غیر\s*فعال|closed|inactive/.test(v) ? 'closed' : /برنامه|planned|بعدا|بعداً/.test(v) ? 'planned' : /فعال|active|open/.test(v) ? 'active' : ''; if (!patch.status) return tgMessage(env, chatId, 'وضعیت را با «فعال»، «در برنامه بازدید» یا «تعطیل / غیرفعال» مشخص کن.'); break; }
    case 'visibility': { const v = raw.toLowerCase(); patch.visibility = /خصوصی|private/.test(v) ? 'private' : /عمومی|public/.test(v) ? 'public' : ''; if (!patch.visibility) return tgMessage(env, chatId, 'برای نمایش عمومی بنویس «عمومی» و برای مخفی‌کردن بنویس «خصوصی».'); break; }
    default: return tgMessage(env, chatId, 'این فیلد قابل ویرایش نیست.');
  }
  try { await adminMutation(env, 'place.update', patch, update.update_id); }
  catch (error) { if (error?.details?.code === 'NEARBY_DUPLICATE') return tgMessage(env, chatId, `⚠️ مختصات جدید به مکان‌های ثبت‌شده نزدیک است:\n${(error.details.matches || []).map(x => `• ${tgEscape(x.name)} · ${x.distanceMeters} متر`).join('\n')}\n\nنشست ویرایش باز می‌ماند؛ مختصات دیگری بفرست یا /cancel کن.`); throw error; }
  await adminMutation(env, 'telegram.edit-session.clear', { chatId, userId }, 0);
  const latest = await getBotData(env), updated = latest.places.find(p => p.id === place.id);
  await tgMessage(env, chatId, `✅ <b>${tgEscape(TELEGRAM_EDIT_FIELDS[session.field])}</b> برای «${tgEscape(updated?.name || place.name)}» ذخیره شد.`, { reply_markup: { inline_keyboard: [[{ text: '🛠 ویرایش فیلد دیگر', callback_data: `peditmenu:${place.id}` }, { text: '👁 مشاهده مکان', callback_data: `pview:${place.id}` }]] } });
}
async function telegramCreatePlace(env, chatId, payload, updateId) {
  try {
    const saved = await adminMutation(env, 'place.create', payload, updateId);
    return tgMessage(env, chatId, `✅ مکان <b>${tgEscape(payload.name)}</b> ذخیره شد.\nشناسه: <code>${tgEscape(saved.result.id)}</code>`, { reply_markup: { inline_keyboard: [[{ text: '🛠 ویرایش جزئیات', callback_data: `peditmenu:${saved.result.id}` }]] } });
  } catch (error) {
    if (error instanceof NearbyDuplicateError || error?.details?.code === 'NEARBY_DUPLICATE') {
      const matches = error.details.matches || [];
      return tgMessage(env, chatId, `⚠️ <b>مکان مشابه پیدا شد</b>\n${matches.map(x => `• ${tgEscape(x.name)} — ${x.distanceMeters} متر`).join('\n')}\n\nبرای جلوگیری از ثبت تکراری، این مکان ذخیره نشد. مکان قبلی را از فهرست انتخاب کن یا پس از بررسی، از سایت استفاده کن.`, { reply_markup: { inline_keyboard: matches.slice(0,5).map(x => [{ text: `📍 ${String(x.name).slice(0,35)}`, callback_data: `pview:${x.id}` }]) } });
    }
    throw error;
  }
}
async function handleTelegramMessage(message, update, env) {
  const chatId = message.chat?.id, fromId = message.from?.id;
  if (!chatId || !fromId) return;
  const admin = await isAdmin(fromId, env);
  const rawText = String(message.text || message.caption || '').trim();
  if (admin && rawText && !rawText.startsWith('/')) {
    const data = await getBotData(env), key = `${chatId}:${fromId}`, session = data.meta?.telegramEditSessions?.[key];
    if (session && Date.now() - Date.parse(session.createdAt || 0) <= 15 * 60 * 1000) return applyTelegramEditReply(message, update, env, session);
    if (session) await adminMutation(env, 'telegram.edit-session.clear', { chatId, userId: fromId }, 0);
  }
  if (message.location) {
    const point = { lat: Number(message.location.latitude), lng: Number(message.location.longitude) };
    if (!admin) {
      const data = await getBotData(env);
      const near = data.places.filter(p => p.visibility !== 'private').map(p => ({ p, d: haversine(point, p) })).sort((a,b)=>a.d-b.d).slice(0,5);
      if (!near.length) return tgMessage(env, chatId, 'هنوز مکانی در اطلس ثبت نشده است.');
      await tgMessage(env, chatId, '<b>📍 نزدیک‌ترین مکان‌ها به موقعیت ارسالی</b>\n\n' + near.map(x => `• ${tgEscape(x.p.name)} — ${(x.d/1000).toFixed(1)} km`).join('\n'));
      for (const item of near.slice(0,1)) await sendPlace(env, chatId, item.p, data, admin);
      return;
    }
    const caption = safeText(rawText, 500);
    const parsed = parseCoordinates(caption) || point;
    const title = coordinateTitle(caption);
    return telegramCreatePlace(env, chatId, { name: title, ...parsed, source: 'telegram', categoryId: 'hidden', visibility: 'public' }, update.update_id);
  }
  const commandMatch = rawText.match(/^\/([\w\u0600-\u06ff]+)(?:@[\w]+)?(?:\s+([\s\S]*))?$/);
  if (commandMatch) {
    const command = commandMatch[1].toLowerCase();
    const argText = (commandMatch[2] || '').trim();
    const aliases = { 'کمک':'help', 'راهنما':'help', 'مکانها':'places', 'مکان‌ها':'places', 'تصادفی':'random', 'افزودن':'add', 'بازدید':'visit', 'آمار':'stats', 'تکراری':'duplicates' };
    const cmd = aliases[command] || command;
    if (cmd === 'start') return tgMessage(env, chatId, `سلام ${tgEscape(message.from.first_name || 'دوست من')}! 👋\nبه <b>Shiraz Atlas</b> خوش آمدی.\n\nمکان‌های موردعلاقه‌ات را ذخیره کن، مقصد تصادفی بگیر و مسیرهایت را ثبت کن.\n\n/help برای راهنما`);
    if (cmd === 'help') return tgMessage(env, chatId, formatHelp(admin,isOwner(fromId,env)),{reply_markup:botKeyboard(admin,isOwner(fromId,env))});
    if (cmd === 'myid' || cmd === 'whoami') return tgMessage(env, chatId, `شناسه عددی تلگرام شما:\n<code>${fromId}</code>\n${admin ? '✅ دسترسی ادمین فعال است.' : 'دسترسی مدیریتی فعال نیست.'}`);
    if (cmd === 'cancel') { if (admin) await adminMutation(env, 'telegram.edit-session.clear', { chatId, userId: fromId }, update.update_id); return tgMessage(env, chatId, 'عملیات جاری لغو شد.'); }
    if(['test','health','diagnostics'].includes(cmd)){
      if(!admin)return tgMessage(env,chatId,'⛔ فقط ادمین‌ها اجازه اجرای تست را دارند.');
      const checks=await runDiagnostics(env),ok=checks.filter(x=>x.ok).length;
      return tgMessage(env,chatId,`<b>🧪 گزارش سلامت Shiraz Atlas</b>\n${checks.map(x=>`${x.ok?'✅':'❌'} <b>${tgEscape(x.name)}</b>\n<code>${tgEscape(x.detail)}</code>`).join('\n\n')}\n\n<b>${ok}/${checks.length} موفق</b>\n📋 لاگ ساختاریافته در Cloudflare Worker → Logs ثبت شد.`);
    }
    if(cmd==='admins'){
      if(!isOwner(fromId,env))return tgMessage(env,chatId,'⛔ فقط مالک اصلی.');
      const d=await getBotData(env),boot=(env.TELEGRAM_ADMIN_IDS||'').split(/[\s,;]+/).filter(Boolean),ids=[...new Set([...boot,...(d.meta.telegramAdmins||[])])];
      return tgMessage(env,chatId,`<b>👥 فهرست ادمین‌ها</b>\n${ids.map((id,i)=>`${i+1}. <code>${tgEscape(id)}</code>${boot.includes(id)?' · اصلی':''}`).join('\n')||'خالی'}\n\n/adminadd 123456789\n/adminremove 123456789`);
    }
    if(cmd==='adminadd'||cmd==='adminremove'){
      if(!isOwner(fromId,env))return tgMessage(env,chatId,'⛔ فقط مالک اصلی اجازه مدیریت ادمین‌ها را دارد.');
      const userId=argText.replace(/[^0-9]/g,'');if(!/^\d{5,20}$/.test(userId))return tgMessage(env,chatId,'شناسه معتبر نیست؛ کاربر ابتدا /myid را ارسال کند.');
      await adminMutation(env,cmd==='adminadd'?'admin.add':'admin.remove',{userId},update.update_id);
      return tgMessage(env,chatId,cmd==='adminadd'?`✅ <code>${userId}</code> ادمین شد.`:`🗑 <code>${userId}</code> از ادمین‌های افزوده‌شده حذف شد.`);
    }
    if (cmd === 'categories') { const data = await getBotData(env); return tgMessage(env, chatId, '<b>🗂 دسته‌بندی‌های اطلس</b>\n' + data.categories.map(c => `${c.icon || '✦'} ${tgEscape(c.name)}`).join('\n') + '\n\nبرچسب‌ها: ' + data.tags.map(tgEscape).join(' · ')); }
    if (cmd === 'weather') {
      const point = parseCoordinates(argText) || { lat: 29.5918, lng: 52.5837 };
      const u = new URL('https://api.open-meteo.com/v1/forecast'); u.search = new URLSearchParams({ latitude: point.lat, longitude: point.lng, current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m', timezone: 'auto' }).toString();
      const r = await fetch(u); if (!r.ok) return tgMessage(env, chatId, 'سرویس هواشناسی فعلاً در دسترس نیست.'); const w = await r.json(); const c = w.current || {};
      return tgMessage(env, chatId, `<b>🌤 وضعیت فعلی هوا</b>\n🌡 دما: ${c.temperature_2m ?? '—'}°C\nاحساس واقعی: ${c.apparent_temperature ?? '—'}°C\n💧 رطوبت: ${c.relative_humidity_2m ?? '—'}٪\n💨 باد: ${c.wind_speed_10m ?? '—'} km/h\n\n<a href="https://open-meteo.com/">منبع: Open-Meteo</a>`);
    }
    if (cmd === 'places' || cmd === 'search') {
      const data = await getBotData(env); const q = argText.toLowerCase();
      const list = data.places.filter(p => (admin || p.visibility !== 'private') && (!q || `${p.name} ${p.description} ${p.address} ${(p.tags||[]).join(' ')}`.toLowerCase().includes(q))).slice(0, 10);
      if (!list.length) return tgMessage(env, chatId, q ? 'نتیجه‌ای پیدا نشد.' : 'هنوز مکان عمومی ثبت نشده است.');
      await tgMessage(env, chatId, `<b>🧭 اطلس مکان‌ها</b>\n<blockquote>📍 ${list.length} مکان ${q ? 'یافت‌شده' : 'ثبت‌شده'}\nبرای مشاهدهٔ جزئیات یا ویرایش، یک مورد را انتخاب کن.</blockquote>\n<code>Shiraz Atlas · Places Index</code>`, { reply_markup: { inline_keyboard: list.map(p => admin ? [{ text: `📍 ${p.name.slice(0,32)}`, callback_data: `pview:${p.id}` }, { text: '✏️', callback_data: `peditmenu:${p.id}` }] : [{ text: `📍 ${p.name.slice(0,40)}`, callback_data: `pview:${p.id}` }]) } });
      if (list.length === 1) await sendPlace(env, chatId, list[0], data, admin);
      return;
    }
    if (cmd === 'random') {
      const data = await getBotData(env); const filter = argText.toLowerCase();
      const pool = data.places.filter(p => (admin || p.visibility !== 'private') && (!filter || p.categoryId.toLowerCase() === filter || data.categories.find(c=>c.id===p.categoryId)?.name.toLowerCase().includes(filter) || (p.tags||[]).some(t=>t.toLowerCase().includes(filter))));
      if (!pool.length) return tgMessage(env, chatId, 'برای این فیلتر مکانی پیدا نشد.');
      const picked = pool[Math.floor(Math.random() * pool.length)]; await tgMessage(env, chatId, '🎲 مقصد شانسی اطلس انتخاب شد:'); return sendPlace(env, chatId, picked, data, admin);
    }
    if (cmd === 'near') {
      const point = parseCoordinates(argText); if (!point) return tgMessage(env, chatId, 'برای جست‌وجوی نزدیک، مختصات را همراه دستور بفرست:\n<code>/near 29.72,52.47</code>');
      const data = await getBotData(env); const near = data.places.filter(p => admin || p.visibility !== 'private').map(p => ({p,d:haversine(point,p)})).sort((a,b)=>a.d-b.d).slice(0,5);
      if (!near.length) return tgMessage(env, chatId, 'مکانی ثبت نشده است.');
      await tgMessage(env, chatId, '<b>📍 نزدیک‌ترین مکان‌ها</b>\n' + near.map(x=>`• ${tgEscape(x.p.name)} — ${(x.d/1000).toFixed(2)} km`).join('\n'));
      return;
    }
    if (cmd === 'add') {
      if (!admin) return tgMessage(env, chatId, '⛔ این دستور فقط برای ادمین‌ها فعال است.');
      const parts = argText.split('|').map(s=>s.trim()); const name = parts[0] || '';
      const point = parseCoordinates(parts[1] || '');
      if (!name || !point) return tgMessage(env, chatId, 'فرمت صحیح:\n<code>/add نام مکان | 29.722356,52.470975 | دسته‌بندی | ورودی | توضیحات</code>\n\nیا فقط مختصات را مستقیم برای ربات بفرست.');
      const data = await getBotData(env); const fee = parts[3] ? Number(normalizeDigits(parts[3]).replace(/[,٬\s]/g,'')) : null;
      return telegramCreatePlace(env, chatId, { name, ...point, categoryId: categoryLookup(data, parts[2]), entryFee: Number.isFinite(fee) ? fee : null, description: parts.slice(4).join(' | '), source: 'telegram' }, update.update_id);
    }
    if (cmd === 'edit') {
      if (!admin) return tgMessage(env, chatId, '⛔ این دستور فقط برای ادمین‌ها فعال است.');
      const parts = argText.split('|').map(s=>s.trim()); const id = parts.shift(); if (!id || !parts.length) return tgMessage(env, chatId, 'فرمت: <code>/edit ID | name=نام جدید | fee=50000 | tags=دوستانه,Skybit</code>');
      const patch = parseKeyValues(parts); patch.id = id;
      if (patch.categoryId) { const data = await getBotData(env); patch.categoryId = categoryLookup(data, patch.categoryId); }
      const saved = await adminMutation(env, 'place.update', patch, update.update_id); if (saved.result?.duplicate) return;
      return tgMessage(env, chatId, `✅ تغییرات مکان <code>${tgEscape(id)}</code> ذخیره شد.`);
    }
    if (cmd === 'delete') {
      if (!admin) return tgMessage(env, chatId, '⛔ این دستور فقط برای ادمین‌ها فعال است.');
      const id = argText.trim(); if (!id) return tgMessage(env, chatId, 'فرمت: <code>/delete PLACE_ID</code>');
      const data = await getBotData(env); const place = data.places.find(p=>p.id===id); if (!place) return tgMessage(env, chatId, 'مکان پیدا نشد.');
      return tgMessage(env, chatId, `مکان <b>${tgEscape(place.name)}</b> حذف شود؟`, { reply_markup: { inline_keyboard: [[{ text: '🗑 بله، حذف شود', callback_data: `del:${id}` }, { text: 'لغو', callback_data: 'delcancel' }]] } });
    }
    if (cmd === 'visit') {
      if (!admin) return tgMessage(env, chatId, '⛔ این دستور فقط برای ادمین‌ها فعال است.');
      const parts = argText.split('|').map(s=>s.trim()); const [placeId,quality='normal',...notes] = parts; if (!placeId) return tgMessage(env, chatId, 'فرمت: <code>/visit PLACE_ID | good | توضیحات</code>');
      const saved = await adminMutation(env, 'visit.create', { placeId, quality, note: notes.join(' | ') }, update.update_id); if (saved.result?.duplicate) return;
      return tgMessage(env, chatId, '✅ بازدید به دفترچه شخصی اضافه شد.');
    }
    if (cmd === 'route') {
      if (!admin) return tgMessage(env, chatId, '⛔ این دستور فقط برای ادمین‌ها فعال است.');
      const parts = argText.split('|').map(s=>s.trim()); const [name,quality='normal',coordsText='',...notes] = parts;
      const coordinates = coordsText.split(/[;؛]/).map(parseCoordinates).filter(Boolean).map(p=>[p.lat,p.lng]);
      if (!name || coordinates.length < 2) return tgMessage(env, chatId, 'فرمت: <code>/route نام مسیر | good | 29.72,52.47;29.73,52.48 | توضیحات</code>');
      const saved = await adminMutation(env, 'route.create', { name, quality, coordinates, notes: notes.join(' | ') }, update.update_id); if (saved.result?.duplicate) return;
      return tgMessage(env, chatId, `✅ مسیر ذخیره شد. مسافت خطی تقریبی: ${(saved.result.distanceMeters/1000).toFixed(2)} km`);
    }
    if (cmd === 'categoryadd') {
      if (!admin) return tgMessage(env, chatId, '⛔ فقط ادمین.'); const [name,icon='✦'] = argText.split('|').map(s=>s.trim());
      const saved=await adminMutation(env,'category.create',{name,icon},update.update_id);if(saved.result?.duplicate)return;return tgMessage(env,chatId,`✅ دسته‌بندی «${tgEscape(name)}» اضافه شد.`);
    }
    if (cmd === 'tagadd') {
      if (!admin) return tgMessage(env, chatId, '⛔ فقط ادمین.'); const saved=await adminMutation(env,'tag.create',{name:argText},update.update_id);if(saved.result?.duplicate)return;return tgMessage(env,chatId,`✅ برچسب «${tgEscape(argText)}» اضافه شد.`);
    }
    if (cmd === 'duplicates') {
      if (!admin) return tgMessage(env, chatId, '🔒 این گزارش فقط برای ادمین‌هاست.');
      const data = await getBotData(env);
      const threshold = duplicateThreshold(data.settings?.duplicateThreshold, 35);
      const groups = findDuplicateGroups(data, threshold);
      const valid = data.places.filter(hasValidCoordinates).length;
      if (!groups.length) return tgMessage(env, chatId, `<b>🧹 گزارش پاک‌سازی اطلس</b>\n<blockquote>همهٔ ${data.places.length} رکورد بررسی شد؛ ${valid} مکان مختصات معتبر داشتند.\nدر شعاع ${threshold} متر گروه تکراری پیدا نشد.</blockquote>\n<code>SCAN COMPLETE · Shiraz Atlas</code>`);
      const rows = [];
      let actions = 0;
      const report = groups.slice(0, 12).map((group, index) => {
        const title = `${index + 1}. <b>${tgEscape(group.keep.name)}</b>`;
        const members = group.duplicates.map(item => {
          if (actions < 20) { rows.push([{ text: `🧩 ادغام «${item.name.slice(0,24)}»`, callback_data: `dconfirm:${group.keep.id}:${item.id}` }]); actions++; }
          return `  └ ${tgEscape(item.name)} · ${item.distanceMeters}m`;
        }).join('\n');
        return `${title}\n${members}`;
      }).join('\n\n');
      return tgMessage(env, chatId, `<b>🔎 اسکن کامل مکان‌های اطلس</b>\n<blockquote>📚 ${data.places.length} رکورد بررسی شد\n📍 ${valid} مکان مختصات معتبر\n🧩 ${groups.length} گروه مشکوک · ${groups.reduce((n,g)=>n+g.duplicates.length,0)} مورد تکراری احتمالی\n📏 شعاع: ${threshold} متر</blockquote>\n${report}\n\n<i>هر ادغام جداگانه نیازمند تأیید نهایی توست. موارد بیشتر را از پنل سایت بررسی کن.</i>`, { reply_markup: { inline_keyboard: rows } });
    }
    if (cmd === 'stats') {
      if (!admin) return tgMessage(env, chatId, '🔒 آمار مسیرها و بازدیدها خصوصی است.'); const data=await getBotData(env);const total=data.routes.reduce((s,r)=>s+(r.distanceMeters||0),0);const good=data.routes.filter(r=>r.quality==='good').length;
      return tgMessage(env,chatId,`<b>📊 آمار خصوصی اطلس</b>\n📍 مکان‌ها: ${data.places.length}\n🧭 مسیرها: ${data.routes.length}\n✅ بازدیدها: ${data.visits.length}\n🚗 مسافت ثبت‌شده: ${(total/1000).toFixed(1)} km\n🌟 مسیرهای خوب: ${good}`);
    }
    return tgMessage(env, chatId, 'دستور شناخته نشد. /help را بفرست.');
  }
  // A plain coordinate message is an admin shortcut; non-admin messages receive guidance.
  const point = parseCoordinates(rawText);
  if (point) {
    if (!admin) return tgMessage(env, chatId, 'برای جست‌وجوی نزدیک‌ترین مکان‌ها از /near lat,lng استفاده کن.');
    const name = coordinateTitle(rawText);
    return telegramCreatePlace(env, chatId, { name, ...point, categoryId: 'hidden', source: 'telegram' }, update.update_id);
  }
  if (rawText && !rawText.startsWith('/')) return tgMessage(env, chatId, 'پیام دریافت شد. برای ثبت مکان، مختصات را ارسال کن یا /help را ببین.');
}
async function handleTelegramCallback(callback, update, env) {
  const chatId = callback.message?.chat?.id, fromId = callback.from?.id;
  if (!chatId || !fromId) return;
  const data = String(callback.data || '');
  if (data === 'delcancel') { await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: 'حذف لغو شد.' }); return; }
  if (data.startsWith('del:')) {
    if (!await isAdmin(fromId, env)) { await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: 'دسترسی ادمین ندارید.', show_alert: true }); return; }
    const id = data.slice(4);
    try {
      const saved = await adminMutation(env, 'place.delete', { id }, update.update_id);
      await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: saved.result?.duplicate ? 'درخواست تکراری بود.' : 'مکان حذف شد.' });
      if (!saved.result?.duplicate) await tgMessage(env, chatId, `🗑 مکان <code>${tgEscape(id)}</code> حذف شد.`);
    } catch (error) { await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: error.message, show_alert: true }); }
  }

  const admin=await isAdmin(fromId,env);
  if (data.startsWith('pview:')) {
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id });
    const current = await getBotData(env), place = current.places.find(p => p.id === data.slice(6));
    if (!place || (!admin && place.visibility === 'private')) return tgMessage(env, chatId, 'این مکان پیدا نشد یا دسترسی مشاهده آن را نداری.');
    return sendPlace(env, chatId, place, current, admin);
  }
  if (data.startsWith('peditmenu:')) {
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id });
    if (!admin) return tgMessage(env, chatId, '⛔ دسترسی ادمین لازم است.');
    const current = await getBotData(env), place = current.places.find(p => p.id === data.slice(9));
    if (!place) return tgMessage(env, chatId, 'مکان پیدا نشد.');
    return sendPlaceEditMenu(env, chatId, place);
  }
  if (data.startsWith('pef:')) {
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id });
    if (!admin) return tgMessage(env, chatId, '⛔ دسترسی ادمین لازم است.');
    const [, placeId, field] = data.split(':');
    const current = await getBotData(env), place = current.places.find(p => p.id === placeId);
    if (!place || !Object.prototype.hasOwnProperty.call(TELEGRAM_EDIT_FIELDS, field)) return tgMessage(env, chatId, 'مکان یا فیلد ویرایش پیدا نشد.');
    await storeTelegramEditSession(env, chatId, fromId, placeId, field, update.update_id);
    const hints = { categoryId: 'نام دسته‌بندی را بفرست.', coordinates: 'مختصات جدید را مثل 29.72, 52.53 بفرست.', tags: 'برچسب‌ها را با کاما جدا کن؛ برای پاک‌کردن بنویس «پاک شود».', accessModes: 'یک یا چند مورد را با کاما بفرست: پیاده‌روی، خودرو، موتورسیکلت، حمل‌ونقل عمومی، دوچرخه.', entryFee: 'مبلغ ورودی را به تومان و فقط به‌صورت عدد بفرست؛ برای پاک‌کردن «ندارد» بنویس.', estimatedCost: 'هزینهٔ تقریبی هر نفر را به تومان و فقط به‌صورت عدد بفرست.', rating: 'امتیاز ۰ تا ۵ را بفرست.', visibility: '«عمومی» یا «خصوصی» بفرست.', status: '«فعال»، «در برنامه بازدید» یا «تعطیل» بفرست.' };
    return tgMessage(env, chatId, `<b>${tgEscape(TELEGRAM_EDIT_FIELDS[field])}</b> · ${tgEscape(place.name)}\n${tgEscape(hints[field] || 'مقدار جدید را در پیام بعدی بفرست.')}\n\nبرای لغو، /cancel را بفرست.`, { reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'مقدار جدید را وارد کن…' } });
  }
  if (data === 'dcancel') {
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: 'ادغام لغو شد.' });
    return;
  }
  if (data.startsWith('dconfirm:')) {
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id });
    if (!admin) return tgMessage(env, chatId, '⛔ دسترسی ادمین لازم است.');
    const [, keepId, duplicateId] = data.split(':');
    const current = await getBotData(env);
    const keep = current.places.find(place => place.id === keepId);
    const duplicate = current.places.find(place => place.id === duplicateId);
    if (!keep || !duplicate) return tgMessage(env, chatId, 'یکی از مکان‌ها دیگر وجود ندارد؛ دوباره /duplicates را اجرا کن.');
    const threshold = duplicateThreshold(current.settings?.duplicateThreshold, 35);
    const distance = Math.round(haversine(keep, duplicate));
    if (distance > threshold) return tgMessage(env, chatId, `⚠️ فاصلهٔ فعلی ${distance} متر است و از آستانهٔ ${threshold} متر بیشتر است. اسکن را دوباره انجام بده.`);
    return tgMessage(env, chatId, `<b>⚠️ تأیید نهایی ادغام</b>\n<blockquote>مکان اصلی:\n<b>${tgEscape(keep.name)}</b>\n\nمکان تکراری:\n<b>${tgEscape(duplicate.name)}</b>\n\nفاصله: <code>${distance} متر</code>\n\nبازدیدها و اطلاعات تکمیلی منتقل می‌شوند؛ رکورد تکراری حذف خواهد شد.</blockquote>`, { reply_markup: { inline_keyboard: [[{ text: '✓ تأیید ادغام', callback_data: `dmerge:${keepId}:${duplicateId}` }, { text: 'لغو', callback_data: 'dcancel' }]] } });
  }
  if (data.startsWith('dmerge:')) {
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: 'در حال بررسی و ادغام…' });
    if (!admin) return tgMessage(env, chatId, '⛔ دسترسی ادمین لازم است.');
    const [, keepId, duplicateId] = data.split(':');
    const current = await getBotData(env);
    const threshold = duplicateThreshold(current.settings?.duplicateThreshold, 35);
    try {
      const result = await adminMutation(env, 'place.merge', { keepId, duplicateIds: [duplicateId], threshold }, update.update_id);
      return tgMessage(env, chatId, `<b>✅ ادغام با موفقیت انجام شد</b>\n<blockquote>مکان اصلی: ${tgEscape(result.result.keepId)}\nرکورد حذف‌شده: <code>${tgEscape(duplicateId)}</code>\nبازدیدها به مکان اصلی منتقل شدند.</blockquote>\n<code>DATA CLEANUP · COMMITTED</code>`);
    } catch (error) {
      return tgMessage(env, chatId, `⚠️ ادغام انجام نشد: ${tgEscape(error.message)}`);
    }
  }
  if(data.startsWith('menu:')){
    await telegramCall(env,'answerCallbackQuery',{callback_query_id:callback.id});
    const cmd=data.slice(5);
    if(['places','random','categories','weather'].includes(cmd))return handleTelegramMessage({chat:callback.message.chat,from:callback.from,text:`/${cmd}`},update,env);
    if(cmd==='near')return tgMessage(env,chatId,'📍 موقعیت خود را به‌صورت Location ارسال کن یا /near lat,lng را بفرست.');
  }
  if(data==='admin:add'||data==='admin:panel'){
    await telegramCall(env,'answerCallbackQuery',{callback_query_id:callback.id});
    if(!admin)return tgMessage(env,chatId,'⛔ دسترسی ادمین لازم است.');
    return tgMessage(env,chatId,'🛠 پنل مدیریت\nبرای ثبت مکان، Location یا مختصات بفرست.\n<code>/add نام | lat,lng | دسته | ورودی | توضیحات</code>',{reply_markup:{inline_keyboard:[[{text:'🧪 تست سلامت',callback_data:'admin:test'},{text:'📊 آمار',callback_data:'admin:stats'}],[{text:'📚 راهنما',callback_data:'admin:help'}]]}});
  }
  if (data === 'admin:duplicates') {
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: 'در حال اسکن همه مکان‌ها…' });
    if (!admin) return tgMessage(env, chatId, '⛔ دسترسی ادمین لازم است.');
    return handleTelegramMessage({ chat: callback.message.chat, from: callback.from, text: '/duplicates' }, update, env);
  }
  if(data==='admin:test'){
    await telegramCall(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'در حال بررسی...'});
    if(!admin)return tgMessage(env,chatId,'⛔ دسترسی ادمین لازم است.');
    const checks=await runDiagnostics(env),ok=checks.filter(x=>x.ok).length;
    return tgMessage(env,chatId,`<b>🧪 تست سلامت</b>\n${checks.map(x=>`${x.ok?'✅':'❌'} ${tgEscape(x.name)}: ${tgEscape(x.detail)}`).join('\n')}\n<b>${ok}/${checks.length} موفق</b>`);
  }
  if(data==='admin:stats'||data==='admin:help'||data==='owner:admins'){
    await telegramCall(env,'answerCallbackQuery',{callback_query_id:callback.id});
    if(data==='owner:admins'&&!isOwner(fromId,env))return tgMessage(env,chatId,'⛔ فقط مالک اصلی.');
    if(data==='admin:stats')return handleTelegramMessage({chat:callback.message.chat,from:callback.from,text:'/stats'},update,env);
    if(data==='owner:admins')return handleTelegramMessage({chat:callback.message.chat,from:callback.from,text:'/admins'},update,env);
    return tgMessage(env,chatId,formatHelp(admin,isOwner(fromId,env)));
  }
}

async function telegramWebhook(request, env) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) return text('Forbidden', 403);
  let update; try { update = await request.json(); } catch { return text('Bad Request', 400); }
  try {
    if (update.callback_query) await handleTelegramCallback(update.callback_query, update, env);
    else if (update.message) await handleTelegramMessage(update.message, update, env);
    return json({ ok: true });
  } catch (error) {
    // Return 200 to Telegram for application-level errors to avoid an infinite retry loop.
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) { try { await tgMessage(env, chatId, `⚠️ عملیات انجام نشد: ${tgEscape(error.message || 'خطای داخلی')}\nتنظیمات اتصال و فایل داده را بررسی کن.`); } catch {} }
    return json({ ok: true, handled: false });
  }
}

async function routeRequest(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (path === '/telegram/webhook' && request.method === 'POST') return telegramWebhook(request, env);
  if (path === '/' && request.method === 'GET') return json({ service: 'Shiraz Atlas API', version: VERSION, health: '/api/health', docs: 'https://github.com/mehrdadmb2/shiraz-atlas' });
  if (path === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'Shiraz Atlas API', version: VERSION, dataConfigured: Boolean(env.GITHUB_OWNER && env.GITHUB_DATA_REPO && env.GITHUB_TOKEN), botConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET), timestamp: new Date().toISOString() });
  if (path === '/api/auth/login' && request.method === 'POST') {
    if (!originAllowed(request, env)) return json({ error: 'Origin مجاز نیست.' }, 403);
    if (loginRateLimited(request)) return json({ error: 'تعداد تلاش ناموفق زیاد است؛ کمی بعد دوباره تلاش کن.' }, 429);
    let body; try { body = await request.json(); } catch { return json({ error: 'درخواست ورود نامعتبر است.' }, 400); }
    if (!await passwordMatches(body?.password || '', env.WEB_ADMIN_PASSWORD || '')) { recordLoginFailure(request); return json({ error: 'رمز عبور صحیح نیست.' }, 401); }
    clearLoginFailures(request);
    try { return json({ ok: true, token: await issueToken(env), expiresIn: 28800 }); } catch (error) { return json({ error: error.message }, 500); }
  }
  if (path === '/api/auth/logout' && request.method === 'POST') return json({ ok: true });
  if (path === '/api/state' && request.method === 'GET') {
    try { const current = await readData(env); return json(publicData(current.data), 200, { 'cache-control': 'public, max-age=30' }); }
    catch (error) { return json({ error: error.message }, 503); }
  }
  if (path === '/api/admin/state' && request.method === 'GET') {
    if (!await requireAdmin(request, env)) return json({ error: 'نشست ادمین معتبر نیست.' }, 401);
    try { const current = await readData(env); return json({ ...current.data, isAdmin: true }); }
    catch (error) { return json({ error: error.message }, 503); }
  }
  if (path === '/api/admin/name-suggestion' && request.method === 'GET') {
    if (!await requireAdmin(request, env)) return json({ error: 'نشست ادمین معتبر نیست.' }, 401);
    const suggestion = await reversePlaceName(env, url.searchParams.get('lat'), url.searchParams.get('lng'));
    return json({ ok: Boolean(suggestion), suggestion });
  }
  if (path === '/api/admin/duplicates' && request.method === 'GET') {
    if (!await requireAdmin(request, env)) return json({ error: 'نشست ادمین معتبر نیست.' }, 401);
    try {
      const current = await readData(env);
      const threshold = duplicateThreshold(url.searchParams.get('threshold'), current.data.settings?.duplicateThreshold || 35);
      const groups = findDuplicateGroups(current.data, threshold);
      const validCoordinates = current.data.places.filter(hasValidCoordinates).length;
      return json({ threshold, groups, duplicatePlaces: groups.reduce((sum, group) => sum + group.duplicates.length, 0), scannedPlaces: current.data.places.length, validCoordinatePlaces: validCoordinates, skippedPlaces: current.data.places.length - validCoordinates });
    } catch (error) { return json({ error: error.message }, 503); }
  }
  if (path === '/api/admin/mutate' && request.method === 'POST') return handleMutation(request, env);
  if (path === '/api/admin/diagnostics' && request.method === 'GET') { if (!await requireAdmin(request, env)) return json({ error: 'نشست ادمین معتبر نیست.' }, 401); const checks = await runDiagnostics(env); return json({ ok: checks.every(x => x.ok), checks, timestamp: new Date().toISOString() }); }
  if (path === '/api/discover' && request.method === 'GET') return discoverNearby(url);
  if (path === '/api/route' && request.method === 'GET') return routePreview(url);
  if (path === '/api/weather' && request.method === 'GET') return weatherFor(url);
  return json({ error: 'مسیر API پیدا نشد.' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    try { return withCors(await routeRequest(request, env), request, env); }
    catch (error) {
      const safe = error?.message || 'خطای غیرمنتظره در Worker رخ داد.';
      return withCors(json({ error: safe }, 500), request, env);
    }
  }
};
