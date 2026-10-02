import { FileArrowDown } from "@phosphor-icons/react";
import { Button } from "./button";

/**
 * Stratus DownloadCsvButton: size="sm" shape="square" icon={<FileArrowDownIcon size={18} />}
 */
export function DownloadButton({
	href,
	onClick,
	label = "Export CSV",
}: {
	href?: string;
	onClick?: () => void;
	label?: string;
}) {
	return (
		<Button
			variant="secondary"
			size="square"
			title={label}
			aria-label={label}
			onClick={onClick ?? (() => href && window.open(href, "_blank"))}
			icon={<FileArrowDown size={18} />}
		/>
	);
}
