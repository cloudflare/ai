import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import App from "./App";
import OAuthCallbackPage from "./OAuthCallbackPage";
import "./index.css";

const router = createBrowserRouter([
	{
		path: "/",
		element: <App />,
	},
	{
		path: "/oauth/callback",
		element: <OAuthCallbackPage />,
	},
	{
		path: "*",
		element: <Navigate to="/" replace />,
	},
]);

ReactDOM.createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
