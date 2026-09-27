import nodemailer, { type Transporter } from 'nodemailer';

let transporterPromise: Promise<Transporter> | undefined;

async function createTransporter(): Promise<Transporter> {
  const host = process.env.ETHEREAL_HOST ?? 'smtp.ethereal.email';
  const port = Number(process.env.ETHEREAL_PORT ?? 587);
  const user = process.env.ETHEREAL_USER;
  const pass = process.env.ETHEREAL_PASSWORD;

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  const account = await nodemailer.createTestAccount();
  console.info(`Using temporary Ethereal account: ${account.user}`);

  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });
}

async function getTransporter(): Promise<Transporter> {
  transporterPromise ??= createTransporter();
  return transporterPromise;
}

interface SendEmailInput {
  fromEmail: string;
  fromName?: string | null;
  to: string;
  subject: string;
  body: string;
}

export async function sendEmailWithEthereal(input: SendEmailInput): Promise<string | null> {
  const transporter = await getTransporter();
  const from = input.fromName
    ? `${input.fromName} <${input.fromEmail}>`
    : input.fromEmail;
  const result = await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.body,
    html: input.body,
  });

  const previewUrl = nodemailer.getTestMessageUrl(result);
  return typeof previewUrl === 'string' ? previewUrl : null;
}
