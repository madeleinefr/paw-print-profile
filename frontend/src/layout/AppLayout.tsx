/**
 * AppLayout - Shared page shell with role-based navigation.
 */

import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function AppLayout() {
  const { isAuthenticated, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>🐾 Paw Print Profile</h1>
        <p>Veterinary Pet Information Management</p>
      </header>

      <nav className="nav-tabs" role="navigation" aria-label="Main navigation">
        <Link to="/search">
          <button type="button">Search Lost Pets</button>
        </Link>
        <Link to="/care">
          <button type="button">Care Snapshot</button>
        </Link>

        {isAuthenticated && userRole === 'vet' && (
          <>
            <Link to="/vet/dashboard">
              <button type="button">Clinic Dashboard</button>
            </Link>
            <Link to="/vet/pets">
              <button type="button">Pet Profiles</button>
            </Link>
            <Link to="/vet/clinic">
              <button type="button">Clinic Settings</button>
            </Link>
          </>
        )}

        {isAuthenticated && userRole === 'owner' && (
          <>
            <Link to="/owner/dashboard">
              <button type="button">My Pets</button>
            </Link>
            <Link to="/owner/claim">
              <button type="button">Claim Profile</button>
            </Link>
          </>
        )}

        {isAuthenticated ? (
          <button type="button" onClick={handleLogout} style={{ marginLeft: 'auto' }}>
            Logout
          </button>
        ) : (
          <Link to="/login" style={{ marginLeft: 'auto' }}>
            <button type="button">Login</button>
          </Link>
        )}
      </nav>

      <main className="tab-content">
        <Outlet />
      </main>
    </div>
  )
}
