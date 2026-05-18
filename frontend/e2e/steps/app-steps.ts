import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'

const { Given, When, Then } = createBdd()

Given('I open the Rainfall Explorer application', async ({ page }) => {
  await page.goto('/')
})

When('the map has finished initialising', async ({ page }) => {
  await page.locator('canvas.maplibregl-canvas').waitFor({ timeout: 15_000 })
})

When('the map container is visible', async ({ page }) => {
  await page.locator('[data-testid="map-root"]').waitFor()
})

Then('I should see the map container on screen', async ({ page }) => {
  await expect(page.locator('[data-testid="map-root"]')).toBeVisible()
})

Then('the MapLibre canvas should be visible', async ({ page }) => {
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
})

Then('there should be no uncaught JavaScript errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  // Allow a moment for any deferred errors to surface
  await page.waitForTimeout(500)
  expect(errors).toHaveLength(0)
})

Then('the map should not show an error indicator', async ({ page }) => {
  const mapContainer = page.locator('.maplibregl-map')
  await expect(mapContainer).not.toHaveClass(/maplibregl-error/)
})

Then('the map controls should be present', async ({ page }) => {
  // MapLibre always renders an attribution control; its presence confirms the map is interactive
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible()
})
