import os

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, To

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "alertes@monelu.fr")
FROM_NAME = "MonÉlu Alertes"

_POSITION_LABEL = {
    "pour": "🟢 A voté POUR",
    "contre": "🔴 A voté CONTRE",
    "abstention": "⚪ S'est abstenu(e)",
    "nonvotant": "⬜ Non votant",
}


def build_alert_email(
    to_email: str,
    vote_title: str,
    vote_result: str,
    voted_at: str,
    votes_for: int,
    votes_against: int,
    abstentions: int,
    deputy_name: str,
    deputy_position: str,
    deputy_party: str,
) -> Mail:
    result_emoji = "✅" if vote_result == "adopté" else "❌"
    position_label = _POSITION_LABEL.get(deputy_position, deputy_position)
    truncated_title = vote_title[:120] + ("..." if len(vote_title) > 120 else "")

    html_content = f"""
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0D1F3C; padding: 24px 32px;">
        <h1 style="color: white; font-size: 20px; margin: 0;">
          Mon<span style="color: #C9302C;">Élu</span>
        </h1>
        <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 4px 0 0;">
          Alerte vote parlementaire
        </p>
      </div>

      <div style="padding: 32px; background: #F8F7F4;">
        <p style="font-size: 13px; color: #888; margin-bottom: 8px;">
          NOUVEAU VOTE · {voted_at}
        </p>
        <h2 style="font-size: 18px; color: #0D1F3C; margin: 0 0 16px; line-height: 1.4;">
          {truncated_title}
        </h2>

        <div style="background: white; border-radius: 8px; padding: 16px 20px;
                    margin-bottom: 16px; border-left: 4px solid #C9302C;">
          <p style="font-size: 13px; color: #888; margin: 0 0 4px;">
            RÉSULTAT DU VOTE
          </p>
          <p style="font-size: 20px; font-weight: 600; color: #0D1F3C; margin: 0;">
            {result_emoji} {vote_result.upper()}
          </p>
          <p style="font-size: 13px; color: #666; margin: 8px 0 0;">
            {votes_for} pour · {votes_against} contre · {abstentions} abstentions
          </p>
        </div>

        <div style="background: white; border-radius: 8px; padding: 16px 20px;
                    margin-bottom: 24px;">
          <p style="font-size: 13px; color: #888; margin: 0 0 4px;">
            VOTRE DÉPUTÉ
          </p>
          <p style="font-size: 16px; font-weight: 600; color: #0D1F3C; margin: 0;">
            {deputy_name}
          </p>
          <p style="font-size: 13px; color: #666; margin: 4px 0 8px;">
            {deputy_party}
          </p>
          <p style="font-size: 15px; color: #0D1F3C; margin: 0;">
            {position_label}
          </p>
        </div>

        <a href="https://monelu-production.up.railway.app/docs"
           style="display: inline-block; background: #C9302C; color: white;
                  padding: 12px 24px; border-radius: 4px; text-decoration: none;
                  font-size: 14px; font-weight: 600;">
          Voir tous les votes →
        </a>
      </div>

      <div style="padding: 16px 32px; background: #0D1F3C;">
        <p style="font-size: 11px; color: rgba(255,255,255,0.4); margin: 0;">
          MonÉlu · Données officielles de l'Assemblée Nationale ·
          <a href="https://monelu-production.up.railway.app/alerts/unsubscribe?email={to_email}"
             style="color: rgba(255,255,255,0.4);">Se désabonner</a>
        </p>
      </div>
    </div>
    """

    return Mail(
        from_email=(FROM_EMAIL, FROM_NAME),
        to_emails=To(to_email),
        subject=f"MonÉlu · {deputy_name} a voté {deputy_position} — {vote_title[:60]}...",
        html_content=html_content,
    )


def send_alert(to_email: str, **kwargs) -> bool:
    """Send alert email. Returns True if successful."""
    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        message = build_alert_email(to_email=to_email, **kwargs)
        response = sg.send(message)
        success = response.status_code in (200, 202)
        print(
            f"Email {'sent' if success else 'failed'}: {to_email} (status {response.status_code})"
        )
        return success
    except Exception as e:
        print(f"SendGrid error for {to_email}: {e}")
        return False


def send_confirmation_email(to_email: str, token: str) -> bool:
    """Send subscription confirmation email."""
    confirm_url = f"https://monelu-production.up.railway.app" f"/alerts/confirm?token={token}"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0D1F3C; padding: 24px 32px;">
        <h1 style="color: white; font-size: 20px; margin: 0;">
          Mon<span style="color: #C9302C;">Élu</span>
        </h1>
      </div>
      <div style="padding: 32px; background: #F8F7F4;">
        <h2 style="color: #0D1F3C;">Confirmez votre abonnement</h2>
        <p style="color: #666; line-height: 1.6;">
          Vous recevrez une alerte email chaque fois que vos députés votent
          à l'Assemblée Nationale.
        </p>
        <a href="{confirm_url}"
           style="display: inline-block; background: #C9302C; color: white;
                  padding: 12px 24px; border-radius: 4px; text-decoration: none;
                  font-size: 14px; font-weight: 600; margin-top: 16px;">
          Confirmer mon abonnement →
        </a>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">
          Si vous n'avez pas demandé cet abonnement, ignorez cet email.
        </p>
      </div>
    </div>
    """
    message = Mail(
        from_email=(FROM_EMAIL, FROM_NAME),
        to_emails=To(to_email),
        subject="MonÉlu · Confirmez votre abonnement aux alertes votes",
        html_content=html_content,
    )
    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        return response.status_code in (200, 202)
    except Exception as e:
        print(f"Confirmation email error: {e}")
        return False
