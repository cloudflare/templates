#!/usr/bin/env node
const argv = require('mri')(process.argv.slice(2), {
	alias: {
		C: 'cwd',
		e: 'env',
		f: 'format',
		t: 'typescript',
		// m: 'monorepo',
		v: 'version',
		h: 'help',
		// c: 'cfw',
	},
	default: {
		C: '.',
		force: false,
		e: 'cloudflare',
		f: '', // ~> env-default
	}
});

/** @param {string} msg */
function exit(msg, code = 1) {
	if (code) process.stderr.write(msg + '\n');
	else process.stdout.write(msg + '\n');
	process.exit(code);
}

if (argv.help) {
	let output = '';

	output += '\n  Usage';
	output += '\n    npm init worktop <name> [options]';
	output += '\n';
	output += '\n  Options';
	output += '\n    -C, --cwd          Directory to resolve from';
	output += '\n    -t, --typescript   Setup project for TypeScript usage';
	output += '\n    -e, --env          Target platform environment (default "cloudflare")';
	output += '\n    -f, --format       Worker/Script output format (default "module")';
	// output += '\n    -m, --monorepo     Force directory overwrite';
	// output += '\n    -c, --cfw          Force directory overwrite';
	output += '\n        --force        Force overwrite target directory';
	output += '\n    -v, --version      Displays current version';
	output += '\n    -h, --help         Displays this message';
	output += '\n';
	output += '\n  Examples';
	output += '\n    $ npm init worktop my-worker';
	output += '\n    $ yarn create worktop my-worker --force';
	output += '\n    $ npm init worktop my-worker --env cloudflare';
	output += '\n    $ npm init worktop my-worker --env cloudflare';
	output += '\n    $ npm init worktop my-worker --env deno';
	output += '\n';

	exit(output, 0);
}

if (argv.version) {
	let pkg = require('./package.json');
	return exit(`${pkg.name}, v${pkg.version}`, 0);
}

(async function () {
	try {
		let dir = argv._.join('-').trim().replace(/[\s_]+/g, '-');
		if (!dir) return exit('Missing <name> argument', 1);
		await require('.').setup(dir, argv);
	} catch (err) {
		exit(err && err.stack || err, 1);
	}
})();
