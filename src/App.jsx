import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  AppShell, AuthProvider, AuthScreen, Badge, BarChart, Empty, ErrorNote, Field, Loading, Modal, Stat, ToastProvider,
  ago, api, dateTimeFmt, money, useApi, useAsync, useAuth, useHashRoute, useToast,
} from "./kit.jsx";

const rs = (p) => money((p || 0) / 100);
const CATS = ["grocery", "food", "bakery", "pharmacy", "fashion", "electronics"];
const CAT_EMOJI = { grocery: "🛒", food: "🍛", bakery: "🥐", pharmacy: "💊", fashion: "👗", electronics: "🔌" };
const STEPS = ["placed", "accepted", "preparing", "out_for_delivery", "delivered"];
const STEP_LABEL = { placed: "Placed", accepted: "Accepted", preparing: "Preparing", out_for_delivery: "On the way", delivered: "Delivered", cancelled: "Cancelled", rejected: "Rejected" };

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}

function Gate() {
  const { user } = useAuth();
  if (user === undefined) return <Loading />;
  if (!user) {
    return (
      <AuthScreen
        title="NearBuy"
        tagline="Shop from stores a few minutes away."
        points={["Discover shops by distance and delivery radius", "One cart across many shops, split into separate orders", "Live order tracking", "A dashboard for shop owners"]}
        roles={[{ value: "customer", label: "Customer: I want to shop" }, { value: "vendor", label: "Shop owner: I sell locally" }]}
      />
    );
  }
  return user.role === "vendor" ? <VendorApp /> : <Providers><CustomerApp /></Providers>;
}

/* ---------- location and cart state (customers) ---------- */
const Ctx = createContext(null);
const useShop = () => useContext(Ctx);

