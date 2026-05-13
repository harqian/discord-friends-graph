# Embedding a Discord Lattice Share

A published Discord Lattice share file is a single self-contained `.html`
document. It carries everything it needs to render (the vis-network library,
the viewer code, your graph data) so it works offline, with no extension
installed, and inside an `<iframe>` on any site you control.

## Quick start

After you click **Export Shareable Page** in the popup, you'll get a file like
`discord-lattice-share-2026-05-12T...html`. Upload it to any static host
(GitHub Pages, Netlify drop, S3 + CloudFront, your personal site) and embed
it with:

```html
<iframe
  src="https://example.com/path/to/discord-lattice-share.html"
  width="100%"
  height="600"
  style="border: 0; border-radius: 8px;"
  loading="lazy"
  title="Discord friend graph"
></iframe>
```

That's it. The graph + search + selection all work inside the iframe; the
search modal and info card stay inside the iframe boundary.

## URL flags

| Flag | Effect |
|---|---|
| `?embed=1` | Apply the compact embed styling even when not in an iframe. Useful if you wrap the page with something other than `<iframe>` (e.g. Webview / Electron). |

Detection of iframe context (`window.self !== window.top`) is automatic; the
`?embed=1` flag exists only for the rare case where that check is wrong.

## Hosting options

The published file has no special hosting requirements. Any static-hosting
provider works:

- **GitHub Pages** — commit the `.html` to a `gh-pages` branch (or any repo
  with Pages enabled) and the file is live at
  `https://<user>.github.io/<repo>/<file>.html`.
- **Netlify drop** — drag and drop the file at <https://app.netlify.com/drop>
  for an instant URL.
- **Cloudflare Pages** — `wrangler pages deploy` a directory containing the
  file.
- **S3 + CloudFront** — put it in a bucket, point a CloudFront distribution at
  it, that's it.
- **Your own site** — copy the file into your static-asset pipeline.

## HTTPS / mixed content

If the host page is served over HTTPS, the iframe `src` must also be HTTPS,
or browsers will block it as mixed content. GitHub Pages and Netlify are
HTTPS by default, so this is usually a non-issue.

## What the file contains

Look at View Source. You'll see:

- The full `vis-network` library (~1.43 MB)
- A short CSS block for the viewer
- A `<script type="application/json" id="lattice-share-data">...</script>`
  block — that's the graph data, in the `shareEnvelopeV1` format
  ([spec](./lib/share-envelope.md))
- A small JS bootstrap that reads that JSON and hands it to the renderer
- The graph renderer itself

If you exported with **Hide names** or **Hide avatars** turned on, those
fields are already replaced with placeholders inside the JSON before the file
was generated. The original values are not recoverable from the file.

## Privacy notes

The file is what you publish: nothing more, nothing less. Anyone who can
fetch the URL can read everything in the file. In particular:

- **Discord user IDs are always present** in the JSON, even when you hide
  names and avatars. That's what makes cross-user merging possible.
- The file does not phone home and does not load any external resources at
  runtime (the default-avatar URL is a Discord CDN image, hit only if you
  *did not* enable Hide avatars).
- The only way to revoke a published share is to delete the file from your
  host. There is no remote revocation.

See [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) for the full policy.

## Sizing inside the iframe

The viewer fills its container. You control width/height via the iframe
attributes. Common patterns:

```html
<!-- fixed height -->
<iframe src="..." width="100%" height="600" style="border:0"></iframe>

<!-- responsive square -->
<div style="aspect-ratio: 1 / 1; max-width: 800px;">
  <iframe src="..." style="width:100%; height:100%; border:0;"></iframe>
</div>

<!-- responsive 16:9 -->
<div style="aspect-ratio: 16 / 9; max-width: 1100px;">
  <iframe src="..." style="width:100%; height:100%; border:0;"></iframe>
</div>
```
