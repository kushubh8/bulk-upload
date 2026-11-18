# Multiplier Bulk Employee Upload Service

A production-grade bulk employee upload service built with TypeScript and Node.js. Customers upload a CSV spreadsheet; the service validates it, enqueues each valid row, and calls the downstream employee service for each record—all without blocking the HTTP response.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Express App                              │
│  POST /employees/bulk-upload   GET /uploads/:id/status          │
└──────────────┬───────────────────────────┬──────────────────────┘
               │                           │
               ▼                           ▼
        UploadController           UploadController
               │                           │
               ▼                           ▼
        UploadService              UploadService.getStatus()
               │
     ┌─────────┴──────────┐
     ▼                    ▼
 CsvParser          EmployeeValidator
     │                    │
     └─────────┬──────────┘
               ▼
        InMemoryQueue
               │
               ▼ (background)
         UploadWorker
               │
       TokenBucketRateLimiter
               │
               ▼
  MockEmployeeServiceClient
  (→ real HTTP client in production)
               │
               ▼
       UploadRepository (in-memory)
       (→ database in production)
```

### Layered Architecture

| Layer | Responsibility |
|---|---|
| **Routes** | Map HTTP paths to controller methods; configure Multer |
| **Controllers** | Parse HTTP request, validate file metadata, delegate to service |
| **Services** | Orchestrate pipeline (parse → validate → enqueue); expose status query |
| **Workers** | Consume queue jobs; call downstream service; update repository |
| **Queue** | FIFO in-memory queue with configurable concurrency |
| **Rate Limiter** | Token-bucket algorithm to control downstream call rate |
| **Clients** | Downstream employee service abstraction (mock or real) |
| **Repositories** | Upload state storage (in-memory or database-backed) |
| **Validators** | Per-row field validation with structured error collection |

---

## Architecture Decisions

### In-Memory Queue (vs. Bull/BullMQ + Redis)

| Concern | In-Memory Queue | Bull/BullMQ + Redis |
|---|---|---|
| Infrastructure | None required | Redis instance required |
| Durability | Jobs lost on process restart | Persisted in Redis |
| Multi-process | Not supported | Multiple workers supported |
| Test complexity | No external deps in tests | Requires mock or real Redis |
| Horizontal scale | Single process only | Native with worker pools |

**Decision**: The in-memory queue is used to avoid infrastructure dependencies during development and testing. The `InMemoryQueue` interface mirrors Bull's minimal API surface (`process`, `add`, `drain`), so replacing it with a Redis-backed implementation only touches the queue module and the DI wiring in `src/index.ts`. This is explicitly called out in the queue's JSDoc.

### Token Bucket Rate Limiter (vs. Fixed Window)

The token-bucket algorithm was chosen because:
- Fixed windows can allow 2× the configured rate at window boundaries (the "thundering herd" at boundary transitions).
- Token bucket naturally handles bursts up to `capacity` while enforcing a steady average rate.
- Both `capacity` (burst tolerance) and `refillRate` (sustained throughput) are independently configurable.

### Mock Employee Service Client

The `MockEmployeeServiceClient` implements the `IEmployeeServiceClient` interface. In production, replace it with an HTTP client (axios, got, fetch) targeting the real endpoint—no other code changes required.

---

## Project Structure

```
src/
  config/           Environment variable loading and typed config object
  routes/           Express routers (upload + status)
  controllers/      HTTP request/response handling
  services/         Upload orchestration and CSV pipeline
  workers/          Queue job handler (rate-limit → call service → update repo)
  repositories/     Upload record storage
  queue/            InMemoryQueue + TokenBucketRateLimiter
  clients/          Mocked employee service client
  validators/       Per-row field validation
  types/            Shared TypeScript interfaces
  utils/            Logger, custom error classes
tests/
  unit/             Validator, CSV parser, rate limiter, mock client, queue
  integration/      HTTP endpoint tests (upload + status)
  e2e/              Full pipeline test with mixed results
  helpers/          Test app factory
