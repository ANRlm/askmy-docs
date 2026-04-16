import secrets
from loguru import logger

from config import settings


def generate_verification_token() -> str:
    return secrets.token_urlsafe(32)


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


async def send_verification_email(
    email: str, token: str, base_url: str = "http://localhost:3000"
) -> None:
    verify_url = f"{base_url}/verify-email?token={token}"
    subject = "验证您的 AskMyDocs 账户"
    body = f"""您好，

请点击以下链接验证您的邮箱地址：

{verify_url}

此链接 24 小时内有效。

— AskMyDocs 团队
"""
    await _send_email(to=email, subject=subject, body=body)


async def send_password_reset_email(
    email: str, token: str, base_url: str = "http://localhost:3000"
) -> None:
    reset_url = f"{base_url}/reset-password?token={token}"
    subject = "重置您的 AskMyDocs 密码"
    body = f"""您好，

请点击以下链接重置您的密码：

{reset_url}

此链接 1 小时内有效。如果这不是您发起的请求，请忽略此邮件。

— AskMyDocs 团队
"""
    await _send_email(to=email, subject=subject, body=body)


async def _send_email(to: str, subject: str, body: str) -> None:
    if settings.email_smtp_host:
        await _send_smtp_email(to=to, subject=subject, body=body)
    else:
        logger.info(f"[Email] To: {to}\nSubject: {subject}\n\n{body}")
        logger.warning(
            "SMTP not configured, email printed to logs. Set EMAIL_SMTP_HOST to enable real emails."
        )


async def _send_smtp_email(to: str, subject: str, body: str) -> None:
    import aiosmtplib
    from email.message import EmailMessage

    msg = EmailMessage()
    msg["From"] = settings.email_from_address or "noreply@askmydocs.com"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    await aiosmtplib.send(
        msg,
        hostname=settings.email_smtp_host,
        port=settings.email_smtp_port or 587,
        username=settings.email_username,
        password=settings.email_password,
        start_tls=settings.email_use_tls,
    )
