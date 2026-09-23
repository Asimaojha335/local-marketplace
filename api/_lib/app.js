const crypto = require("crypto");
const { ObjectId } = require("mongodb");
const { createApp, bad, forbidden, notFound, conflict, oid, clean, str, num, oneOf, created } = require("./http");
const { addAuthRoutes } = require("./authRoutes");
const G = require("./geo");

const DAY = 86400000;
const COMMISSION = 0.08;
const CATEGORIES = ["grocery", "food", "bakery", "pharmacy", "fashion", "electronics"];
const FLOW = { placed: ["accepted", "rejected"], accepted: ["preparing"], preparing: ["out_for_delivery"], out_for_delivery: ["delivered"] };
const asId = (v) => new ObjectId(String(v));
const paise = (rupees) => Math.round(Number(rupees) * 100);

const app = createApp({
  app: "local-marketplace",
  dbName: "local_marketplace",
  setup: async (db) => {
    await db.collection("shops").createIndex({ ownerId: 1 }, { unique: true });
    await db.collection("products").createIndex({ shopId: 1 });
    await db.collection("orders").createIndex({ customerId: 1, createdAt: -1 });
    await db.collection("orders").createIndex({ shopId: 1, createdAt: -1 });
    await db.collection("reviews").createIndex({ orderId: 1 }, { unique: true });
    await seed(db);
  },
});
addAuthRoutes(app, { roles: ["customer", "vendor"], extra: (b) => ({ role: b.role === "vendor" ? "vendor" : "customer" }) });

const need = (user, role) => {
  if (user.role !== role) throw forbidden(role === "vendor" ? "Only shop owners can do that." : "Only customers can do that.");
};

