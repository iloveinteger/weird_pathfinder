import type { ProviderMode, PublicRuntimeConfig } from '../config/runtime'
import type { TransitPoint } from '../domain/models'
import { createMockProviderSet } from '../mock/providers'
import { mockNetwork } from '../mock/network'
import { ProviderUnavailableError } from '../providers/availability'
import type { TransitProviderSet } from '../providers/interfaces'
import { createRealProviderSet } from '../providers/real/providers'
import { TimeDependentRouter } from '../routing/router'
import { CoreTransitPlanner, type PlannedRoute, type PlannerSearchRequest, type TransitPlanner } from './transitPlanner'

export interface TransitApplication {
  providerMode: ProviderMode
  providers: TransitProviderSet
  planner: TransitPlanner
}

/** Composition root: provider selection stays outside both UI and routing core. */
export function createTransitApplication(config: PublicRuntimeConfig): TransitApplication {
  if (config.providerMode === 'real') {
    return {
      providerMode: 'real',
      providers: createRealProviderSet(),
      planner: new UnavailableRealTransitPlanner(),
    }
  }

  const providers = createMockProviderSet()
  return {
    providerMode: 'mock',
    providers,
    planner: new CoreTransitPlanner(providers.place, new TimeDependentRouter(mockNetwork), mockNetwork.points),
  }
}

class UnavailableRealTransitPlanner implements TransitPlanner {
  searchPlaces(_query: string) { return Promise.reject(new ProviderUnavailableError('transit-network')) }
  findRoutes(_request: PlannerSearchRequest): Promise<PlannedRoute[]> { return Promise.reject(new ProviderUnavailableError('transit-network')) }
  pointName(id: string): TransitPoint['name'] { return id }
}
