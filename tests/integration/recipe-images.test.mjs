import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';
import { api, createHousehold, identity, invite, pool, server, signIn } from './harness.mjs';

// REC-001 images (AC-12): upload validation, re-encoding without metadata, and household-scoped
// access. Fixtures are generated here; no personal photos are used.

async function fixture(format, { width = 64, height = 48, exif, orientation } = {}) {
  let image = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } },
  });
  // sharp writes orientation through withMetadata; withExif alone does not set it.
  if (orientation) image = image.withMetadata({ orientation });
  if (exif) image = image.withExif(exif);
  return image.toFormat(format).toBuffer();
}

function upload(user, path, bytes, type, { csrf = true } = {}) {
  return fetch(`${server.origin}/api${path}/image`, {
    method: 'PUT',
    headers: {
      Cookie: user.cookie,
      ...(csrf ? { 'X-CSRF-Token': user.csrf } : {}),
      ...(type ? { 'Content-Type': type } : {}),
    },
    body: bytes,
  });
}

async function recipeFor(user, householdId, name = 'Photo dish') {
  const response = await api(user, `/households/${householdId}/recipes`, {
    method: 'POST',
    body: { requestId: randomUUID(), name, servings: 2 },
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function withRecipe(name) {
  const user = await signIn(identity(name));
  const household = await createHousehold(user);
  const recipe = await recipeFor(user, household.id);
  return { user, household, recipe, path: `/households/${household.id}/recipes/${recipe.id}` };
}

test('AC-12: JPEG, PNG and WebP uploads are stored as small WebP files and served to members', async () => {
  const { user, path } = await withRecipe('Uploader');
  for (const [format, type] of [
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ]) {
    const response = await upload(user, path, await fixture(format), type);
    assert.equal(response.status, 200, `${type}: ${await response.clone().text()}`);
    const stored = await response.json();
    assert.deepEqual([stored.width, stored.height], [64, 48]);
    const detail = await (await api(user, path)).json();
    assert.equal(detail.imageId, stored.imageId);

    const served = await api(user, `${path}/image/${stored.imageId}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/webp');
    assert.match(served.headers.get('cache-control'), /private/);
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    const bytes = Buffer.from(await served.arrayBuffer());
    assert.equal((await sharp(bytes).metadata()).format, 'webp');
  }
  const listed = await (await api(user, path.replace(/\/[^/]+$/, ''))).json();
  assert.ok(listed[0].imageId, 'the menu list exposes the image id');
});

test('AC-12: location metadata is removed, orientation applied and large images downscaled', async () => {
  const { user, path } = await withRecipe('Phone photo');
  const original = await fixture('jpeg', {
    width: 3000,
    height: 2000,
    orientation: 6,
    exif: {
      IFD0: { Copyright: 'private-camera-owner' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '43/1 39/1 0/1' },
    },
  });
  const before = await sharp(original).metadata();
  assert.ok(before.exif && before.orientation === 6, 'fixture carries EXIF and orientation');
  const response = await upload(user, path, original, 'image/jpeg');
  assert.equal(response.status, 200);
  const stored = await response.json();
  // Orientation 6 rotates 90°, so the 3000 × 2000 landscape becomes portrait, then fits 1024.
  assert.deepEqual([stored.width, stored.height], [683, 1024]);
  const bytes = Buffer.from(
    await (await api(user, `${path}/image/${stored.imageId}`)).arrayBuffer(),
  );
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.ok(!bytes.includes('private-camera-owner'));
  assert.ok(stored.byteSize < 200_000, `stored ${stored.byteSize} bytes`);

  const small = await upload(
    user,
    path,
    await fixture('png', { width: 20, height: 10 }),
    'image/png',
  );
  const smallStored = await small.json();
  assert.deepEqual(
    [smallStored.width, smallStored.height],
    [20, 10],
    'small images are not enlarged',
  );
});

test('AC-12: unsupported, mislabeled, damaged, empty and oversized uploads fail and store nothing', async () => {
  const { user, recipe, path } = await withRecipe('Validator');
  const png = await fixture('png');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  const gif = await fixture('gif');
  const cases = [
    [png, undefined, 415],
    [png, 'application/octet-stream', 415],
    [svg, 'image/svg+xml', 415],
    [gif, 'image/gif', 415],
    [svg, 'image/png', 415],
    [gif, 'image/jpeg', 415],
    [png, 'image/jpeg', 415],
    [Buffer.from('not an image at all'), 'image/webp', 415],
    [Buffer.concat([png.subarray(0, 40)]), 'image/png', 400],
    [Buffer.alloc(0), 'image/png', 400],
    [Buffer.alloc(5 * 1024 * 1024 + 1, 1), 'image/png', 413],
  ];
  for (const [bytes, type, status] of cases) {
    const response = await upload(user, path, bytes, type);
    assert.equal(response.status, status, `${type} (${bytes.length} bytes)`);
  }
  // A huge pixel count in a small file (decompression bomb) is refused by the pixel limit.
  const bomb = await sharp({
    create: { width: 10000, height: 10000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  assert.ok(bomb.length < 5 * 1024 * 1024);
  assert.equal((await upload(user, path, bomb, 'image/png')).status, 400);

  assert.equal((await upload(user, path, png, 'image/png', { csrf: false })).status, 403);
  const count = await pool.query(
    'select count(*)::int as count from app.recipe_images where recipe_id=$1',
    [recipe.id],
  );
  assert.equal(count.rows[0].count, 0);
  assert.equal((await (await api(user, path)).json()).imageId, null);
});

test('replacing gives a new id and retires the old URL; removing clears the photo; archived recipes are locked', async () => {
  const { user, path } = await withRecipe('Replacer');
  const first = await (await upload(user, path, await fixture('png'), 'image/png')).json();
  const second = await (await upload(user, path, await fixture('jpeg'), 'image/jpeg')).json();
  assert.notEqual(first.imageId, second.imageId);
  assert.equal((await api(user, `${path}/image/${first.imageId}`)).status, 404);
  assert.equal((await api(user, `${path}/image/${second.imageId}`)).status, 200);

  const recipeRevision = (await (await api(user, path)).json()).revision;
  assert.equal(recipeRevision, 1, 'photo changes do not bump the text revision');

  assert.equal((await api(user, `${path}/image`, { method: 'DELETE' })).status, 204);
  assert.equal((await api(user, `${path}/image`, { method: 'DELETE' })).status, 404);
  assert.equal((await api(user, `${path}/image/${second.imageId}`)).status, 404);
  assert.equal((await (await api(user, path)).json()).imageId, null);

  const again = await (await upload(user, path, await fixture('png'), 'image/png')).json();
  await api(user, `${path}/archive`, { method: 'POST', body: { expectedRevision: 1 } });
  assert.equal((await upload(user, path, await fixture('png'), 'image/png')).status, 409);
  assert.equal((await api(user, `${path}/image`, { method: 'DELETE' })).status, 409);
  assert.equal(
    (await api(user, `${path}/image/${again.imageId}`)).status,
    200,
    'archived recipes keep their photo',
  );
});

test('AC-12 / AC-02: household A cannot read, replace or remove household B photos, even with valid ids', async () => {
  const alice = await signIn(identity('Alice'));
  const bob = await signIn(identity('Bob'));
  const householdA = await createHousehold(alice, 'A');
  const householdB = await createHousehold(bob, 'B');
  const recipeA = await recipeFor(alice, householdA.id);
  const recipeB = await recipeFor(bob, householdB.id, 'Secret B dish');
  const pathB = `/households/${householdB.id}/recipes/${recipeB.id}`;
  const imageB = await (await upload(bob, pathB, await fixture('png'), 'image/png')).json();
  const pathA = `/households/${householdA.id}/recipes/${recipeA.id}`;
  const imageA = await (await upload(alice, pathA, await fixture('png'), 'image/png')).json();

  const reads = [
    `${pathB}/image/${imageB.imageId}`,
    `/households/${householdA.id}/recipes/${recipeB.id}/image/${imageB.imageId}`,
    `${pathA}/image/${imageB.imageId}`,
    `/households/${householdB.id}/recipes/${recipeB.id}/image/not-a-uuid`,
  ];
  for (const path of reads) {
    const response = await api(alice, path);
    assert.equal(response.status, 404, path);
    assert.match(response.headers.get('content-type'), /json/);
  }
  assert.equal((await upload(alice, pathB, await fixture('png'), 'image/png')).status, 404);
  assert.equal(
    (
      await upload(
        alice,
        `/households/${householdA.id}/recipes/${recipeB.id}`,
        await fixture('png'),
        'image/png',
      )
    ).status,
    404,
  );
  assert.equal((await api(alice, `${pathB}/image`, { method: 'DELETE' })).status, 404);
  assert.equal(
    (await fetch(`${server.origin}/api${pathB}/image/${imageB.imageId}`)).status,
    401,
    'signed-out requests are refused',
  );
  const stillB = await api(bob, `${pathB}/image/${imageB.imageId}`);
  assert.equal(stillB.status, 200);
  assert.equal((await api(alice, `${pathA}/image/${imageA.imageId}`)).status, 200);
});

test('removed members lose access to household photos', async () => {
  const owner = await signIn(identity('Owner'));
  const household = await createHousehold(owner);
  const member = await signIn(identity('Member'));
  const link = await invite(owner, household.id);
  await api(member, '/invitations/accept', { method: 'POST', body: { token: link.token } });
  const recipe = await recipeFor(owner, household.id);
  const path = `/households/${household.id}/recipes/${recipe.id}`;
  const image = await (await upload(member, path, await fixture('png'), 'image/png')).json();
  assert.equal((await api(member, `${path}/image/${image.imageId}`)).status, 200);

  await api(owner, `/households/${household.id}/members/${member.id}`, { method: 'DELETE' });
  assert.equal((await api(member, `${path}/image/${image.imageId}`)).status, 404);
  assert.equal((await upload(member, path, await fixture('png'), 'image/png')).status, 404);
  assert.equal((await api(owner, `${path}/image/${image.imageId}`)).status, 200);
});
