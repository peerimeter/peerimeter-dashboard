export type Network = { version: number; id: string; name: string; cidr: string }
export type Peer = {
  version: number
  node_id: string
  public_key: string
  tunnel_address?: string
  listen_port?: number
  local_addresses?: string[]
  public_endpoint?: string
}

export function defaultServiceURL(configured: string | undefined, origin: string): string {
  return configured?.trim() || origin
}

export class ServiceAPI {
  readonly baseURL: string
  readonly key: string

  constructor(baseURL: string, key: string) {
    this.baseURL = baseURL.replace(/\/+$/, '')
    this.key = key
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.key}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`
      try {
        const body = await response.json() as { error?: string }
        if (body.error) message = body.error
      } catch { /* Keep the HTTP status when the service has no JSON error. */ }
      throw new Error(message)
    }
    if (response.status === 204 || response.status === 201) return undefined as T
    return response.json() as Promise<T>
  }

  async verify(): Promise<void> { await this.request('/api/v1/networks') }
  async networks(): Promise<Network[]> {
    const result = await this.request<{ networks: Record<string, Network> }>('/api/v1/networks')
    return Object.values(result.networks ?? {}).sort((a, b) => a.name.localeCompare(b.name))
  }
  async createNetwork(network: Network): Promise<void> {
    await this.request('/api/v1/networks', { method: 'POST', body: JSON.stringify(network) })
  }
  async peers(networkID: string): Promise<Peer[]> {
    const result = await this.request<{ peers: Record<string, Peer> }>(
      `/api/v1/networks/${encodeURIComponent(networkID)}/nodes/dashboard/peers`,
    )
    return Object.values(result.peers ?? {}).sort((a, b) => a.node_id.localeCompare(b.node_id))
  }
  async peerConfig(networkID: string, peerID: string): Promise<Record<string, unknown> | null> {
    try {
      return await this.request(`/api/v1/networks/${encodeURIComponent(networkID)}/nodes/${encodeURIComponent(peerID)}/config`)
    } catch (error) {
      if (error instanceof Error && error.message === 'configuration not found') return null
      throw error
    }
  }
  async savePeerConfig(networkID: string, peerID: string, config: Record<string, unknown>): Promise<void> {
    await this.request(`/api/v1/networks/${encodeURIComponent(networkID)}/nodes/${encodeURIComponent(peerID)}/config`, {
      method: 'PUT', body: JSON.stringify(config),
    })
  }
  async joinToken(networkID: string): Promise<string> {
    const result = await this.request<{ token: string }>(`/api/v1/join-bundle?network_id=${encodeURIComponent(networkID)}`)
    return result.token
  }
}

export function joinCommands() {
  const unix = `curl -fsSL https://agent.peerimeter.app/install.sh | sudo sh\nbash -c 'read -rsp "Paste the join token: " PEERIMETER_JOIN_TOKEN </dev/tty\nprintf "\\n"\nprintf "%s" "$PEERIMETER_JOIN_TOKEN" | sudo peerimeter-agent join\nunset PEERIMETER_JOIN_TOKEN'`
  const powershell = `& {\n  irm https://agent.peerimeter.app/install.ps1 | iex\n  $secureToken = Read-Host 'Paste the join token' -AsSecureString\n  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)\n  try {\n    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | & "$env:ProgramFiles\\Peerimeter\\peerimeter-agent.exe" join\n  }\n  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); Remove-Variable secureToken }\n}`
  return { unix, powershell }
}
