// Copyright (c) 2022 Cloudflare, Inc.
// Licensed under the APACHE LICENSE, VERSION 2.0 license found in the LICENSE file or at http://www.apache.org/licenses/LICENSE-2.0

import { D1QB } from "workers-qb";
import { ResourceRecord, Project } from "./types";

export async function Initialize(db: D1QB) {
	const tables: { name: string; schema: string }[] = [
		{
			name: "projects",
			schema:
				"id TEXT PRIMARY KEY, name TEXT NOT NULL, subdomain TEXT UNIQUE NOT NULL, custom_hostname TEXT, script_content TEXT NOT NULL, created_on TEXT NOT NULL, modified_on TEXT NOT NULL",
		},
	];

	for (const table of tables) {
		await db.dropTable({
			tableName: table.name,
			ifExists: true,
		});
	}
	for (const table of tables) {
		await db.createTable({
			tableName: table.name,
			schema: table.schema,
			ifNotExists: true,
		});
	}
}

export async function FetchTable(
	db: D1QB,
	table: string,
): Promise<ResourceRecord[] | undefined> {
	return (
		await db.fetchAll({
			tableName: table,
			fields: "*",
		})
	).results;
}

export async function CreateProject(db: D1QB, project: Project) {
	// Convert undefined to null for database
	const dbProject = {
		...project,
		custom_hostname: project.custom_hostname || null,
	};

	return db.insert({
		tableName: "projects",
		data: dbProject as unknown as Record<string, string | null>,
	});
}

export async function GetProjectBySubdomain(
	db: D1QB,
	subdomain: string,
): Promise<Project | null> {
	const result = await db.fetchOne({
		tableName: "projects",
		fields: "*",
		where: {
			conditions: "projects.subdomain IS ?",
			params: [subdomain],
		},
	});
	return result.results as Project | null;
}

export async function GetProjectByCustomHostname(
	db: D1QB,
	hostname: string,
): Promise<Project | null> {
	const result = await db.fetchOne({
		tableName: "projects",
		fields: "*",
		where: {
			conditions: "projects.custom_hostname IS ?",
			params: [hostname],
		},
	});
	return result.results as Project | null;
}

export async function GetAllProjects(db: D1QB): Promise<Project[]> {
	const result = await db.fetchAll({
		tableName: "projects",
		fields: "*",
	});
	return (result.results as Project[]) || [];
}

export async function UpdateProject(
	db: D1QB,
	projectId: string,
	updates: Partial<Project>,
) {
	return db.update({
		tableName: "projects",
		data: updates as unknown as Record<string, string>,
		where: {
			conditions: "projects.id IS ?",
			params: [projectId],
		},
	});
}
