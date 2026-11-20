import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FLOW_STATUSES, type OrderDTO, type OrderStatus } from '@order-desk/shared';
import { changeStatus, deleteOrder, getOrder, listOrders, type OrderListParams } from './api';
import { invalidateOrderData } from '../../lib/queryClient';

export const useOrders = (params: OrderListParams) =>
  useQuery({ queryKey: ['orders', params], queryFn: () => listOrders(params), placeholderData: keepPreviousData });

export const useOrder = (id: string | undefined) =>
  useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id!), enabled: !!id, refetchOnMount: 'always' });

/** The "Mark ..." button cycles Pending -> Ready -> Delivered -> Pending. A cancelled order goes back to Pending. */
export function nextStatus(s: OrderStatus): OrderStatus {
  if (s === 'cancelled') return 'pending';
  return FLOW_STATUSES[(FLOW_STATUSES.indexOf(s) + 1) % FLOW_STATUSES.length];
}

export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => changeStatus(id, status),
    onSettled: () => invalidateOrderData(qc),
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteOrder(id), onSettled: () => invalidateOrderData(qc) });
}

/** Everything the card needs to render the Delivered/ready UI before the server answers. */
export const patchedStatus = (o: OrderDTO, status: OrderStatus): OrderDTO => ({
  ...o, status, balance: status === 'delivered' || status === 'cancelled' || o.price == null ? 0 : Math.max(0, o.price - o.advance),
});
