import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { DataProvider } from './ui/DataProvider'
import { AnalysisProvider } from './ui/AnalysisProvider'
import { LanguageProvider } from './ui/i18n'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Inside DataProvider, because the chosen language lives in settings. */}
      <DataProvider>
        <LanguageProvider>
          <AnalysisProvider>
            <App />
          </AnalysisProvider>
        </LanguageProvider>
      </DataProvider>
    </BrowserRouter>
  </StrictMode>,
)