function Providers({ children }) {
  const areas = useApi("/areas");
  const [loc, setLoc] = useState(() => { try { return JSON.parse(localStorage.getItem("loc")) || null; } catch { return null; } });
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem("cart")) || {}; } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem("cart", JSON.stringify(cart)); } catch { /* storage unavailable */ } }, [cart]);
  useEffect(() => { try { if (loc) localStorage.setItem("loc", JSON.stringify(loc)); } catch { /* storage unavailable */ } }, [loc]);
  const value = useMemo(() => {
    const items = Object.values(cart);
    return {
      areas: areas.data || [], loc: loc || (areas.data ? { ...areas.data[0], label: areas.data[0].name } : null), setLoc, cart: items,
      count: items.reduce((s, i) => s + i.qty, 0),
      add: (p, shop) => setCart((c) => ({ ...c, [p.id]: { productId: p.id, name: p.name, emoji: p.emoji, price: p.price, shopId: shop.id, shopName: shop.name, qty: Math.min(50, ((c[p.id] && c[p.id].qty) || 0) + 1) } })),
      setQty: (id, qty) => setCart((c) => { const n = { ...c }; if (qty <= 0) delete n[id]; else n[id] = { ...n[id], qty: Math.min(50, qty) }; return n; }),
      clear: () => setCart({}),
    };
  }, [cart, loc, areas.data]);
  if (!areas.data) return <Loading />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function LocationPicker() {
  const { areas, loc, setLoc } = useShop();
  const toast = useToast();
  const useMine = () => {
    if (!navigator.geolocation) return toast("Your browser cannot share its location.", "error");
    navigator.geolocation.getCurrentPosition((p) => setLoc({ id: "gps", lat: p.coords.latitude, lng: p.coords.longitude, label: "My location" }), () => toast("Could not get your location.", "error"), { timeout: 8000 });
  };
  return (
    <div className="row wrap">
      <span className="muted small">Deliver to</span>
      <select className="input" style={{ width: "auto" }} value={loc.id || ""} onChange={(e) => { const a = areas.find((x) => x.id === e.target.value); if (a) setLoc({ ...a, label: a.name }); }} aria-label="Delivery area">
        {loc.id === "gps" && <option value="gps">My location</option>}{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button className="btn ghost sm" onClick={useMine}>Use my location</button>
    </div>
  );
}

/* ================= Customer ================= */
function CustomerApp() {
  const { path, go } = useHashRoute("/");
  const { count } = useShop();
  const nav = [{ to: "/", label: "Discover" }, { to: "/cart", label: `Cart${count ? ` (${count})` : ""}` }, { to: "/orders", label: "My orders" }];
  const shop = path.match(/^\/shop\/([a-f0-9]{24})$/);
  return (
    <AppShell brand="NearBuy" mark="N" nav={nav} path={path.startsWith("/shop/") ? "/" : path} go={go}>
      {path === "/" && <Discover />}
      {shop && <ShopPage id={shop[1]} go={go} />}
      {path === "/cart" && <Cart go={go} />}
      {path === "/orders" && <MyOrders />}
    </AppShell>
  );
}

function Radar({ shops, radius, onPick }) {
  const R = Math.max(1, radius);
  const size = 300;
  const scale = (size / 2 - 14) / R;
  const rings = [0.25, 0.5, 0.75, 1].map((f) => f * R);
  const { loc } = useShop();
  return (
    <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} style={{ width: "100%", maxWidth: 340 }} role="img" aria-label="Map of shops around you">
      {rings.map((r) => <g key={r}><circle r={r * scale} fill="none" stroke="var(--border)" strokeDasharray="3 4" /><text x={r * scale * 0.71 + 2} y={-r * scale * 0.71} fontSize="8" fill="var(--muted)">{r.toFixed(r < 2 ? 1 : 0)} km</text></g>)}
      <line x1={-size / 2} x2={size / 2} y1="0" y2="0" stroke="var(--border)" /><line y1={-size / 2} y2={size / 2} x1="0" x2="0" stroke="var(--border)" />
      {shops.filter((s) => s.distanceKm <= R).map((s) => {
        const dx = (s.lng - loc.lng) * 111.32 * Math.cos((loc.lat * Math.PI) / 180) * scale;
        const dy = -(s.lat - loc.lat) * 110.57 * scale;
        const ok = s.openNow && s.canDeliver;
        return (
          <g key={s.id} style={{ cursor: "pointer" }} onClick={() => onPick(s.id)}>
            <circle cx={dx} cy={dy} r="9" fill={ok ? "var(--accent)" : "var(--muted)"} opacity={ok ? 1 : 0.55} />
            <text x={dx} y={dy + 3.5} textAnchor="middle" fontSize="9">{CAT_EMOJI[s.category]}</text>
            <title>{`${s.name} · ${s.distanceKm} km · ${s.openNow ? "open" : "closed"}${s.canDeliver ? "" : " · outside delivery range"}`}</title>
          </g>
        );
      })}
      <circle r="6" fill="#ef4444" stroke="#fff" strokeWidth="2" /><text y="18" textAnchor="middle" fontSize="8" fill="var(--text)">You</text>
    </svg>
  );
}

