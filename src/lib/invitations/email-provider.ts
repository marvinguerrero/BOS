import type { BusinessInvitation } from '@/types'

export type InvitationEmailDeliveryStatus = 'sent' | 'failed' | 'not_configured'

export interface InvitationEmailProvider {
  sendBusinessInvitation(invitation: BusinessInvitation, acceptUrl: string): Promise<InvitationEmailDeliveryStatus>
}

export async function sendBusinessInvitationEmail(
  provider: InvitationEmailProvider | null,
  invitation: BusinessInvitation,
  acceptUrl: string
) {
  if (!provider) return 'not_configured' satisfies InvitationEmailDeliveryStatus
  return provider.sendBusinessInvitation(invitation, acceptUrl)
}
