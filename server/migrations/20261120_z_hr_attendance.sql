INSERT INTO public.roles(id,name)
SELECT gen_random_uuid(),'hr' WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE lower(name)='hr');

-- Dedicated HR accounts cannot receive operational grants through the role editor.
DELETE FROM public.permissions p USING public.roles r WHERE p.role_id=r.id AND lower(r.name)='hr';
CREATE FUNCTION desktop_private.ignore_hr_operational_grants() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles r WHERE r.id=NEW.role_id AND lower(r.name)='hr') THEN RETURN NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ignore_hr_operational_grants BEFORE INSERT OR UPDATE ON public.permissions
FOR EACH ROW EXECUTE FUNCTION desktop_private.ignore_hr_operational_grants();

CREATE TABLE desktop_private.hr_employees (
  id uuid PRIMARY KEY,
  employee_code text UNIQUE NOT NULL CHECK(length(employee_code) BETWEEN 1 AND 40),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  department text NOT NULL CHECK(length(department)<=100),
  shift_start time NOT NULL,
  shift_end time NOT NULL CHECK(shift_end>shift_start),
  overtime_allowed boolean NOT NULL,
  monthly_salary numeric(14,2) NOT NULL CHECK(monthly_salary>=0),
  archived_at timestamptz,
  updated_by uuid NOT NULL
);
CREATE TABLE desktop_private.hr_attendance (
  employee_id uuid NOT NULL REFERENCES desktop_private.hr_employees(id),
  work_date date NOT NULL,
  clock_in time NOT NULL,
  clock_out time CHECK(clock_out>=clock_in),
  shift_start time NOT NULL,
  shift_end time NOT NULL,
  overtime_allowed boolean NOT NULL,
  late boolean GENERATED ALWAYS AS (
    extract(epoch FROM (clock_in-shift_start))>=1860
  ) STORED,
  overtime_minutes integer GENERATED ALWAYS AS (
    CASE WHEN overtime_allowed AND clock_out IS NOT NULL
      THEN greatest(0,floor(extract(epoch FROM (clock_out-shift_end))/60)::int) ELSE 0 END
  ) STORED,
  updated_by uuid NOT NULL,
  PRIMARY KEY(employee_id,work_date)
);
CREATE INDEX hr_attendance_date ON desktop_private.hr_attendance(work_date);
REVOKE ALL ON desktop_private.hr_employees,desktop_private.hr_attendance FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON desktop_private.hr_employees,desktop_private.hr_attendance TO service_role;

CREATE FUNCTION public.hr_attendance_action(actor uuid, command text, fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE account_role text;
DECLARE employee desktop_private.hr_employees%ROWTYPE;
DECLARE work_day date;
DECLARE arrived time;
DECLARE departed time;
DECLARE target uuid;
BEGIN
  SELECT lower(u.role) INTO account_role FROM public.users u
  WHERE u.id=actor AND u.is_active AND u.is_restricted IS NOT TRUE AND u.deleted_at IS NULL FOR SHARE;
  IF account_role IS NULL OR account_role NOT IN ('hr','admin') THEN RAISE insufficient_privilege; END IF;
  IF command='list' THEN
    work_day:=(fields->>'date')::date;
    RETURN jsonb_build_object(
      'employees',coalesce((SELECT jsonb_agg(to_jsonb(e)-'updated_by' ORDER BY e.name,e.employee_code)
        FROM desktop_private.hr_employees e WHERE e.archived_at IS NULL),'[]'::jsonb),
      'attendance',coalesce((SELECT jsonb_agg((to_jsonb(a)-'updated_by')||
        jsonb_build_object('name',e.name,'employee_code',e.employee_code,'archived',e.archived_at IS NOT NULL) ORDER BY e.name)
        FROM desktop_private.hr_attendance a JOIN desktop_private.hr_employees e ON e.id=a.employee_id
        WHERE a.work_date=work_day),'[]'::jsonb));
  END IF;
  IF account_role<>'hr' THEN RAISE insufficient_privilege; END IF;
  target:=(fields->>'id')::uuid;
  IF command='saveEmployee' THEN
    employee:=jsonb_populate_record(NULL::desktop_private.hr_employees,fields);
    IF employee.employee_code IS NULL OR btrim(employee.employee_code)='' OR employee.name IS NULL OR btrim(employee.name)=''
       OR extract(second FROM employee.shift_start)<>0 OR extract(second FROM employee.shift_end)<>0
    THEN RAISE invalid_parameter_value; END IF;
    INSERT INTO desktop_private.hr_employees(id,employee_code,name,department,shift_start,shift_end,overtime_allowed,monthly_salary,updated_by)
    VALUES(target,upper(btrim(employee.employee_code)),btrim(employee.name),btrim(employee.department),
      employee.shift_start,employee.shift_end,employee.overtime_allowed,employee.monthly_salary,actor)
    ON CONFLICT(id) DO UPDATE SET employee_code=excluded.employee_code,name=excluded.name,department=excluded.department,
      shift_start=excluded.shift_start,shift_end=excluded.shift_end,overtime_allowed=excluded.overtime_allowed,
      monthly_salary=excluded.monthly_salary,updated_by=actor WHERE hr_employees.archived_at IS NULL;
  ELSIF command='archiveEmployee' THEN
    UPDATE desktop_private.hr_employees SET archived_at=coalesce(archived_at,now()),updated_by=actor WHERE id=target;
  ELSIF command='saveAttendance' THEN
    work_day:=(fields->>'date')::date;
    arrived:=(fields->>'clock_in')::time;
    departed:=nullif(fields->>'clock_out','')::time;
    IF work_day IS NULL OR work_day>(now() AT TIME ZONE 'Asia/Karachi')::date OR arrived IS NULL
      OR extract(second FROM arrived)<>0 OR extract(second FROM departed)<>0 THEN RAISE invalid_parameter_value; END IF;
    SELECT * INTO employee FROM desktop_private.hr_employees e WHERE e.id=target AND e.archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RETURN '{"result":"missing"}'::jsonb; END IF;
    INSERT INTO desktop_private.hr_attendance(employee_id,work_date,clock_in,clock_out,shift_start,shift_end,overtime_allowed,updated_by)
    VALUES(target,work_day,arrived,departed,employee.shift_start,employee.shift_end,employee.overtime_allowed,actor)
    ON CONFLICT(employee_id,work_date) DO UPDATE SET clock_in=excluded.clock_in,clock_out=excluded.clock_out,updated_by=actor;
  ELSE RAISE invalid_parameter_value;
  END IF;
  RETURN jsonb_build_object('result',CASE WHEN FOUND THEN 'saved' ELSE 'missing' END);
END $$;
REVOKE ALL ON FUNCTION public.hr_attendance_action(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_attendance_action(uuid,text,jsonb) TO service_role;