function Discover() {
  const { loc } = useShop();
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [radius, setRadius] = useState(8);
  const [openOnly, setOpenOnly] = useState(false);
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState("distance");
  const path = `/shops?lat=${loc.lat}&lng=${loc.lng}&radius=${radius}&sort=${sort}${cat ? `&category=${cat}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}${openOnly ? "&open=1" : ""}${mine ? "&deliverable=1" : ""}`;
  const { data, loading, error, reload } = useApi(path, { poll: 60000 });
  const go = (id) => { window.location.hash = `/shop/${id}`; };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Shops near {loc.label || loc.name}</h1><p>{data ? `${data.length} within ${radius} km` : "Finding shops…"}</p></div><LocationPicker /></div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 340px) minmax(0, 1fr)", alignItems: "start" }}>
        <div className="card stack-sm">
          <b>Around you</b>
          <Radar shops={data || []} radius={radius} onPick={go} />
          <Field label={`Search radius: ${radius} km`}><input type="range" min="1" max="15" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></Field>
          <p className="muted small" style={{ margin: 0 }}>Filled dots are open and deliver to you. Grey dots are closed or out of range.</p>
        </div>
        <div className="stack-sm">
          <div className="row wrap"><input className="input" style={{ maxWidth: 260 }} placeholder="Search shops or items" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}><option value="distance">Nearest</option><option value="rating">Top rated</option><option value="fee">Lowest delivery fee</option></select></div>
          <div className="row wrap"><button className={`chip${cat === "" ? " on" : ""}`} onClick={() => setCat("")}>All</button>{CATS.map((c) => <button key={c} className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(cat === c ? "" : c)}>{CAT_EMOJI[c]} {c}</button>)}
            <label className="row small"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open now</label><label className="row small"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Delivers to me</label></div>
          {loading && !data && <Loading />}
          {error && <ErrorNote message={error} onRetry={reload} />}
          {data && data.length === 0 && <Empty title="No shops found">Try a larger radius or another area.</Empty>}
          {(data || []).map((s) => (
            <a key={s.id} href={`#/shop/${s.id}`} className="card hover row wrap" style={{ color: "inherit", textDecoration: "none", opacity: s.openNow ? 1 : 0.7 }}>
              <span style={{ fontSize: "1.8rem" }}>{CAT_EMOJI[s.category]}</span>
              <div className="grow"><b>{s.name}</b> {!s.openNow && <Badge>Closed</Badge>} {!s.canDeliver && <Badge kind="warn">Too far</Badge>}<div className="muted small">{s.area} · {s.description}</div></div>
              <div className="small" style={{ textAlign: "right" }}><b>{s.distanceKm} km</b> · {s.etaMin} min<div className="muted">{s.rating ? `★ ${s.rating}` : "New"} · {s.deliveryFee ? `${rs(s.deliveryFee)} delivery` : "Free delivery"}</div></div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShopPage({ id, go }) {
  const { loc, cart, add, setQty } = useShop();
  const { data, loading, error, reload } = useApi(`/shops/${id}?lat=${loc.lat}&lng=${loc.lng}`);
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  const inCart = (pid) => (cart.find((i) => i.productId === pid) || {}).qty || 0;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{CAT_EMOJI[data.category]} {data.name}</h1><p>{data.area} · {data.description}</p></div><a className="btn ghost" href="#/">Back</a></div>
      <div className="row wrap">
        <Badge kind={data.openNow ? "ok" : ""}>{data.openNow ? "Open now" : "Closed"}</Badge><Badge>{data.openTime} - {data.closeTime}</Badge><Badge>{data.distanceKm} km · about {data.etaMin} min</Badge>
        <Badge>{data.deliveryFee ? `${rs(data.deliveryFee)} delivery` : "Free delivery"}</Badge>{data.minOrder > 0 && <Badge>Min order {rs(data.minOrder)}</Badge>}<Badge>{data.rating ? `★ ${data.rating} (${data.reviews})` : "New"}</Badge>
      </div>
      {!data.canDeliver && <div className="badge danger" style={{ whiteSpace: "normal" }}>This shop delivers within {data.radiusKm} km and you are {data.distanceKm} km away. Choose a nearer area to order.</div>}
      <div className="auto-grid">
        {data.products.map((p) => (
          <div key={p.id} className="card stack-sm"><div className="row between"><span style={{ fontSize: "2rem" }}>{p.emoji}</span><b>{rs(p.price)}</b></div><div><b>{p.name}</b>{p.stock <= 5 && p.stock > 0 && <div className="small" style={{ color: "var(--warn)" }}>Only {p.stock} left</div>}{p.stock === 0 && <div className="small" style={{ color: "var(--danger)" }}>Out of stock</div>}</div>
            {inCart(p.id) === 0 ? <button className="btn" disabled={p.stock === 0} onClick={() => add(p, data)}>Add</button> : (
              <div className="row between"><button className="icon-btn" aria-label={`Fewer ${p.name}`} onClick={() => setQty(p.id, inCart(p.id) - 1)}>−</button><b>{inCart(p.id)}</b><button className="icon-btn" aria-label={`More ${p.name}`} disabled={inCart(p.id) >= p.stock} onClick={() => add(p, data)}>+</button></div>)}
          </div>
        ))}
      </div>
      {data.recentReviews.length > 0 && <div className="stack-sm"><h3>Recent reviews</h3>{data.recentReviews.map((r) => <div key={r.id} className="card small"><b>{r.customerName}</b> {"★".repeat(r.rating)} {r.comment && `· ${r.comment}`}</div>)}</div>}
      <div><button className="btn" onClick={() => go("/cart")}>Go to cart</button></div>
    </div>
  );
}

