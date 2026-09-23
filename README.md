# NearBuy: hyper-local multi-vendor marketplace

A marketplace for neighbourhood shops. Customers find shops by distance, fill one cart from several shops and get a separate order (and delivery fee) from each; shop owners run their store from a live dashboard. Set in the neighbourhoods of Bhubaneswar.

**Stack:** React 19 + Vite, Node.js serverless functions on Vercel, MongoDB Atlas, JWT sessions in HttpOnly cookies, bcrypt. The shop "map" is a hand-written SVG radar, so no map keys or tiles are needed.

> Payment is cash on delivery only and no real deliveries happen. The database comes pre-filled with 12 demo shops and their products.

## Customers
- **Discover** shops by distance from a chosen area (or your browser's location), with a radius slider, category chips, search across shop names and items, open-now and "delivers to me" filters, and sorting by distance, rating or delivery fee
- A **radar view** of shops around you with distance rings; grey dots are closed or out of range
- **One cart, many shops**: checkout creates one order per shop, each with its own delivery fee
- **Live order tracking** (placed, accepted, preparing, on the way, delivered) and cancellation until the shop accepts
- **Ratings and reviews** after delivery

## Shop owners
- Shop profile with area, **delivery radius**, delivery fee, minimum order and opening hours (including hours that run past midnight)
- A **live order queue** with accept, reject, preparing, out for delivery and delivered, plus an open/closed switch
- Product management with inline stock editing
- **Sales dashboard**: today's sales, earnings after an 8% platform commission, 7-day chart, top products and low-stock alerts

## Rules the server enforces at checkout
Every rule is checked for every shop **before** any stock is touched:
- the shop must be open (switch on and inside its opening hours, evaluated in Indian Standard Time)
- the customer must be inside the shop's delivery radius (great-circle distance, haversine)
- the subtotal must meet the shop's minimum order
- each item must be available and in stock

Then stock is reserved item by item with an atomic conditional update (`stock >= qty`). If any item runs out, everything reserved so far is put back. Cancelling or rejecting an order restores its stock. Order status changes are compare-and-set, so a customer cancelling and a shop accepting at the same moment cannot both win. The tests run five simultaneous buyers at two remaining units and check exactly two succeed.

## API
One serverless function (`api/index.js`, reached through a `vercel.json` rewrite) routes every request.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/signup` (role `customer` or `vendor`), `/auth/login`, `/auth/logout`, `GET /auth/me` |
| Discovery | `GET /areas`, `GET /shops?lat&lng&radius&category&q&open&deliverable&sort`, `GET /shops/:id` |
| Shop owner | `GET/PUT /shop`, `GET/POST /shop/products`, `PATCH/DELETE /shop/products/:id`, `GET /vendor/stats` |
| Orders | `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/status`, `POST /orders/:id/review` |

## Run it locally
```bash
npm install
npm run build
```
The API needs a `MONGODB_URI` environment variable and Vercel's function runtime, so run `vercel dev` (or deploy to Vercel and add `MONGODB_URI`). Data goes to the `local_marketplace` database.

This is a public demo database: please do not enter real addresses or personal details.
