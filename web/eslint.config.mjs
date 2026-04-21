import { createRequire } from "module";

const require = createRequire(import.meta.url);

const coreWebVitals = require("eslint-config-next/core-web-vitals");
const typescript = require("eslint-config-next/typescript");

const config = [
  { ignores: ["src/gen/**", "coverage/**"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // False positive: useEffect(() => { load() }, [load]) is idiomatic
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