/* ---------- demo shops shared by every visitor ---------- */
async function seed(db) {
  if (await db.collection("meta").findOne({ _id: "seeded" })) return;
  await db.collection("meta").updateOne({ _id: "seeded" }, { $set: { at: new Date() } }, { upsert: true });
  const shops = [
    ["Sahoo General Store", "grocery", "patia", "Daily groceries, fresh vegetables and household items.", 4, 30, 199, "07:00", "22:00", [["Basmati rice 1kg", 95, 40, "🍚"], ["Toor dal 1kg", 140, 30, "🫘"], ["Amul milk 500ml", 30, 60, "🥛"], ["Eggs (12)", 84, 25, "🥚"], ["Bananas 1 dozen", 60, 20, "🍌"], ["Potato 1kg", 32, 50, "🥔"]]],
    ["Odisha Fresh Mart", "grocery", "saheed-nagar", "Farm-fresh fruit and vegetables delivered in 30 minutes.", 5, 25, 149, "06:30", "21:30", [["Tomato 1kg", 40, 40, "🍅"], ["Onion 1kg", 35, 60, "🧅"], ["Apples 1kg", 180, 15, "🍎"], ["Spinach bunch", 20, 25, "🥬"], ["Coriander bunch", 15, 30, "🌿"]]],
    ["Pakhala House", "food", "jaydev-vihar", "Home-style Odia meals: pakhala, dalma and fish curry.", 6, 40, 249, "11:00", "23:00", [["Pakhala thali", 180, 20, "🍚"], ["Dalma with rice", 140, 25, "🍲"], ["Chhena poda slice", 70, 30, "🍰"], ["Fish curry meal", 260, 12, "🐟"]]],
    ["Bake & Bloom", "bakery", "nayapalli", "Fresh cakes, breads and cookies baked every morning.", 4, 30, 299, "08:00", "21:00", [["Chocolate cake 500g", 450, 8, "🎂"], ["Multigrain bread", 60, 20, "🍞"], ["Butter cookies pack", 120, 25, "🍪"], ["Croissant", 55, 20, "🥐"]]],
    ["Care Pharmacy", "pharmacy", "chandrasekharpur", "Medicines, health drinks and everyday healthcare. Open late.", 6, 0, 0, "08:00", "23:59", [["Paracetamol strip", 22, 100, "💊"], ["Hand sanitizer 200ml", 95, 40, "🧴"], ["Vitamin C tablets", 180, 30, "🍊"], ["Glucose powder 500g", 130, 25, "🥤"]]],
    ["Old Town Sweets", "bakery", "old-town", "Traditional sweets and snacks since 1974.", 5, 30, 199, "08:00", "20:30", [["Rasabali (6 pcs)", 150, 20, "🍮"], ["Gaja 250g", 120, 25, "🍬"], ["Samosa (4 pcs)", 60, 40, "🥟"]]],
    ["Khandagiri Kirana", "grocery", "khandagiri", "Your neighbourhood kirana, now online.", 3, 20, 99, "07:00", "21:00", [["Atta 5kg", 245, 20, "🌾"], ["Sunflower oil 1L", 150, 20, "🫒"], ["Tea 250g", 130, 25, "🍵"], ["Biscuits pack", 30, 60, "🍪"]]],
    ["Trend Tailors", "fashion", "baramunda", "Ready-made kurtas and custom stitching.", 8, 60, 0, "10:30", "20:00", [["Cotton kurta", 799, 10, "👘"], ["Dupatta", 349, 15, "🧣"], ["Handloom saree", 1899, 5, "🥻"]]],
    ["Volt Electronics", "electronics", "rasulgarh", "Chargers, earphones and small electronics.", 7, 40, 499, "10:00", "20:30", [["USB-C cable 1m", 199, 40, "🔌"], ["Wired earphones", 349, 25, "🎧"], ["Power bank 10000mAh", 1199, 10, "🔋"]]],
    ["Kalinga Kitchen", "food", "kalinga-nagar", "Biryani, rolls and North Indian favourites.", 5, 40, 199, "12:00", "23:00", [["Chicken biryani", 240, 20, "🍛"], ["Paneer roll", 110, 25, "🌯"], ["Veg thali", 190, 20, "🍽️"]]],
    ["Nayapalli Naturals", "grocery", "nayapalli", "Organic staples, millets and cold-pressed oils.", 5, 30, 249, "09:00", "20:00", [["Ragi flour 1kg", 85, 25, "🌾"], ["Jaggery 500g", 70, 30, "🟤"], ["Cold-pressed coconut oil 500ml", 320, 15, "🥥"]]],
    ["Saheed Nagar Spice Hub", "food", "saheed-nagar", "Street-food favourites: chaat, momos and rolls.", 4, 30, 149, "15:00", "23:30", [["Veg momos (8)", 90, 30, "🥟"], ["Dahi puri", 70, 30, "🥙"], ["Masala chai", 25, 50, "☕"]]],
  ];
  for (const [name, category, areaId, description, radiusKm, deliveryFee, minOrder, openTime, closeTime, products] of shops) {
    const area = G.areaById(areaId);
    const owner = await db.collection("users").insertOne({ name: `${name} (owner)`, email: `${areaId}-${crypto.randomBytes(3).toString("hex")}@demo.nearbuy.example`, role: "vendor", demo: true, createdAt: new Date() });
    const jitter = () => (Math.random() - 0.5) * 0.012;
    const { insertedId } = await db.collection("shops").insertOne({
      ownerId: String(owner.insertedId), name, category, description, areaId, area: area.name, lat: area.lat + jitter(), lng: area.lng + jitter(), radiusKm, deliveryFee: paise(deliveryFee), minOrder: paise(minOrder),
      openTime, closeTime, isOpen: true, ratingSum: Math.round((3.9 + Math.random() * 1.0) * 30 * 10) / 10, reviews: 30, createdAt: new Date(),
    });
    await db.collection("products").insertMany(products.map(([pname, price, stock, emoji]) => ({ shopId: String(insertedId), name: pname, price: paise(price), stock, emoji, description: "", available: true, createdAt: new Date() })));
  }
}

