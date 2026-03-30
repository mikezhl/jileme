import nodemailer from "nodemailer";

import { getSmtpPort, isSmtpSecure, optionalEnv, requireEnv } from "@/lib/env";

type SendSmtpEmailArgs = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    auth: {
      pass: requireEnv("SMTP_PASS"),
      user: requireEnv("SMTP_USER"),
    },
    host: requireEnv("SMTP_HOST"),
    port: getSmtpPort(),
    secure: isSmtpSecure(),
  });

  return transporter;
}

function getFromAddress() {
  const email = requireEnv("SMTP_FROM_EMAIL");
  const name = optionalEnv("SMTP_FROM_NAME");
  return name ? `${name} <${email}>` : email;
}

export async function sendSmtpEmail({ html, subject, text, to }: SendSmtpEmailArgs) {
  await getTransporter().sendMail({
    from: getFromAddress(),
    html,
    subject,
    text,
    to,
  });
}