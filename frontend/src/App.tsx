const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function App() {
  return (
    <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'sans-serif' }}>
      <h1>🐾 Paw Print Profile</h1>
      <p>Frontend scaffolding successful. React and Vite are running!</p>
      <p style={{ color: 'gray', fontSize: '0.9em' }}>
        Targeting API at: <code>{API_BASE_URL}</code>
      </p>
    </div>
  )
}

export default App
