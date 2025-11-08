import { useState, useEffect } from 'react';
import BlogEditor from './BlogEditor';
import TagInput from './TagInput';

interface Post {
	id: string;
	title: string;
	description: string;
	content: string;
	slug: string;
	hero_image?: string;
	status: 'draft' | 'published';
	pub_date: string;
}

interface PostEditorProps {
	postId?: string;
	onCancel: () => void;
	onSaved: () => void;
}

export default function PostEditor({ postId, onCancel, onSaved }: PostEditorProps) {
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [slug, setSlug] = useState('');
	const [heroImage, setHeroImage] = useState('');
	const [status, setStatus] = useState<'draft' | 'published'>('draft');
	const [content, setContent] = useState('');
	const [tags, setTags] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Load existing post if editing
	useEffect(() => {
		if (postId) {
			loadPost(postId);
		}
	}, [postId]);

	const loadPost = async (id: string) => {
		try {
			setLoading(true);
			setError(null);

			const response = await fetch(`/api/posts/${id}`);
			if (!response.ok) {
				throw new Error('Failed to load post');
			}

			const data = await response.json();
			const post: Post = data.post;

			setTitle(post.title);
			setDescription(post.description);
			setSlug(post.slug);
			setHeroImage(post.hero_image || '');
			setStatus(post.status);
			setContent(post.content);
		} catch (err) {
			console.error('Error loading post:', err);
			setError('Failed to load post');
		} finally {
			setLoading(false);
		}
	};

	const handleSave = async () => {
		if (!title.trim()) {
			alert('Please enter a title');
			return;
		}
		if (!description.trim()) {
			alert('Please enter a description');
			return;
		}

		try {
			setSaving(true);
			setError(null);

			const postData = {
				title,
				description,
				content,
				slug: slug.trim() || undefined,
				hero_image: heroImage.trim() || undefined,
				status,
			};

			let response;
			if (postId) {
				// Update existing post
				response = await fetch(`/api/posts/${postId}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(postData),
				});
			} else {
				// Create new post
				response = await fetch('/api/posts', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(postData),
				});
			}

			if (!response.ok) {
				throw new Error('Failed to save post');
			}

			const data = await response.json();
			const savedPostId = postId || data.post?.id;

			// Save tags if post was created/updated
			if (savedPostId && tags.length > 0) {
				try {
					await fetch(`/api/posts/${savedPostId}/tags`, {
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({ tags }),
					});
				} catch (tagError) {
					console.error('Error saving tags:', tagError);
					// Don't fail the whole save if tags fail
				}
			}

			onSaved();
		} catch (err) {
			console.error('Error saving post:', err);
			setError('Failed to save post');
		} finally {
			setSaving(false);
		}
	};

	const handlePublish = async () => {
		setStatus('published');
		// Wait a tick for state to update, then save
		setTimeout(() => handleSave(), 0);
	};

	if (loading) {
		return <div className="loading">Loading post...</div>;
	}

	return (
		<div className="post-editor-container">
			<div className="editor-header">
				<h2>{postId ? 'Edit Post' : 'Create New Post'}</h2>
				<button onClick={onCancel} className="cancel-btn">
					← Back to Posts
				</button>
			</div>

			{error && (
				<div className="error-banner">
					{error}
				</div>
			)}

			<div className="form-section">
				<div className="form-row">
					<div className="form-group">
						<label htmlFor="title">Title *</label>
						<input
							id="title"
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Enter post title"
							className="form-input"
						/>
					</div>
				</div>

				<div className="form-row">
					<div className="form-group">
						<label htmlFor="description">Description *</label>
						<textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Brief description of the post"
							className="form-textarea"
							rows={3}
						/>
					</div>
				</div>

				<div className="form-row two-col">
					<div className="form-group">
						<label htmlFor="slug">URL Slug</label>
						<input
							id="slug"
							type="text"
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							placeholder="auto-generated-from-title"
							className="form-input"
						/>
						<small>Leave empty to auto-generate from title</small>
					</div>

					<div className="form-group">
						<label htmlFor="heroImage">Hero Image URL</label>
						<input
							id="heroImage"
							type="url"
							value={heroImage}
							onChange={(e) => setHeroImage(e.target.value)}
							placeholder="https://example.com/image.jpg"
							className="form-input"
						/>
					</div>
				</div>

				<TagInput postId={postId} onChange={setTags} />
			</div>

			<div className="content-section">
				<label>Content</label>
				<BlogEditor
					postId={postId || 'new'}
					initialContent={content}
					onChange={setContent}
					onSave={setContent}
				/>
			</div>

			<div className="actions-bar">
				<div className="status-selector">
					<label>
						<input
							type="radio"
							value="draft"
							checked={status === 'draft'}
							onChange={() => setStatus('draft')}
						/>
						Save as Draft
					</label>
					<label>
						<input
							type="radio"
							value="published"
							checked={status === 'published'}
							onChange={() => setStatus('published')}
						/>
						Published
					</label>
				</div>

				<div className="action-buttons">
					<button
						onClick={handleSave}
						disabled={saving}
						className="save-btn"
					>
						{saving ? 'Saving...' : 'Save'}
					</button>
					{status === 'draft' && (
						<button
							onClick={handlePublish}
							disabled={saving}
							className="publish-btn"
						>
							Publish Now
						</button>
					)}
				</div>
			</div>

			<style>{`
				.post-editor-container {
					max-width: 900px;
					margin: 0 auto;
					padding: 24px;
				}
				.editor-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 24px;
				}
				.editor-header h2 {
					margin: 0;
					font-size: 28px;
					font-weight: 700;
				}
				.cancel-btn {
					padding: 8px 16px;
					background: white;
					border: 1px solid #e0e0e0;
					border-radius: 4px;
					cursor: pointer;
					font-size: 14px;
				}
				.cancel-btn:hover {
					background: #f5f5f5;
				}
				.error-banner {
					background: #fef2f2;
					border: 1px solid #fecaca;
					color: #dc2626;
					padding: 12px;
					border-radius: 6px;
					margin-bottom: 24px;
				}
				.form-section {
					background: white;
					padding: 24px;
					border-radius: 8px;
					border: 1px solid #e0e0e0;
					margin-bottom: 24px;
				}
				.form-row {
					margin-bottom: 20px;
				}
				.form-row:last-child {
					margin-bottom: 0;
				}
				.form-row.two-col {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 16px;
				}
				.form-group {
					display: flex;
					flex-direction: column;
				}
				.form-group label {
					font-weight: 600;
					margin-bottom: 8px;
					color: #333;
				}
				.form-group small {
					margin-top: 4px;
					color: #666;
					font-size: 13px;
				}
				.form-input, .form-textarea {
					padding: 10px 12px;
					border: 1px solid #e0e0e0;
					border-radius: 4px;
					font-size: 14px;
					font-family: inherit;
				}
				.form-input:focus, .form-textarea:focus {
					outline: none;
					border-color: #0066cc;
					box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
				}
				.content-section {
					margin-bottom: 24px;
				}
				.content-section > label {
					display: block;
					font-weight: 600;
					margin-bottom: 12px;
					color: #333;
				}
				.actions-bar {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 20px;
					background: white;
					border: 1px solid #e0e0e0;
					border-radius: 8px;
				}
				.status-selector {
					display: flex;
					gap: 24px;
				}
				.status-selector label {
					display: flex;
					align-items: center;
					gap: 8px;
					cursor: pointer;
					font-size: 14px;
				}
				.status-selector input[type="radio"] {
					cursor: pointer;
				}
				.action-buttons {
					display: flex;
					gap: 12px;
				}
				.save-btn, .publish-btn {
					padding: 10px 24px;
					border: none;
					border-radius: 6px;
					cursor: pointer;
					font-size: 14px;
					font-weight: 500;
					transition: all 0.2s;
				}
				.save-btn {
					background: #0066cc;
					color: white;
				}
				.save-btn:hover:not(:disabled) {
					background: #0052a3;
				}
				.publish-btn {
					background: #22c55e;
					color: white;
				}
				.publish-btn:hover:not(:disabled) {
					background: #16a34a;
				}
				.save-btn:disabled, .publish-btn:disabled {
					opacity: 0.5;
					cursor: not-allowed;
				}
				.loading {
					text-align: center;
					padding: 48px;
				}
			`}</style>
		</div>
	);
}
