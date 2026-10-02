import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';
import sharp from 'sharp';
import { DatabaseService, type Database } from './database.service.js';
import { HouseholdsService } from './households.service.js';
import { isUuid } from './security.js';
import type { Transaction } from 'kysely';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_EDGE = 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const WEBP_QUALITY = 78;

// Bound memory and CPU for a small shared instance; images are small after resizing.
sharp.cache(false);
sharp.concurrency(1);

const ACCEPTED = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as const;
type Format = (typeof ACCEPTED)[keyof typeof ACCEPTED];

/**
 * Identifies the real file type from its first bytes. Only these three formats ever reach the
 * decoder, so libvips' other loaders (SVG, TIFF, HEIF, PDF…) are never used on uploads.
 */
export function sniffFormat(buffer: Buffer): Format | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function acceptedFormat(contentType: string | undefined): Format {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  const format = ACCEPTED[type as keyof typeof ACCEPTED];
  if (!format) throw new UnsupportedMediaTypeException('Upload a JPEG, PNG or WebP image.');
  return format;
}

/** Reads a request body up to `limit` bytes; larger bodies get 413 without being buffered. */
export async function readLimitedBody(request: Request, limit = MAX_UPLOAD_BYTES) {
  const tooLarge = () =>
    new PayloadTooLargeException(`Images must be at most ${limit / 1024 / 1024} MB.`);
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw tooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) {
      // Keep draining (discarding) a little so the 413 can be delivered; give up on abuse.
      if (size > limit * 4) break;
      continue;
    }
    chunks.push(chunk);
  }
  if (size > limit) throw tooLarge();
  if (size === 0) throw new BadRequestException('The image is empty.');
  return Buffer.concat(chunks);
}

/**
 * Decodes an accepted image, applies its EXIF orientation, fits it within 1024 × 1024 and
 * re-encodes it as WebP. Re-encoding drops all metadata (EXIF, GPS, XMP, ICC), so location
 * data from phone photos is never stored or served.
 */
export async function normalizeImage(buffer: Buffer, declared: Format) {
  const actual = sniffFormat(buffer);
  if (actual !== declared) {
    throw new UnsupportedMediaTypeException(
      'The file content does not match a JPEG, PNG or WebP image.',
    );
  }
  try {
    const { data, info } = await sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { content: data, width: info.width, height: info.height };
  } catch {
    throw new BadRequestException('The image could not be read. It may be damaged or too large.');
  }
}

/**
 * One optional photo per household recipe. Every operation is scoped by the caller's current
 * membership; images of other households answer 404 exactly like unknown ids. Replacing or
 * removing a photo is a separate action from editing the recipe text and does not change the
 * recipe revision: the most recent photo wins.
 */
@Injectable()
export class RecipeImagesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly households: HouseholdsService,
  ) {}

  /** Cheap pre-check so non-members and archived recipes are refused before reading uploads. */
  async assertWritable(userId: string, householdId: string, recipeId: string) {
    await this.households.requireMember(userId, householdId);
    await this.lockActiveRecipe(this.database.db, householdId, recipeId);
  }

  async replace(
    userId: string,
    householdId: string,
    recipeId: string,
    image: { content: Buffer; width: number; height: number },
    credit?: {
      sourceProvider: 'pexels';
      sourceUrl: string;
      photographer: string;
      photographerUrl: string;
    },
  ) {
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      await this.lockActiveRecipe(trx, householdId, recipeId, true);
      await trx
        .deleteFrom('app.recipe_images')
        .where('household_id', '=', householdId)
        .where('recipe_id', '=', recipeId)
        .execute();
      const stored = await trx
        .insertInto('app.recipe_images')
        .values({
          household_id: householdId,
          recipe_id: recipeId,
          content: image.content,
          content_type: 'image/webp',
          width: image.width,
          height: image.height,
          created_by: userId,
          source_provider: credit?.sourceProvider ?? null,
          source_url: credit?.sourceUrl ?? null,
          photographer: credit?.photographer ?? null,
          photographer_url: credit?.photographerUrl ?? null,
        })
        .returning(['id', 'width', 'height'])
        .executeTakeFirstOrThrow();
      return {
        imageId: stored.id,
        width: stored.width,
        height: stored.height,
        byteSize: image.content.length,
      };
    });
  }

  async remove(userId: string, householdId: string, recipeId: string) {
    await this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      await this.lockActiveRecipe(trx, householdId, recipeId, true);
      const removed = await trx
        .deleteFrom('app.recipe_images')
        .where('household_id', '=', householdId)
        .where('recipe_id', '=', recipeId)
        .executeTakeFirst();
      if (removed.numDeletedRows === 0n) throw new NotFoundException('This recipe has no photo.');
    });
  }

  async read(userId: string, householdId: string, recipeId: string, imageId: string) {
    await this.households.requireMember(userId, householdId);
    if (!isUuid(recipeId) || !isUuid(imageId)) throw new NotFoundException('Image not found.');
    const image = await this.database.db
      .selectFrom('app.recipe_images')
      .select(['content', 'content_type'])
      .where('id', '=', imageId)
      .where('recipe_id', '=', recipeId)
      .where('household_id', '=', householdId)
      .executeTakeFirst();
    if (!image) throw new NotFoundException('Image not found.');
    return image;
  }

  private async lockActiveRecipe(
    executor: Transaction<Database> | DatabaseService['db'],
    householdId: string,
    recipeId: string,
    lock = false,
  ) {
    if (!isUuid(recipeId)) throw new NotFoundException('Recipe not found.');
    let query = executor
      .selectFrom('app.recipes')
      .select('archived_at')
      .where('id', '=', recipeId)
      .where('household_id', '=', householdId);
    // Serializes concurrent photo replacements for one recipe (delete + insert).
    if (lock) query = query.forNoKeyUpdate();
    const recipe = await query.executeTakeFirst();
    if (!recipe) throw new NotFoundException('Recipe not found.');
    if (recipe.archived_at) {
      throw new ConflictException('This recipe is archived. Restore it before changing its photo.');
    }
  }
}
