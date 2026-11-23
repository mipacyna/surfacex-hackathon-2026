# Signature format

Signatures are declarative YAML. They must not contain executable code, Ruby/Python scripts or external calls.

Allowed checks: HTTP header, cookie name, HTML fragment, favicon hash, status of an allowed relative path, bounded version regex.

## Schema

```yaml
apiVersion: surfacex/v1
kind: Signature
metadata:
  id: wordpress-core
  name: WordPress
  category: cms
  version: 1
spec:
  matchAny: false
  rules:
    - type: header
      name: link
      contains: "rel=\"https://api.w.org/\""
      weight: 30
    - type: cookie
      name: wordpress_logged_in
      weight: 20
    - type: html
      contains: "wp-content"
      weight: 20
    - type: path
      path: "/wp-login.php"
      status: [200, 302]
      weight: 30
    - type: versionRegex
      source: html
      pattern: "content=\"WordPress ([0-9]+\\.[0-9]+(?:\\.[0-9]+)?)\""
      weight: 20
  confidence:
    low: [1, 39]
    medium: [40, 69]
    high: [70, 100]
```

## Rule types

| Type | Fields | Description |
|---|---|---|
| `header` | `name`, `equals` / `contains` / `regex` (none: presence only) | response header |
| `cookie` | `name` | cookie name only, never the value |
| `html` | `contains` / `regex` | fragment of the page body |
| `favicon` | `hash` | favicon hash (mmh3) reported by httpx |
| `path` | `path`, `status` | the probed URL contains the path and (optionally) has one of the status codes |
| `status` | `status` | HTTP status code |
| `versionRegex` | `source` (`html` or a header name), `pattern` | extracts a version; the first capture group becomes `version` |

Each rule may have a `weight` (default 10). Text comparisons are case-insensitive.

## Safety limits

- `path` must be relative and start with `/`; `http://`, `https://` and hosts in the path are rejected.
- A regex may have at most 200 characters and is applied to the first 32 KiB of input; an invalid pattern is skipped.
- At most 64 KiB of page body is analyzed.
- Cookie values are never compared or stored.
- A signature makes no extra requests. It only works on responses httpx already collected.
- `matchAny: false` sums the weights of all matching rules; `true` stops at the first match.

## Confidence score

Default weights: distinctive header `30`, cookie name `20`, favicon hash `40`, HTML fragment `20`, unambiguous banner or footer `30`. Agreeing signals add up to a maximum of `100`. A single weak signal cannot reach `high`.

## Minimal example

```yaml
apiVersion: surfacex/v1
kind: Signature
metadata:
  id: nginx-server
  name: nginx
  category: http-server
  version: 1
spec:
  matchAny: true
  rules:
    - type: header
      name: server
      contains: "nginx"
      weight: 40
```

## Adding a signature

1. Save `signatures/<name>.yaml` (one `kind: Signature` document per file).
2. Rebuild the images that include the signatures directory:

   ```bash
   docker compose up --build -d api worker
   ```

3. Run a scan with the `signatures` or `full-pipeline` module.
4. Check **Findings** for `signature` observations with `signature_id`, `technology`, `confidence`, `level`, `version` and `evidence` (the matched rules).

Signatures load when the worker process starts, so a change needs an image rebuild. A file with invalid YAML or without `kind: Signature` is skipped. Built in: `wordpress-core`, `nginx-server`, `apache-httpd`.

## Known limitations

- Signatures are repository files; there is no UI editor or database versioning.
- httpx probes the root of each endpoint (`scheme://host:port`), so a `path` rule matches only if the path is part of the probed URL. The `pathsExtra` filter of the `signatures` module is validated but does not yet cause extra requests.
- The `pack` and `minConfidence` filters of the `signatures` module do not narrow the set yet; all loaded signatures are matched.
