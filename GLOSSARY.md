# Domain glossary

- **Cloud Save** — An optional account-held whole-save copy for a Save slot. Local play works without it; replacing a copy requires the existing explicit conflict choice.
- **Save slot** — One of three independently addressable whole-guild saves. Upload ordering and debounce belong to each slot, regardless of which guild is active.
- **Upload snapshot** — A detached, slot-bound JSON checkpoint owned by Cloud Sync from synchronous capture through scheduling, transport, retry, and acknowledgment. Caller mutations cannot change its transmitted value or fingerprint; a retry captures the latest persisted Save slot anew.
- **Sync baseline** — The opaque server hash paired with the local fingerprint of the same accepted Upload snapshot. It acknowledges only that checkpoint; later local progress remains local-newer. Failed, conflicting, or obsolete responses cannot establish a new baseline.
