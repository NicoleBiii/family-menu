import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiBody,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { APP_CONFIG, type AppConfig } from './config.js';
import { CurrentSession, SessionGuard } from './auth.guard.js';
import type { AuthenticatedSession } from './auth.service.js';
import { HouseholdsService } from './households.service.js';
import {
  acceptedFormat,
  MAX_UPLOAD_BYTES,
  normalizeImage,
  RecipeImagesService,
} from './recipe-images.service.js';

interface PexelsPhoto {
  id: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: { medium: string; large: string };
}

export interface PhotoResult {
  id: number;
  previewUrl: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  sourceUrl: string;
}

function allowedUrl(value: unknown, origin: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function limitedBytes(response: Response, limit: number) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new Error('Provider response too large');
  if (!response.body) throw new Error('Empty provider response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > limit) {
      await response.body.cancel().catch(() => undefined);
      throw new Error('Provider response too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

@Injectable()
export class PhotoLibraryService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly households: HouseholdsService,
    private readonly images: RecipeImagesService,
  ) {}

  private settings() {
    if (!this.config.photoLibrary) {
      throw new ServiceUnavailableException(
        'The photo library is not configured. You can upload a photo instead.',
      );
    }
    return this.config.photoLibrary;
  }

  private photo(value: unknown): { result: PhotoResult; largeUrl: string } | null {
    const settings = this.settings();
    if (!value || typeof value !== 'object') return null;
    const p = value as Partial<PexelsPhoto>;
    if (
      !Number.isSafeInteger(p.id) ||
      !p.id ||
      p.id < 1 ||
      typeof p.photographer !== 'string' ||
      !p.photographer.trim() ||
      p.photographer.length > 200 ||
      !allowedUrl(p.url, 'https://www.pexels.com') ||
      !allowedUrl(p.photographer_url, 'https://www.pexels.com') ||
      !allowedUrl(p.src?.medium, settings.imageOrigin) ||
      !allowedUrl(p.src?.large, settings.imageOrigin)
    )
      return null;
    return {
      result: {
        id: p.id,
        previewUrl: p.src.medium,
        alt: typeof p.alt === 'string' ? p.alt.slice(0, 250) : '',
        photographer: p.photographer.trim(),
        photographerUrl: p.photographer_url,
        sourceUrl: p.url,
      },
      largeUrl: p.src.large,
    };
  }

  private async providerJson(path: string) {
    const settings = this.settings();
    try {
      const response = await fetch(`${settings.apiOrigin}${path}`, {
        headers: { Authorization: settings.apiKey, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      return JSON.parse((await limitedBytes(response, 1_000_000)).toString('utf8')) as unknown;
    } catch {
      throw new ServiceUnavailableException(
        'The photo library is unavailable. You can upload a photo instead.',
      );
    }
  }

  async search(userId: string, householdId: string, rawQuery: unknown, rawPage: unknown) {
    await this.households.requireMember(userId, householdId);
    if (typeof rawQuery !== 'string' || rawQuery.trim().length < 2 || rawQuery.trim().length > 80) {
      throw new BadRequestException('Search for 2 to 80 characters.');
    }
    const page = rawPage === undefined ? 1 : Number(rawPage);
    if (!Number.isInteger(page) || page < 1 || page > 10) {
      throw new BadRequestException('Page must be between 1 and 10.');
    }
    const params = new URLSearchParams({
      query: rawQuery.trim(),
      per_page: '12',
      page: String(page),
    });
    const data = await this.providerJson(`/v1/search?${params}`);
    if (
      !data ||
      typeof data !== 'object' ||
      !Array.isArray((data as { photos?: unknown }).photos)
    ) {
      throw new ServiceUnavailableException('The photo library returned an invalid response.');
    }
    const photos = (data as { photos: unknown[] }).photos
      .map((photo) => this.photo(photo)?.result)
      .filter((photo): photo is PhotoResult => Boolean(photo));
    return { photos, page, hasMore: Boolean((data as { next_page?: unknown }).next_page) };
  }

  async import(userId: string, householdId: string, recipeId: string, rawPhotoId: unknown) {
    await this.images.assertWritable(userId, householdId, recipeId);
    const photoId = Number(rawPhotoId);
    if (!Number.isSafeInteger(photoId) || photoId < 1) {
      throw new BadRequestException('Choose a valid photo.');
    }
    const data = await this.providerJson(`/v1/photos/${photoId}`);
    const photo = this.photo(data);
    if (!photo || photo.result.id !== photoId) {
      throw new ServiceUnavailableException(
        'The selected photo is unavailable. You can upload one instead.',
      );
    }
    let image: Awaited<ReturnType<typeof normalizeImage>>;
    try {
      const response = await fetch(photo.largeUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
      const format = acceptedFormat(response.headers.get('content-type') ?? undefined);
      const bytes = await limitedBytes(response, MAX_UPLOAD_BYTES);
      image = await normalizeImage(bytes, format);
      if (image.content.length > 1_048_576) throw new Error('Normalized image too large');
    } catch {
      throw new ServiceUnavailableException(
        'The selected photo could not be imported. You can upload one instead.',
      );
    }
    return this.images.replace(userId, householdId, recipeId, image, {
      sourceProvider: 'pexels',
      sourceUrl: photo.result.sourceUrl,
      photographer: photo.result.photographer,
      photographerUrl: photo.result.photographerUrl,
    });
  }
}

@ApiTags('Photo library')
@ApiCookieAuth()
@ApiNotFoundResponse({ description: 'Household or recipe not found, or caller is not a member.' })
@UseGuards(SessionGuard)
@Controller('households/:householdId')
export class PhotoLibraryController {
  constructor(private readonly library: PhotoLibraryService) {}

  @Get('photo-library/search')
  @ApiOkResponse({ description: 'Pexels previews with photographer and source attribution.' })
  @ApiServiceUnavailableResponse({ description: 'Library key absent or provider unavailable.' })
  search(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') householdId: string,
    @Query('query') query: unknown,
    @Query('page') page: unknown,
  ) {
    return this.library.search(session.userId, householdId, query, page);
  }

  @Post('recipes/:recipeId/photo-library')
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photoId'],
      properties: { photoId: { type: 'integer', minimum: 1 } },
    },
  })
  @ApiOkResponse({
    description: 'Chosen Pexels photo normalized and stored privately with credit.',
  })
  @ApiServiceUnavailableResponse({ description: 'Library or selected image unavailable.' })
  import(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') householdId: string,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    return this.library.import(
      session.userId,
      householdId,
      recipeId,
      (body as { photoId?: unknown } | null)?.photoId,
    );
  }
}
