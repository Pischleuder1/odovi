# TeslaMate boundary fixtures

These schema-only fixtures are generated from the official TeslaMate container
images in disposable PostgreSQL databases. They contain no operator or vehicle
data. `dev/fixtures/seed.ts` adds synthetic data before the compatibility tests
run.

| Fixture | Source revision | Last migration | Status |
| --- | --- | --- | --- |
| `v4.0.1` | `46a755b7ae45f818fce11db4df6cdccc16d8f9b5` | `20260411070212` | supported lower boundary |
| `v4.2.0` | `e8d24886f97f22469c2675f89be843f6d401c76a` | `20260808090000` | supported upper boundary |

Regenerate one fixture from its pinned release tag and verified OCI source
revision:

```bash
./scripts/generate-teslamate-schema-fixture.sh 4.0.1
./scripts/generate-teslamate-schema-fixture.sh 4.2.0
```

The source releases are [TeslaMate v4.0.1](https://github.com/teslamate-org/teslamate/releases/tag/v4.0.1)
and [TeslaMate v4.2.0](https://github.com/teslamate-org/teslamate/releases/tag/v4.2.0).
TeslaMate's official Docker installation runs the application migrations against
PostgreSQL; the generator follows that topology without connecting to an
existing TeslaMate database.
