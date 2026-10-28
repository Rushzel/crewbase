import { expect, test } from "@playwright/test";

// Criterion 44: each demo account signs in with one click and lands on the right screen.
for (const business of ["harbor", "northgate"] as const) {
  for (const role of ["owner", "manager", "employee"] as const) {
    test(`demo sign-in: ${business} ${role}`, async ({ page }) => {
      await page.goto("/");
      await page.locator(`a[href="/demo/${business}/${role}"]`).click();
      await expect(page).toHaveURL(/\/today/);
      await expect(page.getByText("You're using a demo account")).toBeVisible();
      await expect(page.getByText(business === "harbor" ? "Harbor Lane Café" : "Northgate Logistics").first()).toBeVisible();
      const nav = page.locator("aside nav");
      if (role === "owner") {
        await expect(nav.getByRole("link", { name: "Payroll" })).toBeVisible();
        await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
      } else {
        await expect(nav.getByRole("link", { name: "Payroll" })).toHaveCount(0);
        await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
      }
    });
  }
}

test("an employee typing the payroll address is sent back", async ({ page }) => {
  await page.goto("/demo/harbor/employee");
  await page.goto("/payroll");
  await expect(page).toHaveURL(/\/payslips/);
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fhistory/);
});

test("the owner sees the finalized period's payslips @phone", async ({ page }) => {
  await page.goto("/demo/northgate/owner");
  await page.goto("/payroll");
  // The newest period is the open one; the one before it is finalized with payslips.
  await page.locator('a[href^="?period="]').nth(1).click();
  await expect(page.getByText("Finalized on")).toBeVisible();
  await expect(page.getByText(/Total \(\d+\)/)).toBeVisible();
  // No horizontal page scroll at phone width (tables scroll inside their card).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
