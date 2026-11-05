import { defineRoutes } from "@brust/core/routes";
import Layout, { layoutLoader } from "./components/Layout";
import ActionsPage from "./pages/ActionsPage";
import HomePage from "./pages/HomePage";

export const routes = defineRoutes([
	{
		Component: Layout,
		loader: layoutLoader,
		children: [
			{ path: "/", Component: HomePage },
			{ path: "/actions", Component: ActionsPage },
		],
	},
]);
