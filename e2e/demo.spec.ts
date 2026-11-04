import { expect, test } from "@playwright/test";
import { DEMO } from "../src/lib/demo";

// Who should see Payroll and Settings in the menu, by demo role.
const PAYROLL = new Set(["owner", "general-manager", "hr"]);

// Criterion 44: each demo account signs in with one click and lands on the home screen for its role.
for (const role of DEMO.roles) {
  test(`demo sign-in: ${role.key}`, async ({ page }) => {
    await page.goto("/");
    await page.locator(`a[href="/demo/${role.key}"]`).click();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText("in a made-up business")).toBeVisible();
    await expect(page.getByText(DEMO.name).first()).toBeVisible();
    const nav = page.locator("aside nav");
    await expect(nav.getByRole("link", { name: "Payroll" })).toHaveCount(PAYROLL.has(role.key) ? 1 : 0);
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(role.key === "owner" ? 1 : 0);
  });
}

test("an agent typing the payroll address is sent back", async ({ page }) => {
  await page.goto("/demo/staff");
  await page.goto("/payroll");
  await expect(page).toHaveURL(/\/payslips/);
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fhistory/);
});

test("the owner sees the finalized period's payslips @phone", async ({ page }) => {
  await page.goto("/demo/owner");
  await page.goto("/payroll");
  // The newest period is the open one; the one before it is finalized with payslips.
  await page.locator('a[href^="?period="]').nth(1).click();
  await expect(page.getByText("Finalized on")).toBeVisible();
  await expect(page.getByText(/Total \(\d+\)/)).toBeVisible();
  // No horizontal page scroll at phone width (tables scroll inside their card).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
