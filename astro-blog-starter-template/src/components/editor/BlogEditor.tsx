import { useEffect, useState, useCallback } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import type { BlockNoteEditor, PartialBlock } from '@blocknote/core';

interface BlogEditorProps {
	postId: string;
	initialContent?: string;
	onSave?: (content: string) => void;
	onChange?: (content: string) => void;
}

export default function BlogEditor({ postId, initialContent, onSave, onChange }: BlogEditorProps) {
	const [isSaving, setIsSaving] = useState(false);
	const [lastSaved, setLastSaved] = useState<Date | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [previewMode, setPreviewMode] = useState(false);

	// Parse initial content
	const getInitialBlocks = (): PartialBlock[] | undefined => {
		if (!initialContent) return undefined;
		try {
			return JSON.parse(initialContent) as PartialBlock[];
		} catch (error) {
			console.error('Failed to parse initial content:', error);
			return undefined;
		}
	};

	// Create the BlockNote editor
	const editor: BlockNoteEditor = useCreateBlockNote({
		initialContent: getInitialBlocks(),
	});

	// Auto-save to KV (drafts)
	const autoSave = useCallback(async (content: string) => {
		setIsSaving(true);
		setSaveError(null);

		try {
			const response = await fetch(`/api/drafts/${postId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ content }),
			});

			if (!response.ok) {
				throw new Error('Failed to save draft');
			}

			setLastSaved(new Date());
		} catch (error) {
			console.error('Auto-save error:', error);
			setSaveError('Failed to auto-save');
		} finally {
			setIsSaving(false);
		}
	}, [postId]);

	// Handle editor changes
	const handleChange = useCallback(() => {
		const blocks = editor.document;
		const content = JSON.stringify(blocks);

		// Trigger onChange callback
		if (onChange) {
			onChange(content);
		}

		// Auto-save after 2 seconds of inactivity
		const timeoutId = setTimeout(() => {
			autoSave(content);
		}, 2000);

		return () => clearTimeout(timeoutId);
	}, [editor, onChange, autoSave]);

	// Manual save handler
	const handleManualSave = useCallback(() => {
		const blocks = editor.document;
		const content = JSON.stringify(blocks);

		if (onSave) {
			onSave(content);
		}
	}, [editor, onSave]);

	// Render blocks as HTML for preview
	const renderPreview = () => {
		const blocks = editor.document;
		return blocks.map((block: any, index: number) => {
			if (block.type === 'paragraph') {
				const text = block.content?.map((c: any) => c.text || '').join('') || '';
				return <p key={index}>{text}</p>;
			}
			if (block.type === 'heading') {
				const level = block.props?.level || 1;
				const text = block.content?.map((c: any) => c.text || '').join('') || '';
				const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
				return <HeadingTag key={index}>{text}</HeadingTag>;
			}
			if (block.type === 'bulletListItem') {
				const text = block.content?.map((c: any) => c.text || '').join('') || '';
				return <li key={index}>{text}</li>;
			}
			if (block.type === 'numberedListItem') {
				const text = block.content?.map((c: any) => c.text || '').join('') || '';
				return <li key={index}>{text}</li>;
			}
			return null;
		});
	};

	return (
		<div className="blog-editor">
			<div className="editor-toolbar">
				<div className="save-status">
					{isSaving && <span className="saving">Saving...</span>}
					{!isSaving && lastSaved && (
						<span className="saved">
							Last saved: {lastSaved.toLocaleTimeString()}
						</span>
					)}
					{saveError && <span className="error">{saveError}</span>}
				</div>
				<div className="toolbar-actions">
					<button
						onClick={() => setPreviewMode(!previewMode)}
						className="preview-button"
					>
						{previewMode ? '✏️ Edit' : '👁 Preview'}
					</button>
					<button
						onClick={handleManualSave}
						className="save-button"
					>
						Save Now
					</button>
				</div>
			</div>
			{!previewMode ? (
				<BlockNoteView
					editor={editor}
					onChange={handleChange}
					theme="light"
				/>
			) : (
				<div className="preview-content">
					{renderPreview()}
				</div>
			)}
			<style>{`
				.blog-editor {
					border: 1px solid #e0e0e0;
					border-radius: 8px;
					overflow: hidden;
					background: white;
				}
				.editor-toolbar {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 12px 16px;
					background: #f5f5f5;
					border-bottom: 1px solid #e0e0e0;
				}
				.save-status {
					font-size: 14px;
					color: #666;
				}
				.save-status .saving {
					color: #0066cc;
				}
				.save-status .saved {
					color: #22c55e;
				}
				.save-status .error {
					color: #ef4444;
				}
				.toolbar-actions {
					display: flex;
					gap: 8px;
				}
				.preview-button {
					padding: 6px 16px;
					background: white;
					color: #0066cc;
					border: 1px solid #0066cc;
					border-radius: 4px;
					cursor: pointer;
					font-size: 14px;
					font-weight: 500;
				}
				.preview-button:hover {
					background: #f0f9ff;
				}
				.save-button {
					padding: 6px 16px;
					background: #0066cc;
					color: white;
					border: none;
					border-radius: 4px;
					cursor: pointer;
					font-size: 14px;
					font-weight: 500;
				}
				.save-button:hover {
					background: #0052a3;
				}
				.preview-content {
					padding: 32px;
					min-height: 400px;
					background: white;
					line-height: 1.8;
				}
				.preview-content h1 {
					font-size: 32px;
					font-weight: 700;
					margin: 0 0 16px 0;
				}
				.preview-content h2 {
					font-size: 28px;
					font-weight: 600;
					margin: 24px 0 12px 0;
				}
				.preview-content h3 {
					font-size: 24px;
					font-weight: 600;
					margin: 20px 0 10px 0;
				}
				.preview-content p {
					margin: 0 0 16px 0;
					color: #333;
				}
				.preview-content li {
					margin: 0 0 8px 0;
					color: #333;
				}
			`}</style>
		</div>
	);
}
