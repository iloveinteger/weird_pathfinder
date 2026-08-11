import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CoreTransitPlanner } from './application/transitPlanner'
import { mockNetwork } from './mock/network'
import { MockPlaceProvider } from './mock/providers'
import { TimeDependentRouter } from './routing/router'
import { App } from './ui/App'
import './ui/styles.css'

const planner = new CoreTransitPlanner(new MockPlaceProvider(), new TimeDependentRouter(mockNetwork), mockNetwork.points)

createRoot(document.getElementById('root')!).render(
  <StrictMode><App planner={planner} /></StrictMode>,
)
