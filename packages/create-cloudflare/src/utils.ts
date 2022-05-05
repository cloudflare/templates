import * as fs from 'fs';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join, relative } from 'path';
import { exec } from 'child_process';
import semiver from 'semiver';

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
	let target=dest, sparse=false;

	try {
		var { stdout } = await git('version');
	} catch (err) {
		throw new Error('Missing `git` executable');
	}

	if (subdir) {
		let [version] = /\d+.\d+.\d+/.exec(stdout) || [];
		if (!version) throw new Error('Unknown `git` version');

		let num = semiver(version, '2.26.0');
		sparse = num !== -1; // -1~>lesser; 0~>equal; 1~>greater

		target = join(tmpdir(), rand() + '-' + rand());

		// @see https://stackoverflow.com/a/52269934/3577474
		if (sparse) args.push('--filter=blob:none --sparse');
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

	try {
		args.push(target);
		await git(...args);
	} catch (err) {
		throw new Error(`Error cloning "${remote}" repository`);
	}

	if (subdir) {
		// sparse keeps the {subdir} structure, so w/o
		// the tmpdir() juggle, we would have {target}/{subdir} result
		if (sparse) await run(`git sparse-checkout set "${subdir}"`, { cwd: target });

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
