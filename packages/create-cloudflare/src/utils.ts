import * as fs from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

export const run = promisify(exec);
export const exists = fs.existsSync;

// TODO: throw if non-zero
export const git = (...args: string[]) => run(`git ${args.join(' ')}`);

export function toRemote(remote: string): string {
	let idx = remote.lastIndexOf('#');
	if (idx === -1) remote;

	let plain = remote.substring(0, idx++);
	let branch = remote.substring(idx);
	return `-b ${branch} ${plain}`;
}

// @see https://stackoverflow.com/a/52269934/3577474
export async function sparse(remote: string, dest: string, subdir: string) {
	await git('clone --depth 1 --filter=blob:none --sparse', toRemote(remote), dest);
	await git('sparse-checkout set', subdir);
}

export async function clone(remote: string, dest: string) {
	await git('clone --depth 1', toRemote(remote), dest);
}

export async function cleanup(target: string, init: boolean) {
	await fs.promises.rm(
		join(target, '.git'),
		{ recursive: true }
	);
	if (init) {
		await git('init -b main', target);
	}
}
