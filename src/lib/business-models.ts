export const BUSINESS_MODEL_LABELS: Record<string, string> = {
  retail: 'Retail',
  service: 'Service',
  rental: 'Rental',
}

export function getBusinessModelLabel(modelKey: string) {
  return BUSINESS_MODEL_LABELS[modelKey] ?? modelKey
}

export function getBusinessModelLabels(modelKeys: string[]) {
  return modelKeys.map(getBusinessModelLabel)
}
