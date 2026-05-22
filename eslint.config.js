// eslint.config.js — flat config (ESM)
// Codifies the [lint] rules from docs/AUDIT_RULES.md. File length,
// function-body length, and cyclomatic complexity are checked mechanically
// because their failure modes — silent drift past the 250-line cap, a
// component quietly growing past the point where one edit can hold it —
// cost the most when caught late. Review-only rules are NOT codified here.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  {
    ignores: ["dist", "src-tauri/target", "node_modules", "build", "*.config.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "19" },
    },
    rules: {
      // R1.1 — file-length hard cap. The 200–250 band with inline
      // justification is a [review] concern (a human must judge whether
      // the comment is honest); we only enforce the 250 ceiling here.
      "max-lines": [
        "error",
        { max: 250, skipBlankLines: true, skipComments: true },
      ],

      // R1.5 — function-body length. 50 lines is the right scale for
      // imperative logic (.ts files, Rust). React function components
      // get a much higher threshold (.tsx override below) because their
      // bodies are primarily declarative JSX rendering — applying the
      // 50-line limit there warns on the majority of UI components
      // without indicating real complexity.
      "max-lines-per-function": [
        "warn",
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],

      // R1.6 — cyclomatic complexity threshold. 20 catches genuinely
      // pathological branching while accepting load-bearing algorithms
      // whose branching IS the algorithm.
      complexity: ["warn", 20],

      // Frontend↔Rust IPC goes only through src/ipc/commands.ts — the
      // single typed funnel that owns invoke() and the output Channel.
      // Importing @tauri-apps/api/core anywhere else bypasses the typed
      // wrappers; commands.ts itself is exempted in the override below.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tauri-apps/api/core",
              message:
                "Frontend↔Rust IPC goes only through src/ipc/commands.ts. Import the typed wrappers (and the Channel type) from there.",
            },
          ],
        },
      ],

      // window.confirm / alert / prompt are broken inside the Tauri
      // WebView — they return immediately or never render.
      "no-alert": "error",

      // --- Standard TS-quality ---
      // typescript-eslint's no-unused-vars is intentionally NOT enabled:
      // tsconfig already runs noUnusedLocals + noUnusedParameters
      // strictly, so the ESLint version would only duplicate the check.
      "@typescript-eslint/no-unused-vars": "off",

      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",

      // recommendedTypeChecked's no-unsafe-* family is disabled for this
      // project. claui has two unavoidable any-propagation boundaries:
      // Tauri's invoke() (typed on the Rust side, untyped on arrival in
      // JS — commands.ts handles the assertion centrally) and xterm.js,
      // whose Terminal / addon surface returns many any-typed objects.
      // Enforcing no-unsafe-* would force fixes across legitimate
      // boundary code or trigger a wrapper-type blanketing refactor
      // before any other lint signal is readable. no-floating-promises
      // and no-misused-promises stay enabled — those catch real async bugs.
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",

      // --- React / hooks ---
      "react-hooks/rules-of-hooks": "error",
      // exhaustive-deps stays at the plugin default "warn": a missing dep
      // is sometimes deliberate (TerminalView omits `autoFocus` from its
      // effect so toggling the command drawer doesn't respawn the shell
      // PTY). Warn keeps the omission visible without breaking the build.
      "react-hooks/exhaustive-deps": "warn",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // Single rule from react-refresh — Vite HMR friendliness. Warn,
      // not error: cross-cutting modules (commands.ts, themeStore.ts)
      // legitimately export non-component values.
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  // R1.5 override for React function components: 150-line threshold for
  // .tsx files. JSX rendering inflates line count without indicating
  // logic complexity; the 50-line default is misaligned with how React
  // components are written. Cohesion is governed by R1.1's file cap.
  {
    files: ["src/**/*.tsx"],
    rules: {
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },
  // src/ipc/commands.ts is the single IPC funnel — the one file allowed
  // to import @tauri-apps/api/core.
  {
    files: ["src/ipc/commands.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
