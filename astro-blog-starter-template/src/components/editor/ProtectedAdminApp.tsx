import { useState, useEffect } from 'react';
import AdminApp from './AdminApp';
import AuthForm from '../auth/AuthForm';

export default function ProtectedAdminApp() {
	const [authenticated, setAuthenticated] = useState(false);
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		checkAuth();
	}, []);

	async function checkAuth() {
		try {
			const response = await fetch('/api/auth/check');
			const data = await response.json();
			setAuthenticated(data.authenticated);
		} catch (error) {
			console.error('Error checking auth:', error);
		} finally {
			setChecking(false);
		}
	}

	if (checking) {
		return (
			<div style={{ padding: '40px', textAlign: 'center' }}>
				Loading...
			</div>
		);
	}

	if (!authenticated) {
		return <AuthForm onAuthSuccess={() => setAuthenticated(true)} />;
	}

	return <AdminApp />;
}
