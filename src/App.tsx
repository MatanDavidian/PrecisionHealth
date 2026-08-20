import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './ui/AppShell'
import { Today } from './ui/screens/Today'
import { Nutrition } from './ui/screens/Nutrition'
import { Placeholder } from './ui/screens/Placeholder'

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<Today />} />
        <Route path="/nutrition" element={<Nutrition />} />
        <Route path="/training" element={<Placeholder title="Training" phase="a later slice — workout logging" />} />
        <Route path="/recovery" element={<Placeholder title="Recovery" phase="slice 4 — Garmin import" />} />
        <Route path="/body" element={<Placeholder title="Body" phase="a later slice — body measurements" />} />
        <Route path="/health" element={<Placeholder title="Health" phase="a later slice — clinical data" />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </AppShell>
  )
}
