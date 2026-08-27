import { readFileSync, writeFileSync } from "node:fs";

const [providerFile, browserFile, outputFile] = process.argv.slice(2);
const parse = (file) => readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse);
const provider = parse(providerFile);
const browser = parse(browserFile);
const failures = [];
const allowedQueries = { tiles: [], search: ["accept-language", "addressdetails", "format", "limit", "q"], route: ["geometries", "overview"], elevation: ["latitude", "longitude"], weather: ["current", "daily", "end_date", "forecast_days", "hourly", "latitude", "longitude", "past_days", "start_date", "timezone"] };
const kind = (entry) => /^\/tiles\//.test(entry.path) ? "tiles" : entry.path === "/search" ? "search" : entry.path.startsWith("/route/v1/driving/") ? "route" : entry.path === "/elevation" ? "elevation" : entry.path === "/weather" ? "weather" : "unknown";
for (const entry of provider) {
  const capability = kind(entry);
  if (capability === "unknown") failures.push(`unknown provider path: ${entry.path}`);
  if (entry.method !== "GET") failures.push(`non-GET provider request: ${entry.path}`);
  if (entry.credential !== "odovi-acceptance-provider") failures.push(`missing credential: ${entry.path}`);
  const extra = Object.keys(entry.query).filter((key) => !allowedQueries[capability]?.includes(key));
  if (extra.length) failures.push(`unexpected query for ${entry.path}: ${extra.join(",")}`);
  if (capability === "tiles" && (Object.keys(entry.query).length !== 0 || !String(entry.accept).startsWith("image/"))) failures.push("tile request disclosed more than coordinates or omitted image acceptance");
  if (capability === "search" && (entry.query.format !== "jsonv2" || entry.query.limit !== "5" || entry.query.addressdetails !== "1" || entry.query.q !== "Controlled destination" || !entry.query["accept-language"])) failures.push("address-search request shape is incomplete");
  if (capability === "route" && (entry.query.overview !== "full" || entry.query.geometries !== "geojson" || !/^\/route\/v1\/driving\/-?\d/.test(entry.path))) failures.push("routing request shape is incomplete");
  if (capability === "elevation") {
    const latitudes = String(entry.query.latitude ?? "").split(",").filter(Boolean);
    const longitudes = String(entry.query.longitude ?? "").split(",").filter(Boolean);
    if (!latitudes.length || latitudes.length !== longitudes.length) failures.push("elevation request coordinates are incomplete");
  }
  if (capability === "weather") {
    const current = entry.query.current && entry.query.daily && entry.query.forecast_days === "1";
    const historical = entry.query.hourly && entry.query.timezone === "UTC" && (entry.query.start_date || entry.query.past_days);
    if (!entry.query.latitude || !entry.query.longitude || (!current && !historical)) failures.push("weather request shape is incomplete");
  }
}
for (const capability of ["tiles", "search", "route", "elevation", "weather"]) if (!provider.some((entry) => kind(entry) === capability)) failures.push(`no ${capability} request`);
const navigation = browser.filter((entry) => entry.controlled === true && entry.host === "controlled-navigation.invalid" && entry.pathname.startsWith("/navigate/"));
if (navigation.length !== 1) failures.push(`expected one explicit navigation request, got ${navigation.length}`);
const summary = { providerRequests: provider.length, controlledNavigationRequests: navigation.length, failures };
writeFileSync(outputFile, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exit(1);
