import * as fs from 'fs';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join, relative } from 'path';
import { exec } from 'child_process';

export const run = promisify(exec);
export const exists = fs.existsSync;

export { join, relative };

export async function rmdir(dir: string): Promise<void> {
	if (exists(dir)) fs.promises.rm(dir, { recursive: true });
}

export const git = (...args: string[]) => run(`git ${args.join(' ')}`);

export const rand = () => Math.random().toString(16).substring(2);

export async function clone(remote: string, dest: string, subdir?: string) {
	let args = ['clone --depth 1'];
	let target = dest;

	if (subdir) {
		// @see https://stackoverflow.com/a/52269934/3577474
		args.push('--filter=blob:none --sparse');
		target = join(tmpdir(), rand() + '-' + rand());
	}

	let idx = remote.lastIndexOf('#');
	if (idx === -1) {
		if (remote.includes('worker-examples')) {
			args.push('-b dev'); // TODO remove me
		}
		args.push(remote);
	} else {
		args.push(`-b ${remote.substring(idx + 1)}`);
		args.push(remote.substring(0, idx));
	}

	args.push(target);
	await git(...args);

	if (subdir) {
		// sparse keeps the {subdir} structure, so w/o
		// the tmpdir() juggle, we would have {target}/{subdir} result
		await run(`git sparse-checkout set "${subdir}"`, { cwd: target });

		// effectively `$ mv {tmp/subdir} {dest}
		await fs.promises.rename(join(target, subdir), dest);
		await rmdir(target); // rm -rf tmpdir
	}
}

export async function cleanup(target: string, init: boolean) {
	await rmdir(
		join(target, '.git')
	);
	if (init) {
		await git('init -b main', target);
	}
}
