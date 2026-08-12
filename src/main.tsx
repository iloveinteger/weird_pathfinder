import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTransitApplication } from './application/createApplication'
import { loadPublicRuntimeConfig } from './config/runtime'
import { App } from './ui/App'
import './ui/styles.css'

const application = createTransitApplication(loadPublicRuntimeConfig(import.meta.env))

createRoot(document.getElementById('root')!).render(
  <StrictMode><App planner={application.planner} /></StrictMode>,
)