function Cart({ go }) {
  const { cart, loc, setQty, clear } = useShop();
  const shops = useApi(`/shops?lat=${loc.lat}&lng=${loc.lng}`);
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const { busy, run } = useAsync();
  const groups = useMemo(() => {
    const m = new Map();
    cart.forEach((i) => m.set(i.shopId, [...(m.get(i.shopId) || []), i]));
    return [...m.entries()];
  }, [cart]);
  if (cart.length === 0) return <Empty title="Your cart is empty"><a className="btn" href="#/">Find shops</a></Empty>;
  const info = (id) => (shops.data || []).find((s) => s.id === id);
  const totals = groups.map(([id, items]) => { const s = info(id); const sub = items.reduce((t, i) => t + i.price * i.qty, 0); return { id, sub, fee: s ? s.deliveryFee : 0, shop: s }; });
  const grand = totals.reduce((t, x) => t + x.sub + x.fee, 0);
  const problems = totals.flatMap((t) => { const out = []; if (t.shop) { if (!t.shop.canDeliver) out.push(`${t.shop.name} does not deliver to ${loc.label || loc.name}.`); if (!t.shop.openNow) out.push(`${t.shop.name} is closed.`); if (t.sub < t.shop.minOrder) out.push(`${t.shop.name} needs a minimum of ${rs(t.shop.minOrder)}.`); } return out; });
  const place = async () => {
    const r = await run(() => api("/orders", { method: "POST", body: { items: cart.map((i) => ({ productId: i.productId, qty: i.qty })), address, lat: loc.lat, lng: loc.lng, note } }));
    if (r) { clear(); go("/orders"); }
  };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Your cart</h1><p>{groups.length} shop{groups.length === 1 ? "" : "s"}: each gets its own order and delivery fee.</p></div><button className="btn ghost" onClick={clear}>Clear cart</button></div>
      {groups.map(([id, items]) => (
        <div key={id} className="card stack-sm"><div className="row between"><h3 style={{ margin: 0 }}>{items[0].shopName}</h3>{info(id) && <span className="small muted">{info(id).distanceKm} km · {info(id).etaMin} min</span>}</div>
          {items.map((i) => <div key={i.productId} className="row"><span>{i.emoji}</span><span className="grow">{i.name}</span><span className="row"><button className="icon-btn" onClick={() => setQty(i.productId, i.qty - 1)} aria-label={`Fewer ${i.name}`}>−</button><b>{i.qty}</b><button className="icon-btn" onClick={() => setQty(i.productId, i.qty + 1)} aria-label={`More ${i.name}`}>+</button></span><b style={{ minWidth: 80, textAlign: "right" }}>{rs(i.price * i.qty)}</b></div>)}
          <div className="row between small muted"><span>Delivery</span><span>{info(id) ? (info(id).deliveryFee ? rs(info(id).deliveryFee) : "Free") : "-"}</span></div></div>
      ))}
      <div className="card stack-sm">
        <Field label="Delivery address"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House / flat, street, landmark" /></Field>
        <Field label="Note for the shops (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="muted small">Delivering to {loc.label || loc.name}. Payment: cash on delivery.</div>
        {problems.map((p) => <div key={p} className="badge danger" style={{ whiteSpace: "normal" }}>{p}</div>)}
        <div className="row between"><b style={{ fontSize: "1.2rem" }}>Total {rs(grand)}</b><button className="btn" disabled={busy || problems.length > 0 || address.trim().length < 8} onClick={place}>Place order</button></div>
        {address.trim().length < 8 && <span className="muted small">Enter your full delivery address to continue.</span>}
      </div>
    </div>
  );
}

function Tracker({ status }) {
  if (["cancelled", "rejected"].includes(status)) return <Badge kind="danger">{STEP_LABEL[status]}</Badge>;
  const idx = STEPS.indexOf(status);
  return (
    <div className="row" style={{ gap: "0.2rem", flexWrap: "wrap" }}>{STEPS.map((s, i) => <span key={s} className="row small" style={{ gap: "0.2rem", color: i <= idx ? "var(--accent-strong)" : "var(--muted)", fontWeight: i === idx ? 800 : 500 }}><i className="dot" style={{ background: i <= idx ? "var(--accent)" : "var(--border)", margin: 0 }} />{STEP_LABEL[s]}{i < STEPS.length - 1 && <span style={{ margin: "0 0.15rem" }}>›</span>}</span>)}</div>
  );
}

