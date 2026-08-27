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
      {/*
        Outside DataProvider, not inside it. The language comes from local
        settings, which are readable without waiting for the store to be chosen
        — and DataProvider's own "opening your data" and "storage unavailable"
        screens are text a person has to read too.
      */}
      <LanguageProvider>
        <DataProvider>
          <AnalysisProvider>
            <App />
          </AnalysisProvider>
        </DataProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
)
