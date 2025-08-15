## Grades Viewer

A modern, minimal React + TypeScript app for browsing class grade CSVs. Built with Vite and Material UI. It parses a Canvas-style grade export and provides fast search, student details, category grouping, and a contributions table.

### Quick start

- **Requirements**: Node 18+ (recommend `nvm use --lts`), npm 9+
- **Install**:
  ```bash
  npm install
  ```
- **Add your data**:
  - Place your CSV at `public/grades.csv` (CSV files are git-ignored by default).
- **Run dev server**:
  ```bash
  npm run dev
  ```
- **Build & preview**:
  ```bash
  npm run build
  npm run preview
  ```

### Key features

- **Fast CSV parsing**: Uses PapaParse with header row support and greedy empty-line skipping
- **Student search & navigation**: Type-ahead search, URL routing per student: `/student/{student_id}`
- **Compact sidebar**: Collapse/expand; avatar list in compact mode
- **Show/Hide scores**: Conceals numbers (including contributions) while keeping layout intact
- **Dark/Light/System theme**: Theme selector; system preference by default
- **Per-student details**:
  - Summary panel (Final Score, Final Grade)
  - Category contributions table (top-right) that sums to Final Score
  - Grouped activities with collapsible sections and per-group aggregates
- **Modern UI**: Material UI components with a minimal custom theme

### CSV expectations

- The app expects a header row and student rows similar to Canvas exports.
- Special handling:
  - A "Points Possible" row (identified via `LastName` = `Points Possible`) is used to determine per-assignment maxima.
  - Non-student rows are filtered (blank names, header echo rows, Canvas "Test Student").
  - Students deduplicated by `SIS User ID` (fallback: `ID` or `LastName|FirstName`).
- Place your file at `public/grades.csv`. This file is ignored by git.

### Grouping and weights

Activities are automatically classified by name patterns into categories. Current weights (normalized to total 100%):

| Category              | Weight |
| --------------------- | ------ |
| Case Study            | 40%    |
| Practical Exercises   | 35%    |
| Class Activities      | 15%    |
| Exams (Midterm/Final) | 10%    |

- The contributions table shows each category’s contribution computed as `Final Score × Weight`.
- Group sections are collapsible; the header shows the group average and its contribution.
- Unmatched items fall under "Other" (not counted towards the weighted contributions table).

### Routing

- Direct link to a student with: `/student/{student_id}`
- Example: `/student/123456`

### Project layout

- `src/App.tsx`: Main UI, CSV loading/parsing, grouping, contributions, and routing
- `src/main.tsx`: App bootstrap (React 18, router)
- `src/style.css`: Theme tokens and layout styles
- `src/types.ts`: CSV-related TypeScript types
- `public/grades.csv`: Your data (not tracked in git)

### Dev tooling

- **Vite** for dev/build
- **TypeScript** strictness via `tsconfig.json`
- **ESLint v9 (flat config)**: `eslint.config.js` (React + TypeScript + Hooks, Prettier-compatible)
- **Prettier** formatting: `.prettierrc`
- **Husky + lint-staged** pre-commit hooks:
  - Runs `eslint --fix` on staged `*.{ts,tsx,js,jsx}`
  - Runs `prettier --write` on staged code, CSS, MD, JSON
  - The hook is installed via `npm run prepare` (auto-runs on `npm install`)
  - If hooks don’t run after clone, run `npm run prepare`

### Scripts

- `npm run dev` — start Vite dev server
- `npm run build` — type-check and build for production
- `npm run preview` — preview the production build locally

### Notes & limitations

- Grouping uses regex-based heuristics; exact titles can be mapped if needed.
- The contributions table is driven by the CSV’s Final Score (not recalculated from items) and honors Hide scores.
- If you deploy under a subpath, set Vite `base` in `vite.config.ts` accordingly.

### License

TBD
