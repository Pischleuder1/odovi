import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const logFile = process.env.ODOVI_ACCEPTANCE_PROVIDER_LOG;
const credential = process.env.ODOVI_ACCEPTANCE_PROVIDER_CREDENTIAL ?? "odovi-acceptance-provider";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X4hZ8QAAAABJRU5ErkJggg==", "base64");

function json(response, body) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://provider:8080");
  if (url.pathname === "/health") return json(response, { ok: true });
  const entry = { at: new Date().toISOString(), method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), accept: request.headers.accept ?? null, credential: request.headers["x-odovi-acceptance"] ?? null };
  if (logFile) appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
  if (entry.credential !== credential) return json(response, { error: "missing acceptance credential" });
  if (/^\/tiles\/\d+\/\d+\/\d+\.png$/.test(url.pathname)) {
    response.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=60" });
    return response.end(png);
  }
  if (url.pathname === "/search") return json(response, [{ display_name: "Controlled destination", lat: "47.2", lon: "8.2", address: { road: "Acceptance Road", city: "Zurich" } }]);
  if (url.pathname.startsWith("/route/v1/driving/")) {
    const points = url.pathname.slice("/route/v1/driving/".length).split(";").map((pair) => pair.split(",").map(Number));
    return json(response, { code: "Ok", routes: [{ distance: 12000, duration: 900, geometry: { type: "LineString", coordinates: points }, legs: points.slice(1).map(() => ({ distance: 12000 / (points.length - 1), duration: 900 / (points.length - 1) })) }] });
  }
  if (url.pathname === "/elevation") {
    const count = (url.searchParams.get("latitude") ?? "").split(",").filter(Boolean).length;
    return json(response, { elevation: Array.from({ length: count }, (_, index) => 400 + index) });
  }
  if (url.pathname === "/weather") {
    if (url.searchParams.has("current")) return json(response, { current: { temperature_2m: 18, apparent_temperature: 17, weather_code: 1, wind_speed_10m: 5 }, daily: { temperature_2m_max: [22], temperature_2m_min: [12], weather_code: [1] } });
    const date = url.searchParams.get("start_date") ?? "2026-08-25";
    const time = Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, "0")}:00`);
    return json(response, { hourly: { time, temperature_2m: time.map(() => 18), precipitation: time.map(() => 0), wind_speed_10m: time.map(() => 5), weather_code: time.map(() => 1) } });
  }
  response.writeHead(404).end();
}).listen(8080, "0.0.0.0");
