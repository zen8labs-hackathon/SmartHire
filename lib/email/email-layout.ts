/**
 * Wraps a rendered email body in a table-based "card" layout (header with
 * logo/company name, white content card, footer) using inline styles only.
 * Email clients don't render a shared stylesheet the way browsers do --
 * Outlook desktop in particular renders via Word's engine, which ignores
 * flexbox/grid/box-shadow and most non-inline CSS -- so nested `<table>`s
 * with `style="..."` attributes on every element is the only layout
 * approach that survives across Outlook/Gmail/Apple Mail consistently.
 */
export function wrapEmailBodyInCard(params: {
  bodyHtml: string;
  companyName: string;
  logoUrl?: string | null;
}): string {
  const { bodyHtml, companyName, logoUrl } = params;

  const companyNameHtml = `<span style="font-size:18px;font-weight:bold;color:#111111;font-family:Arial,Helvetica,sans-serif;">${companyName}</span>`;

  // Logo + name side by side via a table row (not flexbox -- see file docblock),
  // vertically centered against the logo's height.
  const headerContent = logoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <img src="${logoUrl}" alt="${companyName}" height="32" style="display:block;height:32px;max-height:32px;border:0;outline:none;">
        </td>
        <td style="vertical-align:middle;">${companyNameHtml}</td>
      </tr></table>`
    : companyNameHtml;

  return `<!--[if mso]>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>
<![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;">
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #eeeeee;">
            ${headerContent}
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#333333;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #eeeeee;border-radius:0 0 12px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#999999;">
            This email was sent by ${companyName}.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<!--[if mso]>
</td></tr></table>
<![endif]-->`;
}
