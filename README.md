# Peerimeter Dashboard

The Peerimeter Dashboard is a small React and TypeScript control panel for the
current Peerimeter Service API. It supports API-key or configured GitHub SSO sign-in, creating and
listing managed networks, listing registered peers, editing peer display
metadata, deleting peers, and copying install/join commands for Linux, macOS,
and Windows.

![Slow demonstration of dashboard sign-in, network creation, peer editing, and join commands](public/dashboard-demo.gif)

## Current API limits

The dashboard follows the service's current API. API-key sign-in is controlled
by the service and defaults off when GitHub SSO is configured. GitHub SSO only
admits active members of the configured organization team. API keys and the
selected auth mode are kept in browser `sessionStorage` for the active tab
session; GitHub sessions use an HttpOnly service cookie. Peer
registration details are read-only. The dashboard saves a display name and
notes as the peer's version 1 node config document. Deleting a peer revokes its
registration and removes its saved node config; the agent must join again to
reconnect. Network deletion and network edits are not supported by the current
API.

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

Requirements: Node.js 22, npm, and GNU Make. If `make` is not already
available, install it with your operating system's package manager (for
example, `sudo apt install make` on Debian or Ubuntu). On macOS, install it with
`brew install make`, then add Homebrew's GNU Make binary to the current shell's
`PATH` with `export PATH="$(brew --prefix make)/libexec/gnubin:$PATH"`.
On Windows, use WSL, which provides the Unix utilities used by `make env` too.

Set `VITE_SERVICE_URL` in a `.env` file to prefill the API URL on the login
screen. Vite embeds this public URL into the frontend build; never put API keys
or other secrets in `VITE_*` variables. See [.env.example](.env.example).
Remote service URLs must use HTTPS by default; HTTP loopback URLs are allowed
for local development. To disable this check, set
`VITE_ALLOW_INSECURE_HTTP=true` in `.env` before starting Vite or building the
dashboard. This build-time option allows HTTP service URLs, which expose the
shared API key in transit; use it only on trusted networks. It only relaxes the
service URL check; it does not add TLS to the dashboard server or override a
browser's mixed-content blocking of HTTP API requests from an HTTPS dashboard.

```sh
make install
make env # optional: create .env from .env.example
make run
```

The Vite development and preview servers listen on `0.0.0.0`, making them
reachable through the host's network interfaces. They serve plain HTTP and
have no login gate of their own. Restrict the Vite port to trusted clients; for
shared or untrusted networks, put an authenticated HTTPS reverse proxy in front
and block direct access to the Vite port. The dashboard's API-key sign-in does
not protect the JavaScript served over HTTP from on-path modification. Under
WSL 2's default NAT networking, LAN clients generally need port forwarding;
mirrored networking can provide LAN access subject to firewall rules. See
[Microsoft's WSL networking guide](https://learn.microsoft.com/windows/wsl/networking).

Run `make demo-gif` to regenerate the README demonstration (requires ffmpeg).

Run checks before submitting changes:

```sh
make test
make test-e2e
make test-ui
make lint
make build
make audit
```

For a production build, run `make build`; the static site is emitted to
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
