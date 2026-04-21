import { createRequire } from "module";

const require = createRequire(import.meta.url);

const coreWebVitals = require("eslint-config-next/core-web-vitals");
const typescript = require("eslint-config-next/typescript");

const config = [{ ignores: ["src/gen/**"] }, ...coreWebVitals, ...typescript];

export default config;
