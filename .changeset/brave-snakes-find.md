---
"kilo-code": minor
"@roo-code/types": patch
---

Introduce a new `VirtualQuotaFallbackProvider`

This new virtual provider lets you set cost- or request-based quotas for a list of profiles. It will automatically falls back to the next profile's provider when any limit is reached!
