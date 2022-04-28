import * as fs from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

export const run = promisify(exec);
export const exists = fs.existsSync;

export const git = (...args: string[]) => {
  return run(`git ${args.join(' ')}`);
}

// @see https://stackoverflow.com/a/52269934/3577474
export async function sparse(remote: string, target: string, filter: string) {
	await git('clone --depth 1 --filter=blob:none --sparse', remote, target);
	await git('sparse-checkout set', filter);
}

export async function clone(remote: string, target: string) {
	await git('clone --depth 1', remote, target);
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
