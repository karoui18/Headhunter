import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { test, expect } from '@playwright/test';
async function seed(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore 42 sample jobs' }).click();
  await expect(page.getByTestId('job-card')).toBeVisible();
}
test('select persists after reload, undo restores queue', async ({ page }) => {
  await seed(page);
  const title = await page.getByTestId('job-card').getByRole('heading').innerText();
  await page.getByRole('button', { name: 'Select job', exact: true }).click();
  await expect(page.getByText('Selected ✓', { exact: true })).toBeVisible();
  await page.reload();
  await page.evaluate(() => (location.hash = 'selected'));
  await expect(page.getByRole('heading', { name: 'The shortlist' })).toBeVisible();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.evaluate(() => (location.hash = 'discover'));
  if (test.info().project.name === 'chromium') {
    await page.keyboard.press('z');
    await expect(page.getByTestId('job-card').getByRole('heading')).toHaveText(title);
  }
});
test('reject persists, snooze is distinct and library can restore', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Reject job', exact: true }).click();
  await page.getByRole('button', { name: 'Salary', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reject job', exact: true }).click();
  await expect(page.getByText('Rejected ✓', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Snooze job', exact: true }).click();
  await expect(page.getByText('Snoozed — no preference penalty')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'View library' }).click();
  await expect(page.getByText('REJECTED', { exact: true })).toBeVisible();
  await expect(page.getByText('SNOOZED', { exact: true })).toBeVisible();
});
test('manual ingestion sanitizes content and scores stay explainable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Verified role');
  await page.getByLabel('Company', { exact: true }).fill('Test employer');
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/jobs/verified');
  await page
    .getByLabel('Job description')
    .fill('<script>window.hacked=true</script>Remote in France, 2 days per month in Paris.');
  await page.getByRole('button', { name: 'Add to job library' }).click();
  await expect(page.getByTestId('job-card')).toBeVisible();
  await expect(page.getByText('Remote in France')).not.toBeVisible();
  await page.getByRole('button', { name: 'Explore the full analysis' }).click();
  await page.getByRole('button', { name: 'Description', exact: true }).click();
  await expect(
    page.getByText('Remote in France, 2 days per month in Paris.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => 'hacked' in window)).toBe(false);
});
test('offline shell retains local decisions', async ({ page, context }) => {
  // Stop an isolated static server to test real network unavailability. This avoids
  // WebKit's internal navigation error under Playwright's synthetic offline toggle.
  const root = resolve('out');
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + '/')) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.setHeader(
        'Content-Type',
        (
          {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.webmanifest': 'application/manifest+json',
            '.png': 'image/png',
          } as Record<string, string>
        )[extname(file)] || 'application/octet-stream',
      );
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.getByRole('button', { name: 'Explore 42 sample jobs' }).click();
    await expect(page.getByTestId('job-card')).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.getByRole('button', { name: 'Select job', exact: true }).click();
    await expect(page.getByText('Selected ✓', { exact: true })).toBeVisible();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await page.reload();
    await expect(page.getByTestId('job-card')).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Snooze job', exact: true }).click();
    await expect(page.getByText('Snoozed — no preference penalty')).toBeVisible();
    await page.evaluate(() => (location.hash = 'selected'));
    await expect(page.getByRole('heading', { name: 'The shortlist' })).toBeVisible();
    await expect(page.locator('.job-row')).toHaveCount(1);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
test('profile, application package, submission and contact flow', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Select job', exact: true }).click();
  await page.evaluate(() => (location.hash = 'profile'));
  await page
    .getByLabel('Professional headline')
    .fill('Business analyst with verified transformation experience');
  await page.getByLabel('Resume name', { exact: true }).fill('Transformation CV');
  await page.getByLabel('Resume role family').fill('Transformation');
  await page
    .getByLabel('Resume text', { exact: true })
    .fill('Business analyst. Transformation delivery and stakeholder management.');
  await page.getByRole('button', { name: 'Add resume version' }).click();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  await page.evaluate(() => (location.hash = 'selected'));
  await page.getByRole('button', { name: 'Prepare all selected' }).click();
  await expect(page.getByText('Application packages prepared', { exact: true })).toBeVisible();
  await page.evaluate(() => (location.hash = 'apply'));
  await page.getByRole('button', { name: 'I reviewed this package — mark ready' }).click();
  await page.getByRole('button', { name: 'I submitted this application — mark applied' }).click();
  await page.evaluate(() => (location.hash = 'pipeline'));
  await expect(page.locator('.pipeline-card')).toHaveCount(1);
  await page.evaluate(() => (location.hash = 'contacts'));
  await page.getByRole('button', { name: 'Add contact', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Test Recruiter');
  await page.getByLabel('Company', { exact: true }).fill('Test employer');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('heading', { name: 'Test Recruiter' })).toBeVisible();
});
test('responsive layout and accessible controls', async ({ page }) => {
  await seed(page);
  await expect(page.getByRole('button', { name: 'Select job', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `test-results/workspace-${test.info().project.name}.png`,
    fullPage: true,
  });
});
