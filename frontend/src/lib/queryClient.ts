import { QueryClient, type QueryClient as QC } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

/** After any order write: refresh every order-derived view (lists, detail, dashboard/sales numbers, reminders). */
export function invalidateOrderData(qc: QC) {
  return Promise.all(['orders', 'order', 'stats', 'upcoming'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
