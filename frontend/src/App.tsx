import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RouteGuard } from './auth/RouteGuard'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { SearchPage } from './pages/SearchPage'
import { VetDashboard } from './pages/vet/VetDashboard'
import { VetPets } from './pages/vet/VetPets'
import { OwnerDashboard } from './pages/owner/OwnerDashboard'
import { ClaimPage } from './pages/owner/ClaimPage'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Public routes */}
            <Route path="/search" element={<SearchPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Vet-only routes */}
            <Route element={<RouteGuard allowedRole="vet" />}>
              <Route path="/vet/dashboard" element={<VetDashboard />} />
              <Route path="/vet/pets" element={<VetPets />} />
            </Route>

            {/* Owner-only routes */}
            <Route element={<RouteGuard allowedRole="owner" />}>
              <Route path="/owner/dashboard" element={<OwnerDashboard />} />
              <Route path="/owner/claim" element={<ClaimPage />} />
            </Route>

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/search" replace />} />
            <Route path="*" element={<Navigate to="/search" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
