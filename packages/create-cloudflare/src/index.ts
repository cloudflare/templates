import * as utils from './utils';

// yarn create cloudflare foobar pages/nuxt
// yarn create cloudflare foobar workers-airtable
// yarn create cloudflare foobar https://.../user/repo

import type { Argv } from 'create-cloudflare';

export async function setup(dir: string, src: string, argv: Argv) {
	let cwd = process.cwd();
	let target = utils.join(cwd, dir);

	if (utils.exists(target)) {
		if (argv.force) {
			if (target.startsWith(cwd)) await utils.rmdir(target);
			else throw new Error('Refusing to manipulate the file system outside the PWD location.\nPlease specify a different target directory.');
		} else {
			let pretty = utils.relative(cwd, target);
			let msg = `Refusing to overwrite existing "${pretty}" directory.\n`;
			msg += 'Please specify a different directory or use the `--force` flag.';
			throw new Error(msg);
		}
	}

	let source = '', filter = '';
	if (/^(https?|ftps?|file|git|ssh):\/\//.test(src) || src.includes(':')) {
		source = src; // allows [user@]host.xz:path/to/repo.git/
	} else {
		// TODO: change me post-release
		source = 'https://github.com/cloudflare/worker-examples.git';
		filter = src;
	}

	try {
		await utils.clone(source, target, filter);
	} catch (err) {
		if (argv.debug) console.error((err as Error).toString());
		throw new Error(`Error cloning "${source}" repository`);
	}

	await utils.cleanup(target, !!argv.init);
	console.log('Done~!'); // todo
}
