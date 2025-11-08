import { useState, useEffect } from 'react';

interface TagInputProps {
	postId?: string;
	onChange?: (tags: string[]) => void;
}

export default function TagInput({ postId, onChange }: TagInputProps) {
	const [tags, setTags] = useState<string[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [allTags, setAllTags] = useState<string[]>([]);

	useEffect(() => {
		loadAllTags();
		if (postId) {
			loadPostTags();
		}
	}, [postId]);

	useEffect(() => {
		if (onChange) {
			onChange(tags);
		}
	}, [tags]);

	const loadAllTags = async () => {
		try {
			const response = await fetch('/api/tags');
			if (response.ok) {
				const data = await response.json();
				setAllTags(data.tags || []);
			}
		} catch (error) {
			console.error('Error loading tags:', error);
		}
	};

	const loadPostTags = async () => {
		if (!postId) return;

		try {
			const response = await fetch(`/api/posts/${postId}/tags`);
			if (response.ok) {
				const data = await response.json();
				setTags(data.tags || []);
			}
		} catch (error) {
			console.error('Error loading post tags:', error);
		}
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setInputValue(value);

		// Show suggestions
		if (value.trim()) {
			const filtered = allTags.filter(
				tag => tag.includes(value.toLowerCase()) && !tags.includes(tag)
			);
			setSuggestions(filtered);
		} else {
			setSuggestions([]);
		}
	};

	const addTag = (tag: string) => {
		const normalizedTag = tag.toLowerCase().trim();
		if (normalizedTag && !tags.includes(normalizedTag)) {
			setTags([...tags, normalizedTag]);
		}
		setInputValue('');
		setSuggestions([]);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			if (inputValue.trim()) {
				addTag(inputValue);
			}
		} else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
			setTags(tags.slice(0, -1));
		}
	};

	const removeTag = (tagToRemove: string) => {
		setTags(tags.filter(tag => tag !== tagToRemove));
	};

	return (
		<div className="tag-input">
			<label>Tags</label>
			<div className="tag-container">
				{tags.map(tag => (
					<span key={tag} className="tag">
						{tag}
						<button
							type="button"
							onClick={() => removeTag(tag)}
							className="remove-tag"
						>
							×
						</button>
					</span>
				))}
				<input
					type="text"
					value={inputValue}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					placeholder="Add tags (press Enter or comma)"
					className="tag-input-field"
				/>
			</div>

			{suggestions.length > 0 && (
				<div className="suggestions">
					{suggestions.map(tag => (
						<button
							key={tag}
							type="button"
							onClick={() => addTag(tag)}
							className="suggestion"
						>
							{tag}
						</button>
					))}
				</div>
			)}

			<style>{`
				.tag-input {
					margin-bottom: 20px;
				}
				.tag-input label {
					display: block;
					font-weight: 600;
					margin-bottom: 8px;
					color: #333;
				}
				.tag-container {
					display: flex;
					flex-wrap: wrap;
					gap: 8px;
					padding: 8px;
					border: 1px solid #e0e0e0;
					border-radius: 4px;
					min-height: 42px;
					align-items: center;
				}
				.tag {
					display: inline-flex;
					align-items: center;
					gap: 4px;
					padding: 4px 8px;
					background: #667eea;
					color: white;
					border-radius: 12px;
					font-size: 13px;
					font-weight: 500;
				}
				.remove-tag {
					background: none;
					border: none;
					color: white;
					cursor: pointer;
					font-size: 18px;
					line-height: 1;
					padding: 0;
					margin-left: 2px;
				}
				.remove-tag:hover {
					opacity: 0.8;
				}
				.tag-input-field {
					flex: 1;
					min-width: 150px;
					border: none;
					outline: none;
					font-size: 14px;
					padding: 4px;
				}
				.suggestions {
					margin-top: 4px;
					border: 1px solid #e0e0e0;
					border-radius: 4px;
					background: white;
					max-height: 150px;
					overflow-y: auto;
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
				}
				.suggestion {
					display: block;
					width: 100%;
					padding: 8px 12px;
					border: none;
					background: white;
					text-align: left;
					cursor: pointer;
					font-size: 14px;
					transition: background 0.2s;
				}
				.suggestion:hover {
					background: #f5f5f5;
				}
			`}</style>
		</div>
	);
}
