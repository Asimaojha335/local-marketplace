// Location maths and shop-hours rules as pure functions.

// Neighbourhoods of Bhubaneswar used as delivery areas (approximate centres).
const AREAS = [
  { id: "patia", name: "Patia", lat: 20.3547, lng: 85.8196 },
  { id: "saheed-nagar", name: "Saheed Nagar", lat: 20.2937, lng: 85.8437 },
  { id: "jaydev-vihar", name: "Jaydev Vihar", lat: 20.3009, lng: 85.8154 },
  { id: "nayapalli", name: "Nayapalli", lat: 20.2919, lng: 85.8117 },
  { id: "chandrasekharpur", name: "Chandrasekharpur", lat: 20.3315, lng: 85.8103 },
  { id: "old-town", name: "Old Town", lat: 20.2385, lng: 85.8365 },
  { id: "khandagiri", name: "Khandagiri", lat: 20.2578, lng: 85.7803 },
  { id: "baramunda", name: "Baramunda", lat: 20.2822, lng: 85.7796 },
  { id: "rasulgarh", name: "Rasulgarh", lat: 20.2836, lng: 85.8631 },
  { id: "kalinga-nagar", name: "Kalinga Nagar", lat: 20.2482, lng: 85.8161 },
];
const areaById = (id) => AREAS.find((a) => a.id === id) || null;

const rad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const R = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Preparation time plus riding time at roughly 15 km/h through city traffic.
const etaMinutes = (km, prep = 10) => Math.round(prep + km * 4);

// "HH:MM" strings in Indian Standard Time; a closing time earlier than the opening time means the shop is open past midnight.
function minutesOf(text) {
  const m = String(text || "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function istMinutes(now = new Date()) {
  const ist = new Date(new Date(now).getTime() + 330 * 60000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}
function isWithinHours(open, close, now = new Date()) {
  const o = minutesOf(open);
  const c = minutesOf(close);
  if (o === null || c === null) return true;
  const t = istMinutes(now);
  if (o === c) return true;
  return o < c ? t >= o && t < c : t >= o || t < c;
}

// Position of a shop relative to the customer in kilometres east/north (small-area approximation), for drawing a radar view.
function offsetKm(center, point) {
  return { x: (point.lng - center.lng) * 111.32 * Math.cos(rad(center.lat)), y: (point.lat - center.lat) * 110.57 };
}

module.exports = { AREAS, areaById, haversineKm, etaMinutes, isWithinHours, istMinutes, minutesOf, offsetKm };
