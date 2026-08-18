import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './ui/AppShell'
import { Today } from './ui/screens/Today'
import { Placeholder } from './ui/screens/Placeholder'

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<Today />} />
        <Route path="/nutrition" element={<Placeholder title="Nutrition" phase="Roadmap phase 5 — manual meal logging" />} />
        <Route path="/training" element={<Placeholder title="Training" phase="Roadmap phase 5 — workout logging" />} />
        <Route path="/recovery" element={<Placeholder title="Recovery" phase="Roadmap phase 7 — device integrations" />} />
        <Route path="/body" element={<Placeholder title="Body" phase="Roadmap phase 5 — body measurements" />} />
        <Route path="/health" element={<Placeholder title="Health" phase="Roadmap phase 14 — clinical data" />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </AppShell>
  )
}
