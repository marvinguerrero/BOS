-- ============================================================================
-- MODULE PLATFORM: backfill generic module keys after enum values are committed
-- ============================================================================

INSERT INTO public.business_modules (business_id, module_key, is_enabled, config)
SELECT business_id, 'services'::module_key, is_enabled, config
FROM public.business_modules
WHERE module_key = 'laundry_services'
ON CONFLICT (business_id, module_key) DO UPDATE
SET is_enabled = excluded.is_enabled;

INSERT INTO public.business_modules (business_id, module_key, is_enabled, config)
SELECT business_id, 'orders'::module_key, is_enabled, config
FROM public.business_modules
WHERE module_key = 'laundry_orders'
ON CONFLICT (business_id, module_key) DO UPDATE
SET is_enabled = excluded.is_enabled;
