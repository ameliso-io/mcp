import { createConnectTransport } from '@connectrpc/connect-web'
import { createClient } from '@connectrpc/connect'
import { AmelisoService } from './gen/ameliso/v1/service_pb.js'

const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
})

export const client = createClient(AmelisoService, transport)
