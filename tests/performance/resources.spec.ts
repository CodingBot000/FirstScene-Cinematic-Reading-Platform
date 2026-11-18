import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
test("plain entry loads zero GSAP chunks and cinematic entry requests only the first scene neighborhood", async ({
  page,
  context,
}) => {
  const directory = "apps/web/.next/static/chunks";
  const gsap = new Set(
    fs
      .readdirSync(directory, { recursive: true })
      .filter(
        (file): file is string =>
          typeof file === "string" && file.endsWith(".js"),
      )
      .filter((file) => {
        const source = fs.readFileSync(path.join(directory, file), "utf8");
        return source.includes("3.15.1") && source.includes("gsap");
      })
      .map((file) => path.basename(file)),
  );
  expect(gsap.size).toBeGreaterThan(0);
  const plain = await context.newPage();
  await plain.addInitScript(() =>
    localStorage.setItem(
      "firstscene:cache:v1",
      JSON.stringify({
        schemaVersion: 1,
        sessionEpoch: null,
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        preferences: {
          mode: "plain",
          fontSize: 20,
          theme: "dark",
          reduceMotion: false,
        },
        anchors: {},
        anchorOwners: {},
      }),
    ),
  );
  const plainChunks: string[] = [];
  plain.on("request", (request) => {
    const file = new URL(request.url()).pathname.split("/").at(-1)!;
    if (gsap.has(file)) plainChunks.push(file);
  });
  await plain.goto("/read/post-office");
  await expect(plain.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  await expect(plain.locator(".fs-reader-stage")).toHaveCount(0);
  expect(plainChunks).toEqual([]);
  await plain.close();
  // A separate origin-scoped browser context avoids carrying the deliberate plain preference.
  const fresh = await page
    .context()
    .browser()!
    .newContext({
      viewport: { width: 1440, height: 1000 },
      baseURL: test.info().project.use.baseURL,
    });
  const cinematic = await fresh.newPage();
  const images = new Set<string>();
  cinematic.on("request", (request) => {
    const asset = new URL(request.url()).pathname.match(
      /\/assets\/(mail-(?:bg|portrait)-\d+)/,
    )?.[1];
    if (asset) images.add(asset);
  });
  try {
    await cinematic.goto("/read/post-office");
    await expect(
      cinematic.getByText("서버에 저장됨", { exact: true }),
    ).toBeVisible();
    await expect(
      cinematic.locator(".fs-reader-stage img").first(),
    ).toBeVisible();
    expect(images.has("mail-bg-01")).toBe(true);
    expect(
      [...images].filter((id) => !["mail-bg-01", "mail-bg-02"].includes(id)),
    ).toEqual([]);
    fs.writeFileSync(
      "evidence/performance/current/resources.json",
      JSON.stringify(
        {
          status: "PASS",
          observedAt: new Date().toISOString(),
          plainGsapChunks: plainChunks,
          cinematicInitialSceneAssets: [...images].sort(),
          availableGsapChunkCount: gsap.size,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await fresh.close();
  }
});
