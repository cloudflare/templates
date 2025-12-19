import { useState } from "react";

/**
 * BackgroundDots component - creates an SVG pattern of dots for the diagram background
 */
export function BackgroundDots({ size = 12 }: { size?: number }) {
	const [id] = useState(
		() => `bg-dots-${Math.random().toString(36).substr(2, 9)}`,
	);

	return (
		<svg width="100%" height="100%">
			<defs>
				<pattern
					id={id}
					viewBox={`-${size / 2} -${size / 2} ${size} ${size}`}
					patternUnits="userSpaceOnUse"
					width={size}
					height={size}
				>
					<circle cx="0" cy="0" r="1" fill="currentColor" />
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill={`url(#${id})`} />
		</svg>
	);
}
