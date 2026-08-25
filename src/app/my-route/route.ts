import configPromise from '@engage-config'
import { getPayload } from 'payload'

export const GET = async (request: Request) => {
  const engine = await getPayload({
    config: configPromise,
  })

  return Response.json({
    message: 'This is an example of a custom route.',
  })
}
