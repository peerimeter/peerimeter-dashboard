import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultServiceURL, joinCommands, normalizeServiceURL, readStoredServiceURLs, rememberServiceURL, savedServiceURLs, ServiceAPI } from './api'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('ServiceAPI', () => {
  it('normalizes the service URL and sends the shared bearer key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ networks: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    const api = new ServiceAPI('https://service.example.com///', 'secret-key')
    await api.networks()
    expect(fetcher).toHaveBeenCalledWith('https://service.example.com/api/v1/networks', expect.objectContaining({
      headers: { Authorization: 'Bearer secret-key' },
    }))
  })

  it('sorts networks by display name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ networks: {
      z: { version: 1, id: 'z', name: 'Zulu', cidr: '10.2.0.0/24' },
      a: { version: 1, id: 'a', name: 'Alpha', cidr: '10.1.0.0/24' },
    } }), { status: 200 })))
    const networks = await new ServiceAPI('https://service.example.com', 'key').networks()
    expect(networks.map((network) => network.name)).toEqual(['Alpha', 'Zulu'])
  })

  it('accepts empty successful responses for write operations', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    const api = new ServiceAPI('https://service.example.com', 'key')

    await expect(api.createNetwork({ version: 1, id: 'mesh', name: 'Mesh', cidr: '10.0.0.0/24' })).resolves.toBeUndefined()
    await expect(api.savePeerConfig('mesh', 'node', { version: 1 })).resolves.toBeUndefined()
  })

  it('surfaces structured service errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'network CIDR overlaps an existing network' }), { status: 409 })))
    await expect(new ServiceAPI('https://service.example.com', 'key').verify()).rejects.toThrow('network CIDR overlaps an existing network')
  })

  it('uses URL encoded network and peer identifiers', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ peers: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await new ServiceAPI('https://service.example.com', 'key').peers('mesh one')
    expect(fetcher.mock.calls[0][0]).toBe('https://service.example.com/api/v1/networks/mesh%20one/peers')
  })

  it('rejects remote HTTP service URLs before sending credentials', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(new ServiceAPI('http://service.example.com', 'secret-key', false).verify()).rejects.toThrow('must use HTTPS')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('allows remote HTTP when explicitly enabled', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ networks: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await new ServiceAPI('http://service.example.com', 'secret-key', true).verify()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('reads the insecure HTTP override from the Vite environment', async () => {
    vi.stubEnv('VITE_ALLOW_INSECURE_HTTP', 'true')
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ networks: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await new ServiceAPI('http://service.example.com', 'secret-key').verify()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each(['http://localhost:8080', 'http://127.0.0.1:8080', 'http://[::1]:8080'])('allows HTTP loopback URL %s', async (url) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ networks: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await new ServiceAPI(url, 'secret-key').verify()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('requests a join bundle for the selected network', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'bundle' }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await new ServiceAPI('https://service.example.com', 'key').joinToken('mesh one')
    expect(fetcher.mock.calls[0][0]).toBe('https://service.example.com/api/v1/join-bundle?network_id=mesh%20one')
  })
})

describe('defaultServiceURL', () => {
  it('uses the configured default and falls back to the app origin', () => {
    expect(defaultServiceURL(' https://api.example.test/ ', 'https://dashboard.example.test')).toBe('https://api.example.test/')
    expect(defaultServiceURL(undefined, 'https://dashboard.example.test')).toBe('https://dashboard.example.test')
    expect(defaultServiceURL('  ', 'https://dashboard.example.test')).toBe('https://dashboard.example.test')
  })
})

describe('service URL storage helpers', () => {
  it('normalizes whitespace and trailing slashes', () => {
    expect(normalizeServiceURL('  https://service.example.test///  ')).toBe('https://service.example.test')
  })

  it('reads only string URLs and handles malformed or unavailable storage', () => {
    expect(readStoredServiceURLs({ getItem: () => '["https://one.test", 42, null]' })).toEqual(['https://one.test'])
    expect(readStoredServiceURLs({ getItem: () => '{bad json' })).toEqual([])
    expect(readStoredServiceURLs({ getItem: () => { throw new Error('storage unavailable') } })).toEqual([])
  })

  it('falls back to the normalized default URL when the localStorage getter throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('storage unavailable') },
    })

    try {
      expect(savedServiceURLs(' https://default.example.test/// ', 'https://dashboard.example.test')).toEqual(['https://default.example.test'])
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })
})

describe('savedServiceURLs', () => {
  it('retains the configured default and remembers only successful service URLs', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }
    expect(savedServiceURLs(' https://default.example/ ', 'https://dashboard.example', storage)).toEqual(['https://default.example'])
    rememberServiceURL('https://connected.example/', storage)
    expect(savedServiceURLs('https://default.example', 'https://dashboard.example', storage)).toEqual(['https://default.example', 'https://connected.example'])
  })
})

describe('joinCommands', () => {
  it('pipes the network-scoped token from a hidden prompt on Unix and Windows', () => {
    const commands = joinCommands()
    expect(commands.unix).toContain('read -rsp "Paste the join token: "')
    expect(commands.unix).toContain('sudo peerimeter-agent join')
    expect(commands.unix).not.toContain('--network-id')
    expect(commands.powershell).toContain("Read-Host 'Paste the join token' -AsSecureString")
    expect(commands.powershell).toContain('Peerimeter\\peerimeter-agent.exe" join')
    expect(commands.powershell).not.toContain('--network-id')
  })
})
