-- Event and race configuration is Admin-only. Registration/read policies remain unchanged.
DROP POLICY IF EXISTS events_staff_all ON public.events;
CREATE POLICY events_admin_all ON public.events
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS races_staff_all ON public.event_races;
CREATE POLICY races_admin_all ON public.event_races
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
