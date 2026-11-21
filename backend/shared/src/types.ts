import type { ORDER_STATUSES, ERROR_CODES, BALLOON_COLORS } from './constants';

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ImageRef { key: string; thumbKey: string; w: number; h: number; url?: string; thumbUrl?: string }

/** Order as returned by API (list rows omit `images`, include imageCount/coverThumb) */
export interface OrderDTO {
  id: string;
  orderNo: number;
  code: string;               // '#OD-1001' = 1000 + orderNo
  cake: string;
  addons: string[];
  balloonColor?: (typeof BALLOON_COLORS)[number] | null;
  customer: { name: string; phone: string };
  location: string;
  source: '' | 'whatsapp' | 'instagram' | 'facebook';
  scheduledAt: string;        // ISO UTC
  status: OrderStatus;
  lbs: number;
  price: number | null;
  advance: number;
  profit: number | null;
  balance: number;            // still to collect: 0 when delivered/cancelled or no price
  imageCount: number; coverThumb?: string;
  images?: ImageRef[];        // detail endpoint only
  details: string;
  deliveredAt?: string; cancelledAt?: string;
  version: number;            // for If-Match
  createdAt: string; updatedAt: string;
}

export interface ApiMeta { page: number; limit: number; total: number; pages: number }
export interface ApiList<T> { data: T[]; meta: ApiMeta; counts?: Record<'all'|'pending'|'ready'|'delivered'|'cancelled', number> }
export interface ApiOne<T> { data: T }
export interface ApiError { error: { code: ErrorCode; message: string; details?: unknown; requestId: string } }
export interface SlotConflict { orderNo: number; code: string; cake: string; customer: { name: string }; scheduledAt: string }
/** `nextFree` is the first slot (5 min steps) that is clear of every order that day, or null when the day is full. */
export interface SlotCheck { conflicts: SlotConflict[]; nextFree: string | null }

export interface Lists { flavours: string[]; locations: string[]; addons: string[] }

export interface Overview {
  todayCount: number; upcoming: number; balance: number; totalSales: number; totalProfit: number;
  upNext: OrderDTO[];
}
export interface SalesSummary {
  period: '1' | 'w' | 'm' | 'c';
  from: string; to: string;   // 'YYYY-MM-DD', both inclusive (Karachi days)
  month: string;              // 'YYYY-MM' for period=m, '' otherwise
  daily: Array<{ date: string; orders: number; sales: number; profit: number }>; // every period except today
  orders: number; sales: number; profit: number; lbs: number;
  avgPerOrder: number; avgPerLb: number; advance: number; balance: number;
  last7: Array<{ date: string; label: string; total: number }>;
  best: Array<{ name: string; count: number }>;
}

export interface AuthUser { id: string; username: string }
export interface LoginResponse { data: { accessToken: string; user: AuthUser } }
