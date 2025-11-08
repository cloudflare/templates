import { useState, useEffect } from 'react';

interface SearchResult {
	id: string;
	title: string;
	description: string;
	slug: string;
	pub_date: string;
}

export default function SearchBox() {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchResult[]>([]);
	const [searching, setSearching] = useState(false);
	const [showResults, setShowResults] = useState(false);

	useEffect(() => {
		if (!query.trim()) {
			setResults([]);
			setShowResults(false);
			return;
		}

		const timeoutId = setTimeout(() => {
			performSearch(query);
		}, 300); // Debounce search

		return () => clearTimeout(timeoutId);
	}, [query]);

	const performSearch = async (searchQuery: string) => {
		setSearching(true);
		try {
			const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
			if (response.ok) {
				const data = await response.json();
				setResults(data.posts || []);
				setShowResults(true);
			}
		} catch (error) {
			console.error('Error searching:', error);
		} finally {
			setSearching(false);
		}
	};

	const handleBlur = () => {
		// Delay to allow click on results
		setTimeout(() => setShowResults(false), 200);
	};

	return (
		<div className="search-box">
			<div className="search-input-wrapper">
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onFocus={() => query && setShowResults(true)}
					onBlur={handleBlur}
					placeholder="Search posts..."
					className="search-input"
				/>
				{searching && <span className="searching-indicator">Searching...</span>}
			</div>

			{showResults && results.length > 0 && (
				<div className="search-results">
					{results.map(post => (
						<a
							key={post.id}
							href={`/blog/${post.slug}/`}
							className="search-result"
						>
							<h4>{post.title}</h4>
							<p>{post.description}</p>
							<span className="date">
								{new Date(post.pub_date).toLocaleDateString()}
							</span>
						</a>
					))}
				</div>
			)}

			{showResults && query && results.length === 0 && !searching && (
				<div className="search-results">
					<div className="no-results">No posts found for "{query}"</div>
				</div>
			)}

			<style>{`
				.search-box {
					position: relative;
					margin-bottom: 40px;
				}
				.search-input-wrapper {
					position: relative;
				}
				.search-input {
					width: 100%;
					padding: 12px 16px;
					border: 2px solid #e0e0e0;
					border-radius: 8px;
					font-size: 16px;
					transition: border-color 0.2s;
				}
				.search-input:focus {
					outline: none;
					border-color: #667eea;
				}
				.searching-indicator {
					position: absolute;
					right: 16px;
					top: 50%;
					transform: translateY(-50%);
					color: #667eea;
					font-size: 14px;
				}
				.search-results {
					position: absolute;
					top: 100%;
					left: 0;
					right: 0;
					background: white;
					border: 1px solid #e0e0e0;
					border-radius: 8px;
					margin-top: 8px;
					max-height: 400px;
					overflow-y: auto;
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
					z-index: 10;
				}
				.search-result {
					display: block;
					padding: 16px;
					border-bottom: 1px solid #f0f0f0;
					text-decoration: none;
					color: inherit;
					transition: background 0.2s;
				}
				.search-result:last-child {
					border-bottom: none;
				}
				.search-result:hover {
					background: #f9fafb;
				}
				.search-result h4 {
					margin: 0 0 8px 0;
					font-size: 16px;
					font-weight: 600;
					color: #1a202c;
				}
				.search-result p {
					margin: 0 0 8px 0;
					font-size: 14px;
					color: #666;
					line-height: 1.5;
				}
				.search-result .date {
					font-size: 13px;
					color: #999;
				}
				.no-results {
					padding: 16px;
					text-align: center;
					color: #666;
				}
			`}</style>
		</div>
	);
}
