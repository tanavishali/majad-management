import { useQuery } from '@tanstack/react-query';
import type { OrderDTO } from '@order-desk/shared';
import { api } from '../../lib/axios';

export interface UpcomingResponse { data: OrderDTO[]; meta: { minutes: number; now: string; total: number } }

export const listUpcoming = () =>
  api.get<UpcomingResponse>('/orders/next-upcoming').then((r) => r.data);

/** The next five pending orders; re-checked every 30 s, also while the tab is in the background. */
export const useUpcoming = () =>
  useQuery({ queryKey: ['upcoming'], queryFn: () => listUpcoming(), refetchInterval: 30_000, refetchIntervalInBackground: true, staleTime: 0 });
