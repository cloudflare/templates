import { Link, useParams } from "react-router";

function Sidebar({ genres = [], counts }) {
	const params = useParams();
	const { genreId } = params;
	const activeGenre = genreId ? decodeURIComponent(genreId) : null;

	return (
		<aside className="sidebar">
			<div className="sidebar-title">Library</div>

			<nav className="sidebar-nav">
				<Link
					to="/"
					className={
						activeGenre === null ? "sidebar-link-active" : "sidebar-link"
					}
				>
					All Books
				</Link>

				<div className="sidebar-section">
					<div className="sidebar-heading">Genres</div>
					{genres.length === 0 ? (
						<div className="px-3 py-2 text-sm text-gray-600">
							Loading genres...
						</div>
					) : (
						genres.map((genre) => (
							<Link
								key={genre.name}
								to={`/genre/${encodeURIComponent(genre.name)}`}
								className={
									activeGenre === genre.name
										? "sidebar-link-active"
										: "sidebar-link"
								}
							>
								{genre.name}
								{counts && (
									<span className="ml-2 text-xs text-gray-900">
										({genre.count})
									</span>
								)}
							</Link>
						))
					)}
				</div>
			</nav>

			<div className="mt-auto pt-6 px-6">
				<div className="text-xs text-gray-900">
					Powered by
					<br />
					<a
						href="https://cloudflare.com"
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-800 hover:underline"
					>
						Cloudflare
					</a>
				</div>
			</div>
		</aside>
	);
}

export default Sidebar;
