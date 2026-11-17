ALTER TABLE conversations ADD COLUMN support_status text NOT NULL DEFAULT 'open' CHECK (support_status IN ('open','in_progress','resolved'));
CREATE INDEX conversations_support_queue ON conversations(support_status,created_at) WHERE kind='support';
CREATE TABLE admin_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
 conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 150),
 body text NOT NULL DEFAULT '' CHECK(length(body)<=5000),
 pinned boolean NOT NULL DEFAULT false,
 done boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_notes_owner ON admin_notes(admin_id,updated_at DESC);
CREATE INDEX audit_chronology ON audit(created_at DESC);