/* ---------- views ---------- */
const rating = (s) => (s.reviews ? Math.round((s.ratingSum / s.reviews) * 10) / 10 : 0);
function shopView(s, from) {
  const km = from ? G.haversineKm(from, s) : null;
  const openNow = s.isOpen && G.isWithinHours(s.openTime, s.closeTime);
  return {
    id: String(s._id), name: s.name, category: s.category, description: s.description, area: s.area, areaId: s.areaId, lat: s.lat, lng: s.lng, radiusKm: s.radiusKm, deliveryFee: s.deliveryFee, minOrder: s.minOrder,
    openTime: s.openTime, closeTime: s.closeTime, isOpen: s.isOpen, openNow, rating: rating(s), reviews: s.reviews,
    ...(km === null ? {} : { distanceKm: Math.round(km * 10) / 10, etaMin: G.etaMinutes(km), canDeliver: km <= s.radiusKm }),
  };
}

function locationOf(q) {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

app.get("/areas", { auth: true }, async () => G.AREAS);

/* ---------- discovery (customers) ---------- */
app.get("/shops", { auth: true }, async ({ db, query }) => {
  const from = locationOf(query);
  const filter = {};
  if (query.category) filter.category = oneOf(query.category, CATEGORIES, "Category");
  let list = await db.collection("shops").find(filter).toArray();
  let views = list.map((s) => shopView(s, from));
  const q = String(query.q || "").trim().toLowerCase();
  if (q) {
    const matching = new Set((await db.collection("products").find({ name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }, available: true }).project({ shopId: 1 }).toArray()).map((p) => p.shopId));
    views = views.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || matching.has(s.id));
  }
  if (from) {
    const radius = query.radius ? num(query.radius, { min: 0.5, max: 30, label: "Radius" }) : null;
    views = views.filter((s) => (radius ? s.distanceKm <= radius : true));
  }
  if (query.deliverable === "1" && from) views = views.filter((s) => s.canDeliver);
  if (query.open === "1") views = views.filter((s) => s.openNow);
  const sort = query.sort || (from ? "distance" : "rating");
  views.sort(sort === "rating" ? (a, b) => b.rating - a.rating : sort === "fee" ? (a, b) => a.deliveryFee - b.deliveryFee : (a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  return views;
});

app.get("/shops/:id", { auth: true }, async ({ db, params, query }) => {
  const shop = await db.collection("shops").findOne({ _id: oid(params.id) });
  if (!shop) throw notFound("Shop not found.");
  const products = await db.collection("products").find({ shopId: String(shop._id), available: true }).sort({ name: 1 }).toArray();
  const reviews = await db.collection("reviews").find({ shopId: String(shop._id) }).sort({ at: -1 }).limit(8).toArray();
  return { ...shopView(shop, locationOf(query)), products: products.map(clean), recentReviews: reviews.map(clean) };
});

/* ---------- vendor: shop and products ---------- */
function shopFields(b, existing = {}) {
  const areaId = b.areaId === undefined ? existing.areaId : b.areaId;
  const area = G.areaById(areaId);
  if (!area) throw bad("Pick the area your shop is in.");
  const open = b.openTime === undefined ? existing.openTime || "09:00" : String(b.openTime);
  const close = b.closeTime === undefined ? existing.closeTime || "21:00" : String(b.closeTime);
  if (G.minutesOf(open) === null || G.minutesOf(close) === null) throw bad("Opening hours must look like 09:00.");
  return {
    name: b.name === undefined ? existing.name : str(b.name, { min: 2, max: 60, label: "Shop name" }),
    category: b.category === undefined ? existing.category : oneOf(b.category, CATEGORIES, "Category"),
    description: b.description === undefined ? existing.description || "" : str(b.description, { max: 200 }),
    areaId, area: area.name, lat: existing.areaId === areaId && existing.lat ? existing.lat : area.lat, lng: existing.areaId === areaId && existing.lng ? existing.lng : area.lng,
    radiusKm: b.radiusKm === undefined ? existing.radiusKm || 4 : num(b.radiusKm, { min: 1, max: 15, label: "Delivery radius" }),
    deliveryFee: b.deliveryFee === undefined ? existing.deliveryFee || 0 : paise(num(b.deliveryFee, { min: 0, max: 500, label: "Delivery fee" })),
    minOrder: b.minOrder === undefined ? existing.minOrder || 0 : paise(num(b.minOrder, { min: 0, max: 5000, label: "Minimum order" })),
    openTime: open, closeTime: close,
  };
}

app.get("/shop", { auth: true }, async ({ db, user }) => {
  need(user, "vendor");
  const s = await db.collection("shops").findOne({ ownerId: user.id });
  return s ? shopView(s, null) : null;
});

app.put("/shop", { auth: true }, async ({ db, user, body }) => {
  need(user, "vendor");
  const existing = await db.collection("shops").findOne({ ownerId: user.id });
  const f = shopFields(body, existing || {});
  if (!f.name) throw bad("Shop name is required.");
  if (!f.category) throw bad("Pick a category.");
  if (existing) await db.collection("shops").updateOne({ _id: existing._id }, { $set: { ...f, ...(body.isOpen === undefined ? {} : { isOpen: Boolean(body.isOpen) }) } });
  else await db.collection("shops").insertOne({ ownerId: user.id, ...f, isOpen: true, ratingSum: 0, reviews: 0, createdAt: new Date() });
  return shopView(await db.collection("shops").findOne({ ownerId: user.id }), null);
});

async function myShop(db, user) {
  need(user, "vendor");
  const s = await db.collection("shops").findOne({ ownerId: user.id });
  if (!s) throw bad("Set up your shop first.");
  return s;
}

function productFields(b, existing = {}) {
  return {
    name: b.name === undefined ? existing.name : str(b.name, { min: 2, max: 80, label: "Name" }),
    price: b.price === undefined ? existing.price : paise(num(b.price, { min: 0.5, max: 500000, label: "Price" })),
    stock: b.stock === undefined ? existing.stock : num(b.stock, { min: 0, max: 100000, int: true, label: "Stock" }),
    emoji: b.emoji === undefined ? existing.emoji || "🛍️" : str(b.emoji, { max: 4 }) || "🛍️",
    description: b.description === undefined ? existing.description || "" : str(b.description, { max: 200 }),
    available: b.available === undefined ? existing.available !== false : Boolean(b.available),
  };
}

app.get("/shop/products", { auth: true }, async ({ db, user }) => {
  const s = await myShop(db, user);
  return (await db.collection("products").find({ shopId: String(s._id) }).sort({ name: 1 }).toArray()).map(clean);
});

app.post("/shop/products", { auth: true }, async ({ db, user, body }) => {
  const s = await myShop(db, user);
  const f = productFields(body);
  if (!f.name || f.price === undefined || f.stock === undefined) throw bad("Name, price and stock are required.");
  const doc = { shopId: String(s._id), ...f, createdAt: new Date() };
  const { insertedId } = await db.collection("products").insertOne(doc);
  return created(clean({ _id: insertedId, ...doc }));
});

app.patch("/shop/products/:id", { auth: true }, async ({ db, user, params, body }) => {
  const s = await myShop(db, user);
  const p = await db.collection("products").findOne({ _id: oid(params.id), shopId: String(s._id) });
  if (!p) throw notFound("Product not found.");
  const f = productFields(body, p);
  await db.collection("products").updateOne({ _id: p._id }, { $set: f });
  return clean({ ...p, ...f });
});

app.delete("/shop/products/:id", { auth: true }, async ({ db, user, params }) => {
  const s = await myShop(db, user);
  const r = await db.collection("products").deleteOne({ _id: oid(params.id), shopId: String(s._id) });
  if (!r.deletedCount) throw notFound("Product not found.");
  return { ok: true };
});

/* ---------- checkout ---------- */
async function restock(db, items) {
  for (const it of items) await db.collection("products").updateOne({ _id: asId(it.productId) }, { $inc: { stock: it.qty } });
}

app.post("/orders", { auth: true }, async ({ db, user, body }) => {
  need(user, "customer");
  const where = locationOf(body);
  if (!where) throw bad("Choose your delivery location.");
  const address = str(body.address, { min: 8, max: 200, label: "Delivery address" });
  const wanted = new Map();
  (Array.isArray(body.items) ? body.items : []).forEach((i) => {
    const qty = num(i.qty, { min: 1, max: 50, int: true, label: "Quantity" });
    wanted.set(String(i.productId), (wanted.get(String(i.productId)) || 0) + qty);
  });
  if (!wanted.size) throw bad("Your cart is empty.");
  const products = await db.collection("products").find({ _id: { $in: [...wanted.keys()].map(oid) } }).toArray();
  if (products.length !== wanted.size) throw bad("Some items are no longer sold.");
  const byShop = new Map();
  for (const p of products) {
    if (!p.available) throw bad(`${p.name} is not available right now.`);
    byShop.set(p.shopId, [...(byShop.get(p.shopId) || []), p]);
  }
  const shops = new Map((await db.collection("shops").find({ _id: { $in: [...byShop.keys()].map(asId) } }).toArray()).map((s) => [String(s._id), s]));

  // every rule is checked for every shop before any stock is touched
  const plans = [];
  for (const [shopId, list] of byShop) {
    const shop = shops.get(shopId);
    if (!shop) throw bad("A shop in your cart no longer exists.");
    const km = G.haversineKm(where, shop);
    if (!shop.isOpen || !G.isWithinHours(shop.openTime, shop.closeTime)) throw bad(`${shop.name} is closed right now.`);
    if (km > shop.radiusKm) throw bad(`${shop.name} only delivers within ${shop.radiusKm} km, and you are ${km.toFixed(1)} km away.`);
    const items = list.map((p) => ({ productId: String(p._id), name: p.name, emoji: p.emoji, price: p.price, qty: wanted.get(String(p._id)) }));
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    if (subtotal < shop.minOrder) throw bad(`${shop.name} has a minimum order of ₹${(shop.minOrder / 100).toFixed(0)}.`);
    plans.push({ shop, items, subtotal, km });
  }

  // reserve stock atomically per item; if anything runs out, put back everything reserved so far
  const reserved = [];
  try {
    for (const plan of plans) {
      for (const it of plan.items) {
        const r = await db.collection("products").updateOne({ _id: asId(it.productId), stock: { $gte: it.qty } }, { $inc: { stock: -it.qty } });
        if (!r.modifiedCount) throw bad(`Not enough stock for ${it.name}.`);
        reserved.push(it);
      }
    }
  } catch (e) {
    await restock(db, reserved);
    throw e;
  }

  const orders = plans.map((plan) => ({
    number: `NB-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, customerId: user.id, customerName: user.name, shopId: String(plan.shop._id), shopName: plan.shop.name, items: plan.items,
    subtotal: plan.subtotal, deliveryFee: plan.shop.deliveryFee, total: plan.subtotal + plan.shop.deliveryFee, address, lat: where.lat, lng: where.lng, distanceKm: Math.round(plan.km * 10) / 10,
    etaMin: G.etaMinutes(plan.km), note: str(body.note, { max: 200 }), payment: "cash_on_delivery", status: "placed", history: [{ status: "placed", at: new Date() }], createdAt: new Date(),
  }));
  const { insertedIds } = await db.collection("orders").insertMany(orders);
  return created({ orders: orders.map((o, i) => ({ id: String(insertedIds[i]), number: o.number, shopName: o.shopName, total: o.total, etaMin: o.etaMin })), grandTotal: orders.reduce((s, o) => s + o.total, 0) });
});

/* ---------- orders ---------- */
app.get("/orders", { auth: true }, async ({ db, user, query }) => {
  let filter;
  if (user.role === "vendor") {
    const s = await db.collection("shops").findOne({ ownerId: user.id });
    if (!s) return [];
    filter = { shopId: String(s._id) };
  } else filter = { customerId: user.id };
  if (query.status) filter.status = String(query.status);
  return (await db.collection("orders").find(filter).sort({ createdAt: -1 }).limit(100).toArray()).map(clean);
});

async function loadOrder(db, id, user) {
  const o = await db.collection("orders").findOne({ _id: oid(id) });
  if (!o) throw notFound("Order not found.");
  if (o.customerId === user.id) return { o, side: "customer" };
  const shop = await db.collection("shops").findOne({ _id: asId(o.shopId) });
  if (shop && shop.ownerId === user.id) return { o, side: "vendor", shop };
  throw notFound("Order not found.");
}

app.get("/orders/:id", { auth: true }, async ({ db, user, params }) => {
  const { o } = await loadOrder(db, params.id, user);
  const review = await db.collection("reviews").findOne({ orderId: String(o._id) });
  return { ...clean(o), review: review ? clean(review) : null };
});

app.post("/orders/:id/status", { auth: true }, async ({ db, user, params, body }) => {
  const { o, side } = await loadOrder(db, params.id, user);
  const next = String(body.status || "");
  let allowed;
  if (side === "customer") allowed = o.status === "placed" ? ["cancelled"] : [];
  else allowed = FLOW[o.status] || [];
  if (!allowed.includes(next)) throw bad(side === "customer" ? "You can only cancel an order that the shop has not accepted yet." : `An order that is ${o.status.replace(/_/g, " ")} cannot move to ${next.replace(/_/g, " ")}.`);
  // compare-and-set on the current status so two clicks (or two people) cannot both apply
  const r = await db.collection("orders").updateOne({ _id: o._id, status: o.status }, { $set: { status: next }, $push: { history: { status: next, at: new Date() } } });
  if (!r.modifiedCount) throw conflict("This order was just updated. Refresh and try again.");
  if (["cancelled", "rejected"].includes(next)) await restock(db, o.items);
  return { status: next };
});

app.post("/orders/:id/review", { auth: true }, async ({ db, user, params, body }) => {
  need(user, "customer");
  const { o } = await loadOrder(db, params.id, user);
  if (o.status !== "delivered") throw bad("You can review an order after it is delivered.");
  const rate = num(body.rating, { min: 1, max: 5, int: true, label: "Rating" });
  try {
    await db.collection("reviews").insertOne({ orderId: String(o._id), shopId: o.shopId, customerName: user.name, rating: rate, comment: str(body.comment, { max: 300 }), at: new Date() });
  } catch (e) {
    if (e.code === 11000) throw conflict("You already reviewed this order.");
    throw e;
  }
  await db.collection("shops").updateOne({ _id: asId(o.shopId) }, { $inc: { ratingSum: rate, reviews: 1 } });
  return created({ ok: true });
});

/* ---------- vendor dashboard ---------- */
app.get("/vendor/stats", { auth: true }, async ({ db, user }) => {
  const shop = await myShop(db, user);
  const orders = await db.collection("orders").find({ shopId: String(shop._id) }).toArray();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const delivered = orders.filter((o) => o.status === "delivered");
  const net = (o) => Math.round(o.subtotal * (1 - COMMISSION));
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(start.getTime() - i * DAY);
    const next = new Date(d.getTime() + DAY);
    days.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: delivered.filter((o) => o.createdAt >= d && o.createdAt < next).reduce((s, o) => s + o.subtotal, 0) });
  }
  const top = new Map();
  delivered.forEach((o) => o.items.forEach((it) => { const e = top.get(it.name) || { name: it.name, qty: 0, revenue: 0 }; e.qty += it.qty; e.revenue += it.qty * it.price; top.set(it.name, e); }));
  const low = await db.collection("products").find({ shopId: String(shop._id), stock: { $lte: 5 } }).sort({ stock: 1 }).limit(6).toArray();
  return {
    pending: orders.filter((o) => o.status === "placed").length, active: orders.filter((o) => ["accepted", "preparing", "out_for_delivery"].includes(o.status)).length,
    todayOrders: orders.filter((o) => o.createdAt >= start && !["cancelled", "rejected"].includes(o.status)).length, todaySales: orders.filter((o) => o.createdAt >= start && o.status === "delivered").reduce((s, o) => s + o.subtotal, 0),
    totalDelivered: delivered.length, earnings: delivered.reduce((s, o) => s + net(o), 0), commissionRate: COMMISSION, rating: rating(shop), reviews: shop.reviews,
    series: days, topProducts: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5), lowStock: low.map((p) => ({ id: String(p._id), name: p.name, stock: p.stock })),
  };
});

module.exports = app;
