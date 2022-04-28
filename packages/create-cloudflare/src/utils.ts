import * as fs from 'fs';
import { promisify } from 'util';
import { join, relative } from 'path';
import { exec } from 'child_process';

export const run = promisify(exec);
export const exists = fs.existsSync;

export { join, relative };

export function rmdir(dir: string): Promise<void> {
	return fs.promises.rm(dir, { recursive: true });
}

// TODO: throw if non-zero
export const git = (...args: string[]) => run(`git ${args.join(' ')}`);

export async function clone(remote: string, dest: string, subdir?: string) {
	let args = ['clone --depth 1'];

	// @see https://stackoverflow.com/a/52269934/3577474
	if (subdir) args.push('--filter=blob:none --sparse');

	let idx = remote.lastIndexOf('#');
	if (idx === -1) {
		args.push(remote);
	} else {
		args.push(`-b ${remote.substring(idx + 1)}`);
		args.push(remote.substring(0, idx));
	}

	args.push(dest);
	await git(...args);

	if (subdir) {
		await run(`git sparse-checkout set "${subdir}"`, { cwd: dest });
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
