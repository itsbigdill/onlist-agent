// UPS sandbox (CIE) label generator — a REAL shipping label with a real 1Z
// tracking number, from the UPS test environment. Zero dependencies.
//
// Env (all three required, else upsEnabled() is false and the UI falls back to
// the rendered demo label):
//   UPS_CLIENT_ID, UPS_CLIENT_SECRET — app keys from developer.ups.com
//   UPS_ACCOUNT                      — the 6-char UPS account (shipper) number

const CIE = "https://wwwcie.ups.com";

export const upsEnabled = (): boolean =>
  Boolean(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET && process.env.UPS_ACCOUNT);

let _token: { value: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (_token && Date.now() < _token.exp - 60_000) return _token.value;
  const basic = Buffer.from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${CIE}/security/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`ups oauth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json() as { access_token: string; expires_in: string };
  _token = { value: d.access_token, exp: Date.now() + Number(d.expires_in) * 1000 };
  return _token.value;
}

export interface UpsLabel { tracking: string; gifB64: string }

/** Create a sandbox shipment → real label GIF + 1Z tracking number. */
export async function createLabel(opts: { toName: string; title: string }): Promise<UpsLabel> {
  const acct = process.env.UPS_ACCOUNT!;
  const res = await fetch(`${CIE}/api/shipments/v2409/ship`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      transactionSrc: "onlist-agent",
    },
    body: JSON.stringify({
      ShipmentRequest: {
        Request: { RequestOption: "nonvalidate" },
        Shipment: {
          Description: opts.title.slice(0, 50),
          Shipper: {
            Name: "onlist seller", ShipperNumber: acct,
            Address: { AddressLine: ["229 W 43rd St"], City: "New York", StateProvinceCode: "NY", PostalCode: "10036", CountryCode: "US" },
          },
          ShipTo: {
            Name: opts.toName.slice(0, 35),
            Address: { AddressLine: ["2847 Juniper Lane"], City: "Orlando", StateProvinceCode: "FL", PostalCode: "32803", CountryCode: "US" },
          },
          ShipFrom: {
            Name: "onlist seller",
            Address: { AddressLine: ["229 W 43rd St"], City: "New York", StateProvinceCode: "NY", PostalCode: "10036", CountryCode: "US" },
          },
          PaymentInformation: { ShipmentCharge: { Type: "01", BillShipper: { AccountNumber: acct } } },
          Service: { Code: "03", Description: "Ground" },
          Package: {
            Packaging: { Code: "02" },
            PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: "2" },
          },
        },
        LabelSpecification: { LabelImageFormat: { Code: "GIF" } },
      },
    }),
  });
  const d: any = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`ups ship ${res.status}: ${JSON.stringify(d).slice(0, 250)}`);
  const pr = d?.ShipmentResponse?.ShipmentResults?.PackageResults;
  const pkg = Array.isArray(pr) ? pr[0] : pr;
  const gif = pkg?.ShippingLabel?.GraphicImage;
  const tracking = pkg?.TrackingNumber;
  if (!gif || !tracking) throw new Error(`ups ship: no label in response ${JSON.stringify(d).slice(0, 200)}`);
  return { tracking: String(tracking), gifB64: String(gif) };
}
