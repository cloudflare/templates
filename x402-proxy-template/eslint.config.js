import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

export default [
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
		plugins: {
			"@typescript-eslint": tseslint,
		},
		rules: {
			// TypeScript-specific rules
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-non-null-assertion": "warn",

			// General best practices
			"no-console": "off", // Workers need console for logging
			"prefer-const": "warn",
			"no-var": "error",
			eqeqeq: ["warn", "always"],
			curly: ["warn", "all"],
		},
	},
	// Disable ESLint rules that conflict with Prettier
	prettierConfig,
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			".wrangler/**",
			"worker-configuration.d.ts",
		],
	},
];
