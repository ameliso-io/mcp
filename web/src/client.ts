import { createConnectTransport } from '@connectrpc/connect-web'
import { createClient } from '@connectrpc/connect'
import { AmelisoService } from './gen/ameliso/v1/service_pb.js'

const transport = createConnectTransport({
  baseUrl: 'http://localhost:50051',
})

export const client = createClient(AmelisoService, transport)
