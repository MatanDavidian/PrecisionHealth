import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { DataProvider } from './ui/DataProvider'
import { AnalysisProvider } from './ui/AnalysisProvider'
import { LanguageProvider } from './ui/i18n'
import { ErrorBoundary } from './ui/components/ErrorBoundary'
import { installErrorReporting } from './data/errorReporting'
import './styles.css'

installErrorReporting()

/*
  The service worker: lets the installed app open without a connection
  (public/sw.js). Production builds only — in development it would cache files
  Vite is still changing.
*/
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Private windows and some browsers refuse; the app works without it.
    })
  })
}

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
        <ErrorBoundary>
          <DataProvider>
            <AnalysisProvider>
              <App />
            </AnalysisProvider>
          </DataProvider>
        </ErrorBoundary>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
)
