# Nexi Checkout – NestJS Payment Backend

A backend-only integration with **Nexi Checkout** (formerly Nets Easy) built with NestJS, Prisma and SQLite.
It runs against the Nexi **test environment** only, so no real money is involved.

The project covers the full payment cycle:

```
create order → create payment at Nexi → redirect customer to the hosted payment page
→ receive the result (return URL + webhook) → verify with Nexi → update the order
```

## Tech stack

- NestJS (TypeScript)
- Prisma 6 + SQLite
- `@nestjs/axios` for calls to the Nexi API
- `class-validator` / `class-transformer` for request validation
- `@nestjs/swagger` for API docs
- ngrok to expose the local webhook endpoint

## Features

- Create orders (the server calculates the total, the client never sends `amount`)
- Create a Nexi payment and return the hosted payment page URL
- Verify payments directly with Nexi (the return URL alone is never trusted)
- Webhook endpoint protected by an authorization token
- Webhook idempotency (the same notification is never processed twice)
- Separate `Transaction` table that records every payment attempt, including the `chargeId`
- Full refund of a paid order

## Order statuses

| Status | Meaning |
|---|---|
| `PENDING` | Order created, payment not completed |
| `PAID` | Nexi confirmed the charge |
| `REFUNDED` | The charge was refunded through Nexi |
| `FAILED` | Defined in the schema (see *Known limitations*) |

## Getting started

### 1. Prerequisites

- Node.js 20+ and npm
- A Nexi Checkout **test** account: register at the Nexi portal, then go to **Integration → Company** and copy the **Test Secret Key**
- [ngrok](https://ngrok.com) (free account) for the webhook

### 2. Install

```bash
git clone https://github.com/MOhamadOmarHajALi/nexi-checkout.git
cd nexi-checkout
npm install
```

### 3. Environment variables

Copy the example file and fill in your values:

```bash
cp example.env .env
```

| Variable | Description |
|---|---|
| `PORT` | Server port (default `3000`) |
| `DATABASE_URL` | SQLite file, e.g. `file:./dev.db` |
| `NEXI_BASE_URL` | `https://test.api.dibspayment.eu` |
| `NEXI_SECRET_KEY` | Your Nexi **test** secret key (never commit it) |
| `WEBHOOK_TOKEN` | Any secret string. It is sent to Nexi when a payment is created and must come back in the webhook `Authorization` header |
| `APP_BASE_URL` | `http://localhost:3000` (used to build the return URL) |
| `WEBHOOK_BASE_URL` | Your public ngrok HTTPS URL (used to build the webhook URL) |

> `.env` is git-ignored. Never commit real keys.

### 4. Database

```bash
npx prisma migrate dev
```

This creates the SQLite database and generates the Prisma client.

### 5. Expose the webhook with ngrok

In a second terminal:

```bash
ngrok http 3000
```

Copy the `https://....ngrok-free.dev` URL into `WEBHOOK_BASE_URL` in `.env`, then restart the server.

> The webhook URL is registered with Nexi **when the payment is created**. If you change `WEBHOOK_BASE_URL` or `WEBHOOK_TOKEN`, create a new order and a new payment.

### 6. Run

```bash
npm run start:dev
```

- API: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/orders` | Create an order (`PENDING`) |
| `GET` | `/orders/:id` | Get an order and its status |
| `POST` | `/payments/checkout/:orderId` | Create a payment at Nexi, store `paymentId`, return `hostedPaymentPageUrl` |
| `GET` | `/payments/return?paymentid=...` | Return page after payment. Verifies the payment with Nexi and updates the order |
| `POST` | `/payments/webhook` | Receives `payment.checkout.completed` from Nexi, checks the token, verifies with Nexi, updates the order |
| `POST` | `/payments/refund/:orderId` | Full refund of a `PAID` order |

### Create an order

```http
POST /orders
Content-Type: application/json

{
  "items": [
    { "reference": "p-1", "name": "Shawarma", "quantity": 2, "unitPrice": 5000 }
  ]
}
```

Amounts use the **smallest currency unit** (`5000` = 50.00 SEK). The server computes `amount` from the items, so the total always matches the sum of `grossTotalAmount` that Nexi requires.

## Testing a payment

1. `POST /orders` → note the order `id`.
2. `POST /payments/checkout/:id` → open the returned `hostedPaymentPageUrl`.
3. Pay with a Nexi test card (any future expiry date, any 3-digit CVC):

| Card | Result |
|---|---|
| `4268 2700 8737 4847` (Visa) | Success |
| `4925 0000 0000 0087` (Visa) | Payment fails |

   More cards are listed in the [Nexi test card documentation](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/test-card-processing/).

4. After a successful payment, `GET /orders/:id` returns `status: "PAID"`.
5. To refund: `POST /payments/refund/:id` → status becomes `REFUNDED`.

You can watch the webhook requests that Nexi sends in the ngrok inspector at `http://127.0.0.1:4040`.

## How it works

### Why both the return URL and the webhook?

- The **return URL** only runs if the customer comes back to your site.
- The **webhook** is sent by Nexi directly to the server, so the order is updated even if the customer closes the browser.
- Neither is trusted on its own: both call `GET /v1/payments/{paymentId}` at Nexi and check `chargedAmount` before marking the order as `PAID`.

### Webhook security and idempotency

- The `Authorization` header must equal `WEBHOOK_TOKEN`, otherwise the request is rejected with `401`.
- Each notification has a unique `id`. It is stored in the `WebhookEvent` table (primary key), so a repeated notification returns `{ received: true, duplicate: true }` and is not processed again.

### Database

- `Order`: items, amount, currency, `paymentId`, status
- `Transaction`: one row per payment attempt (`paymentId`, `chargeId`, status, trimmed Nexi response)
- `WebhookEvent`: processed webhook ids

Updates to the order and its transaction run inside a single Prisma `$transaction`, so they succeed or fail together.

## Postman

A Postman collection with all endpoints is in the `postman/` folder. Import it and set the `baseUrl` variable to `http://localhost:3000`.

## Known limitations

- Refunds are **full refunds only**.
- The `FAILED` status exists in the schema, but a failed card attempt currently leaves the order as `PENDING`, because the Nexi hosted page lets the customer retry and sends no failure webhook.
- The refund endpoint is not authenticated (acceptable for a test-environment exercise; a real system would restrict it to admins).
- The ngrok URL is for development only.

## Security notes

- Secrets live only in `.env`, which is git-ignored. `example.env` contains no real values.
- Only the minimum Nexi response (amounts and charges) is stored, not customer personal data.
