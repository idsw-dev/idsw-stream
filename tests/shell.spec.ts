import { expect, test } from "@playwright/test";

test("HIDE_DAY_2 shows only Day 1 without a day switcher", async ({ page }) => {
  test.skip(process.env.HIDE_DAY_2 !== "true");
  await page.goto("/");
  await expect(page.getByRole("tablist", { name: "Conference day" })).toHaveCount(0);
  await expect(page.locator("main").getByText("Day 2")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "You’re in the right place." })).toBeVisible();
  await expect(page.locator("mux-player")).toHaveCount(0);
});

test("DEFAULT_DAY=2 opens Day 2 when both days are visible", async ({ page }) => {
  test.skip(process.env.DEFAULT_DAY !== "2" || process.env.HIDE_DAY_2 === "true");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Day 2" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Day 2" })).toBeVisible();
});

test("conference shell stays intact while recordings remain locked", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("IDSW 2026 | Indonesia Software Developer Conference, Jakarta");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /IDSW 2026 livestream and recordings/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\/stream\.idsw\.dev\/?$/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "IDSW 2026 | Indonesia Software Developer Conference, Jakarta");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://stream.idsw.dev/assets/og.jpg");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.getByAltText("IDSW 2026")).toHaveCount(2);
  await expect(page.locator("header a[href='https://idsw.dev/#schedule']")).toHaveCount(2);
  await expect(page.locator("footer a[href='https://idsw.dev/#schedule']")).toHaveCount(1);
  const currentNavigation = ["Speakers", "Schedule", "Sponsors", "FAQ", "Guideline", "Stream"];
  await expect(page.locator("header nav ul").first().locator("li")).toHaveText(currentNavigation);
  await expect(page.locator("header nav ul").last().locator("li")).toHaveText(currentNavigation);
  await expect(page.locator(".footer-navigation a")).toHaveText(currentNavigation);
  await expect(page.locator("footer a[title='Perkumpulan Pengrajin Kode Indonesia']")).toHaveAttribute("href", "https://perkodi.org");
  await expect(page.locator("footer")).toContainText("21–22 Nov 2026");
  await expect(page.locator("footer")).toContainText("08.00–18.15 WIB");
  await expect(page.locator("footer")).toContainText("09.00–18.15 WIB");
  await expect(page.getByRole("tablist", { name: "Conference day" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You’re in the right place." })).toBeVisible();
  await expect(page.locator("mux-player")).toHaveCount(0);
  await page.getByRole("tab", { name: "Day 2" }).click();
  await expect(page.getByRole("tabpanel", { name: "Day 2" })).toBeVisible();
  await expect(page.locator("mux-player")).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain("PRIVATE KEY");
  expect(html).not.toMatch(/eyJhbGciOiJSUzI1NiJ9/);
  expect(html).not.toContain("test-day-1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("player area adapts to available screen height", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await expect(page.locator(".auth-overlay")).toBeVisible();
  const measure = () => page.evaluate(() => {
    const nav = document.querySelector(".site-nav")!.getBoundingClientRect();
    const tabs = document.querySelector(".stream-tabs")!.getBoundingClientRect();
    const video = document.querySelector(".stream-video")!.getBoundingClientRect();
    return { width: video.width, topGap: tabs.top - nav.bottom };
  });
  const large = await measure();
  expect(large.width).toBeGreaterThanOrEqual(1299);
  expect(large.topGap).toBeGreaterThanOrEqual(0);
  expect(large.topGap).toBeLessThanOrEqual(24);

  // 125% desktop scaling leaves approximately 80% of the CSS viewport.
  await page.setViewportSize({ width: 1536, height: 864 });
  const scaled = await measure();
  expect(scaled.width).toBeLessThan(1200);
  expect(scaled.width).toBeGreaterThan(1150);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("access code form stays inside the player frame on compact screens", async ({ page }) => {
  await page.route("**/api/auth/request-code", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' }));
  await page.goto("/");
  await page.getByRole("button", { name: /Enter email/ }).click();
  await page.getByLabel("Email address").fill("viewer@example.com");
  await page.getByRole("button", { name: /Send access code/ }).click();
  await expect(page.getByRole("heading", { name: "Check your email." })).toBeVisible();

  for (const viewport of [{ width: 1536, height: 864 }, { width: 1093, height: 614 }, { width: 412, height: 839 }]) {
    await page.setViewportSize(viewport);
    const bounds = await page.evaluate(() => {
      const overlay = document.querySelector(".auth-overlay")!.getBoundingClientRect();
      const card = document.querySelector(".auth-card")!.getBoundingClientRect();
      return {
        cardTop: card.top,
        cardBottom: card.bottom,
        overlayTop: overlay.top,
        overlayBottom: overlay.bottom,
        overflowWidth: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(bounds.cardTop).toBeGreaterThan(bounds.overlayTop);
    expect(bounds.cardBottom).toBeLessThan(bounds.overlayBottom);
    expect(bounds.overflowWidth).toBeLessThanOrEqual(0);
  }
});

test("a verified code unlocks only the selected day's player", async ({ page }) => {
  const requestedDays: number[] = [];
  await page.route("**/api/auth/request-code", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' }));
  await page.route("**/api/auth/verify-code", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' }));
  await page.route("**/api/mux/token", async (route) => {
    const { day } = route.request().postDataJSON() as { day: number };
    requestedDays.push(day);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        playbackId: `test-day-${day}`,
        tokens: { playback: "test-token", thumbnail: "test-token", storyboard: "test-token" },
        expiresAt: Date.now() + 600_000,
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Enter email/ }).click();
  await page.getByLabel("Email address").fill("viewer@example.com");
  await page.getByRole("button", { name: /Send access code/ }).click();
  await page.getByLabel("6-digit access code").fill("123456");
  await page.getByRole("button", { name: /Unlock stream/ }).click();
  await expect(page.locator("mux-player")).toHaveAttribute("playback-id", "test-day-1");
  await page.getByRole("tab", { name: "Day 2" }).click();
  await expect(page.locator("mux-player")).toHaveAttribute("playback-id", "test-day-2");
  expect([...new Set(requestedDays)]).toEqual([1, 2]);
  expect(requestedDays.at(-1)).toBe(2);
});

test("requesting a code shows generic confirmation and keeps the player locked", async ({ page }) => {
  await page.route("**/api/auth/request-code", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' }));
  await page.goto("/");
  await page.getByRole("button", { name: /Enter email/ }).click();
  await page.getByLabel("Email address").fill("viewer@example.com");
  await page.getByRole("button", { name: /Send access code/ }).click();
  await expect(page.getByRole("heading", { name: "Check your email." })).toBeVisible();
  await expect(page.getByText(/If viewer@example.com is registered/)).toBeVisible();
  await expect(page.locator("mux-player")).toHaveCount(0);
});

test("day tabs support keyboard navigation without unlocking playback", async ({ page }) => {
  await page.goto("/");
  const first = page.getByRole("tab", { name: "Day 1" });
  const second = page.getByRole("tab", { name: "Day 2" });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(second).toBeFocused();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("mux-player")).toHaveCount(0);
});
