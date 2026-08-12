import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTransitApplication } from './application/createApplication'
import { loadPublicRuntimeConfig } from './config/runtime'
import { App } from './ui/App'
import './ui/styles.css'

const runtimeConfig = loadPublicRuntimeConfig(import.meta.env)
const application = createTransitApplication(runtimeConfig)

createRoot(document.getElementById('root')!).render(
  <StrictMode><App planner={application.planner} mapMode={application.providerMode} kakaoJavaScriptKey={runtimeConfig.kakaoJavaScriptKey} /></StrictMode>,
)
