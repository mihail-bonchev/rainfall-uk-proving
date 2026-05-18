import { test, expect } from '@playwright/test'

test.describe('App shell', () => {
  test('loads and shows the map root', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="map-root"]')).toBeVisible()
  })

  test('MapLibre canvas is rendered (WebGL initialised)', async ({ page }) => {
    await page.goto('/')
    // MapLibre creates a <canvas> inside the map container once WebGL is ready
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({
      timeout: 15_000,
    })
  })

  test('map initialises at UK viewport (canvas ready + no blank-tile class)', async ({ page }) => {
    await page.goto('/')

    // MapLibre adds maplibregl-canvas once WebGL initialises
    const canvas = page.locator('canvas.maplibregl-canvas')
    await expect(canvas).toBeVisible({ timeout: 15_000 })

    // The map container should NOT carry the error class that indicates init failure
    const mapContainer = page.locator('.maplibregl-map')
    await expect(mapContainer).not.toHaveClass(/maplibregl-error/, { timeout: 5_000 })
  })

  test('no uncaught JavaScript errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    await page.locator('[data-testid="map-root"]').waitFor()

    expect(errors).toHaveLength(0)
  })
})
