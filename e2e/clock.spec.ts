import { expect, test, type Browser } from "@playwright/test";

// Demo Company, an employee in Pasig East (a polygon around 14.577, 121.088).
test.use({ permissions: ["geolocation"], geolocation: { latitude: 14.577, longitude: 121.088, accuracy: 8 } });

// The demo has the face check on and time in from 5:00 AM. These tests are about time, not faces or
// the hour they run, so the owner switches those off while they run and back on afterwards.
async function setRules(browser: Browser, on: boolean) {
  const page = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  await page.goto("/demo/owner");
  await page.goto("/settings/general");
  const face = page.locator("li", { hasText: "Face match with a liveness challenge" }).getByRole("button");
  if ((await face.getAttribute("aria-pressed")) !== String(on)) {
    await face.click();
    await expect(face).toHaveAttribute("aria-pressed", String(on));
  }
  await page.getByLabel("Earliest time in (blank for any time)").fill(on ? "05:00" : "");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved");
  await page.close();
}
test.beforeAll(({ browser }) => setRules(browser, false));
test.afterAll(({ browser }) => setRules(browser, true));

test.beforeEach(async ({ page }) => {
  await page.goto("/demo/employee");
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/today");
  // The seed may have this person already working today; start from timed out.
  const out = page.getByRole("button", { name: "Time out" });
  if (await out.isVisible()) {
    const cont = page.getByRole("button", { name: "Continue" });
    if (await cont.isVisible()) {
      await cont.click();
      await expect(page.getByRole("button", { name: "Break" })).toBeVisible();
    }
    await out.click();
    await expect(page.getByRole("status")).toContainText(/Timed out|Recorded/);
  }
});

// Criterion 8: changing the device's clock has no effect on recorded times.
test("time in records the server's time even when the device clock is wrong", async ({ page, request }) => {
  await page.clock.setFixedTime(new Date("2030-01-01T09:00:00Z"));
  await page.reload();
  await page.getByRole("button", { name: "Time in" }).click();
  await expect(page.getByRole("status")).toContainText(/Timed in|Recorded/, { timeout: 20_000 });

  await page.clock.setSystemTime(new Date());
  await page.goto("/history");
  const serverToday = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" }).format(new Date());
  await expect(page.getByText(serverToday).first()).toBeVisible();
  await expect(page.getByText("1 Jan 2030")).toHaveCount(0);
  void request;
});

test("break, continue and time out", async ({ page }) => {
  await page.getByRole("button", { name: "Time in" }).click();
  await expect(page.getByRole("button", { name: "Break" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Break" }).click();
  await expect(page.getByText("On a break")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Break" })).toBeVisible();
  await page.getByRole("button", { name: "Time out" }).click();
  await expect(page.getByRole("status")).toContainText(/Timed out|Recorded/, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Time in" })).toBeVisible();
});

test.describe("outside the fence", () => {
  test.use({ geolocation: { latitude: 14.6, longitude: 121.1, accuracy: 8 } });
  test("is accepted but flagged with the reason (flag policy)", async ({ page }) => {
    await page.getByRole("button", { name: "Time in" }).click();
    await expect(page.getByRole("status")).toContainText("flagged for your manager to review: outside the site", { timeout: 20_000 });
  });
});
