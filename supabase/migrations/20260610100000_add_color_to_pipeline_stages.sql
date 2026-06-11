-- Add color column to pipeline_stages
ALTER TABLE public.pipeline_stages ADD COLUMN IF NOT EXISTS color text DEFAULT 'zinc';

-- Update colors for default stages
UPDATE public.pipeline_stages SET color = 'sky' WHERE code = 'cv_scan';
UPDATE public.pipeline_stages SET color = 'violet' WHERE code = 'interview';
UPDATE public.pipeline_stages SET color = 'teal' WHERE code = 'offer';
