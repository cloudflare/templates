export function Header({ domain }: { domain?: string }) {
	return (
		<header className="sticky top-0 z-50 h-[58px] bg-surface border-b border-neutral-200 flex items-center px-4 sm:px-6">
			<div className="flex items-center gap-3 flex-1 min-w-0">
				{/* Cloudflare wordmark */}
				<svg
					height="18"
					viewBox="0 0 109 40"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M88.17 23.63l.31-.94c.37-1.27.23-2.44-.39-3.33-.58-.8-1.53-1.27-2.7-1.33l-21.8-.28a.32.32 0 01-.25-.17.31.31 0 01.02-.32.38.38 0 01.39-.33l21.93-.28c2.6-.12 5.42-2.25 6.4-4.85l1.25-3.28a.34.34 0 00.01-.43c-1.43-6.44-7.14-11.24-13.97-11.24-6.28 0-11.62 4.08-13.54 9.75-1.29-.98-2.93-1.43-4.54-1.27-3.01.3-5.44 2.73-5.74 5.73a7.16 7.16 0 00.17 2.25c-4.93.14-8.89 4.2-8.89 9.17 0 .44.03.88.1 1.32a.35.35 0 00.34.3l40.16.01a.35.35 0 00.32-.33z"
						fill="#F6821F"
					/>
					<path
						d="M96.4 8.93c-.2 0-.4.01-.6.02a.25.25 0 00-.27.23l-.86 3.07c-.37 1.27-.23 2.45.39 3.32.57.8 1.52 1.27 2.69 1.32l4.64.28a.32.32 0 01.32.16.32.32 0 01-.03.33.37.37 0 01-.4.15l-4.82.28c-2.62.12-5.44 2.24-6.43 4.82l-.35.92a.2.2 0 00.25.26l16.58.01a.35.35 0 00.37-.32c.05-.59.08-1.19.08-1.83 0-6.58-5.33-11.92-11.9-11.92z"
						fill="#FBAD41"
					/>
				</svg>
				<div className="w-px h-6 bg-neutral-200 shrink-0" />
				<span className="text-sm font-medium text-neutral-900">
					AI Brand Visibility Template
					{domain && (
						<span className="text-neutral-500 font-normal ml-1">
							· {domain}
						</span>
					)}
				</span>
			</div>
		</header>
	);
}
