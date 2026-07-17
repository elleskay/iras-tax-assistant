# @platform/spec-test

Spec-driven test runner. Validates a YAML spec, registers `specTest(id, title, fn)` calls in Vitest and Playwright, records pass/fail per ID, and gates CI on 100% coverage.

## What this catches

- Missing test for any spec ID: the coverage report flags it, CLI exits 1.
- Test exists but body is empty (zero `expect()` calls): the ESLint rule fails lint before tests run, for both `specTest("ID", ...)` and `test("[ID] ...")` styles (including `.only`/`.skip`).
- Test passes in the wrong runner layer for its category (e.g. a `category: ui` requirement whose only passing test is a Vitest unit test): category mismatch, exit 1. The layer is stamped by the runner wrappers; `security` requirements may pass in either layer.
- Test exists and fails: standard runner failure, exit 1.
- A recorded id that matches no spec requirement (typo or stale rename) is listed in the report as a warning.
- A malformed `specTest` id (would never be recorded) throws at registration.

Run on every PR. CI cannot merge with red specs.

## What this does NOT catch

**The runner verifies that each spec ID has a registered test that asserts something. It does not verify that the spec is correct, complete, or that the user-facing feature actually works end to end.** Three specific failure modes survive a green gate:

### 1. Wrong spec

The spec entry says the scoring formula is `(ok / total) * 100`, the test asserts the same formula, both agree, the app ships with the wrong formula. Spec correctness is on the human reviewer; code review on spec changes is the mitigation.

### 2. Behavior not in the spec

You add a new server action without adding a spec entry. The gate has nothing to enforce against this new code. No automated check exists for "did you add a feature without a spec entry?" PR review discipline catches it.

### 3. Decomposed-journey gap

A user-facing feature whose implementation spans multiple spec IDs can hit 100% coverage while the **chain between IDs** is broken.

Real example from armoury:

| Spec ID | What it asserts | Passed? |
|---|---|---|
| ARM-PHOTO-001 | Officer submit page renders `<input type="file">` for items with `kind === "photo"` | yes |
| ARM-PHOTO-002 | A submitted photo persists as a data URL in `responses.valueText` | yes |
| ARM-PHOTO-003 | The submission detail page renders an `<img>` for photo responses | yes |
| **Untested** | **Admin builder dropdown offers Photo as a selectable item kind** | no |

All three spec IDs passed. Coverage was 126/126. The photo feature was unreachable because no admin could ever create a template item of `kind === "photo"`: the builder's `<Select>` was missing the option. The gate was satisfied; the feature was broken.

**Mitigation:** for every user-facing feature, write at least one journey-level e2e that traverses the full path:

```ts
specTest(
  "APP-PHOTO-JOURNEY",
  "Admin creates photo item, officer uploads, admin sees the image",
  async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/templates/new");
    // ...fill name, add an item, select Photo from the kind dropdown
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Photo" }).click();
    await page.getByRole("button", { name: "Create" }).click();

    await signOutAndLoginAsOfficer(page);
    await page.goto(`/officer/submit/${templateId}`);
    // ...upload a real PNG via the file input
    await page.setInputFiles('input[type="file"]', "tests/fixtures/sample.png");
    await page.getByRole("button", { name: "Submit" }).click();

    await signOutAndLoginAsAdmin(page);
    await page.goto(`/admin/submissions/${submissionId}`);
    await expect(page.locator('img[src^="data:image"]')).toBeVisible();
  },
  { category: "ui" },
);
```

The journey test asserts that the structure your individual spec IDs cover actually connects into a working chain. Without it, the gate measures structure only; with it, the gate measures behavior.

See `docs/TESTING.md` "Failure modes the gate does NOT catch" for the same caveat in the platform-wide context.

## Reading list

- `docs/TESTING.md`: full system overview (spec format, category routing, ESLint rule, CLI usage)
- `samples/example.spec.yml`: minimum viable spec for testing the runner
- `samples/bad.test.ts`: example of a test the ESLint rule blocks (zero `expect()` calls); `samples/eslint.test.mjs` is the rule's runnable self-test

## Why this package is private

The package is consumed as a workspace dependency (`"@platform/spec-test": "*"`) by the apps in this monorepo, not published to a registry. A change here reaches every app on the next install, so treat the exports as a contract and run each app's `test:spec` gate after touching it. Repos cloned from the platform template carry their own copy, so changes here do not propagate across repos.