function MyOrders() {
  const { data, loading, error, reload } = useApi("/orders", { poll: 5000 });
  const { run } = useAsync();
  const [reviewing, setReviewing] = useState(null);
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>My orders</h1><p>Updates automatically.</p></div></div>
      {data.length === 0 && <Empty title="No orders yet"><a className="btn" href="#/">Start shopping</a></Empty>}
      {data.map((o) => (
        <div key={o.id} className="card stack-sm">
          <div className="row between wrap"><div><b>{o.shopName}</b> <span className="muted small">#{o.number} · {ago(o.createdAt)}</span></div><b>{rs(o.total)}</b></div>
          <Tracker status={o.status} />
          <div className="small muted">{o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</div>
          <div className="small muted">{o.distanceKm} km away · estimated {o.etaMin} min · cash on delivery</div>
          <div className="row">{o.status === "placed" && <button className="btn ghost sm" onClick={async () => { await run(() => api(`/orders/${o.id}/status`, { method: "POST", body: { status: "cancelled" } }), "Order cancelled"); reload(true); }}>Cancel order</button>}
            {o.status === "delivered" && <button className="btn ghost sm" onClick={() => setReviewing(o)}>Rate this order</button>}</div>
        </div>
      ))}
      {reviewing && <ReviewModal order={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

function ReviewModal({ order, onClose }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const { busy, run } = useAsync();
  return (
    <Modal title={`Rate ${order.shopName}`} onClose={onClose}>
      <div className="stack-sm"><Field label="Rating"><select className="input" value={rating} onChange={(e) => setRating(e.target.value)}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}</select></Field>
        <Field label="Comment"><input className="input" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" disabled={busy} onClick={async () => { if (await run(() => api(`/orders/${order.id}/review`, { method: "POST", body: { rating, comment } }), "Thanks for your review")) onClose(); }}>Submit</button></div></div>
    </Modal>
  );
}

/* ================= Vendor ================= */
function VendorApp() {
  const { path, go } = useHashRoute("/");
  const shop = useApi("/shop");
  const nav = [{ to: "/", label: "Orders" }, { to: "/products", label: "Products" }, { to: "/shop", label: "My shop" }, { to: "/stats", label: "Sales" }];
  if (shop.loading) return <Loading />;
  const setup = !shop.data;
  return (
    <AppShell brand="NearBuy" mark="N" nav={nav} path={path} go={go}>
      {setup && path !== "/shop" && <div className="card row between wrap" style={{ marginBottom: "1rem" }}><div><b>Set up your shop first</b><p className="muted small" style={{ margin: 0 }}>Customers can only find you once your shop has a name, an area and hours.</p></div><a className="btn" href="#/shop">Set up shop</a></div>}
      {!setup && path === "/" && <VendorOrders shop={shop.data} />}
      {!setup && path === "/products" && <Products />}
      {path === "/shop" && <ShopSettings shop={shop.data} onSaved={() => shop.reload(true)} />}
      {!setup && path === "/stats" && <Stats />}
    </AppShell>
  );
}

function VendorOrders({ shop }) {
  const { data, loading, error, reload } = useApi("/orders", { poll: 4000 });
  const { run } = useAsync();
  const [open, setOpen] = useState(shop.isOpen);
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  const move = async (o, status) => { await run(() => api(`/orders/${o.id}/status`, { method: "POST", body: { status } })); reload(true); };
  const NEXT = { placed: [["accepted", "Accept", "btn ok"], ["rejected", "Reject", "btn ghost"]], accepted: [["preparing", "Start preparing", "btn"]], preparing: [["out_for_delivery", "Out for delivery", "btn"]], out_for_delivery: [["delivered", "Mark delivered", "btn ok"]] };
  const live = data.filter((o) => !["delivered", "cancelled", "rejected"].includes(o.status));
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Orders</h1><p>{live.length} in progress · refreshes every few seconds</p></div>
        <label className="row"><span className="small">{open ? "Accepting orders" : "Closed"}</span><input type="checkbox" checked={open} onChange={async (e) => { setOpen(e.target.checked); await run(() => api("/shop", { method: "PUT", body: { isOpen: e.target.checked } }), e.target.checked ? "You are open" : "You are closed"); }} /></label></div>
      {live.length === 0 && <Empty title="No active orders">New orders appear here as customers place them.</Empty>}
      <div className="auto-grid">{live.map((o) => (
        <div key={o.id} className="card stack-sm"><div className="row between"><b>#{o.number}</b><Badge kind={o.status === "placed" ? "warn" : "accent"}>{STEP_LABEL[o.status]}</Badge></div>
          <div className="small">{o.customerName} · {o.distanceKm} km · {ago(o.createdAt)}</div>
          <div className="small">{o.items.map((i) => <div key={i.productId}>{i.qty} × {i.name}</div>)}</div>
          <div className="small muted">{o.address}{o.note ? ` · "${o.note}"` : ""}</div>
          <div className="row between"><b>{rs(o.total)}</b><span className="small muted">cash on delivery</span></div>
          <div className="row wrap">{(NEXT[o.status] || []).map(([s, label, cls]) => <button key={s} className={cls} onClick={() => move(o, s)}>{label}</button>)}</div></div>
      ))}</div>
      {data.filter((o) => !live.includes(o)).length > 0 && (
        <><h2 style={{ marginBottom: 0 }}>History</h2><div className="table-wrap"><table className="table"><thead><tr><th>Order</th><th>Customer</th><th>When</th><th className="num">Total</th><th>Status</th></tr></thead>
          <tbody>{data.filter((o) => !live.includes(o)).map((o) => <tr key={o.id}><td>#{o.number}</td><td>{o.customerName}</td><td className="small">{dateTimeFmt(o.createdAt)}</td><td className="num">{rs(o.total)}</td><td><Badge kind={o.status === "delivered" ? "ok" : "danger"}>{STEP_LABEL[o.status]}</Badge></td></tr>)}</tbody></table></div></>
      )}
    </div>
  );
}

function Products() {
  const { data, loading, error, reload } = useApi("/shop/products");
  const [editing, setEditing] = useState(null);
  const { run } = useAsync();
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  const patch = async (p, body) => { await run(() => api(`/shop/products/${p.id}`, { method: "PATCH", body })); reload(true); };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Products</h1><p>{data.length} items</p></div><button className="btn" onClick={() => setEditing({})}>+ Add product</button></div>
      {data.length === 0 ? <Empty title="No products yet">Add what you sell so customers can order.</Empty> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th className="num">Price</th><th className="num">Stock</th><th>Sold online</th><th /></tr></thead>
          <tbody>{data.map((p) => <tr key={p.id}><td>{p.emoji} <b>{p.name}</b></td><td className="num">{rs(p.price)}</td>
            <td className="num"><input className="input" style={{ width: 80, textAlign: "right" }} type="number" min="0" defaultValue={p.stock} onBlur={(e) => Number(e.target.value) !== p.stock && patch(p, { stock: e.target.value })} aria-label={`Stock of ${p.name}`} /></td>
            <td><input type="checkbox" checked={p.available} onChange={(e) => patch(p, { available: e.target.checked })} aria-label={`${p.name} available`} /></td>
            <td className="num"><button className="btn ghost sm" onClick={() => setEditing(p)}>Edit</button> <button className="btn ghost sm" onClick={async () => { if (window.confirm(`Delete ${p.name}?`)) { await run(() => api(`/shop/products/${p.id}`, { method: "DELETE" }), "Deleted"); reload(true); } }}>Delete</button></td></tr>)}</tbody></table></div>
      )}
      {editing && <ProductForm product={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(true); }} />}
    </div>
  );
}

function ProductForm({ product, onClose, onSaved }) {
  const [f, setF] = useState(product ? { ...product, price: product.price / 100 } : { name: "", price: "", stock: "", emoji: "🛍️" });
  const { busy, run } = useAsync();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={product ? "Edit product" : "Add product"} onClose={onClose}>
      <form className="stack-sm" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(product ? `/shop/products/${product.id}` : "/shop/products", { method: product ? "PATCH" : "POST", body: f }), "Saved")) onSaved(); }}>
        <div className="grid" style={{ gridTemplateColumns: "1fr 80px" }}><Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field><Field label="Emoji"><input className="input" value={f.emoji} onChange={set("emoji")} /></Field></div>
        <div className="grid cols-2"><Field label="Price (INR)"><input className="input" type="number" min="1" step="any" value={f.price} onChange={set("price")} /></Field><Field label="Stock"><input className="input" type="number" min="0" value={f.stock} onChange={set("stock")} /></Field></div>
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  );
}

