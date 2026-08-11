import { describe, expect, it } from 'vitest'
import { createSyntheticNetwork } from '../../mock/syntheticNetwork'
import { mockNetwork } from '../../mock/network'
import { HardRouter } from './hardRouter'

describe('Hard search diagnostics', () => {
  it('reports state counts and elapsed time on the small mock network', () => {
    const result = new HardRouter(mockNetwork).search({
      originId: 'gwanghwamun', destinationId: 'jamsil', departureTime: 540,
    })
    console.info('[hard-routing small diagnostic]', {
      stops: mockNetwork.points.length,
      trips: mockNetwork.trips.length,
      ...result.diagnostics,
    })
    expect(result.candidates[0].bestPossibleArrival).toBe(575)
    expect(result.diagnostics.generatedStates).toBeGreaterThan(0)
  })

  it('reports state counts and elapsed time on a larger synthetic network', () => {
    const network = createSyntheticNetwork(24, 5)
    const result = new HardRouter(network).search({
      originId: 'synthetic-0',
      destinationId: 'synthetic-23',
      departureTime: 0,
      maxRouteCandidates: 6,
    })
    const diagnostic = {
      stops: network.points.length,
      trips: network.trips.length,
      ...result.diagnostics,
    }
    console.info('[hard-routing synthetic diagnostic]', diagnostic)
    expect(result.candidates.length).toBeGreaterThan(0)
    expect(result.diagnostics.generatedStates).toBeGreaterThan(result.diagnostics.expandedStates)
    expect(result.diagnostics.maxQueueSize).toBeGreaterThan(0)
    expect(Number.isFinite(result.diagnostics.elapsedMilliseconds)).toBe(true)
  })
})
