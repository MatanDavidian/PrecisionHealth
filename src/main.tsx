import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { DataProvider } from './ui/DataProvider'
import { AnalysisProvider } from './ui/AnalysisProvider'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DataProvider>
        <AnalysisProvider>
          <App />
        </AnalysisProvider>
      </DataProvider>
    </BrowserRouter>
  </StrictMode>,
)
