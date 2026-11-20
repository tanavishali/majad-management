import { MAX_IMAGE_BYTES } from '@order-desk/shared';

/** Downscale to max 1600px and re-encode as JPEG so uploads stay well under the 5MB limit. */
export async function compressImage(file: File, max = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(`Could not read ${file.name}.`));
      i.src = url;
    });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', quality));
    if (!blob) throw new Error(`Could not process ${file.name}.`);
    if (blob.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is too large (max 5 MB).`);
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
