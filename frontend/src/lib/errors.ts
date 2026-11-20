import { isAxiosError } from 'axios';
import type { ApiError, ErrorCode } from '@order-desk/shared';

export interface AppApiError {
  status?: number;
  code?: ErrorCode | string;
  message: string;
  details?: unknown;
  retryAfter?: number;
  network: boolean;
}

export function apiError(e: unknown): AppApiError {
  if (isAxiosError(e)) {
    if (!e.response) return { message: 'Cannot reach the server. Check your connection and try again.', network: true };
    const body = e.response.data as Partial<ApiError> | undefined;
    const details = body?.error?.details as Record<string, unknown> | undefined;
    const hdr = Number(e.response.headers?.['retry-after']);
    const det = Number(details?.retryAfterSeconds ?? details?.retryAfter);
    return {
      status: e.response.status,
      code: body?.error?.code,
      message: body?.error?.message ?? 'Something went wrong. Please try again.',
      details: body?.error?.details,
      retryAfter: Number.isFinite(det) && det > 0 ? det : Number.isFinite(hdr) && hdr > 0 ? hdr : undefined,
      network: false,
    };
  }
  return { message: e instanceof Error ? e.message : 'Something went wrong.', network: false };
}
