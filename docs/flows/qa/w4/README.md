# W4 QA — `/worlds`

Screenshots at the three required viewports (1366×768, 1024×768, 390×844), captured from the dev server with the
lane's fixture client. Each run also fails on a page error, a console error or horizontal page overflow; the last
run reported none.

| File | What it shows |
|---|---|
| `student-mine-*` | Student, Mine: rail, draft strip (34 bricks in this browser), own cards with sharing chips and the ⋯ menu |
| `student-class-*` | Student, class section: classmates' shared worlds (Join / Visit / Make my own copy) and the teacher's worlds |
| `student-share-sheet-*` | The share sheet on a private world, look-only preselected |
| `student-empty-*` | New account: empty state, no browser draft |
| `class-closed-*` | Collaboration closed: the teacher-named line, no cards, no search, class count 0 |
| `teacher-class-*` | Teacher: class rail, "Start a shared world", "Shared by students" with Hide from class |

## Re-running

```
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
npx vite --port 5260 --strictPort          # any free port ≥ 5260; update the script's origin if you change it
node docs/flows/qa/w4/capture.mjs          # writes the PNGs next to this file
```

The script uses the Playwright install the other QA harnesses use (`scripts/qa/lib/env.mjs` documents the paths and
the `PLAYWRIGHT_MODULE` / `CHROME_PATH` overrides). The states come from the dev-only preview flag
`/worlds?demo=student|teacher|closed|empty`, which swaps in `src/pages/worlds/worldsFixtures.ts`; production always
resolves the real client. W7 is welcome to fold these locators into `scripts/qa/**`.
