#!/usr/bin/env node
const argv = require('mri')(process.argv.slice(2), {
	alias: {
		v: 'version',
		h: 'help',
	},
	default: {
		init: true,
		force: false,
		debug: false
	}
});

/**
 * @param {string} msg
 * @returns {never}
 */
function exit(msg, code = 1) {
	if (code) process.stderr.write(msg + '\n');
	else process.stdout.write(msg + '\n');
	process.exit(code);
}

if (argv.help) {
	let output = '';

	output += '\n  Usage';
	output += '\n    npm init cloudflare <directory> -- [options]';
	output += '\n    pnpm create cloudflare <directory> [options]';
	output += '\n    yarn create cloudflare <directory> [options]';
	output += '\n';
	output += '\n  Options';
	output += '\n        --force        Force overwrite target directory';
	output += '\n        --no-init      Do not initialize a git repository';
	output += '\n        --debug        Print additional error details';
	output += '\n    -v, --version      Displays current version';
	output += '\n    -h, --help         Displays this message';
	output += '\n';
	output += '\n  Examples';
	output += '\n    $ npm init cloudflare my-project';
	output += '\n    $ npm init cloudflare my-project -- --no-init';
	output += '\n    $ npm init cloudflare my-project -- pages svelte-kit';
	output += '\n    $ npm init cloudflare my-project -- https://github.com/user/repo.git';
	output += '\n    $ npm init cloudflare my-project -- https://github.com/user/repo.git#branch';
	output += '\n';

	exit(output, 0);
}

if (argv.version) {
	let pkg = require('./package.json');
	exit(`${pkg.name}, v${pkg.version}`, 0);
}

(async function () {
	try {
		console.log(argv);
		let dir = argv._.join('-').trim().replace(/[\s_]+/g, '-');
		if (!dir) return exit('Missing <name> argument', 1);
		await require('.').setup(dir, argv);
	} catch (err) {
		exit(err && err.stack || err, 1);
	}
})();
