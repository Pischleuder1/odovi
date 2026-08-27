# Demo

Odovi ausprobieren ohne echtes Auto oder eine echte TeslaMate-Installation
— mit ~6 Wochen synthetischer Fahrdaten (Raum Zürich, siehe
[`dev/fixtures/seed.ts`](../dev/fixtures/seed.ts)).

## Starten

```bash
export ODOVI_SETUP_TOKEN="v1.$(date +%s).$(openssl rand -hex 32)"
docker compose -f docker-compose.demo.yml up --build
```

Baut `web` und `worker` lokal, startet eine eigene `odovi-db` und eine
Fake-`teslamate-db` (nur Schema, keine echte TeslaMate-App dahinter), seedet
sie einmalig mit Beispieldaten und lässt den Sync-Worker (15s-Takt statt der
üblichen 60s) alles in die Odovi-DB übernehmen. Nach 1–2 Minuten sind die
ersten Fahrten sichtbar, nach ein paar weiteren Zyklen die komplette Fixture
(Ladevorgänge, Parkvorgänge, Fahrzeugstatus).

## Login

<http://localhost:3000> — beim ersten Öffnen das oben erzeugte
`ODOVI_SETUP_TOKEN` eingeben und ein Demo-Passwort wählen.

## Alle Werte hier sind Demo-only

`docker-compose.demo.yml` verdrahtet Datenbank-Passwörter fest im Klartext
(`odovi-demo`, `teslamate-demo`). Der kurzlebige Setup-Token kommt nur aus der
aktuellen Shell. Für eine echte Installation
immer `docker-compose.yml` + `.env` verwenden (siehe README „Deployment"),
niemals diese Datei — sie ist ausschließlich zum Ausprobieren gedacht und
läuft komplett isoliert (eigene Volumes, eigene Image-Tags `:demo`).

## Abbau

```bash
docker compose -f docker-compose.demo.yml down -v
```

`-v` löscht auch die beiden Demo-Datenbank-Volumes — danach ist alles weg,
ein erneutes `up --build` startet wieder bei null.

## Seed-Ansatz (Hinweis für Maintainer)

Der `seed`-Service baut ein eigenes, schlankes Image
([`dev/fixtures/Dockerfile`](../dev/fixtures/Dockerfile)), das
`dev/fixtures/seed.ts` unabhängig vom pnpm-Workspace per `npm install`
ausführt — `seed.ts` hat keine Workspace-internen Abhängigkeiten (nur das
`postgres`-npm-Paket), das hält den Container einfach und robust gegenüber
Lockfile-/Workspace-Eigenheiten.

Falls dieser Ansatz doch mal bricht: Fallback ist manuelles Seeden gegen die
laufende Fixture-DB, z. B. mit einem temporär veröffentlichten Port:

```bash
# In docker-compose.demo.yml bei teslamate-db kurz ergänzen:
#   ports: ["5433:5432"]
docker compose -f docker-compose.demo.yml up -d teslamate-db
TESLAMATE_DATABASE_URL=postgres://teslamate:teslamate-demo@localhost:5433/teslamate \
  pnpm --filter @odovi/fixtures seed
```
