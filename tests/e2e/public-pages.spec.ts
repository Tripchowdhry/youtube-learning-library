import { expect, test, type Page } from "@playwright/test";

const fakeToken = "00000000-0000-0000-0000-000000000000";

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
}

test("the sign-in page explains BrainShelf and offers a way to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stop bookmarking. Start learning.");
  await expect(page.getByRole("button", { name: "Get started free" }).first()).toBeVisible();
  await noSideScroll(page);
});

test("the sign-in page has a link preview picture", async ({ page, request }) => {
  await page.goto("/");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toContain("/opengraph-image");
  const res = await request.get(new URL(image!).pathname);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
});

test("a wrong link shows a friendly page with a way back", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go to BrainShelf" }).click();
  await expect(page).toHaveURL("/");
  await noSideScroll(page);
});

test("a turned-off category link says so", async ({ page }) => {
  await page.goto(`/share/${fakeToken}`);
  await expect(page.getByRole("heading", { name: "This link isn't shared any more" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to BrainShelf" })).toBeVisible();
});

test("a turned-off report link says so", async ({ page }) => {
  await page.goto(`/r/${fakeToken}`);
  await expect(page.getByRole("heading", { name: "This report isn't shared any more" })).toBeVisible();
});

test("shared links draw their own preview picture", async ({ request }) => {
  for (const path of [`/share/${fakeToken}/opengraph-image`, `/r/${fakeToken}/opengraph-image`]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
});

test("the privacy page opens", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noSideScroll(page);
});

test("signed-out visitors to private pages get the sign-in page, not an error", async ({ page }) => {
  for (const path of ["/reading", "/tutorials", "/scrapbook", "/vault", "/reports", "/clips", `/video/${fakeToken}`]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.getByRole("button", { name: "Get started free" }).first(), path).toBeVisible();
  }
});