function ShopSettings({ shop, onSaved }) {
  const areas = useApi("/areas");
  const [f, setF] = useState(shop ? { name: shop.name, category: shop.category, description: shop.description, areaId: shop.areaId, radiusKm: shop.radiusKm, deliveryFee: shop.deliveryFee / 100, minOrder: shop.minOrder / 100, openTime: shop.openTime, closeTime: shop.closeTime } : { name: "", category: "grocery", description: "", areaId: "patia", radiusKm: 4, deliveryFee: 30, minOrder: 100, openTime: "09:00", closeTime: "21:00" });
  const { busy, run } = useAsync();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div className="page-head"><div><h1>{shop ? "My shop" : "Set up your shop"}</h1><p>How customers see and reach you.</p></div></div>
      <form className="card stack-sm" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api("/shop", { method: "PUT", body: f }), "Shop saved")) onSaved(); }}>
        <div className="grid cols-2"><Field label="Shop name"><input className="input" value={f.name} onChange={set("name")} /></Field><Field label="Category"><select className="input" value={f.category} onChange={set("category")}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field></div>
        <Field label="Description"><input className="input" value={f.description} onChange={set("description")} /></Field>
        <div className="grid cols-2"><Field label="Area"><select className="input" value={f.areaId} onChange={set("areaId")}>{(areas.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field><Field label={`Delivery radius: ${f.radiusKm} km`}><input type="range" min="1" max="15" value={f.radiusKm} onChange={set("radiusKm")} /></Field></div>
        <div className="grid cols-2"><Field label="Delivery fee (INR)"><input className="input" type="number" min="0" value={f.deliveryFee} onChange={set("deliveryFee")} /></Field><Field label="Minimum order (INR)"><input className="input" type="number" min="0" value={f.minOrder} onChange={set("minOrder")} /></Field></div>
        <div className="grid cols-2"><Field label="Opens"><input className="input" type="time" value={f.openTime} onChange={set("openTime")} /></Field><Field label="Closes"><input className="input" type="time" value={f.closeTime} onChange={set("closeTime")} /></Field></div>
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" disabled={busy}>Save shop</button></div>
      </form>
    </div>
  );
}

