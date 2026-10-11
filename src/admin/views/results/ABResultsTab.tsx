import React from 'react'
import { ABTestResultsPanel } from '@/features/abTesting/components/ABResultsView'

/**
 * The Results tab on an A/B test's edit page: the card the cross-test results
 * screen draws, for this one test. Server-rendered, so it needs no endpoint.
 */
export async function ABResultsTab({ testId }: { testId: number }): Promise<React.ReactElement> {
  return <ABTestResultsPanel testId={testId} />
}
