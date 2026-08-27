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

This file is a high-level notice, not an exhaustive software bill of materials.
Before a public binary or container release, regenerate the dependency license
inventory from the locked dependency graph and include all notices required by
those licenses.
