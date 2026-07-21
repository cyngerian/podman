/**
 * End-to-end happy path: simulated cube draft from the configure screen to the
 * results screen, against a real Next.js build and a real local Supabase.
 *
 * Why cube and not a booster set: cube packs are built from a pasted card list
 * (`generateCubePacks`), so the run needs no `booster_products` rows and makes
 * no Scryfall calls — the two things that would otherwise make this suite
 * depend on network and on data that CI has no copy of. Everything else about
 * the flow (server actions, `applyDraftMutation`'s version guard, bot picks,
 * the pick-view RPC, deck submit, results) is exercised for real.
 */
import { test, expect, type Page } from "@playwright/test";
import { Fixtures, type TestUser } from "../integration/helpers/supabase";

const PLAYER_COUNT = 2;
const PACKS_PER_PLAYER = 3;
/** `createDraft`'s default; cube packs use it verbatim. */
const CARDS_PER_PACK = 14;
const TOTAL_PICKS = PACKS_PER_PLAYER * CARDS_PER_PACK;

/** Comfortably more cards than `playerCount × packs × cardsPerPack` (84). */
const CUBE_SIZE = 120;
const CUBE_LIST = Array.from(
  { length: CUBE_SIZE },
  (_, i) => `E2E Cube Card ${String(i + 1).padStart(3, "0")}`
).join("\n");

const fixtures = new Fixtures();
let user: TestUser;
let password: string;

test.beforeAll(async () => {
  user = await fixtures.createUser("e2e");
  password = fixtures.password;
});

test.afterAll(async () => {
  await fixtures.cleanup();
});

async function signIn(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
}

test("simulated cube draft: configure, pick every pack, submit deck, see results", async ({
  page,
}) => {
  await signIn(page);

  // ---- Configure the simulation ----
  await page.goto("/dashboard/simulate");
  await page.getByRole("button", { name: /Cube Draft/ }).click();

  const cubeInput = page.getByPlaceholder("One card name per line...");
  await cubeInput.fill(CUBE_LIST);
  await cubeInput.blur();
  await expect(page.getByText(`${CUBE_SIZE} cards loaded`)).toBeVisible();

  // Drop from the default 8 players to 2 — fewer seats, fewer bot picks per
  // mutation, and the pack still cycles through both pass directions.
  const players = page.getByRole("group", { name: "Players" });
  const playerCounter = players.locator("span").first();
  while ((await playerCounter.innerText()).trim() !== String(PLAYER_COUNT)) {
    await players.getByRole("button").first().click();
  }

  // No timer: an auto-pick firing mid-assertion would race the test.
  await page.getByRole("button", { name: /No Timer/ }).click();

  await page.getByRole("button", { name: "Start Simulation" }).click();

  // ---- Pick through every pack ----
  await page.waitForURL(/\/draft\/[0-9a-f-]+\/pick/, { timeout: 60_000 });
  const draftId = /\/draft\/([0-9a-f-]+)\//.exec(page.url())![1];

  const grid = page.getByTestId("pick-grid");
  let picksMade = 0;

  for (let i = 0; i < TOTAL_PICKS; i++) {
    if (!page.url().includes("/pick")) break;

    // The waiting screen replaces the grid between packs; bots pick inside the
    // same mutation as ours, so the next pack is normally there immediately.
    await expect(grid.getByRole("button").first()).toBeVisible({
      timeout: 60_000,
    });
    const before = await grid.getByRole("button").count();

    // Desktop pick path: click a card to open the preview modal, then PICK.
    await grid.getByRole("button").first().click();
    await page.getByRole("button", { name: "PICK", exact: true }).click();
    picksMade++;

    // Settled when the pack changed size (next pack has one fewer card), the
    // grid went away (waiting screen), or the draft moved on.
    await expect
      .poll(
        async () => {
          if (!page.url().includes("/pick")) return -1;
          return grid.getByRole("button").count();
        },
        { timeout: 60_000 }
      )
      .not.toBe(before);
  }

  expect(picksMade).toBe(TOTAL_PICKS);

  // ---- Deck building ----
  // The last pick flips the draft to `deck_building`; the client follows via
  // Realtime, or via the waiting-screen poll if the socket dropped.
  await page.waitForURL(`**/draft/${draftId}/deckbuild`, { timeout: 90_000 });
  await expect(
    page.getByRole("heading", { name: "Build Your Deck" })
  ).toBeVisible();

  // The waiting screen's deck panel auto-adds each pick and autosaves, so the
  // deck normally arrives here already holding the full pool. If a build ever
  // lands with everything in the sideboard instead, move it over rather than
  // failing on a 40-card minimum that isn't what this test is about.
  const moveAllToDeck = page.getByRole("button", { name: "Move all to deck" });
  if (await moveAllToDeck.isVisible()) {
    await moveAllToDeck.click();
    await page.getByRole("button", { name: "Confirm" }).click();
  }
  await expect(
    page.getByRole("heading", { name: `Deck (${TOTAL_PICKS} cards)` })
  ).toBeVisible();

  await page.getByRole("button", { name: "SUBMIT DECK" }).click();

  // ---- Results ----
  await page.waitForURL(`**/draft/${draftId}/results`, { timeout: 60_000 });
  await expect(page.getByText(/Deck \(\d+\)/).first()).toBeVisible();

  // The pool the results screen renders is the one we actually drafted.
  const state = await fixtures.readDraftState(draftId);
  const seat = state.seats.find((s) => s.userId === user.id);
  expect(seat).toBeDefined();
  expect(seat!.pool).toHaveLength(TOTAL_PICKS);
  expect(seat!.deck).toHaveLength(TOTAL_PICKS);
  expect(seat!.hasSubmittedDeck).toBe(true);
});
