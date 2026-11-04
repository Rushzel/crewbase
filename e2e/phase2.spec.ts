import { expect, test, type Page } from "@playwright/test";

// Phase 2: team leaders, areas, sales and leave in the field demo (Northgate Solar).

async function signIn(page: Page, role: string) {
  await page.goto(`/demo/northgate/${role}`);
  await expect(page).toHaveURL(/\/home/);
}

// A working day (Monday to Saturday) far enough ahead that reruns rarely collide.
function futureWorkday(): string {
  const d = new Date(Date.now() + (200 + Math.floor(Math.random() * 150)) * 86_400_000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Criterion 47: a team leader sees their area's people and no one else's.
test("a team leader's Team today shows only their area", async ({ page }) => {
  await signIn(page, "team-leader");
  await page.goto("/team");
  const table = page.locator("table");
  await expect(table.getByText("Abby Cruzado")).toBeVisible();
  await expect(table.getByText("Mark Ilagan")).toBeVisible();
  // Agents in Marikina and Cainta, and the unassigned agents, are not in this leader's team.
  await expect(table.getByText("Ely Sarmiento")).toHaveCount(0);
  await expect(table.getByText("Dom Pangilinan")).toHaveCount(0);
});

test("operations sees every area and who has none", async ({ page }) => {
  await signIn(page, "operations");
  await page.goto("/areas");
  for (const area of ["Pasig East", "Marikina", "Cainta"]) await expect(page.getByRole("link", { name: area })).toBeVisible();
  await expect(page.getByText("Not in any area")).toBeVisible();
  await expect(page.getByText("Dom Pangilinan")).toBeVisible();
});

// Criteria 54, 55 and 57: log a sale, the customer confirms with the link, operations approves.
test("a sale goes from logged to confirmed to approved", async ({ page, browser }) => {
  const customer = `Test Customer ${Date.now()}`;
  await signIn(page, "staff");
  await page.goto("/sales");
  const kit = await page.locator("#product option", { hasText: "Solar starter kit" }).getAttribute("value");
  await page.getByLabel("Product").selectOption(kit!);
  await page.getByLabel("Customer name").fill(customer);
  await page.getByLabel("Customer email").fill(`test.${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Log sale" }).click();
  await expect(page.getByRole("status")).toContainText("Logged");
  const link = await page.locator("code").first().textContent();
  expect(link).toMatch(/\/verify\/[0-9a-f]{48}$/);

  // The customer, not signed in, opens the link and confirms with a button press.
  const visitor = await browser.newContext();
  const tab = await visitor.newPage();
  await tab.goto(new URL(link!).pathname);
  await tab.getByRole("button", { name: "Yes, I applied" }).click();
  await expect(tab.getByRole("heading", { name: "Thank you" })).toBeVisible();
  // The link works once.
  await tab.goto(new URL(link!).pathname);
  await tab.getByRole("button", { name: "Yes, I applied" }).click();
  await expect(tab.getByRole("heading", { name: "This link doesn’t work" }).or(tab.getByRole("heading", { name: "This link doesn't work" }))).toBeVisible();
  await visitor.close();

  // The agent can't approve their own sale; operations can.
  await page.goto("/sales?status=for_approval");
  await expect(page.getByRole("row", { name: new RegExp(customer) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

  await signIn(page, "operations");
  await page.goto("/sales");
  await page.locator("li", { hasText: customer }).getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("li", { hasText: customer })).toHaveCount(0);
  await page.goto("/sales?status=approved");
  await expect(page.getByRole("row", { name: new RegExp(customer) })).toBeVisible();
});

// Criteria 51 and 52: an agent requests leave and HR approves it.
test("leave goes from requested to approved", async ({ page }) => {
  const day = futureWorkday();
  const reason = `End-to-end test ${Date.now()}`;
  await signIn(page, "staff");
  await page.goto("/leave");
  await page.getByLabel("Type").selectOption({ label: "Emergency" });
  await page.getByLabel("First day").fill(day);
  await page.getByLabel("Last day").fill(day);
  await page.getByLabel("Reason (optional)").fill(reason);
  await page.getByRole("button", { name: "Request" }).click();
  await expect(page.getByRole("status")).toContainText("Leave requested");

  await signIn(page, "hr");
  await page.goto("/leave");
  await page.locator("li", { hasText: reason }).getByRole("button", { name: "Approve" }).click();
  // Decided requests leave the queue.
  await expect(page.locator("li", { hasText: reason })).toHaveCount(0);
});

test("an agent can't open area or team screens", async ({ page }) => {
  await signIn(page, "staff");
  for (const path of ["/areas", "/team", "/audit", "/products"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/home/);
  }
});
