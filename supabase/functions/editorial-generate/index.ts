import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createEditorialHandler } from '../_shared/editorialAi.js';

serve(createEditorialHandler({ getEnv: (name: string) => Deno.env.get(name), createClient }));
