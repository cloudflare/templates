// The brust mark, used by the top bar and the home page header.
export default function Logo({ size }: { size: number }) {
	return (
		<svg
			className="flex-none"
			viewBox="0 0 32 32"
			width={size}
			height={size}
			aria-hidden="true"
		>
			<rect width="32" height="32" rx="8" fill="#062323" />
			<path d="M7 19a9 9 0 0 1 18 0z" fill="#f2a516" />
			<rect x="5" y="20.5" width="22" height="2.2" rx="1.1" fill="#f2a516" />
			<rect
				x="10"
				y="24.6"
				width="12"
				height="2"
				rx="1"
				fill="#f2a516"
				opacity=".55"
			/>
		</svg>
	);
}
