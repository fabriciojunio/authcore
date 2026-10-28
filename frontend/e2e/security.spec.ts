import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Collects console errors (CSP and Trusted Types violations included) and off-site requests. */
function watch(page: Page) {
  const problems: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol !== 'data:') problems.push(`off-site: ${request.url()}`)
  })
  return problems
}

test('serves the security headers on the page and on SPA routes', async ({ request }) => {
  for (const path of ['/', '/login', '/dashboard']) {
    const headers = (await request.get(path)).headers()
    expect(headers['content-security-policy'], path).toContain("default-src 'none'")
    expect(headers['content-security-policy'], path).toContain("require-trusted-types-for 'script'")
    expect(headers['strict-transport-security'], path).toContain('max-age=63072000')
    expect(headers['x-frame-options'], path).toBe('DENY')
    expect(headers['x-content-type-options'], path).toBe('nosniff')
  }
})

test('loads only from its own origin, with no CSP violation, and is accessible', async ({ page }) => {
  const problems = watch(page)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  expect(await page.locator('script:not([src])').count()).toBe(0)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(violations.map((v) => v.id)).toEqual([])
  expect(problems).toEqual([])
})

test('demo mode works under the strict policy', async ({ page }) => {
  const problems = watch(page)
  await page.goto('/login')
  await page.getByRole('button', { name: 'Entrar como demonstração' }).click()
  await expect(page).not.toHaveURL(/\/login$/)
  await expect(page.getByRole('main')).toBeVisible()
  expect(problems.filter((p) => !p.includes('Failed to load resource'))).toEqual([])
})
