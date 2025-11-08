import { useState, useEffect } from 'react';

interface AuthFormProps {
	onAuthSuccess: () => void;
}

export default function AuthForm({ onAuthSuccess }: AuthFormProps) {
	const [mode, setMode] = useState<'login' | 'register'>('login');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [registrationOpen, setRegistrationOpen] = useState(false);
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		checkAuthStatus();
	}, []);

	const checkAuthStatus = async () => {
		try {
			const response = await fetch('/api/auth/check');
			const data = await response.json();

			if (data.authenticated) {
				onAuthSuccess();
				return;
			}

			setRegistrationOpen(data.registrationOpen);
			setMode(data.registrationOpen ? 'register' : 'login');
		} catch (err) {
			console.error('Error checking auth status:', err);
		} finally {
			setChecking(false);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
			const body = mode === 'login'
				? { email, password }
				: { email, password, name };

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Authentication failed');
			}

			if (mode === 'register') {
				// After registration, switch to login
				setMode('login');
				setError('Account created! Please log in.');
				setPassword('');
			} else {
				// Login successful
				onAuthSuccess();
			}
		} catch (err: any) {
			setError(err.message || 'Authentication failed');
		} finally {
			setLoading(false);
		}
	};

	if (checking) {
		return (
			<div className="auth-form">
				<div className="checking">Checking authentication...</div>
				<style>{styles}</style>
			</div>
		);
	}

	return (
		<div className="auth-form">
			<div className="auth-card">
				<h2>{mode === 'login' ? 'Admin Login' : 'Create Admin Account'}</h2>

				{mode === 'register' && (
					<p className="info">
						This is a one-time setup. Create the admin account to manage your blog.
					</p>
				)}

				{error && (
					<div className={`message ${error.includes('created') ? 'success' : 'error'}`}>
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit}>
					{mode === 'register' && (
						<div className="form-group">
							<label htmlFor="name">Name (optional)</label>
							<input
								id="name"
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Your name"
							/>
						</div>
					)}

					<div className="form-group">
						<label htmlFor="email">Email</label>
						<input
							id="email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="admin@example.com"
							required
						/>
					</div>

					<div className="form-group">
						<label htmlFor="password">Password</label>
						<input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							minLength={8}
							required
						/>
						{mode === 'register' && (
							<small>Minimum 8 characters</small>
						)}
					</div>

					<button type="submit" disabled={loading} className="submit-btn">
						{loading
							? 'Please wait...'
							: mode === 'login'
							? 'Log In'
							: 'Create Account'}
					</button>
				</form>

				{!registrationOpen && (
					<p className="switch">
						Don't have an account? Registration is closed.
					</p>
				)}
			</div>

			<style>{styles}</style>
		</div>
	);
}

const styles = `
	.auth-form {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 20px;
	}
	.checking {
		color: white;
		font-size: 18px;
	}
	.auth-card {
		background: white;
		border-radius: 12px;
		padding: 40px;
		width: 100%;
		max-width: 400px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}
	.auth-card h2 {
		margin: 0 0 8px 0;
		font-size: 28px;
		font-weight: 700;
		color: #1a202c;
	}
	.info {
		color: #718096;
		font-size: 14px;
		margin: 0 0 24px 0;
		line-height: 1.5;
	}
	.message {
		padding: 12px;
		border-radius: 6px;
		margin-bottom: 20px;
		font-size: 14px;
	}
	.message.error {
		background: #fef2f2;
		color: #dc2626;
		border: 1px solid #fecaca;
	}
	.message.success {
		background: #f0fdf4;
		color: #16a34a;
		border: 1px solid #bbf7d0;
	}
	.form-group {
		margin-bottom: 20px;
	}
	.form-group label {
		display: block;
		margin-bottom: 8px;
		font-weight: 600;
		color: #374151;
		font-size: 14px;
	}
	.form-group input {
		width: 100%;
		padding: 12px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 14px;
		transition: border-color 0.2s;
	}
	.form-group input:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}
	.form-group small {
		display: block;
		margin-top: 4px;
		color: #6b7280;
		font-size: 13px;
	}
	.submit-btn {
		width: 100%;
		padding: 12px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.2s, box-shadow 0.2s;
	}
	.submit-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
	}
	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.switch {
		margin-top: 20px;
		text-align: center;
		color: #6b7280;
		font-size: 14px;
	}
	.switch button {
		background: none;
		border: none;
		color: #667eea;
		cursor: pointer;
		font-weight: 600;
		padding: 0;
		text-decoration: underline;
	}
`;
