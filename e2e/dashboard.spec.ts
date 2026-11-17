import { expect, test } from '@playwright/test'

const initialNetwork = { version: 1, id: 'office', name: 'Office mesh', cidr: '10.90.0.0/24' }
const registeredPeer = {
  version: 1,
  node_id: 'workstation-1',
  public_key: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  tunnel_address: '10.90.0.1',
  listen_port: 51820,
  local_addresses: ['192.168.1.10/24'],
  public_endpoint: '198.51.100.20:51820',
  primary_interface: 'en0',
}

async function demoPause(page: import('@playwright/test').Page) {
  if (process.env.PEERIMETER_DEMO) await page.waitForTimeout(1800)
}

test('API-key login, network creation, peer editing, and platform join commands', async ({ page }, testInfo) => {
  let networks = [initialNetwork]
  let savedPeer: Record<string, unknown> | null = null
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.headers().authorization !== 'Bearer test-api-key') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) })
      return
    }
    if (url.pathname === '/api/v1/networks' && request.method() === 'GET') {
      await route.fulfill({ json: { version: 1, networks: Object.fromEntries(networks.map((network) => [network.id, network])) } })
      return
    }
    if (url.pathname === '/api/v1/networks' && request.method() === 'POST') {
      networks = [...networks, request.postDataJSON()]
      await route.fulfill({ status: 201 })
      return
    }
    if (url.pathname === '/api/v1/networks/office/peers') {
      await route.fulfill({ json: { version: 1, peers: { [registeredPeer.node_id]: registeredPeer } } })
      return
    }
    if (url.pathname === '/api/v1/networks/office/nodes/workstation-1/config' && request.method() === 'GET') {
      if (savedPeer) await route.fulfill({ json: savedPeer })
      else if (process.env.PEERIMETER_DEMO) await route.fulfill({ json: { version: 1 } })
      else await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'configuration not found' }) })
      return
    }
    if (url.pathname === '/api/v1/networks/office/nodes/workstation-1/config' && request.method() === 'PUT') {
      savedPeer = request.postDataJSON()
      await route.fulfill({ status: 204 })
      return
    }
    if (url.pathname === '/api/v1/join-bundle') {
      expect(url.searchParams.get('network_id')).toBe('office')
      await route.fulfill({ json: { token: 'test-join-bundle-token' } })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /your networks/i })).toBeVisible()
  await page.getByRole('textbox', { name: 'Service URL' }).fill('http://127.0.0.1:5173')
  await page.getByLabel('API key').fill('test-api-key')
  await page.getByRole('button', { name: 'Connect to service' }).click()
  await expect(page.getByRole('heading', { name: 'Office mesh' })).toBeVisible()
  await demoPause(page)
  await expect(page.getByText('workstation-1')).toBeVisible()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('peerimeter.session'))).toContain('test-api-key')
  expect(await page.evaluate(() => localStorage.getItem('peerimeter.serviceURLs'))).toContain('http://127.0.0.1:5173')
  await page.screenshot({ path: testInfo.outputPath('dashboard-network.png'), fullPage: true })

  await page.getByRole('button', { name: 'Create network' }).first().click()
  await page.getByLabel('Network name').fill('Lab mesh')
  await expect(page.getByLabel('Network ID')).toHaveValue('lab-mesh')
  await page.getByLabel('Private IPv4 CIDR').fill('10.91.0.0/24')
  await page.getByRole('button', { name: 'Create network', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Lab mesh' })).toBeVisible()
  await demoPause(page)
  expect(networks.at(-1)).toMatchObject({ id: 'lab-mesh', name: 'Lab mesh', cidr: '10.91.0.0/24', version: 1 })

  await page.getByRole('button', { name: 'Office mesh' }).click()
  await expect(page.getByRole('heading', { name: 'Office mesh' })).toBeVisible()
  await page.getByRole('row', { name: /workstation-1/ }).click()
  await expect(page.getByRole('heading', { name: 'workstation-1' })).toBeVisible()
  await demoPause(page)
  await expect(page.getByText('Primary interface')).toBeVisible()
  await expect(page.getByText(/en0.*192.168.1.10\/24/)).toBeVisible()
  await page.getByLabel('Display name').fill('Design Mac')
  await page.getByLabel('Notes').fill('Studio workstation')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('row', { name: /Design Mac/ })).toBeVisible()
  await demoPause(page)
  expect(savedPeer).toMatchObject({ version: 1, name: 'Design Mac', notes: 'Studio workstation' })

  await page.getByRole('button', { name: 'Add a peer' }).click()
  await expect(page.getByText('Linux & macOS')).toBeVisible()
  await demoPause(page)
  await page.screenshot({ path: testInfo.outputPath('join-commands.png'), fullPage: true })
  await expect(page.getByText('Windows', { exact: true })).toBeVisible()
  await expect(page.locator('pre').nth(0)).toContainText('sudo peerimeter-agent join')
  await expect(page.locator('pre').nth(0)).not.toContainText('--network-id')
  await expect(page.locator('pre').nth(1)).toContainText('Read-Host')
  await expect(page.locator('pre').nth(1)).toContainText('peerimeter-agent.exe" join')
  await expect(page.locator('pre').nth(1)).not.toContainText('test-join-bundle-token')
  await expect(page.getByText(/only to this network/i)).toBeVisible()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy token' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('test-join-bundle-token')
})

test('invalid API key stays on the login screen and shows the service error', async ({ page }) => {
  await page.route('**/api/v1/networks', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) })
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Service URL' }).fill('http://127.0.0.1:5173')
  await page.getByLabel('API key').fill('wrong-key')
  await page.getByRole('button', { name: 'Connect to service' }).click()
  await expect(page.getByText('unauthorized')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect to service' })).toBeVisible()
})
