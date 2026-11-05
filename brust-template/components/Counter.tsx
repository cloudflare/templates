// useState only, so the compiler lowers this to a native component: a signal in the browser, no React shipped.
import { useState } from "react";

export default function Counter() {
	const [count, setCount] = useState(0);
	return (
		<button
			type="button"
			className="cursor-pointer rounded-[0.6rem] border border-amber-ink bg-amber px-[1.1rem] py-2 font-semibold text-[oklch(18%_0.035_82)] hover:brightness-106 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-amber-ink"
			onClick={() => setCount(count + 1)}
		>
			count is {count}
		</button>
	);
}
