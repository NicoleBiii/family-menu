const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const MAX_EDGE = 1600;

export class ImageError extends Error {
  constructor(
    readonly code: 'tooLarge' | 'unreadable' | 'unsupported',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Shrinks a chosen photo in the browser before upload. Decoding through the browser also
 * handles formats the server does not accept (such as HEIC on iPhones), applies the photo's
 * orientation, and drops its metadata. The server still validates and re-encodes the result.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES)
    throw new ImageError('tooLarge', 'This photo is too large. Choose one under 30 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError(
      'unreadable',
      'This file could not be read as an image. Try a JPEG or PNG photo.',
    );
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context)
    throw new ImageError('unsupported', 'This browser cannot prepare photos for upload.');
  context.fillStyle = '#ffffff'; // JPEG has no transparency
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.88),
  );
  if (!blob) throw new ImageError('unsupported', 'This browser cannot prepare photos for upload.');
  return blob;
}
