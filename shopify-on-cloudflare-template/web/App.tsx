import { NavMenu } from "@shopify/app-bridge-react";
import { Link, Route, Routes } from "react-router-dom";
import BugSnagBoundary from "./bugsnag";
import Home from "./Pages/Home";

export default function App() {
	return (
		<BugSnagBoundary>
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="*" element={<Home />} />
			</Routes>
			<NavMenu>
				<Link to="/">Home</Link>
			</NavMenu>
		</BugSnagBoundary>
	);
}
