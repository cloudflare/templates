// Wrangler bundles `.wasm` imports as `CompiledWasm` modules and hands the
// Worker a `WebAssembly.Module` at import time. This declaration gives that
// import a type; the runtime behaviour comes from Wrangler's default module
// rules, not from this file.
declare module "*.wasm" {
	const module: WebAssembly.Module;
	export default module;
}
