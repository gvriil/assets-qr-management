import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { OfflineProvider } from "./context/OfflineContext";

// Pages
import LoginPage from "./pages/LoginPage";
import ScannerPage from "./pages/ScannerPage";
import ObjectPage from "./pages/ObjectPage";
import ProgressPage from "./pages/ProgressPage";

// Admin Pages
import AdminLayout from "./pages/admin/AdminLayout";
import DashboardPage from "./pages/admin/DashboardPage";
import ObjectsPage from "./pages/admin/ObjectsPage";
import UsersPage from "./pages/admin/UsersPage";
import ImportPage from "./pages/admin/ImportPage";
import QRBatchesPage from "./pages/admin/QRBatchesPage";
import ReferencesPage from "./pages/admin/ReferencesPage";
import RatesPage from "./pages/admin/RatesPage";
import QAPage from "./pages/admin/QAPage";
import ExportPage from "./pages/admin/ExportPage";
import AuditPage from "./pages/admin/AuditPage";
import HelpPage from "./pages/admin/HelpPage";

import "./App.css";

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/scanner" replace />;
  }
  
  return children;
};

// App with Offline Provider
const AppContent = () => {
  const { api } = useAuth();
  
  return (
    <OfflineProvider api={api}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Field Worker Routes */}
        <Route 
          path="/scanner" 
          element={
            <ProtectedRoute>
              <ScannerPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/object/:id" 
          element={
            <ProtectedRoute>
              <ObjectPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/progress" 
          element={
            <ProtectedRoute>
              <ProgressPage />
            </ProtectedRoute>
          } 
        />
        
        {/* Admin Routes */}
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'operator', 'auditor']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="objects" element={<ObjectsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="qr-batches" element={<QRBatchesPage />} />
          <Route path="references" element={<ReferencesPage />} />
          <Route path="rates" element={<RatesPage />} />
          <Route path="qa" element={<QAPage />} />
          <Route path="export" element={<ExportPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
        
        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </OfflineProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
          <Toaster 
            position="top-center" 
            richColors 
            toastOptions={{
              className: 'font-sans'
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
