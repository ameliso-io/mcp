import { createRequire } from "module";

const require = createRequire(import.meta.url);

const agentConfig = require("eslint-config-agent").default;
const coreWebVitals = require("eslint-config-next/core-web-vitals");
const tseslint = require("typescript-eslint");

// Keep only @next/next plugin registrations and rules from eslint-config-next.
// eslint-config-agent already covers react, react-hooks, @typescript-eslint, import.
const nextOnly = coreWebVitals
  .filter((cfg) => {
    const hasNextPlugin = cfg.plugins && Object.keys(cfg.plugins).some((k) => k === "@next/next");
    const hasNextRules = cfg.rules && Object.keys(cfg.rules).some((r) => r.startsWith("@next/"));
    return hasNextPlugin || hasNextRules;
  })
  .map((cfg) => {
    const result = { ...cfg };
    if (result.plugins) {
      result.plugins = Object.fromEntries(
        Object.entries(result.plugins).filter(([k]) => k === "@next/next")
      );
    }
    if (result.rules) {
      result.rules = Object.fromEntries(
        Object.entries(result.rules).filter(([k]) => k.startsWith("@next/"))
      );
    }
    // Don't override parser — agent config sets @typescript-eslint/parser
    delete result.languageOptions;
    return result;
  });

const TEST_FILES = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "src/test-setup.ts",
  "src/test/*.ts",
  "src/__mocks__/*.ts",
];

const config = [
  { ignores: ["src/gen/**", "coverage/**"] },
  ...agentConfig,
  ...nextOnly,
  {
    rules: {
      // False positive: useEffect(() => { load() }, [load]) is idiomatic
      "react-hooks/set-state-in-effect": "off",

      // Next.js pages must export generateMetadata + default component
      "single-export/single-export": "off",

      // Test infrastructure uses separate spec dirs (vitest), not co-located spec files
      "ddd/require-spec-file": "off",

      // CSS modules are used project-wide; not every element needs className
      "jsx-classname/require-classname": "off",

      // ?? is idiomatic TypeScript; process.env.X is standard Next.js pattern;
      // "as" casts are necessary for proto-generated types
      "no-restricted-syntax": "off",

      // Components are legitimately large UI components with complex render logic
      "max-lines": "off",
      "max-lines-per-function": "off",

      // Async JSX event handlers (onClick, onSubmit, etc.) are idiomatic React
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // TODO: enable and fix incrementally
      "early-return/prefer-early-return": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "default/no-localhost": "off",
      "default/no-hardcoded-urls": "off",
      "default/no-default-params": "off",
      "security/detect-object-injection": "off",
    },
  },
  // Test files are excluded from tsconfig.json. Disable type-aware linting for them.
  // These must come AFTER all global rules so per-file overrides win.
  ...tseslint.config({
    files: TEST_FILES,
    extends: [tseslint.configs.disableTypeChecked],
  }),
  // Test-file-specific overrides for non-type-aware rules
  {
    files: TEST_FILES,
    rules: {
      // Tests use ! for array index access (noUncheckedIndexedAccess) and DOM queries
      "@typescript-eslint/no-non-null-assertion": "off",
      // Tests use empty arrow functions as stubs/mocks
      "@typescript-eslint/no-empty-function": "off",
      // Tests use literal error messages to verify error handling logic
      "error/no-literal-error-message": "off",
    },
  },
];

export default config;
