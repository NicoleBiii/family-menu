import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import sharp from 'sharp';
import { api, createHousehold, identity, pool, server, signIn } from './harness.mjs';

async function fixture() {
  return sharp({ create: { width: 80, height: 60, channels: 3, background: '#aa6644' } })
    .jpeg()
    .toBuffer();
}

async function recipeFor(user, householdId) {
  const response = await api(user, `/households/${householdId}/recipes`, {
    method: 'POST',
    body: { requestId: randomUUID(), name: 'Library photo dish', servings: 2 },
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function localProvider() {
  const bytes = await fixture();
  const calls = [];
  let imageStatus = 200;
  let unsafeSource = false;
  let origin;
  const stub = createServer((request, response) => {
    const url = new URL(request.url, origin);
    calls.push({
      path: url.pathname,
      query: url.searchParams.get('query'),
      auth: request.headers.authorization,
    });
    if (url.pathname === '/image.jpg') {
      response.writeHead(imageStatus, { 'Content-Type': 'image/jpeg' });
      response.end(imageStatus === 200 ? bytes : 'unavailable');
      return;
    }
    const photo = {
      id: 123,
      url: 'https://www.pexels.com/photo/meal-123/',
      photographer: 'Test Photographer',
      photographer_url: 'https://www.pexels.com/@tester',
      alt: 'A bowl of food',
      src: {
        medium: `${origin}/image.jpg`,
        large: unsafeSource ? 'http://127.0.0.1:1/private' : `${origin}/image.jpg`,
      },
    };
    if (url.pathname === '/v1/search') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ photos: [photo], next_page: null }));
    } else if (url.pathname === '/v1/photos/123') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(photo));
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${stub.address().port}`;
  return {
    origin,
    calls,
    setImageStatus(value) {
      imageStatus = value;
    },
    setUnsafeSource(value) {
      unsafeSource = value;
    },
    close: () => new Promise((resolve) => stub.close(resolve)),
  };
}

test('AC-20: explicit search and private import preserve Pexels credit; manual replacement clears it', async () => {
  const provider = await localProvider();
  const previous = server.config.photoLibrary;
  server.config.photoLibrary = {
    apiKey: 'test-key',
    apiOrigin: provider.origin,
    imageOrigin: provider.origin,
  };
  try {
    const member = await signIn(identity('Library member'));
    const household = await createHousehold(member);
    const recipe = await recipeFor(member, household.id);
    const base = `/households/${household.id}`;
    const search = await api(member, `${base}/photo-library/search?query=vegetable%20soup`);
    assert.equal(search.status, 200);
    const result = await search.json();
    assert.equal(result.photos.length, 1);
    assert.equal(result.photos[0].photographer, 'Test Photographer');
    assert.deepEqual(
      provider.calls.map((call) => call.path),
      ['/v1/search'],
    );
    assert.equal(provider.calls[0].query, 'vegetable soup');
    assert.equal(provider.calls[0].auth, 'test-key');

    const imported = await api(member, `${base}/recipes/${recipe.id}/photo-library`, {
      method: 'POST',
      body: { photoId: 123 },
    });
    assert.equal(imported.status, 200, await imported.clone().text());
    const stored = await imported.json();
    const detail = await (await api(member, `${base}/recipes/${recipe.id}`)).json();
    assert.equal(detail.imageId, stored.imageId);
    assert.deepEqual(detail.imageCredit, {
      provider: 'pexels',
      sourceUrl: 'https://www.pexels.com/photo/meal-123/',
      photographer: 'Test Photographer',
      photographerUrl: 'https://www.pexels.com/@tester',
    });
    const row = await pool.query(
      'select content, source_provider from app.recipe_images where recipe_id = $1',
      [recipe.id],
    );
    assert.equal(row.rows[0].source_provider, 'pexels');
    assert.equal((await sharp(row.rows[0].content).metadata()).format, 'webp');
    const outsider = await signIn(identity('Other household'));
    await createHousehold(outsider);
    assert.equal((await api(outsider, `${base}/photo-library/search?query=soup`)).status, 404);
    assert.equal(
      (
        await api(outsider, `${base}/recipes/${recipe.id}/photo-library`, {
          method: 'POST',
          body: { photoId: 123 },
        })
      ).status,
      404,
    );
    assert.equal(
      (await api(outsider, `${base}/recipes/${recipe.id}/image/${stored.imageId}`)).status,
      404,
    );
    assert.deepEqual(
      provider.calls.map((call) => call.path),
      ['/v1/search', '/v1/photos/123', '/image.jpg'],
    );

    const manual = await fetch(`${server.origin}/api${base}/recipes/${recipe.id}/image`, {
      method: 'PUT',
      headers: { Cookie: member.cookie, 'X-CSRF-Token': member.csrf, 'Content-Type': 'image/jpeg' },
      body: await fixture(),
    });
    assert.equal(manual.status, 200);
    const afterManual = await (await api(member, `${base}/recipes/${recipe.id}`)).json();
    assert.equal(afterManual.imageCredit, null);
  } finally {
    server.config.photoLibrary = previous;
    await provider.close();
  }
});

test('AC-20: bad source URLs and provider outage cannot replace a recipe photo', async () => {
  const provider = await localProvider();
  const previous = server.config.photoLibrary;
  server.config.photoLibrary = {
    apiKey: 'test-key',
    apiOrigin: provider.origin,
    imageOrigin: provider.origin,
  };
  try {
    const member = await signIn(identity('Fallback member'));
    const household = await createHousehold(member);
    const recipe = await recipeFor(member, household.id);
    const base = `/households/${household.id}/recipes/${recipe.id}`;
    provider.setUnsafeSource(true);
    assert.equal(
      (await api(member, `${base}/photo-library`, { method: 'POST', body: { photoId: 123 } }))
        .status,
      503,
    );
    assert.equal(
      provider.calls.some((call) => call.path === '/image.jpg'),
      false,
    );
    provider.setUnsafeSource(false);
    provider.setImageStatus(503);
    assert.equal(
      (await api(member, `${base}/photo-library`, { method: 'POST', body: { photoId: 123 } }))
        .status,
      503,
    );
    assert.equal((await api(member, base)).status, 200);
    assert.equal((await (await api(member, base)).json()).imageId, null);
    server.config.photoLibrary = undefined;
    assert.equal(
      (await api(member, `/households/${household.id}/photo-library/search?query=soup`)).status,
      503,
    );
    const manual = await fetch(`${server.origin}/api${base}/image`, {
      method: 'PUT',
      headers: { Cookie: member.cookie, 'X-CSRF-Token': member.csrf, 'Content-Type': 'image/jpeg' },
      body: await fixture(),
    });
    assert.equal(manual.status, 200);
  } finally {
    server.config.photoLibrary = previous;
    await provider.close();
  }
});
