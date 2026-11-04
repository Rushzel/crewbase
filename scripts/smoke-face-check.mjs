// End-to-end smoke test of the face check's plumbing, with no real face: signs in as the demo employee,
// asks for a challenge, uploads synthetic frames in the capture screen's order, and expects the server
// to refuse them ("no face") and record that verdict. Run with the app and local database running.
import sharp from "sharp";

const APP = process.env.APP_URL ?? "http://localhost:3100";

// Sign in through the demo route to get the session cookies, as a visitor would.
const res = await fetch(`${APP}/demo/employee`, { redirect: "manual" });
const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
if (!cookies.includes("auth-token")) throw new Error(`demo sign-in failed (HTTP ${res.status})`);

// A challenge via the database's REST API, with the same session.
const token = decodeURIComponent(cookies.match(/auth-token=([^;]+)/)[1]);
const session = JSON.parse(token.startsWith("base64-") ? Buffer.from(token.slice(7), "base64").toString() : token);
const env = Object.fromEntries((await import("node:fs")).readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const orgs = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/organizations?slug=eq.demo-company&select=id`, {
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}` },
}).then((r) => r.json());
const challenge = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/issue_face_challenge`, {
  method: "POST",
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
  body: JSON.stringify({ p_org: orgs[0].id, p_purpose: "clock" }),
}).then((r) => r.json());
if (!challenge.id) throw new Error(`no challenge: ${JSON.stringify(challenge)}`);
console.log("challenge", challenge.id, challenge.colors.join(" "));

// Synthetic frames in the capture screen's order: 3 still, 10 blink, 2 per colour.
const frame = (rgb) => sharp({ create: { width: 480, height: 360, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).jpeg().toBuffer();
const meta = [
  ...Array(3).fill({ phase: "still" }),
  ...Array(10).fill({ phase: "blink" }),
  ...challenge.colors.flatMap((_, step) => [{ phase: "flash", step }, { phase: "flash", step }]),
];
const body = new FormData();
body.set("challenge", challenge.id);
body.set("meta", JSON.stringify(meta));
for (let i = 0; i < meta.length; i++) body.append("frame", new Blob([await frame([120, 110, 100])], { type: "image/jpeg" }), `${i}.jpg`);

const started = Date.now();
const check = await fetch(`${APP}/api/face/check`, { method: "POST", body, headers: { cookie: cookies } });
const result = await check.json();
console.log(`HTTP ${check.status} in ${Date.now() - started} ms:`, JSON.stringify(result));
if (result.passed !== false || !/no face/.test(result.reason ?? "")) throw new Error("expected the server to refuse frames with no face");
console.log("ok: the server checked the frames itself and recorded a refusal");
