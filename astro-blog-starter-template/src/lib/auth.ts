// Authentication utilities
import { nanoid } from 'nanoid';

export interface User {
	id: string;
	email: string;
	password_hash: string;
	name?: string;
	role: string;
	created_at: string;
	updated_at: string;
}

export interface Session {
	id: string;
	user_id: string;
	expires_at: string;
	created_at: string;
}

/**
 * Hash a password using Web Crypto API
 */
export async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	const passwordHash = await hashPassword(password);
	return passwordHash === hash;
}

/**
 * Check if any users exist (for one-time registration)
 */
export async function hasUsers(db: D1Database): Promise<boolean> {
	const result = await db
		.prepare('SELECT COUNT(*) as count FROM users')
		.first<{ count: number }>();
	return (result?.count ?? 0) > 0;
}

/**
 * Create a new user (only if no users exist)
 */
export async function createUser(
	db: D1Database,
	email: string,
	password: string,
	name?: string
): Promise<User | null> {
	// Check if users already exist
	if (await hasUsers(db)) {
		return null; // Registration closed
	}

	const id = nanoid();
	const passwordHash = await hashPassword(password);
	const now = new Date().toISOString();

	const user: User = {
		id,
		email,
		password_hash: passwordHash,
		name: name || null,
		role: 'admin',
		created_at: now,
		updated_at: now,
	};

	await db
		.prepare(
			'INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(
			user.id,
			user.email,
			user.password_hash,
			user.name,
			user.role,
			user.created_at,
			user.updated_at
		)
		.run();

	return user;
}

/**
 * Get user by email
 */
export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
	return await db
		.prepare('SELECT * FROM users WHERE email = ?')
		.bind(email)
		.first<User>();
}

/**
 * Get user by ID
 */
export async function getUserById(db: D1Database, id: string): Promise<User | null> {
	return await db
		.prepare('SELECT * FROM users WHERE id = ?')
		.bind(id)
		.first<User>();
}

/**
 * Create a session for a user
 */
export async function createSession(db: D1Database, userId: string): Promise<Session> {
	const id = nanoid();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

	const session: Session = {
		id,
		user_id: userId,
		expires_at: expiresAt.toISOString(),
		created_at: now.toISOString(),
	};

	await db
		.prepare(
			'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
		)
		.bind(session.id, session.user_id, session.expires_at, session.created_at)
		.run();

	return session;
}

/**
 * Get session by ID
 */
export async function getSession(db: D1Database, sessionId: string): Promise<Session | null> {
	const session = await db
		.prepare('SELECT * FROM sessions WHERE id = ?')
		.bind(sessionId)
		.first<Session>();

	if (!session) return null;

	// Check if expired
	if (new Date(session.expires_at) < new Date()) {
		await deleteSession(db, sessionId);
		return null;
	}

	return session;
}

/**
 * Delete a session
 */
export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
	await db
		.prepare('DELETE FROM sessions WHERE id = ?')
		.bind(sessionId)
		.run();
}

/**
 * Delete expired sessions
 */
export async function cleanupExpiredSessions(db: D1Database): Promise<void> {
	await db
		.prepare('DELETE FROM sessions WHERE expires_at < datetime("now")')
		.run();
}

/**
 * Get user from session ID
 */
export async function getUserFromSession(
	db: D1Database,
	sessionId: string
): Promise<User | null> {
	const session = await getSession(db, sessionId);
	if (!session) return null;

	return await getUserById(db, session.user_id);
}

/**
 * Verify user credentials and create session
 */
export async function login(
	db: D1Database,
	email: string,
	password: string
): Promise<{ user: User; session: Session } | null> {
	const user = await getUserByEmail(db, email);
	if (!user) return null;

	const isValid = await verifyPassword(password, user.password_hash);
	if (!isValid) return null;

	const session = await createSession(db, user.id);
	return { user, session };
}
