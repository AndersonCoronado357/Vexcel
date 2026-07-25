import { config, mailConfigured } from '../config.js';

/** Remitente en formato "Nombre <correo>" (Resend acepta ambos). */
function fromAddress(): string {
  const f = config.resend.from;
  return f.includes('<') ? f : `Vexcel <${f}>`;
}

/**
 * Envía un correo por Resend. Devuelve true si se envió. Si no hay clave
 * configurada (dev local), no es un error: se registra en consola y retorna false.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!mailConfigured()) {
    console.log(`[mail] (sin RESEND_API_KEY) para ${opts.to}: ${opts.subject}`);
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: opts.to,
        subject: opts.subject,
        html: opts.html
      })
    });
    if (!r.ok) {
      console.error('[mail] Resend respondió', r.status, await r.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mail] Error enviando con Resend:', err);
    return false;
  }
}

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const VIOLET = '#6D4AFF';

/**
 * Envoltorio de marca para todos los correos. Solo tablas + estilos INLINE +
 * atributos bgcolor (lo único que respetan Gmail/Outlook). Diseño centrado:
 * cabecera violeta con el icono de la app, tarjeta blanca y pie apagado.
 */
function emailShell(preheader: string, contentHtml: string): string {
  const header = `${config.appUrl}/email-header.png`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#edecf3;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;color:#edecf3;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#edecf3" style="background-color:#edecf3;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:480px;max-width:100%;background-color:#ffffff;border-radius:22px;overflow:hidden;">
        <tr>
          <td bgcolor="#6A46F5" align="center" style="background-color:#6A46F5;line-height:0;font-size:0;">
            <img src="${header}" width="480" alt="Vexcel" style="display:block;width:100%;max-width:480px;height:auto;border:0;">
          </td>
        </tr>
        <tr><td align="center" style="padding:34px 34px 30px;">${contentHtml}</td></tr>
        <tr>
          <td align="center" bgcolor="#faf9fd" style="background-color:#faf9fd;padding:20px 30px;border-top:1px solid #eeedf4;">
            <div style="font-family:${FONT};font-size:12px;line-height:1.6;color:#9c9bab;">Vexcel · Convierte PNG y JPG a SVG vectorizado.</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Botón "a prueba de balas" (color por bgcolor, funciona hasta en Outlook). */
function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    <td align="center" bgcolor="${VIOLET}" style="background-color:${VIOLET};border-radius:12px;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:15px 40px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:12px;">${label}</a>
    </td>
  </tr></table>`;
}

/** Plantilla del correo de restablecimiento de contraseña. */
export function resetPasswordEmail(name: string, link: string): { subject: string; html: string } {
  const safeName = name ? name.split(/\s+/)[0] : '';
  const content = `
    <h1 style="margin:0 0 12px;font-family:${FONT};font-size:23px;font-weight:700;color:#1b1b26;letter-spacing:-.4px;">Restablece tu contraseña</h1>
    <p style="margin:0 auto 8px;max-width:370px;font-family:${FONT};font-size:15px;line-height:1.62;color:#5a5a68;">Hola${safeName ? ' ' + safeName : ''}, recibimos una solicitud para cambiar la contraseña de tu cuenta de Vexcel.</p>
    <p style="margin:0 auto 28px;max-width:370px;font-family:${FONT};font-size:15px;line-height:1.62;color:#5a5a68;">Pulsa el botón para crear una nueva. El enlace caduca en <strong style="color:#1b1b26;">1 hora</strong>.</p>
    ${button('Restablecer contraseña', link)}
    <p style="margin:28px auto 0;max-width:370px;font-family:${FONT};font-size:13px;line-height:1.6;color:#a2a1b0;">Si no fuiste tú, ignora este correo: tu contraseña seguirá igual.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr><td align="center" style="padding-top:20px;border-top:1px solid #eeedf4;">
        <div style="font-family:${FONT};font-size:12px;color:#b0afbe;margin-bottom:5px;">¿El botón no abre? Copia y pega este enlace:</div>
        <div style="font-family:${FONT};font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" target="_blank" style="color:${VIOLET};text-decoration:none;">${link}</a></div>
      </td></tr>
    </table>`;
  return {
    subject: 'Restablece tu contraseña de Vexcel',
    html: emailShell(
      'Crea una nueva contraseña para tu cuenta de Vexcel. El enlace caduca en 1 hora.',
      content
    )
  };
}

/** Fila del recuadro de detalle (etiqueta izquierda, valor derecha). */
function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="font-family:${FONT};font-size:13.5px;color:#7a7988;padding:6px 0;">${label}</td>
    <td align="right" style="font-family:${FONT};font-size:13.5px;font-weight:600;color:#1b1b26;padding:6px 0;">${value}</td>
  </tr>`;
}

/** Aviso de que el cobro automático de la suscripción se acerca (3 días antes). */
export function upcomingChargeEmail(
  name: string,
  planLabel: string,
  amount: string,
  date: string,
  manageUrl: string
): { subject: string; html: string } {
  const safeName = name ? name.split(/\s+/)[0] : '';
  const content = `
    <h1 style="margin:0 0 12px;font-family:${FONT};font-size:23px;font-weight:700;color:#1b1b26;letter-spacing:-.4px;">Tu plan se renueva pronto</h1>
    <p style="margin:0 auto 24px;max-width:380px;font-family:${FONT};font-size:15px;line-height:1.62;color:#5a5a68;">Hola${safeName ? ' ' + safeName : ''}, en <strong style="color:#1b1b26;">3 días</strong> renovaremos tu plan automáticamente y cobraremos el monto a tu método de pago guardado.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f7f6fc" style="background-color:#f7f6fc;border-radius:14px;">
      <tr><td style="padding:14px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${detailRow('Plan', planLabel)}
          ${detailRow('Monto', amount)}
          ${detailRow('Fecha del cobro', date)}
        </table>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:26px;"><tr><td>
      ${button('Ver mi suscripción', manageUrl)}
    </td></tr></table>
    <p style="margin:26px auto 0;max-width:380px;font-family:${FONT};font-size:13px;line-height:1.6;color:#a2a1b0;">¿No quieres renovar? Cancela la renovación desde tu suscripción antes de esa fecha y no se hará ningún cobro.</p>`;
  return {
    subject: `Tu plan ${planLabel} se renueva en 3 días`,
    html: emailShell(
      `Tu plan ${planLabel} se renovará el ${date} por ${amount}. Puedes cancelar antes si no quieres el cobro.`,
      content
    )
  };
}
