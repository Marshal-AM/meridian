import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { SupplierPage } from "./pages/SupplierPage";
import { SupplierFinancingPage } from "./pages/SupplierFinancingPage";
import { BuyerPage } from "./pages/BuyerPage";
import { FinancierPage } from "./pages/FinancierPage";
import { FinancierSyndicationPage } from "./pages/FinancierSyndicationPage";
import "./index.css";

function App() {
  return (
    <div className="app-shell">
      <nav>
        <NavLink to="/supplier" className={({ isActive }) => (isActive ? "active" : "")}>
          Supplier
        </NavLink>
        <NavLink
          to="/supplier/financing"
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          Financing
        </NavLink>
        <NavLink to="/buyer" className={({ isActive }) => (isActive ? "active" : "")}>
          Buyer
        </NavLink>
        <NavLink to="/financier" className={({ isActive }) => (isActive ? "active" : "")}>
          Financier
        </NavLink>
        <NavLink
          to="/financier/syndication"
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          Syndication
        </NavLink>
      </nav>
      <Routes>
        <Route path="/supplier" element={<SupplierPage />} />
        <Route path="/supplier/financing" element={<SupplierFinancingPage />} />
        <Route path="/buyer" element={<BuyerPage />} />
        <Route path="/financier" element={<FinancierPage />} />
        <Route path="/financier/syndication" element={<FinancierSyndicationPage />} />
        <Route path="*" element={<SupplierPage />} />
      </Routes>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
