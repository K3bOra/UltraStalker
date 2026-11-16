# Ultra Stalker Web relay

Small Cloudflare Worker used by the website in `web/`. Browsers can't talk to IPTV
portals directly (MAC cookie, MAG User-Agent, plain http, no CORS), so the site sends
each request through this Worker. It only answers pages from `https://k3bora.github.io`
(and localhost for testing).

Deploys by itself from GitHub Actions (`.github/workflows/web-relay.yml`) whenever
`worker/**` changes, or with **Run workflow**. It needs two repository secrets:

- `CLOUDFLARE_API_TOKEN` — a token from the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID`

After deploying, the workflow writes the Worker address to `web/config.js`.

Free plan limits: 100,000 requests a day. API calls and pictures are small; playing
video inside the browser also goes through the Worker. Playing in VLC / MX / Outplayer
connects to the provider directly and costs nothing here.
