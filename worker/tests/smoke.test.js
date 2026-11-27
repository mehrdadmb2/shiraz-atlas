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
  const telegramCalls = [];
  const originalFetch = globalThis.fetch;
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
    if (url.hostname === 'api.telegram.org') {
      const payload = JSON.parse(init.body || '{}');
      telegramCalls.push({ method: url.pathname.split('/').pop(), payload });
      return new Response(JSON.stringify({ ok: true, result: { message_id: telegramCalls.length } }), { status: 200 });
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

    response = await call('/api/admin/diagnostics', { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(response.status, 200, 'authenticated diagnostics endpoint should respond');
    const diagnostics = await response.json();
    assert.ok(diagnostics.checks.some(x => x.name === 'Private data repository'));
    assert.ok(diagnostics.checks.some(x => x.name === 'GitHub Pages website'));

    const mutate = (action, payload) => call('/api/admin/mutate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${session.token}`, Origin: 'https://mehrdadmb2.github.io' },
      body: JSON.stringify({ action, payload })
    });
    response = await mutate('place.create', { name: 'No entry fee set', lat: 29.62, lng: 52.52, entryFee: null, estimatedCost: null, rating: null });
    assert.equal(response.status, 200);
    assert.equal(data.places[0].entryFee, null, 'blank fees should remain null, not become zero');

    response = await mutate('visit.update', { id: 'visit1', quality: 'bad', note: 'updated private note' });
    assert.equal(response.status, 200);
    assert.equal(data.visits[0].quality, 'bad');

    response = await mutate('route.update', { id: 'route1', quality: 'good', visitedAt: '2026-11-27T10:00:00.000Z' });
    assert.equal(response.status, 200);
    assert.equal(data.routes.find(route => route.id === 'route1').quality, 'good');

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
    assert.ok(data.meta.processedTelegramUpdateIds.includes(999));

    const dmsPayload = { update_id: 1000, message: { message_id: 2, from: { id: 12345 }, chat: { id: 12345 }, text: '29°43\'20.5"N 52°28\'15.5"E' } };
    response = await call('/telegram/webhook', {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' },
      body: JSON.stringify(dmsPayload)
    });
    assert.equal(response.status, 200);
    assert.equal(data.places.length, 5, 'DMS coordinate message should create a place');

    const ownerAdd = { update_id: 1001, message: { message_id: 3, from: { id: 12345 }, chat: { id: 12345 }, text: '/adminadd 54321' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(ownerAdd) });
    assert.equal(response.status, 200);
    assert.ok(data.meta.telegramAdmins.includes('54321'), 'owner can delegate admin access without code changes');

    const delegatedAdmin = { update_id: 1002, message: { message_id: 4, from: { id: 54321 }, chat: { id: 54321 }, text: '29.733000, 52.510000' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(delegatedAdmin) });
    assert.equal(response.status, 200);
    assert.equal(data.places.length, 6, 'delegated admin can create places');

    const ownerRemove = { update_id: 1003, message: { message_id: 5, from: { id: 12345 }, chat: { id: 12345 }, text: '/adminremove 54321' } };
    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' }, body: JSON.stringify(ownerRemove) });
    assert.equal(response.status, 200);
    assert.ok(!data.meta.telegramAdmins.includes('54321'), 'owner can revoke delegated admin access');

    response = await call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong' }, body: '{}' });
    assert.equal(response.status, 403, 'invalid webhook secret must be rejected');

    assert.ok(writes >= 7);
    assert.ok(telegramCalls.length >= 2);
  } finally {
    globalThis.fetch = originalFetch;
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
