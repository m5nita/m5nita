import { Resend } from 'resend'
import type { ReminderMatch } from '../application/ports/NotificationService.port'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'M5nita <noreply@notifications.m5nita.com>'

function appUrl(): string {
  return process.env.APP_URL || ''
}

function formatBrl(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavos / 100)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Shared m5nita branded shell (wordmark + red accent bar + content card),
// matching the magic-link email look.
function brandedEmail(opts: { heading: string; bodyHtml: string }): string {
  return `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:32px 24px 0;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;">m5nita</p>
              <h1 style="margin:8px 0 0;font-size:28px;font-weight:900;color:#000;">${opts.heading}</h1>
              <div style="margin-top:12px;width:48px;height:4px;background:#e53e3e;border-radius:2px;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              ${opts.bodyHtml}
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

function ctaButton(href: string, label: string): string {
  return `
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center">
          <a href="${href}" style="display:inline-block;padding:14px 32px;background:#000;color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.5px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `
}

export async function sendMagicLinkEmail(email: string, url: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Seu link de acesso — M5nita',
    html: `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 24px 0;">
                <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;">m5nita</p>
                <h1 style="margin:8px 0 0;font-size:28px;font-weight:900;color:#000;">Entrar</h1>
                <div style="margin-top:12px;width:48px;height:4px;background:#e53e3e;border-radius:2px;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#333;">
                  Clique no botão abaixo para acessar sua conta. Este link expira em 15 minutos.
                </p>
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <a href="${url}" style="display:inline-block;padding:14px 32px;background:#000;color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.5px;">
                        Acessar m5nita
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#999;">
                  Se você não solicitou este link, ignore este email.
                </p>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  })
}

// Prediction reminder — email fallback for users without a linked Telegram chat.
export async function sendPredictionReminderEmail(params: {
  to: string
  userName: string | null
  poolName: string
  poolId: string
  matches: ReminderMatch[]
}): Promise<void> {
  const greeting = params.userName ? `Olá, ${escapeHtml(params.userName)}!` : 'Olá!'
  const matchRows = params.matches
    .map(
      (m) =>
        `<li style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#333;">${escapeHtml(m.homeTeam)} <strong>x</strong> ${escapeHtml(m.awayTeam)} — em ${m.minutesUntil} min</li>`,
    )
    .join('')

  const predictionsUrl = appUrl() ? `${appUrl()}/pools/${params.poolId}/predictions` : ''
  const cta = predictionsUrl
    ? ctaButton(predictionsUrl, 'Fazer palpites')
    : `<p style="margin:0;font-size:15px;line-height:1.6;color:#333;">Acesse o app para fazer seus palpites.</p>`

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#333;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333;">
      Você ainda não palpitou em <strong>${escapeHtml(params.poolName)}</strong> para os jogos que começam em breve:
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;">${matchRows}</ul>
    ${cta}
  `

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `⚽ Não esqueça seus palpites — ${params.poolName}`,
    html: brandedEmail({ heading: 'Faça seus palpites!', bodyHtml }),
  })
}

// Pool winner — email fallback for winners without a linked Telegram chat.
export async function sendWinnerEmail(params: {
  to: string
  winnerName: string | null
  poolName: string
  prizeShare: number
}): Promise<void> {
  const name = params.winnerName ? escapeHtml(params.winnerName) : 'Campeão'
  const cta = appUrl()
    ? ctaButton(appUrl(), 'Solicitar retirada')
    : `<p style="margin:0;font-size:15px;line-height:1.6;color:#333;">Acesse o app para solicitar a retirada do seu prêmio.</p>`

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#333;">Parabéns, <strong>${name}</strong>!</p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#333;">
      Você venceu o bolão <strong>${escapeHtml(params.poolName)}</strong>!
    </p>
    <p style="margin:0 0 24px;font-size:18px;line-height:1.6;color:#000;font-weight:700;">
      Seu prêmio: ${formatBrl(params.prizeShare)}
    </p>
    ${cta}
  `

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `🏆 Você venceu o bolão ${params.poolName}!`,
    html: brandedEmail({ heading: 'Você venceu! 🏆', bodyHtml }),
  })
}
