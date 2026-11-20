import { useQuery } from '@tanstack/react-query';
import type { OrderDTO } from '@order-desk/shared';
import { NOTIFY_BEFORE_MINUTES } from '@order-desk/shared';
import { api } from '../../lib/axios';

export interface UpcomingResponse { data: OrderDTO[]; meta: { minutes: number; now: string; total: number } }

export const listUpcoming = (minutes = NOTIFY_BEFORE_MINUTES) =>
  api.get<UpcomingResponse>('/orders/upcoming', { params: { minutes } }).then((r) => r.data);

/** Pending orders due in the next 45 minutes; re-checked every 30 s, also while the tab is in the background. */
export const useUpcoming = () =>
  useQuery({ queryKey: ['upcoming'], queryFn: () => listUpcoming(), refetchInterval: 30_000, refetchIntervalInBackground: true, staleTime: 0 });
