# Peerimeter Dashboard

The Peerimeter Dashboard is a small React and TypeScript control panel for the
current Peerimeter Service API. It supports API-key sign-in, creating and
listing managed networks, listing registered peers, editing peer display
metadata, and copying install/join commands for Linux, macOS, and Windows.

## Current API limits

The dashboard follows the service's current shared-key API. The API key has
access to every network and registration. It is kept in browser `sessionStorage`
for the active tab session and is removed when the user disconnects. Peer
registration details are read-only: the service has no revoke, rename, or
registration update endpoint. The dashboard saves a display name and notes as
the peer's version 1 node config document. Network deletion and network edits
are not supported by the current API.

The service does not enable cross-origin browser requests by default. Set
`PEERIMETER_CORS_ALLOWED_ORIGINS` in the service environment to a comma-separated
list of exact dashboard origins (scheme and host, optional port; no path or
wildcard) when hosting the app separately. The dashboard origin must be
included. Alternatively, serve this static app and the service API behind one
HTTPS origin with a reverse proxy forwarding `/api/` to `peerimeter-service`.
The API key is a shared credential; use HTTPS and restrict access to trusted
dashboard origins.

Join commands obtain the network-specific bundle on demand; the bundle carries
the network ID so the agent does not need a separate network flag. The token
contains the same shared service API key, so keep it private and do not paste it
into public logs or tickets. The commands prompt for the token without echoing
it or placing it in shell history. The agent stores the token in its protected
state directory after joining. The agent join runs with
administrator privileges on Windows and root privileges on Linux/macOS.

## Development

Requirements: Node.js 22 and npm.

Set `VITE_SERVICE_URL` in a `.env` file to prefill the API URL on the login
screen. Vite embeds this public URL into the frontend build; never put API keys
or other secrets in `VITE_*` variables. See [.env.example](.env.example).

```sh
npm ci
npm run dev
```

Run checks before submitting changes:

```sh
npm test
npm run test:e2e
npm run test:ui
npm run lint
npm run build
npm audit --audit-level=moderate
```

For a production build, run `npm run build`; the static site is emitted to
`dist/`. Browser tests use Playwright and mock the service API so they do not
need a running Peerimeter deployment. Install the browser and system
dependencies with `npx playwright install --with-deps chromium` before running
`npm run test:e2e`. `npm run test:ui` opens Playwright's
interactive test runner. Configure your web server to serve the dashboard files and reverse
proxy `/api/` to the Peerimeter Service on the same host and HTTPS origin. The
dashboard defaults its service URL to the current origin; on sign-in, provide
the origin that exposes the API root.

## License

MIT. See [LICENSE](LICENSE).
