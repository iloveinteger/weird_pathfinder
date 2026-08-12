import type { ProviderMode, PublicRuntimeConfig } from '../config/runtime'
import { createMockProviderSet } from '../mock/providers'
import { mockNetwork } from '../mock/network'
import type { TransitProviderSet } from '../providers/interfaces'
import { createRealProviderSet } from '../providers/real/providers'
import { TimeDependentRouter } from '../routing/router'
import { RealTransitPlanner } from './realTransitPlanner'
import { CoreTransitPlanner, type TransitPlanner } from './transitPlanner'

export interface TransitApplication {
  providerMode: ProviderMode
  providers: TransitProviderSet
  planner: TransitPlanner
}

/** Composition root: provider selection stays outside both UI and routing core. */
export function createTransitApplication(config: PublicRuntimeConfig): TransitApplication {
  if (config.providerMode === 'real') {
    const providers = createRealProviderSet(config.apiBaseUrl ?? '')
    return {
      providerMode: 'real',
      providers,
      planner: new RealTransitPlanner(providers),
    }
  }

  const providers = createMockProviderSet()
  return {
    providerMode: 'mock',
    providers,
    planner: new CoreTransitPlanner(providers.place, new TimeDependentRouter(mockNetwork), mockNetwork.points),
  }
}
