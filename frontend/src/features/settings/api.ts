import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiOne, Lists } from '@order-desk/shared';
import { api } from '../../lib/axios';

export type ListKey = keyof Lists;

export const useLists = () =>
  useQuery({ queryKey: ['lists'], queryFn: () => api.get<ApiOne<Lists>>('/settings').then((r) => r.data.data), staleTime: 60_000 });

/** Saves the whole set of lists; the screen updates immediately and rolls back if the save fails. */
export function useSaveLists() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lists: Lists) => api.put<ApiOne<Lists>>('/settings', lists).then((r) => r.data.data),
    onMutate: async (lists) => {
      await qc.cancelQueries({ queryKey: ['lists'] });
      const prev = qc.getQueryData<Lists>(['lists']);
      qc.setQueryData(['lists'], lists);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['lists'], ctx.prev); },
    onSuccess: (saved) => qc.setQueryData(['lists'], saved),
  });
}