function Stats() {
  const { data, loading, error, reload } = useApi("/vendor/stats", { poll: 15000 });
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Sales</h1><p>Earnings are after the {Math.round(data.commissionRate * 100)}% platform commission.</p></div></div>
      <div className="grid cols-4"><Stat label="Waiting" value={data.pending} hint={`${data.active} in progress`} /><Stat label="Today's sales" value={rs(data.todaySales)} hint={`${data.todayOrders} orders today`} /><Stat label="Total earnings" value={rs(data.earnings)} hint={`${data.totalDelivered} delivered`} /><Stat label="Rating" value={data.rating ? `★ ${data.rating}` : "-"} hint={`${data.reviews} reviews`} /></div>
      <div className="card"><h3>Sales, last 7 days</h3><BarChart data={data.series} valueFormat={(v) => rs(v)} /></div>
      <div className="grid cols-2">
        <div className="card stack-sm"><h3>Top products</h3>{data.topProducts.length === 0 && <p className="muted">Delivered orders will show up here.</p>}{data.topProducts.map((p) => <div key={p.name} className="row small"><span className="grow">{p.name}</span><span className="muted">{p.qty} sold</span><b>{rs(p.revenue)}</b></div>)}</div>
        <div className="card stack-sm"><h3>Running low</h3>{data.lowStock.length === 0 && <p className="muted">Stock levels look fine.</p>}{data.lowStock.map((p) => <div key={p.id} className="row small"><span className="grow">{p.name}</span><Badge kind={p.stock === 0 ? "danger" : "warn"}>{p.stock === 0 ? "Out" : `${p.stock} left`}</Badge></div>)}</div>
      </div>
    </div>
  );
}
