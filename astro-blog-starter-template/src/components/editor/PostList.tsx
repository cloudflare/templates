import { useState, useEffect } from 'react';

interface Post {
	id: string;
	title: string;
	description: string;
	slug: string;
	status: 'draft' | 'published';
	pub_date: string;
	updated_date?: string | null;
}

interface PostListProps {
	onEdit: (postId: string) => void;
	onNew: () => void;
}

export default function PostList({ onEdit, onNew }: PostListProps) {
	const [posts, setPosts] = useState<Post[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);

	// Fetch posts
	useEffect(() => {
		loadPosts();
	}, []);

	const loadPosts = async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await fetch('/api/posts');
			if (!response.ok) {
				throw new Error('Failed to fetch posts');
			}

			const data = await response.json();
			setPosts(data.posts || []);
		} catch (err) {
			console.error('Error loading posts:', err);
			setError('Failed to load posts');
		} finally {
			setLoading(false);
		}
	};

	const handleDelete = async (postId: string) => {
		if (!confirm('Are you sure you want to delete this post?')) {
			return;
		}

		try {
			setDeleting(postId);

			const response = await fetch(`/api/posts/${postId}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				throw new Error('Failed to delete post');
			}

			// Remove from list
			setPosts(posts.filter(p => p.id !== postId));
		} catch (err) {
			console.error('Error deleting post:', err);
			alert('Failed to delete post');
		} finally {
			setDeleting(null);
		}
	};

	if (loading) {
		return <div className="loading">Loading posts...</div>;
	}

	if (error) {
		return (
			<div className="error">
				<p>{error}</p>
				<button onClick={loadPosts}>Retry</button>
			</div>
		);
	}

	return (
		<div className="post-list">
			<div className="header">
				<h2>Blog Posts</h2>
				<button onClick={onNew} className="new-post-btn">
					+ New Post
				</button>
			</div>

			{posts.length === 0 ? (
				<div className="empty">
					<p>No posts yet. Create your first post!</p>
					<button onClick={onNew} className="new-post-btn">
						Create Post
					</button>
				</div>
			) : (
				<div className="posts-grid">
					{posts.map(post => (
						<div key={post.id} className="post-card">
							<div className="post-header">
								<h3>{post.title}</h3>
								<span className={`status ${post.status}`}>
									{post.status}
								</span>
							</div>
							<p className="description">{post.description}</p>
							<div className="post-meta">
								<span className="date">
									{new Date(post.pub_date).toLocaleDateString()}
								</span>
								<span className="slug">/{post.slug}</span>
							</div>
							<div className="actions">
								<button
									onClick={() => onEdit(post.id)}
									className="edit-btn"
								>
									Edit
								</button>
								<button
									onClick={() => handleDelete(post.id)}
									className="delete-btn"
									disabled={deleting === post.id}
								>
									{deleting === post.id ? 'Deleting...' : 'Delete'}
								</button>
							</div>
						</div>
					))}
				</div>
			)}

			<style>{`
				.post-list {
					padding: 24px;
					max-width: 1200px;
					margin: 0 auto;
				}
				.header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 24px;
				}
				.header h2 {
					margin: 0;
					font-size: 32px;
					font-weight: 700;
				}
				.new-post-btn {
					padding: 10px 20px;
					background: #0066cc;
					color: white;
					border: none;
					border-radius: 6px;
					cursor: pointer;
					font-size: 16px;
					font-weight: 500;
				}
				.new-post-btn:hover {
					background: #0052a3;
				}
				.empty {
					text-align: center;
					padding: 48px;
					background: #f5f5f5;
					border-radius: 8px;
				}
				.empty p {
					color: #666;
					margin-bottom: 16px;
				}
				.posts-grid {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
					gap: 24px;
				}
				.post-card {
					background: white;
					border: 1px solid #e0e0e0;
					border-radius: 8px;
					padding: 20px;
					transition: box-shadow 0.2s;
				}
				.post-card:hover {
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
				}
				.post-header {
					display: flex;
					justify-content: space-between;
					align-items: start;
					margin-bottom: 12px;
				}
				.post-card h3 {
					margin: 0;
					font-size: 20px;
					font-weight: 600;
					flex: 1;
				}
				.status {
					padding: 4px 12px;
					border-radius: 12px;
					font-size: 12px;
					font-weight: 500;
					text-transform: uppercase;
				}
				.status.draft {
					background: #fef3c7;
					color: #92400e;
				}
				.status.published {
					background: #d1fae5;
					color: #065f46;
				}
				.description {
					color: #666;
					margin: 0 0 16px 0;
					font-size: 14px;
					line-height: 1.5;
				}
				.post-meta {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 16px;
					font-size: 13px;
					color: #999;
				}
				.slug {
					font-family: monospace;
					background: #f5f5f5;
					padding: 2px 8px;
					border-radius: 4px;
				}
				.actions {
					display: flex;
					gap: 8px;
				}
				.edit-btn, .delete-btn {
					flex: 1;
					padding: 8px 16px;
					border: 1px solid #e0e0e0;
					border-radius: 4px;
					cursor: pointer;
					font-size: 14px;
					font-weight: 500;
					transition: all 0.2s;
				}
				.edit-btn {
					background: white;
					color: #0066cc;
				}
				.edit-btn:hover {
					background: #f0f9ff;
					border-color: #0066cc;
				}
				.delete-btn {
					background: white;
					color: #dc2626;
				}
				.delete-btn:hover:not(:disabled) {
					background: #fef2f2;
					border-color: #dc2626;
				}
				.delete-btn:disabled {
					opacity: 0.5;
					cursor: not-allowed;
				}
				.loading, .error {
					text-align: center;
					padding: 48px;
				}
			`}</style>
		</div>
	);
}
