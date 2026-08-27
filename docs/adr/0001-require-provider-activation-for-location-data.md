# Require provider activation for external location data

Odovi's Core Archive must work without sending location data to an external
provider. Optional capabilities such as weather, elevation, public maps, and
routing may transmit location data only after the user explicitly activates a
named provider. Each capability has an independent mode of `disabled`, a
disclosed `public` provider, or a user-supplied `custom` endpoint, preserving
the product's self-hosted trust promise while still allowing richer
experiences. Fresh installs and upgrades keep public providers disabled until
an administrator completes Provider Review; the product explains which richer
experiences require activation without weakening the Core Archive.
