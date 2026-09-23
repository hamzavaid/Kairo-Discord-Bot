# Offline fixture provider

The Phase 1 parser accepts free text and `https://fixture.kairo.invalid/tracks/<id>` only. The reserved `.invalid` host is never fetched. Catalog entries are supplied at engine construction and converted to metadata-only canonical Tracks. Search matches normalized query terms against artist and title text in fixture order, subject to `maxResults` (1–25). URL parsing uses WHATWG `URL`; only `utm_source` is stripped from fixture URL identity.

The fixture provider is intentionally limited. No real media provider, collection, direct HTTP media, URI, playback source, caching, timeout, or network behavior is implemented yet. Phase 1 still needs a general provider registry and validated provider payload boundary before its exit criterion is met.
