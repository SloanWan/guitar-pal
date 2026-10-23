import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Every link must go through <AppLink> (src/components/AppLink.tsx) so its click
  // feeds the global navigation progress bar via useLinkStatus. A raw next/link
  // silently shows no indicator, so bypassing the wrapper must be a build error.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message:
                "Import the default export from '@/components/AppLink' instead of 'next/link', so navigations feed the global progress bar. (next/link / useLinkStatus may only be imported inside AppLink itself.)",
            },
          ],
        },
      ],
    },
  },
  {
    // `const { omitted: _x, ...rest } = obj` is how a field is dropped from a
    // copy; the named sibling exists only to keep it out of `rest`.
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  {
    // AppLink is the one sanctioned importer of next/link.
    files: ["src/components/AppLink.tsx"],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
