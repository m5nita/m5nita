export type StubCallLog = {
  provider: string
  timestamp: string
  direction: 'outbound' | 'inbound'
  summary: string
  payload?: unknown
}
