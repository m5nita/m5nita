import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendMagicLinkEmail(email: string, url: string) {
  await resend.emails.send({
    from: 'M5nita <noreply@notifications.m5nita.com>',
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
