import semiver from 'semiver';
import * as utils from './utils';

// yarn create cloudflare foobar pages/nuxt
// yarn create cloudflare foobar workers-airtable
// yarn create cloudflare foobar https://.../user/repo

export interface Argv {
	init?: boolean;
	force?: boolean;
	debug?: boolean;
}

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

	// filter uses `git sparse-checkout` wxhich requires 2.19+
	if (filter) {
		try {
			var { stdout } = await utils.git('version');
		} catch (err) {
			throw new Error('Missing `git` executable');
		}

		let [version] = /\d+.\d+.\d+/.exec(stdout) || [];
		if (!version) throw new Error('Unknown `git` version');

		let num = semiver(version, '2.19.0'); // -1~>lesser; 0~>equal; 1~>greater
		if (num < 0) throw new Error('Requires git version 2.19.0 or newer');
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
