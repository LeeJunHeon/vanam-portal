-- 포털 배포 전에 DBeaver 에서 inventory DB 에 실행
-- 포털 첫 화면 런처: 메뉴 사용 기록(일 단위 집계) + 사용자별 배치(즐겨찾기·숨김·앱 순서)
-- 여러 번 실행해도 안전하다(IF NOT EXISTS).

CREATE SCHEMA IF NOT EXISTS portal;

-- 메뉴 사용 기록: 사용자 × 메뉴키 × 날짜(KST) 한 행, cnt 누적
CREATE TABLE IF NOT EXISTS portal.launcher_usage_daily (
  user_email   varchar(255)   NOT NULL,
  menu_key     varchar(100)   NOT NULL,
  used_on      date           NOT NULL,
  cnt          integer        NOT NULL DEFAULT 0,
  last_used_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_email, menu_key, used_on)
);

CREATE INDEX IF NOT EXISTS idx_launcher_usage_daily_user_date
  ON portal.launcher_usage_daily (user_email, used_on);

-- 사용자별 배치
CREATE TABLE IF NOT EXISTS portal.launcher_prefs (
  user_email varchar(255)   PRIMARY KEY,
  pinned     jsonb          NOT NULL DEFAULT '[]',
  hidden     jsonb          NOT NULL DEFAULT '[]',
  app_order  jsonb          NOT NULL DEFAULT '[]',
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

-- 소유자 맞춤: portal.push_subscriptions 와 같은 소유자로 (포털 앱 계정이 읽고 쓸 수 있게)
DO $$
DECLARE
  owner_name text;
BEGIN
  SELECT tableowner INTO owner_name
    FROM pg_tables
   WHERE schemaname = 'portal' AND tablename = 'push_subscriptions';

  IF owner_name IS NULL THEN
    RAISE NOTICE 'portal.push_subscriptions 가 없어 소유자를 바꾸지 않았습니다.';
  ELSE
    EXECUTE format('ALTER TABLE portal.launcher_usage_daily OWNER TO %I', owner_name);
    EXECUTE format('ALTER TABLE portal.launcher_prefs OWNER TO %I', owner_name);
  END IF;
END
$$;
