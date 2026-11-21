import { describe, expect, it } from 'vitest';
import type { ImageRef } from '@order-desk/shared';
import { API_BASE } from './axios';
import { fileUrl, imageUrl, thumbUrl } from './files';

describe('stored image URLs', () => {
  it('uses the configured API host for relative image URLs', () => {
    const url = '/api/v1/files/example.webp';
    const expected = /^https?:\/\//.test(API_BASE) ? new URL(url, API_BASE).toString() : url;
    expect(fileUrl(url)).toBe(expected);
  });

  it('resolves main and thumbnail images from API-provided relative URLs', () => {
    const image: ImageRef = {
      key: 'example.webp',
      thumbKey: 'example.t.webp',
      w: 800,
      h: 600,
      url: '/api/v1/files/example.webp',
      thumbUrl: '/api/v1/files/example.t.webp',
    };
    expect(imageUrl(image)).toBe(fileUrl(image.url!));
    expect(thumbUrl(image)).toBe(fileUrl(image.thumbUrl!));
  });
});
