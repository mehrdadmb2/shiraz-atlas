import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const seed = {
  schemaVersion: 1, updatedAt: new Date().toISOString(),
  settings: { city: 'Shiraz', cityFa: 'شیراز', center: { lat: 29.5918, lng: 52.5837 }, explorationBounds: { south: 29.47, west: 52.42, north: 29.73, east: 52.78, step: 0.004 } },
  categories: [{ id: 'nature', name: 'Nature', icon: '🌿' }, { id: 'hidden', name: 'Hidden', icon: '✦' }],
  tags: ['دوستانه', 'Skybit'], places: [], visits: [], routes: [], meta: { lastTelegramUpdateId: 0 }
};

// Integration smoke test: GitHub and Telegram are deterministic mocks; no real credentials/network calls.
test('Shiraz Atlas API privacy, admin auth, mutations and Telegram webhook', async () => {
  let data = structuredClone(seed);
  data.places.push(
    { id: 'public1', name: 'Public Park', lat: 29.6, lng: 52.5, categoryId: 'nature', visibility: 'public', notes: 'must remain private in public API', tags: [] },
    { id: 'private1', name: 'Private Place', lat: 29.61, lng: 52.51, categoryId: 'hidden', visibility: 'private', notes: 'private place note', tags: [] }
  );
  data.visits.push({ id: 'visit1', placeId: 'public1', visitedAt: new Date().toISOString(), quality: 'good', note: 'private visit note', visibility: 'private' });
  data.routes.push(
    { id: 'route1', name: 'Private route', coordinates: [[29.6, 52.5], [29.61, 52.51]], distanceMeters: 1400, visibility: 'private', notes: 'private route note' },
    { id: 'route2', name: 'Public route', coordinates: [[29.6, 52.5], [29.62, 52.52]], distanceMeters: 2800, visibility: 'public', notes: 'must be stripped' }
  );

  let sha = 'sha0';
  let writes = 0;
  let forceOverpassName = false;
  const telegramCalls = [];
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const testCache = new Map();
  globalThis.caches = { default: {
    match: async request => testCache.get(request.url)?.clone() || null,
    put: async (request, response) => { testCache.set(request.url, response.clone()); }
  } };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.github.com' && url.pathname.endsWith('/contents/atlas.json')) {
      if ((init.method || 'GET') === 'GET') {
        return new Response(JSON.stringify({ content: btoa(unescape(encodeURIComponent(JSON.stringify(data)))), sha }), { status: 200 });
      }
      if (init.method === 'PUT') {
        const payload = JSON.parse(init.body);
        data = JSON.parse(decodeURIComponent(escape(atob(payload.content))));
        sha = `sha${++writes}`;
        return new Response(JSON.stringify({ content: { sha }, commit: { sha: `commit${writes}` } }), { status: 201 });
      }
    }
    if (url.hostname === 'nominatim.openstreetmap.org') {
      const result = forceOverpassName
        ? { name: 'Unnamed building', category: 'building', type: 'house', addresstype: 'house', lat: '29.7102', lon: '52.4701', display_name: 'Unnamed building, Shiraz' }
        : { name: 'Test Garden', category: 'leisure', type: 'garden', addresstype: 'garden', lat: '29.722356', lon: '52.470975', display_name: 'Test Garden, Shiraz', namedetails: { name: 'Test Garden' } };
      return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.hostname === 'overpass-api.de' && forceOverpassName) {
      return new Response(JSON.stringify({ elements: [{ type: 'way', id: 555, center: { lat: 29.7102, lon: 52.4701 }, tags: { 'name:fa': 'باغ ارم', tourism: 'garden' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.hostname === 'api.github.com' && url.pathname === '/repos/mehrdadmb2/shiraz-atlas-data') {
      return new Response(JSON.stringify({ full_name: 'mehrdadmb2/shiraz-atlas-data', private: true, permissions: { push: true, admin: false } }), { status: 200 });
    }
    if (url.hostname === 'raw.githubusercontent.com' && url.pathname === '/mehrdadmb2/shiraz-atlas/main/README.md') {
      return new Response('# Shiraz Atlas', { status: 200 });
    }
    if (url.hostname === 'mehrdadmb2.github.io') return new Response('<html>OK</html>', { status: 200 });
    if (url.hostname === 'api.telegram.org') {
      const payload = JSON.parse(init.body || '{}');
      const method = url.pathname.split('/').pop();
      for (const row of payload.reply_markup?.inline_keyboard || []) {
        for (const button of row || []) {
          if (button.callback_data != null) assert.ok(new TextEncoder().encode(String(button.callback_data)).byteLength <= 64, `Telegram callback_data must be <=64 bytes: ${button.callback_data}`);
        }
      }
      telegramCalls.push({ method, payload });
      const result = method === 'getMe' ? { username: 'ShirazAtlasBot' } :
        method === 'getWebhookInfo' ? { url: 'https://worker.test/telegram/webhook', pending_update_count: 0 } :
        { message_id: telegramCalls.length };
      return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  try {
    const env = {
      SITE_ORIGIN: 'https://mehrdadmb2.github.io',
      ALLOWED_ORIGINS: 'https://mehrdadmb2.github.io',
      GITHUB_OWNER: 'mehrdadmb2', GITHUB_DATA_REPO: 'shiraz-atlas-data', GITHUB_BRANCH: 'main',
      GITHUB_DATA_PATH: 'atlas.json', GITHUB_TOKEN: 'fake-test-token',
      WEB_ADMIN_PASSWORD: 'test-password', SESSION_SECRET: 'S'.repeat(48),
      TELEGRAM_BOT_TOKEN: '123456:abcdefghijklmnopqrstuvwxyzABCDE',
      TELEGRAM_ADMIN_IDS: '12345', TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
      PUBLIC_SITE_URL: 'https://mehrdadmb2.github.io/shiraz-atlas/'
    };
    const call = (pathname, options = {}) => worker.fetch(new Request(`https://worker.test${pathname}`, options), env, {});

    let response = await call('/api/health');
    const health = await response.json();
    assert.equal(health.ok, true);
    assert.equal(health.dataConfigured, true);

    response = await call('/api/admin/duplicates?threshold=35');
    assert.equal(response.status, 401, 'duplicate scan is admin-only');

    response = await call('/api/state');
    const publicState = await response.json();
    assert.equal(publicState.places.length, 1, 'private places must not be public');
    assert.equal(publicState.places[0].notes, undefined, 'place notes must be stripped');
    assert.equal(publicState.visits.length, 0, 'visit journal is always private');
    assert.equal(publicState.routes.length, 1, 'only explicitly public routes are shared');
    assert.equal(publicState.routes[0].id, 'route2');
    assert.equal(publicState.routes[0].notes, undefined, 'public route notes must be stripped');

    response = await call('/api/admin/mutate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'place.create', payload: { name: 'Unauth', lat: 29.7, lng: 52.5 } })
    });
    assert.equal(response.status, 401, 'writes require an admin session');

    const loginOptions = {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: 'https://mehrdadmb2.github.io' },
      body: JSON.stringify({ password: 'test-password' })
    };
    response = await call('/api/auth/login', loginOptions);
    assert.equal(response.status, 200);
    const session = await response.json();
    assert.ok(session.token);

    response = await call('/api/admin/state', { headers: { Authorization: `Bearer ${session.token}` } });
    const adminState = await response.json();
    assert.equal(adminState.isAdmin, true);
    assert.equal(adminState.places.length, 2);
    assert.equal(adminState.visits.length, 1);
    assert.equal(adminState.routes.length, 2);

    const publicPlaceView = { update_id: 90, callback_query: { id: 'cb-public-view', from: { id: 98765 }, message: { chat: { id: 98765 } }, data: 'pview:public1' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(publicPlaceView) });
    assert.equal(response.status, 200);
    const publicPlaceMessage = telegramCalls.filter(call => call.method === 'sendMessage').at(-1);
    assert.equal(String(publicPlaceMessage.payload.text || '').includes('must remain private in public API'), false, 'Telegram public place view must not leak admin-only notes');

    response = await call('/api/admin/name-suggestion?lat=29.722356&lng=52.470975', { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).suggestion.name, 'Test Garden', 'reverse geocoder returns a nearby named POI suggestion');

    response = await call('/api/admin/diagnostics', { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(response.status, 200, 'authenticated diagnostics endpoint should respond');
    const diagnostics = await response.json();
    assert.ok(diagnostics.checks.some(x => x.name === 'Private data repository'));
    assert.ok(diagnostics.checks.some(x => x.name === 'GitHub Pages website'));
    assert.ok(diagnostics.checks.some(x => x.name === 'GitHub data repository access' && x.ok), 'diagnostics reads the private repository metadata');
    assert.ok(diagnostics.checks.some(x => x.name === 'GitHub repository push role' && x.ok), 'diagnostics verifies repository push role');

    const mutate = (action, payload) => call('/api/admin/mutate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${session.token}`, Origin: 'https://mehrdadmb2.github.io' },
      body: JSON.stringify({ action, payload })
    });
    response = await mutate('place.create', { name: 'No entry fee set', lat: 29.62, lng: 52.52, entryFee: null, estimatedCost: null, rating: null, accessModes: ['walking','car','public_transport'], accessNotes: 'پارکینگ عمومی نزدیک ورودی' });
    assert.equal(response.status, 200);
    assert.equal(data.places[0].entryFee, null, 'blank fees should remain null, not become zero');
    assert.deepEqual(data.places[0].accessModes, ['walking','car','public_transport']);
    assert.equal(data.places[0].accessNotes, 'پارکینگ عمومی نزدیک ورودی');

    response = await mutate('visit.update', { id: 'visit1', quality: 'bad', note: 'updated private note' });
    assert.equal(response.status, 200);
    assert.equal(data.visits[0].quality, 'bad');

    response = await mutate('route.update', { id: 'route1', quality: 'good', visitedAt: '2026-11-27T10:00:00.000Z' });
    assert.equal(response.status, 200);
    assert.equal(data.routes.find(route => route.id === 'route1').quality, 'good');

    // An ordinary edit that resubmits unchanged coordinates must not be mistaken for a move.
    response = await mutate('place.update', { id: 'private1', name: 'Private place updated', lat: 29.61, lng: 52.51 });
    assert.equal(response.status, 200, 'editing a field without changing coordinates remains allowed');

    // Near-duplicate creates are blocked until the admin explicitly confirms.
    response = await mutate('place.create', { name: 'Public Park duplicate', lat: 29.6001, lng: 52.5001 });
    assert.equal(response.status, 409);
    const duplicateWarning = await response.json();
    assert.equal(duplicateWarning.code, 'NEARBY_DUPLICATE');
    assert.equal(duplicateWarning.matches[0].id, 'public1');
    response = await mutate('place.update', { id: 'private1', lat: 29.6001, lng: 52.5001 });
    assert.equal(response.status, 409, 'moving an existing place into a duplicate radius is warned');

    response = await call('/api/admin/duplicates?threshold=4', { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).threshold, 25, 'duplicate scan threshold is clamped to a safe 25m minimum');
    response = await call('/api/admin/duplicates?threshold=99', { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal((await response.json()).threshold, 50, 'duplicate scan threshold is clamped to a safe 50m maximum');

    response = await mutate('place.create', { name: 'Public Park duplicate', lat: 29.6001, lng: 52.5001, accessModes: ['walking'], visibility: 'private', confirmNearDuplicate: true });
    assert.equal(response.status, 200, 'admin can explicitly confirm a nearby independent place');
    const duplicateId = (await response.json()).result.id;
    response = await call('/api/admin/duplicates?threshold=35', { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(response.status, 200);
    const duplicateReport = await response.json();
    assert.ok(duplicateReport.groups.some(group => group.keep.id === 'public1' && group.duplicates.some(item => item.id === duplicateId)));

    response = await mutate('visit.create', { placeId: duplicateId, quality: 'good', note: 'visit must be retained when merging' });
    assert.equal(response.status, 200);
    response = await mutate('place.merge', { keepId: 'public1', duplicateIds: ['private1'], threshold: 35 });
    assert.equal(response.status, 400, 'server refuses merges beyond selected distance threshold');
    assert.ok(data.places.some(place => place.id === 'private1'), 'failed merge leaves records untouched');

    response = await mutate('place.merge', { keepId: 'public1', duplicateIds: [duplicateId], threshold: 35 });
    assert.equal(response.status, 200);
    assert.equal(data.places.some(place => place.id === duplicateId), false, 'merged duplicate record is removed');
    assert.ok(data.visits.some(visit => visit.placeId === 'public1' && visit.note === 'visit must be retained when merging'), 'visits are reassigned to the canonical place');
    assert.ok(data.places.find(place => place.id === 'public1').tags);
    assert.equal(data.places.find(place => place.id === 'public1').visibility, 'private', 'merge preserves the stricter private visibility when records differ');

    // Successful sign-ins must not consume the failed-password rate-limit budget.
    for (let i = 0; i < 10; i++) {
      response = await call('/api/auth/login', { ...loginOptions, headers: { ...loginOptions.headers, 'CF-Connecting-IP': '192.0.2.10' } });
      assert.equal(response.status, 200);
    }

    const webhookPayload = { update_id: 999, message: { message_id: 1, from: { id: 12345, first_name: 'AtlasAdmin' }, chat: { id: 12345 }, text: '29.722356, 52.470975' } };
    response = await call('/telegram/webhook', {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' },
      body: JSON.stringify(webhookPayload)
    });
    assert.equal(response.status, 200);
    assert.equal(data.places.length, 4, 'admin coordinate message should create a place');
    assert.equal(data.places.find(place => place.lat === 29.722356)?.name, 'Test Garden', 'unnamed Telegram location receives a nearby OSM name when a confident POI match exists');
    assert.ok(data.meta.processedTelegramUpdateIds.includes(999));

    // Long UUID-based place IDs must remain within Telegram's 64-byte callback_data limit.
    const createReply = telegramCalls.filter(call => call.method === 'sendMessage').at(-1);
    const compactEditButton = createReply.payload.reply_markup.inline_keyboard.flat().find(button => String(button.callback_data || '').startsWith('pm:'));
    assert.ok(compactEditButton, 'new place confirmation includes a compact edit callback');
    assert.ok(new TextEncoder().encode(compactEditButton.callback_data).byteLength <= 64);
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify({ update_id: 1012, callback_query: { id: 'cb-long-place-menu', from: { id: 12345 }, message: { chat: { id: 12345 } }, data: compactEditButton.callback_data } }) });
    assert.equal(response.status, 200);
    const longEditMenu = telegramCalls.filter(call => call.method === 'sendMessage').at(-1);
    const longNameButton = longEditMenu.payload.reply_markup.inline_keyboard.flat().find(button => String(button.callback_data || '').endsWith(':name'));
    assert.ok(longNameButton, 'compact field editor button is available for UUID place IDs');
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify({ update_id: 1013, callback_query: { id: 'cb-long-place-name', from: { id: 12345 }, message: { chat: { id: 12345 } }, data: longNameButton.callback_data } }) });
    assert.equal(response.status, 200);
    const longCreatedId = data.places.find(place => place.name === 'Test Garden')?.id;
    assert.ok(longCreatedId);
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify({ update_id: 1014, message: { message_id: 45, from: { id: 12345 }, chat: { id: 12345 }, text: 'Test Garden Edited' } }) });
    assert.equal(response.status, 200);
    assert.equal(data.places.find(place => place.id === longCreatedId).name, 'Test Garden Edited', 'compact UUID callback resolves back to the original place ID');

    forceOverpassName = true;
    response = await mutate('place.create', { name: 'مکان بدون نام', lat: 29.7102, lng: 52.4701 });
    assert.equal(response.status, 200);
    const overpassNamedPlace = data.places.find(place => place.lat === 29.7102);
    assert.equal(overpassNamedPlace.name, 'باغ ارم', 'Overpass fallback suggests a nearby named POI when Nominatim has no suitable feature');
    assert.equal(overpassNamedPlace.nameSource, 'openstreetmap-overpass');
    forceOverpassName = false;

    const dmsPayload = { update_id: 1000, message: { message_id: 2, from: { id: 12345 }, chat: { id: 12345 }, text: '29°43\'20.5"N 52°28\'15.5"E' } };
    response = await call('/telegram/webhook', {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' },
      body: JSON.stringify(dmsPayload)
    });
    assert.equal(response.status, 200);
    assert.equal(data.places.length, 5, 'DMS duplicate coordinate should be blocked instead of creating a repeated place');
    assert.ok(telegramCalls.some(call => call.method === 'sendMessage' && String(call.payload.text || '').includes('مکان مشابه')));

    const ownerAdd = { update_id: 1001, message: { message_id: 3, from: { id: 12345 }, chat: { id: 12345 }, text: '/adminadd 54321' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(ownerAdd) });
    assert.equal(response.status, 200);
    assert.ok(data.meta.telegramAdmins.includes('54321'), 'owner can delegate admin access without code changes');

    const adminAddPrompt = { update_id: 1010, message: { message_id: 40, from: { id: 12345 }, chat: { id: 12345 }, text: '/adminadd' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(adminAddPrompt) });
    assert.equal(response.status, 200);
    assert.ok(data.meta.telegramAdminSessions['12345:12345'], 'adminadd without an argument opens a pending ID-entry session');
    const adminAddReply = { update_id: 1011, message: { message_id: 41, from: { id: 12345 }, chat: { id: 12345 }, text: '65432' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(adminAddReply) });
    assert.equal(response.status, 200);
    assert.ok(data.meta.telegramAdmins.includes('65432'), 'interactive adminadd accepts a plain numeric reply');
    assert.equal(Boolean(data.meta.telegramAdminSessions['12345:12345']), false, 'admin ID-entry session is cleared after success');

    const adminRemovePrompt = { update_id: 1020, message: { message_id: 42, from: { id: 12345 }, chat: { id: 12345 }, text: '/adminremove' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(adminRemovePrompt) });
    assert.equal(response.status, 200);
    const adminRemoveReply = { update_id: 1021, message: { message_id: 43, from: { id: 12345 }, chat: { id: 12345 }, text: '65432' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(adminRemoveReply) });
    assert.equal(response.status, 200);
    assert.ok(!data.meta.telegramAdmins.includes('65432'), 'interactive adminremove revokes the delegated admin');

    const cancelPrompt = { update_id: 1022, message: { message_id: 44, from: { id: 12345 }, chat: { id: 12345 }, text: '/adminadd' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(cancelPrompt) });
    assert.equal(response.status, 200);
    const cancelAction = { update_id: 1023, message: { message_id: 45, from: { id: 12345 }, chat: { id: 12345 }, text: '/cancel' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(cancelAction) });
    assert.equal(response.status, 200);
    assert.equal(Boolean(data.meta.telegramAdminSessions['12345:12345']), false, '/cancel clears pending admin delegation');

    const delegatedAdmin = { update_id: 1002, message: { message_id: 4, from: { id: 54321 }, chat: { id: 54321 }, text: '29.733000, 52.510000' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(delegatedAdmin) });
    assert.equal(response.status, 200);
    assert.equal(data.places.length, 6, 'delegated admin can create places');

    // Telegram inline field editor: tap a field, then send only the new value (no command / place ID).
    const editMenuCallback = { update_id: 1003, callback_query: { id: 'cb-menu', from: { id: 12345 }, message: { chat: { id: 12345 } }, data: 'peditmenu:public1' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(editMenuCallback) });
    assert.equal(response.status, 200);
    const editMenuMessage = telegramCalls.filter(call => call.method === 'sendMessage').at(-1);
    assert.ok(String(editMenuMessage.payload.text || '').includes('ویرایش مکان'), 'peditmenu callback resolves the exact place ID (no stray colon)');
    const editFieldCallback = { update_id: 1004, callback_query: { id: 'cb-field', from: { id: 12345 }, message: { chat: { id: 12345 } }, data: 'pef:public1:name' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(editFieldCallback) });
    assert.equal(response.status, 200);
    assert.ok(data.meta.telegramEditSessions['12345:12345']);
    const editReply = { update_id: 1005, message: { message_id: 6, from: { id: 12345 }, chat: { id: 12345 }, text: 'پارک مرکزی' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(editReply) });
    assert.equal(response.status, 200);
    assert.equal(data.places.find(place => place.id === 'public1').name, 'پارک مرکزی');
    assert.equal(Boolean(data.meta.telegramEditSessions['12345:12345']), false, 'edit session is cleared after a successful update');

    response = await mutate('place.create', { name: 'Duplicate for Telegram review', lat: 29.60005, lng: 52.50005, confirmNearDuplicate: true });
    assert.equal(response.status, 200);
    const telegramDuplicateId = (await response.json()).result.id;
    const duplicateCommand = { update_id: 1007, message: { message_id: 7, from: { id: 12345 }, chat: { id: 12345 }, text: '/duplicates' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(duplicateCommand) });
    assert.equal(response.status, 200);
    const duplicateReportMessage = telegramCalls.filter(call => call.method === 'sendMessage').at(-1);
    assert.ok(String(duplicateReportMessage.payload.text || '').includes('اسکن کامل مکان‌های اطلس'), 'admin duplicate scan command returns a full report');
    const confirmPair = duplicateReportMessage.payload.reply_markup.inline_keyboard.flat().find(button => String(button.callback_data || '').startsWith('dc:'));
    assert.ok(confirmPair, 'duplicate report offers an admin confirmation action');
    const confirmCallback = { update_id: 1008, callback_query: { id: 'cb-dup-confirm', from: { id: 12345 }, message: { chat: { id: 12345 } }, data: confirmPair.callback_data } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(confirmCallback) });
    assert.equal(response.status, 200);
    const confirmationMessage = telegramCalls.filter(call => call.method === 'sendMessage').at(-1);
    const mergeButton = confirmationMessage.payload.reply_markup.inline_keyboard.flat().find(button => String(button.callback_data || '').startsWith('dm:'));
    assert.ok(mergeButton, 'a second explicit confirmation is required before merge');
    const mergeCallback = { update_id: 1009, callback_query: { id: 'cb-dup-merge', from: { id: 12345 }, message: { chat: { id: 12345 } }, data: mergeButton.callback_data } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(mergeCallback) });
    assert.equal(response.status, 200);
    assert.equal(data.places.some(place => place.id === telegramDuplicateId), false, 'confirmed Telegram merge removes duplicate record');

    const ownerRemove = { update_id: 1006, message: { message_id: 5, from: { id: 12345 }, chat: { id: 12345 }, text: '/adminremove 54321' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(ownerRemove) });
    assert.equal(response.status, 200);
    assert.ok(!data.meta.telegramAdmins.includes('54321'), 'owner can revoke delegated admin access');

    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong' }, body: '{}' });
    assert.equal(response.status, 403, 'invalid webhook secret must be rejected');

    assert.ok(writes >= 7);
    assert.ok(telegramCalls.length >= 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches; else globalThis.caches = originalCaches;
  }
});


test('Weather API exposes current conditions and a three-day forecast', async () => {
  const originalFetch = globalThis.fetch;
  const upstream = {
    current: {
      temperature_2m: 24.5, relative_humidity_2m: 31, apparent_temperature: 24.1,
      is_day: 1, precipitation: 0, weather_code: 1, wind_speed_10m: 8.2
    },
    daily: {
      time: ['2026-11-27', '2026-11-28', '2026-11-29'],
      weather_code: [1, 3, 61],
      temperature_2m_max: [26, 24, 21],
      temperature_2m_min: [12, 11, 10],
      precipitation_probability_max: [0, 5, 55]
    },
    timezone: 'Asia/Tehran'
  };
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'api.open-meteo.com');
    assert.ok(url.searchParams.get('current').includes('temperature_2m'));
    assert.ok(url.searchParams.get('daily').includes('precipitation_probability_max'));
    return new Response(JSON.stringify(upstream), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = { SITE_ORIGIN: 'https://mehrdadmb2.github.io', ALLOWED_ORIGINS: 'https://mehrdadmb2.github.io' };
    const response = await worker.fetch(new Request('https://worker.test/api/weather?lat=29.5918&lng=52.5837', {
      headers: { Origin: 'https://mehrdadmb2.github.io' }
    }), env, {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://mehrdadmb2.github.io');
    assert.match(response.headers.get('cache-control') || '', /s-maxage=900/);
    const payload = await response.json();
    assert.equal(payload.current.temperature_2m, 24.5);
    assert.equal(payload.daily.time.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GitHub Pages exposes place edit entry points and current Worker cache version', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../js/app.js', import.meta.url), 'utf8');
  const htmlSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const swSource = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.match(appSource, /data-action="edit" data-id=\"\$\{U\.esc\(p\.id\)\}\"/);
  assert.match(appSource, /\$\('#place-detail-edit'\)\.classList\.remove\('hidden'\)/);
  assert.doesNotMatch(htmlSource, /id="place-detail-edit"[^>]*admin-only hidden/);
  assert.match(swSource, /shiraz-atlas-static-v1\.5\.0/);
});
