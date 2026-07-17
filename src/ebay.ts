// eBay Sandbox publisher — the "Listed" step becomes REAL: the agent creates
// an actual listing through eBay's Inventory API and gets a listing id back.
// Sandbox only (safe: no live marketplace, no money), zero dependencies.
//
// Env (all three required, else ebayEnabled() is false and the demo falls back
// to the local board):
//   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET  — the app keyset (Sandbox)
//   EBAY_REFRESH_TOKEN                  — OAuth user refresh token for a
//                                         sandbox test user (User Tokens page)
//
// First publish auto-provisions the seller plumbing the Inventory API demands:
// an inventory location and payment/return/fulfillment policies. Ids are cached
// in memory (the FC instance is warm).

const BASE = "https://api.sandbox.ebay.com";
const AUTH = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const MARKETPLACE = "EBAY_US";
const LOCATION_KEY = "onlist-agent-loc";

export const ebayEnabled = (): boolean =>
  Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET && process.env.EBAY_REFRESH_TOKEN);

let _token: { value: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (_token && Date.now() < _token.exp - 60_000) return _token.value;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.EBAY_REFRESH_TOKEN!,
      scope: "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account",
    }),
  });
  if (!res.ok) throw new Error(`ebay oauth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json() as { access_token: string; expires_in: number };
  _token = { value: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return _token.value;
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      "Content-Language": "en-US",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

// ————— one-time seller plumbing (idempotent) —————

let _plumbed: { fulfillment: string; payment: string; ret: string } | null = null;

async function ensurePlumbing(): Promise<NonNullable<typeof _plumbed>> {
  if (_plumbed) return _plumbed;

  // inventory location
  const loc = await api("GET", `/sell/inventory/v1/location/${LOCATION_KEY}`);
  if (loc.status === 404) {
    const made = await api("POST", `/sell/inventory/v1/location/${LOCATION_KEY}`, {
      location: { address: { country: "US", postalCode: "32803", city: "Orlando", stateOrProvince: "FL" } },
      locationTypes: ["WAREHOUSE"],
      name: "onlist-agent demo location",
      merchantLocationStatus: "ENABLED",
    });
    if (made.status >= 300) throw new Error(`ebay location: ${JSON.stringify(made.data).slice(0, 200)}`);
  }

  async function policyId(kind: "fulfillment" | "payment" | "return", create: unknown): Promise<string> {
    const list = await api("GET", `/sell/account/v1/${kind}_policy?marketplace_id=${MARKETPLACE}`);
    const arr = list.data?.[`${kind}Policies`] ?? [];
    if (arr.length) return arr[0][`${kind}PolicyId`];
    const made = await api("POST", `/sell/account/v1/${kind}_policy`, create);
    const id = made.data?.[`${kind}PolicyId`];
    if (!id) throw new Error(`ebay ${kind} policy: ${JSON.stringify(made.data).slice(0, 250)}`);
    return id;
  }

  const fulfillment = await policyId("fulfillment", {
    name: "onlist flat shipping", marketplaceId: MARKETPLACE,
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
    handlingTime: { value: 2, unit: "DAY" },
    shippingOptions: [{
      optionType: "DOMESTIC", costType: "FLAT_RATE",
      shippingServices: [{ shippingServiceCode: "USPSPriority", shippingCost: { value: "0.00", currency: "USD" } }],
    }],
  });
  const payment = await policyId("payment", {
    name: "onlist payment", marketplaceId: MARKETPLACE,
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
  });
  const ret = await policyId("return", {
    name: "onlist no returns", marketplaceId: MARKETPLACE,
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
    returnsAccepted: false,
  });

  _plumbed = { fulfillment, payment, ret };
  return _plumbed;
}

async function categoryFor(title: string): Promise<string> {
  try {
    const r = await api("GET",
      `/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(title)}`);
    const leaf = r.data?.categorySuggestions?.[0]?.category?.categoryId;
    if (leaf) return String(leaf);
  } catch { /* fall through */ }
  return "182094"; // Everything Else > Other — safe leaf fallback
}

export interface EbayListing { listingId: string; url: string; categoryId: string }

/** Create + publish a fixed-price sandbox listing. Returns the real listing id. */
export async function publishToEbay(opts: {
  title: string; description: string; condition: string;
  priceUSD: number; imageUrl: string;
}): Promise<EbayListing> {
  const plumbing = await ensurePlumbing();
  const sku = `onlist-${Date.now().toString(36)}`;

  // condition text → eBay enum (used goods demo: keep it simple and honest)
  const cond = /new/i.test(opts.condition) ? "NEW" : "USED_GOOD";

  const inv = await api("PUT", `/sell/inventory/v1/inventory_item/${sku}`, {
    availability: { shipToLocationAvailability: { quantity: 1 } },
    condition: cond,
    product: {
      title: opts.title.slice(0, 80),
      description: opts.description.slice(0, 4000),
      imageUrls: [opts.imageUrl],
    },
  });
  if (inv.status >= 300) throw new Error(`ebay inventory: ${JSON.stringify(inv.data).slice(0, 250)}`);

  const categoryId = await categoryFor(opts.title);
  const offer = await api("POST", "/sell/inventory/v1/offer", {
    sku, marketplaceId: MARKETPLACE, format: "FIXED_PRICE",
    availableQuantity: 1, categoryId,
    listingDescription: opts.description.slice(0, 4000),
    pricingSummary: { price: { value: String(opts.priceUSD), currency: "USD" } },
    listingPolicies: {
      fulfillmentPolicyId: plumbing.fulfillment,
      paymentPolicyId: plumbing.payment,
      returnPolicyId: plumbing.ret,
    },
    merchantLocationKey: LOCATION_KEY,
  });
  const offerId = offer.data?.offerId;
  if (!offerId) throw new Error(`ebay offer: ${JSON.stringify(offer.data).slice(0, 250)}`);

  const pub = await api("POST", `/sell/inventory/v1/offer/${offerId}/publish`, {});
  const listingId = pub.data?.listingId;
  if (!listingId) throw new Error(`ebay publish: ${JSON.stringify(pub.data).slice(0, 250)}`);

  return { listingId: String(listingId), url: `https://sandbox.ebay.com/itm/${listingId}`, categoryId };
}
