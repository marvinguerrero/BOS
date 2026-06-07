import type { Metadata } from 'next'
import { SetupWizard } from '@/components/business/setup-wizard'

export const metadata: Metadata = { title: 'Create Business' }

export default function SetupPage() {
  return (
    <div className="py-4">
      <SetupWizard />
    </div>
  )
}
