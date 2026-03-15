import { useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

interface InviteTicketProps {
  poolName: string
  inviteCode: string
}

export function InviteTicket({ poolName, inviteCode }: InviteTicketProps) {
  const [copied, setCopied] = useState(false)
  const inviteUrl = `${window.location.origin}/invite/${inviteCode}`
  const whatsappMessage = encodeURIComponent(`Entra no meu bolao "${poolName}" na Manita! ${inviteUrl}`)
  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input')
      input.value = inviteUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card className="flex flex-col items-center gap-5 border-2 border-dashed border-navy/20 bg-cream">
      <div className="text-center">
        <p className="text-sm text-gray-dark">Convite para o bolao</p>
        <h3 className="font-heading text-xl font-bold text-navy">{poolName}</h3>
      </div>

      <div className="flex h-32 w-32 items-center justify-center rounded-xl bg-white p-2 shadow-sm">
        <div className="flex h-full w-full items-center justify-center rounded-lg bg-navy/5 text-xs text-gray">
          QR Code
        </div>
      </div>

      <p className="rounded-lg bg-navy/5 px-4 py-2 font-mono text-sm font-bold tracking-widest text-navy">
        {inviteCode}
      </p>

      <div className="flex w-full flex-col gap-2">
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="w-full">
          <Button className="w-full bg-green hover:bg-green/90" size="lg">
            Compartilhar via WhatsApp
          </Button>
        </a>
        <Button variant="secondary" onClick={handleCopy} className="w-full">
          {copied ? 'Link copiado!' : 'Copiar link do convite'}
        </Button>
      </div>
    </Card>
  )
}
