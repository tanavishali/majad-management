export const TZ = 'Asia/Karachi';
/** Two cakes need at least this many minutes between them (a closer order is a clash). */
export const SLOT_GAP_MINUTES = 30;
/** Reminder window: notify when an open order is due within this many minutes. */
export const NOTIFY_BEFORE_MINUTES = 45;
export const ORDER_STATUSES = ['pending', 'ready', 'delivered', 'cancelled'] as const;
/** Statuses the shop cycles through with the "Mark ..." button. */
export const FLOW_STATUSES = ['pending', 'ready', 'delivered'] as const;
export const STATUS_FILTERS = ['all', 'pending', 'ready', 'delivered', 'cancelled'] as const;
export const RANGES = ['today', 'tomorrow', 'week', 'nextweek', 'month', 'lastmonth', 'custom'] as const;
export const SORT_FIELDS = ['scheduledAt', 'orderNo', 'price', 'profit', 'createdAt'] as const;
export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;
export const SALES_PERIODS = ['1', 'w', 'm', 'c'] as const;
export const MAX_REPORT_DAYS = 366;
export const NO_LOCATION = '__none__';
export const ORDER_SOURCES = ['whatsapp', 'instagram', 'facebook'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];
export const DEFAULT_FLAVOURS = ['Chocolate', 'Red velvet', 'Vanilla', 'Pineapple', 'Black forest', 'Biscoff'];
export const DEFAULT_LOCATIONS = ['Johar Town', 'DHA', 'Bahria Town', 'Gulberg', 'Model Town', 'Wapda Town', 'Garden Town'];
export const DEFAULT_ADDONS = ['Balloon bouquet', 'Acrylic boxes', 'Candles', 'Toppers', 'Artificial flowers'];
export const ERROR_CODES = [
  'VALIDATION_ERROR', 'BAD_ID', 'DUPLICATE', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND',
  'SLOT_CONFLICT', 'VERSION_CONFLICT', 'ACCOUNT_LOCKED', 'RATE_LIMITED', 'INTERNAL',
] as const;
