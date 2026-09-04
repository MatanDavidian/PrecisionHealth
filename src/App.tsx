import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './ui/AppShell'
import { Today } from './ui/screens/Today'
import { Nutrition } from './ui/screens/Nutrition'
import { Log } from './ui/screens/Log'
import { Settings } from './ui/screens/Settings'
import { SignIn } from './ui/screens/SignIn'
import { Placeholder } from './ui/screens/Placeholder'
import { Policy } from './ui/screens/Policy'

export function App() {
  return (
    <AppShell>
      <Routes>
        {/* Slice 2: the camera is the front door. */}
        <Route path="/" element={<Navigate to="/log" replace />} />
        <Route path="/log" element={<Log />} />
        <Route path="/today" element={<Today />} />
        <Route path="/nutrition" element={<Nutrition />} />
        <Route path="/training" element={<Placeholder title="nav.training" phase="phase.training" />} />
        <Route path="/recovery" element={<Placeholder title="nav.recovery" phase="phase.recovery" />} />
        <Route path="/body" element={<Placeholder title="nav.body" phase="phase.body" />} />
        <Route path="/health" element={<Placeholder title="nav.health" phase="phase.health" />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/signin" element={<SignIn />} />
        {/* Readable without an account: someone deciding whether to hand over
            their health data has to be able to read what happens to it first. */}
        <Route path="/privacy" element={<Policy />} />
        <Route path="/terms" element={<Policy />} />
        <Route path="*" element={<Navigate to="/log" replace />} />
      </Routes>
    </AppShell>
  )
}
