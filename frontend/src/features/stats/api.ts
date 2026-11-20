import { useQuery } from '@tanstack/react-query';
import type { ApiOne, Overview, SalesSummary } from '@order-desk/shared';
import { api } from '../../lib/axios';

export type Period = SalesSummary['period'];

export const useOverview = () =>
  useQuery({ queryKey: ['stats', 'overview'], queryFn: () => api.get<ApiOne<Overview>>('/stats/overview').then((r) => r.data.data) });

export interface SalesParams {
  period: Period;
  month?: string; // 'YYYY-MM' (period m)
  from?: string;  // 'YYYY-MM-DD' (period w: any day of the week; period c: first day)
  to?: string;    // 'YYYY-MM-DD' (period c: last day)
}

export const useSales = (p: SalesParams, enabled = true) => {
  const params = {
    period: p.period,
    month: p.period === 'm' ? p.month : undefined,
    from: p.period === 'w' || p.period === 'c' ? p.from : undefined,
    to: p.period === 'c' ? p.to : undefined,
  };
  return useQuery({
    queryKey: ['stats', 'sales', params],
    queryFn: () => api.get<ApiOne<SalesSummary>>('/stats/sales', { params }).then((r) => r.data.data),
    enabled,
  });
};
