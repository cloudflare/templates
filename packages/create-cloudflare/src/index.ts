import * as path from 'path';
import * as utils from './utils';

// yarn create cloudflare pages nuxt
// yarn create cloudflare workers airtable

export type Argv = {
	cwd: string;
	init?: boolean;
	force?: boolean;
	debug?: boolean;
	_:
		| [] // ~> interactive
		| [string] // URL / ???
		| [string, string] // [worker|pages, directory]
}

export async function setup(dir: string, argv: Argv) {
	argv.cwd = path.resolve(argv.cwd || '.');

	let target = path.join(argv.cwd, dir);

	if (utils.exists(target) && !argv.force) {
		let pretty = path.relative(process.cwd(), target);
		let msg = `Refusing to overwrite existing "${pretty}" directory.\n`;
		msg += 'Please specify a different directory or use the `--force` flag.';
		throw new Error(msg);
	}

	let isRemote = false;
	let [source, filter] = argv._ || [];
	console.log({ source, filter });

	if (!source) {
		// TODO: interactive list w/ selection menu
		throw new Error('Missing source value(s).\nPlease view the `--help` text.');
	}

	if (/^(https?|ftps?|file|git|ssh):\/\//.test(source)) isRemote = true;
	// [user@]host.xz:path/to/repo.git/
	else if (!filter && source.includes(':')) isRemote = true;
	else {
		source = source.toLowerCase();
		// TODO: interactive type-based list
		if (!filter) throw new Error('Missing filter');

		if (/^workers?/.test(source)) filter = 'workers/' + filter;
		else if (source === 'pages') filter = 'pages/' + filter;
		else throw new Error(`Invalid "${source}" source.`);

		// TODO: change me post-release
		source = 'https://github.com/cloudflare/worker-examples.git';
	}

	try {
		// TODO: throw on non-zero exit
		if (isRemote) await utils.clone(source, target);
		else await utils.sparse(source, target, filter!);
	} catch (err) {
		if (argv.debug) console.error((err as Error).toString());
		throw new Error(`Error cloning "${source}" repository`);
	}

	await utils.cleanup(target, !!argv.init);
	console.log('Done~!'); // todo
}
