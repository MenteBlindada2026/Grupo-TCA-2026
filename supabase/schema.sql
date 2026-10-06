CREATE TABLE IF NOT EXISTS public.survey_invites (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.survey_submissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invite_id BIGINT NOT NULL UNIQUE REFERENCES public.survey_invites(id),
  answers_json JSONB NOT NULL,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.survey_clients (
  client_hash CHAR(64) PRIMARY KEY,
  invite_id BIGINT NOT NULL UNIQUE REFERENCES public.survey_invites(id),
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.survey_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_clients ENABLE ROW LEVEL SECURITY;
