import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/genre/:genreId" element={<App />} />
        <Route path="/book/:bookId" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
