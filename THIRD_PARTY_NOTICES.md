# Third-party notices

Odovi includes and depends on third-party software. Those components remain
under their own license terms; the FSL does not replace them. The package manifests and lockfile are the
authoritative inventory for a particular build.

Notable examples include:

- [TeslaMate](https://github.com/teslamate-org/teslamate), which Odovi can
  read through a separately installed database. TeslaMate is not bundled as
  Odovi code except where deployment documentation explicitly references
  it.
- `libvips` binaries distributed through Sharp packages, which retain their
  applicable LGPL and related third-party terms.

Container builds collect license and notice files from the installed production
dependency graph, including nested bundled components such as Next.js's compiled
dependencies, original package metadata and upstream README notices. Each architecture has its own inventory because native optional
dependencies differ. The inventory records the lockfile checksum, package names,
versions, license declarations and notice paths without local build paths.

The application license is at `/app/LICENSE`; the generated inventory and
unaltered third-party notices are at `/app/third-party-licenses/`. Standard
license terms from SPDX license-list-data v3.28.0 are included under
`license-texts/`, with their sources; those templates supplement, not replace,
upstream copyright notices. The base image
retains its own system-package notices. This inventory is not a claim that all
transitive license obligations are captured by package metadata alone.

Sharp's dynamically linked libvips and its bundled libraries retain their own
terms, including LGPLv3. Their upstream README and `versions.json` are preserved
in the corresponding inventory directory. Source and reproducible build scripts
are available from https://github.com/lovell/sharp-libvips (the package version
identifies the upstream release). You may replace the shared libraries with
interface-compatible builds; Odovi's license does not restrict modification of
those libraries or reverse engineering to debug such modifications.
