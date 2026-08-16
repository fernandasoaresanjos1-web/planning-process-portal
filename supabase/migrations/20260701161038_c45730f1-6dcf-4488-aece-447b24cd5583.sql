
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Novos usuários criados a partir de agora precisam trocar senha, exceto o primeiro admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_first_admin boolean;
BEGIN
  v_is_first_admin := NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin');
  INSERT INTO public.profiles (id, email, nome, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    NOT v_is_first_admin
  );
  IF v_is_first_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'colaborador');
  END IF;
  RETURN NEW;
END;
$function$;

-- Permitir que o próprio usuário limpe seu flag ao trocar a senha
DROP POLICY IF EXISTS "profiles_self_update_must_change" ON public.profiles;
CREATE POLICY "profiles_self_update_must_change"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