```

---

## Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | `development` / `production` |
| `RATE_LIMIT_TOKENS` | `10` | Token bucket capacity (burst) |
| `RATE_LIMIT_REFILL_RATE` | `5` | Tokens refilled per second |
| `MAX_CONCURRENCY` | `3` | Max parallel downstream calls |
| `MAX_FILE_SIZE_BYTES` | `10485760` | Max upload size (10 MB) |
| `MOCK_FAILURE_RATE` | `0.1` | Downstream failure probability (0–1) |
| `MOCK_LATENCY_MS` | `50` | Simulated downstream latency (ms) |
| `LOG_LEVEL` | `info` | Pino log level |

---

## Running Locally

```bash
# Development (auto-reload)
npm run dev

# Production build
npm run build
npm start
```

---

## Running Tests

```bash
npm test
```

Tests run with Jest in `--runInBand` mode to avoid port conflicts. No external infrastructure (Redis, databases) is required.

---

## API Reference

### POST /employees/bulk-upload

Upload a CSV file containing employee records. The request returns immediately with a tracking ID; processing happens in the background.

**Request**

```
POST /employees/bulk-upload
Content-Type: multipart/form-data

file: <CSV file>
```

**CSV Format**

Required columns (in any order):

| Column | Description |
|---|---|
| `firstName` | Employee first name |
| `lastName` | Employee last name |
| `email` | Valid email address |
| `startDate` | ISO 8601 date (e.g. `2024-01-15`) |
| `country` | ISO 3166-1 alpha-2 country code (e.g. `US`) |
| `customerId` | Customer identifier |

**Example CSV**

```csv
firstName,lastName,email,startDate,country,customerId
Alice,Smith,alice@example.com,2024-01-15,US,cust_123
Bob,Jones,bob@jones.co.uk,2024-02-20,GB,cust_456
```

**Response – 202 Accepted**

```json
{
  "uploadId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Upload accepted and is being processed"
}
```

**Error Responses**

| Status | Condition |
|---|---|
| 400 | No file attached |
| 413 | File exceeds size limit |
| 415 | Unsupported file type |
| 500 | Internal server error |

---

### GET /uploads/{uploadId}/status

Poll for the processing status of a previously submitted upload.

**Request**

```
GET /uploads/550e8400-e29b-41d4-a716-446655440000/status
```

**Response – 200 OK**

```json
{
  "uploadId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "total": 100,
  "successful": 87,
  "failed": 8,
  "invalid": 5,
  "errors": [
    {
      "row": 3,
      "field": "email",
      "message": "email must be a valid email address"
    },
    {
      "row": 7,
      "field": "employee",
      "message": "Downstream service temporarily unavailable"
    }
  ]
}
```

**Status Values**

| Value | Meaning |
|---|---|
| `pending` | File received, background processing not yet started |
| `processing` | Pipeline is running (parsing, validating, or calling downstream) |
| `completed` | All valid rows have been processed (some may have failed) |
| `failed` | Pipeline itself failed (e.g. unparseable file) |

**Count Definitions**

| Field | Meaning |
|---|---|
| `total` | Total rows in the CSV (excluding the header) |
| `successful` | Rows where the downstream employee service accepted the record |
| `failed` | Rows that passed validation but were rejected by the downstream service |
| `invalid` | Rows that failed field validation and were never sent downstream |

**Error Response**

```json
{ "error": "Upload 550e8400... not found" }
```

---

### GET /health

```
GET /health
→ 200 { "status": "ok" }
```

---

## Extending to Production

1. **Durable queue**: replace `InMemoryQueue` with a Bull/BullMQ queue backed by Redis. Only `src/index.ts` (wiring) changes.
2. **Persistent storage**: replace `UploadRepository` with a Postgres/MySQL implementation behind the same interface.
3. **Real employee client**: implement `IEmployeeServiceClient` with an HTTP client; inject it in `src/index.ts`.
4. **Worker isolation**: move `UploadWorker` + queue consumer to a separate process; share state via the database and Redis queue.
5. **Auth**: add an authentication middleware before the upload route.
