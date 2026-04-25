/**
 * VetDashboard - Clinic dashboard for veterinarians.
 * Placeholder — full implementation in issue 70
 */

import { useAuth } from '../../auth/AuthContext'

export function VetDashboard() {
  const { clinicId } = useAuth()

  return (
    <div>
      <h2>Clinic Dashboard</h2>
      <p className="text-muted">Clinic ID: {clinicId || 'Not set'}</p>
      <p className="text-muted">Pending claims and clinic management — coming soon.</p>
    </div>
  )
}
