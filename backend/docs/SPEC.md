# Order Desk - Build Spec (from the approved plan)

Reference (old single-file app, all current behaviour): docs/reference/order-desk-v20.html
Monorepo: npm workspaces. Root: D:\activiti. Node 20+, TypeScript everywhere.

## Stack
- API: Node 20, Express, Mongoose 8, TypeScript, pino logging, Zod validation (schemas in shared)
- DB: MongoDB 7 replica set (docker-compose.yml). Tests use mongodb-memory-server.
- Auth: JWT access token (15 min, kept in memory on web) + httpOnly refresh cookie with rotation; refresh tokens stored hashed in `sessions` collection (TTL index on expiresAt). Password argon2 or bcrypt cost 12. Login rate limit + account-level lockout in DB.
- Images: multer + sharp, storage adapter (local, s3 stub). Store only file keys. Max 5MB, 6 photos, type whitelist, resize to webp, 400px thumbnail.
- Web: React 18, Vite, Tailwind (green accent #0B7A68, small radius, Poppins, dark: class), TanStack Query, React Hook Form + zod resolver, React Router, axios.
- Tests: Vitest, supertest, mongodb-memory-server.

## Folder structure
package.json, docker-compose.yml, docs/, shared/src (zod schemas, types, constants - ALREADY CREATED, treat as the contract; extend only by adding)
backend/src: config/(env.ts zod-validated, db.ts), modules/{auth,orders(model,routes,controller,service,repository,filter.ts,slot.ts),reports(aggregation,csv,pdf),uploads(storage adapter)}, middlewares/(auth,validate,errorHandler,rateLimit,requestId), utils/(AppError,time Asia/Karachi,response), app.ts, server.ts
frontend/src: app/(router,providers,ErrorBoundary), features/{auth,orders,dashboard}, features/orders/{api,hooks,components,pages}, components/ui/(Button,Modal,DataTable,Badge,Skeleton), lib/(axios,queryClient,format)

## Backend layers
route -> validate(zod) -> controller (thin) -> service (rules: 45 min gap, status change, profit=price-cost) -> repository (ALL mongo queries) -> model

## Order document
orderNo (atomic $inc from counters collection), customer{name,phone,address} embedded, source, scheduledAt (ONE Date, UTC; display in Asia/Karachi), status(pending|delivered|cancelled), price/cost integer rupees, profit (set in service), images[{key,thumbKey,w,h}], imageCount, coverThumb (denormalized), notes, deliveredAt, cancelledAt, isDeleted (soft delete), version (optimistic concurrency), createdAt, updatedAt.

## Indexes (all orders indexes use partialFilterExpression {isDeleted:false}; autoIndex false in production, index script/migration provided)
{orderNo:1} unique; {status:1,scheduledAt:-1}; {source:1,status:1,scheduledAt:-1}; {scheduledAt:-1}; {"customer.phone":1}; text index (customer.name, customer.address, notes); sessions {expiresAt:1} TTL.

## Filters: GET /api/v1/orders?status=&source=&range=&from=&to=&q=&sort=-scheduledAt&page=1&limit=8
- range presets (today,tomorrow,week,nextweek,month,lastmonth,custom) resolved on SERVER in Asia/Karachi, half-open [from,to). Week starts Monday.
- buildOrderFilter(q, now) is a PURE function (own unit tests):
  and=[{isDeleted:false}]; source; status 'pending' -> {status:'pending',scheduledAt:{$gte:now}}; 'overdue' -> {status:'pending',scheduledAt:{$lt:now}}; 'all' none; else {status}; range -> scheduledAt $gte/$lt; q -> searchClause.
- sort whitelist (shared SORT_FIELDS), limit max 50.
- list: .select() + .lean(), no images array. Rows+count via Promise.all. Detail endpoint returns full images.
- chips counts: ONE aggregation ($match all filters except status, $group by status; overdue split by scheduledAt<now). Counts must equal table totals.
- search: pure digits that look like order number (or "#OD-1001") -> exact orderNo; phone-like -> anchored prefix regex on customer.phone (^0300, uses index); else text index. NEVER unanchored regex.
- 45 minute check: findOne({isDeleted:false,status:{$ne:'cancelled'},scheduledAt:{$gt:t-45m,$lt:t+45m},_id:{$ne:excludeId}}).select('orderNo customer scheduledAt').lean(). Conflict -> 409 SLOT_CONFLICT with conflicting order details; client resends with force:true. POST /orders/check-slot for live form warning.
- Dashboard: one aggregation with $facet {totals, buckets ($dateTrunc, timezone Asia/Karachi, startOfWeek monday), bySource}. Counted = not cancelled (check old HTML `counted()` for the exact rule and replicate it). Small cache invalidated on order writes.

## Response format
Success {data, meta:{page,limit,total,pages}} (+counts for list). Error {error:{code,message,details,requestId}}.
Zod fail 422 VALIDATION_ERROR (details per field); CastError 400 BAD_ID; duplicate key 409 DUPLICATE; bad/expired JWT 401 UNAUTHORIZED; slot 409 SLOT_CONFLICT; version mismatch 412/409 VERSION_CONFLICT; else 500 (no stack in production).
requestId per request (pino). unhandledRejection + SIGTERM graceful shutdown. /healthz, /readyz (DB ping).
POST create supports Idempotency-Key header (stored, TTL). PATCH/PUT supports If-Match: <version>.

## Security
helmet, CORS only web origin, body size limit, express-mongo-sanitize, Zod .strict(), rate limits, upload whitelist.

## Web architecture
Query key ['orders', filters]; keepPreviousData; prefetch next page. Filters live in URL (useSearchParams), search debounce 300ms. Status change = optimistic with rollback; other mutations invalidateQueries. React.memo rows/cards, useCallback, React.lazy per route (Dashboard own chunk), Suspense + skeletons. ErrorBoundary per route + toast on mutation error. Forms RHF + shared zod; photo preview + client compress. axios interceptor attaches token; on 401 single-flight refresh. ProtectedRoute. Components: FilterBar, DataTable, OrderCard(grid), StatusBadge, Pagination, Modal, EmptyState. List and Grid views, day strip, gallery + lightbox, detail dialog, dashboard, print/PDF + CSV, demo seed - match the old HTML feature-for-feature and look.

## Old HTML -> new app
localStorage orders -> API; login+lockout -> auth module; 45 min gap -> slot.ts+check-slot+409; date dropdown -> server range presets; chips/search/source/sort -> buildOrderFilter + chips aggregation; list/grid -> frontend view (URL); gallery -> images+thumbs; dashboard -> reports/summary; PDF/CSV -> reports/export.pdf (pdfkit) + .csv (stream); demo data -> npm run seed (development only).

## Phases
1 scaffold (workspaces, compose, env validation, health) 2 auth + orders CRUD + indexes + errorHandler + slot 3 filters + list UI 4 images 5 dashboard + reports 6 hardening (tests, explain checks, rate limits, deployment).
