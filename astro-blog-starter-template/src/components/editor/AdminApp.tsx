import { useState } from 'react';
import PostList from './PostList';
import PostEditor from './PostEditor';

type View = 'list' | 'edit' | 'new';

export default function AdminApp() {
	const [view, setView] = useState<View>('list');
	const [editingPostId, setEditingPostId] = useState<string | undefined>();

	const handleNew = () => {
		setEditingPostId(undefined);
		setView('new');
	};

	const handleEdit = (postId: string) => {
		setEditingPostId(postId);
		setView('edit');
	};

	const handleCancel = () => {
		setEditingPostId(undefined);
		setView('list');
	};

	const handleSaved = () => {
		setEditingPostId(undefined);
		setView('list');
	};

	return (
		<div className="admin-app">
			{view === 'list' && (
				<PostList
					onEdit={handleEdit}
					onNew={handleNew}
				/>
			)}

			{(view === 'edit' || view === 'new') && (
				<PostEditor
					postId={editingPostId}
					onCancel={handleCancel}
					onSaved={handleSaved}
				/>
			)}

			<style>{`
				.admin-app {
					min-height: 100vh;
					background: #f9fafb;
				}
			`}</style>
		</div>
	);
}
