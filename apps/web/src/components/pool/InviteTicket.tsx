import { useState } from 'react'
import { Button } from '../ui/Button'

interface InviteTicketProps {
  poolName: string
  inviteCode: string
}

export function InviteTicket({ poolName, inviteCode }: InviteTicketProps) {
  const [copied, setCopied] = useState(false)
  const inviteUrl = `${window.location.origin}/invite/${inviteCode}`
  const whatsappMessage = encodeURIComponent(
    `Entre no meu bolão "${poolName}" no m5nita! ${inviteUrl}`,
  )
  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
    } catch {
      const input = document.createElement('input')
      input.value = inviteUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border-2 border-black p-6 flex flex-col items-center gap-5">
      <div className="text-center">
        <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
          Convite
        </p>
        <h3 className="font-display text-2xl font-black uppercase text-black">{poolName}</h3>
      </div>

      <p className="bg-black px-5 py-2 font-display text-lg font-black tracking-[0.3em] text-white">
        {inviteCode}
      </p>

      <div className="flex w-full flex-col gap-2">
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="w-full">
          <Button className="w-full bg-green hover:bg-green/85" size="lg">
            Compartilhar via WhatsApp
          </Button>
        </a>
        <Button variant="secondary" onClick={handleCopy} className="w-full">
          {copied ? 'Copiado!' : 'Copiar Link'}
        </Button>
      </div>
    </div>
  )
}
