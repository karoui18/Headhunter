import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('Discover has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore 42 sample jobs' }).click();
  await expect(page.getByTestId('job-card')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
});
