# API contract (base /api/v1) - source of truth for api and web agents
Auth: Authorization: Bearer <accessToken>. All routes except /auth/login, /auth/refresh, /healthz, /readyz need it.
POST /auth/login {username,password} -> {data:{accessToken,user}} + Set-Cookie refresh (httpOnly, path /api/v1/auth)
POST /auth/refresh (cookie) -> same shape, rotates cookie
POST /auth/logout ; GET /auth/me ; POST /auth/change-password
GET /orders (query: orderQuerySchema) -> {data:OrderDTO[],meta,counts}
GET /orders/:id (id = mongo id) -> {data:OrderDTO with images}
POST /orders (orderInputSchema; header Idempotency-Key optional) -> 201 {data}. 409 SLOT_CONFLICT {details:SlotConflict} unless force:true
PATCH /orders/:id (orderUpdateSchema; If-Match: version) -> {data}
PATCH /orders/:id/status {status} -> {data}  (sets deliveredAt/cancelledAt)
DELETE /orders/:id -> 204 (soft delete)
POST /orders/check-slot {scheduledAt,excludeId?} -> {data:{conflict:SlotConflict|null}}
POST /uploads (multipart field "files", up to 6) -> {data:ImageRef[]} ; GET /files/:key serves (local adapter)
GET /reports/summary?range=&from=&to=&unit= -> {data:ReportSummary}
GET /reports/export.csv?...same filters as orders list... (streamed) ; GET /reports/export.pdf
GET /healthz, GET /readyz (outside /api/v1 is fine: mount both)
Dev defaults: API :4000, web :5173, MONGO_URI mongodb://localhost:27017/orderdesk?replicaSet=rs0, first admin created from ADMIN_USERNAME/ADMIN_PASSWORD env on seed/startup.
