-- Structure of the public schema: tables, indexes, RLS policies, grants. No rows.
-- A snapshot, not a migration. Regenerate with `npm run db:schema` after every
-- schema change and commit it with that change (scripts/dump-schema.mjs).
--
-- PostgreSQL database dump
--

\restrict guitarpal

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: record_visit(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_visit(p_kind text, p_target text) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  insert into public.user_visits (user_id, kind, target)
  values (auth.uid(), p_kind, p_target)
  on conflict (user_id, kind, target)
  do update set count = public.user_visits.count + 1, last_at = now();
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: book_chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.book_chapters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    index smallint NOT NULL,
    title text NOT NULL,
    page_start integer NOT NULL,
    page_end integer NOT NULL,
    exercise_hint_count integer DEFAULT 0 NOT NULL,
    parsed_at timestamp with time zone,
    parse_status text DEFAULT 'idle'::text NOT NULL,
    parse_error text,
    parse_input_tokens integer DEFAULT 0 NOT NULL,
    parse_output_tokens integer DEFAULT 0 NOT NULL,
    parse_cost_usd numeric(8,4) DEFAULT 0 NOT NULL,
    parse_warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT book_chapters_check CHECK ((page_end >= page_start)),
    CONSTRAINT book_chapters_page_start_check CHECK ((page_start >= 1)),
    CONSTRAINT book_chapters_parse_status_check CHECK ((parse_status = ANY (ARRAY['idle'::text, 'parsing'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT book_chapters_title_check CHECK ((char_length(title) <= 200))
);


--
-- Name: TABLE book_chapters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.book_chapters IS 'Flat chapter list per book: a title and a page range, the unit the parse runs on.';


--
-- Name: book_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.book_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    page integer NOT NULL,
    index smallint NOT NULL,
    text text NOT NULL,
    tsv tsvector,
    embedding public.vector(1024),
    CONSTRAINT book_chunks_page_check CHECK ((page >= 1))
);


--
-- Name: TABLE book_chunks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.book_chunks IS 'Chapter text in retrieval-sized pieces; #203 adds what its retrieval needs.';


--
-- Name: book_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.book_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    page integer NOT NULL,
    kind text NOT NULL,
    source text NOT NULL,
    draft jsonb NOT NULL,
    warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    crop_path text,
    status text DEFAULT 'proposed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT book_exercises_kind_check CHECK ((kind = ANY (ARRAY['strum'::text, 'progression'::text, 'tab'::text, 'chord_diagram'::text]))),
    CONSTRAINT book_exercises_page_check CHECK ((page >= 1)),
    CONSTRAINT book_exercises_source_check CHECK ((source = ANY (ARRAY['literal'::text, 'derived'::text]))),
    CONSTRAINT book_exercises_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'taken'::text, 'dismissed'::text])))
);


--
-- Name: TABLE book_exercises; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.book_exercises IS 'Practice drafts from a chapter parse: literal off the page, or derived by the model.';


--
-- Name: book_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.book_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    index smallint NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    pages integer[] DEFAULT '{}'::integer[] NOT NULL,
    draft_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT book_notes_title_check CHECK ((char_length(title) <= 200))
);


--
-- Name: TABLE book_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.book_notes IS 'Knowledge points a chapter parse read from the chapter text; shown as cards.';


--
-- Name: book_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.book_pages (
    book_id uuid NOT NULL,
    page integer NOT NULL,
    has_text_layer boolean NOT NULL,
    may_have_exercise boolean DEFAULT false NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    text_source text DEFAULT 'none'::text NOT NULL,
    image_path text,
    CONSTRAINT book_pages_page_check CHECK ((page >= 1)),
    CONSTRAINT book_pages_text_source_check CHECK ((text_source = ANY (ARRAY['layer'::text, 'ocr'::text, 'none'::text])))
);


--
-- Name: TABLE book_pages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.book_pages IS 'Per-page text layer and the may_have_exercise tag from the whole-book pass.';


--
-- Name: book_service_alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.book_service_alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: chord_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chord_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    query text NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chord_requests_query_check CHECK ((char_length(query) <= 100))
);


--
-- Name: chord_voicings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chord_voicings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chord_id uuid NOT NULL,
    label text DEFAULT 'Standard'::text NOT NULL,
    start_fret integer DEFAULT 1 NOT NULL,
    barre_fret integer,
    capo boolean DEFAULT false NOT NULL,
    frets text NOT NULL,
    fingers text NOT NULL,
    note text
);


--
-- Name: chords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chords (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    root text NOT NULL,
    suffix text NOT NULL
);


--
-- Name: exercise_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    exercise_id uuid,
    exercise_name text NOT NULL,
    duration_minutes integer,
    reps integer,
    notes text,
    logged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    description text,
    target_bpm integer,
    stage integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exercises_category_check CHECK ((category = ANY (ARRAY['chord'::text, 'chord_change'::text, 'picking'::text, 'scale'::text, 'strumming'::text, 'fingering'::text, 'ear_training'::text, 'arpeggio'::text, 'theory'::text, 'song'::text]))),
    CONSTRAINT exercises_stage_check CHECK (((stage >= 1) AND (stage <= 10)))
);


--
-- Name: practice_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    routine_id uuid,
    routine_name text NOT NULL,
    duration_minutes integer,
    rating integer,
    notes text,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT practice_logs_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: routine_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routine_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    routine_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    duration_minutes integer DEFAULT 5 NOT NULL,
    order_index integer DEFAULT 0 NOT NULL
);


--
-- Name: routines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shared_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_items (
    id text NOT NULL,
    owner_id uuid NOT NULL,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT shared_items_id_shape CHECK ((id ~ '^[A-Za-z0-9]{10}$'::text)),
    CONSTRAINT shared_items_kind CHECK ((kind = ANY (ARRAY['fingerpick'::text, 'strum'::text])))
);


--
-- Name: TABLE shared_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shared_items IS 'Public snapshot links: a copy of a pattern anyone with the id can open in the player.';


--
-- Name: COLUMN shared_items.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shared_items.expires_at IS 'After this the link no longer opens; null never expires. Set by the MCP server, not by the app.';


--
-- Name: user_books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_books (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    page_count integer,
    storage_path text NOT NULL,
    status text DEFAULT 'uploaded'::text NOT NULL,
    toc_source text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scanned_pages integer DEFAULT 0 NOT NULL,
    CONSTRAINT user_books_scanned_pages_check CHECK ((scanned_pages >= 0)),
    CONSTRAINT user_books_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'scanning'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT user_books_title_check CHECK ((char_length(title) <= 200)),
    CONSTRAINT user_books_toc_source_check CHECK ((toc_source = ANY (ARRAY['outline'::text, 'text'::text, 'vision'::text, 'manual'::text])))
);


--
-- Name: TABLE user_books; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_books IS 'One uploaded textbook PDF per row; private to user_id, served only by book-service.';


--
-- Name: user_chord_voicings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_chord_voicings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    root text NOT NULL,
    suffix text NOT NULL,
    label text,
    start_fret smallint DEFAULT 1 NOT NULL,
    barre_fret smallint,
    capo boolean DEFAULT false NOT NULL,
    frets text NOT NULL,
    fingers text DEFAULT '000000'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text
);


--
-- Name: TABLE user_chord_voicings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_chord_voicings IS 'Chord shapes a player wrote themselves. Same column shape as chord_voicings so a row from either reads as one ChordVoicing; chords/chord_voicings stay shared read-only reference data.';


--
-- Name: COLUMN user_chord_voicings.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_chord_voicings.category IS 'Browse category the player filed this chord under (CHORD_SUFFIX_CATEGORIES name). Null means derive it from the suffix.';


--
-- Name: user_favourite_fingerpick_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_favourite_fingerpick_patterns (
    user_id uuid NOT NULL,
    pattern_id text NOT NULL
);


--
-- Name: user_favourite_chords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_favourite_chords (
    user_id uuid NOT NULL,
    root text NOT NULL,
    suffix text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_favourite_chords; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_favourite_chords IS 'Chords a player keeps, by name (root + suffix) so a favourite outlives any voicing change.';


--
-- Name: user_favourite_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_favourite_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pattern_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_fingerpick_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_fingerpick_patterns (
    user_id uuid NOT NULL,
    pattern_id text NOT NULL,
    name text NOT NULL,
    measures jsonb NOT NULL,
    bpm integer NOT NULL,
    time_signature jsonb NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    capo smallint,
    spans jsonb,
    CONSTRAINT user_fingerpick_patterns_capo_range CHECK (((capo IS NULL) OR ((capo >= 0) AND (capo <= 12))))
);


--
-- Name: COLUMN user_fingerpick_patterns.capo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_fingerpick_patterns.capo IS 'Capo fret (0-12) the TAB is written behind; playback transposes up by this many semitones. Null = no capo.';


--
-- Name: COLUMN user_fingerpick_patterns.spans; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_fingerpick_patterns.spans IS 'Technique model v2 spans: [{id, kind: palmMute|letRing|slur, from, to, strings?}], anchored on slot ids in `measures`. Null = none.';


--
-- Name: user_last_pattern; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_last_pattern (
    user_id uuid NOT NULL,
    tool text NOT NULL,
    pattern_id text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_last_pattern_tool_check CHECK ((tool = ANY (ARRAY['strum'::text, 'fingerpick'::text])))
);


--
-- Name: user_pattern_progressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_pattern_progressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pattern_id text NOT NULL,
    bars jsonb NOT NULL,
    order_index smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    bpm smallint,
    capo smallint,
    synced_beats jsonb,
    follows_pattern boolean,
    sync_notice_dismissed boolean,
    CONSTRAINT user_pattern_progressions_capo_range CHECK (((capo IS NULL) OR ((capo >= 0) AND (capo <= 12))))
);


--
-- Name: TABLE user_pattern_progressions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_pattern_progressions IS 'Chord sequences (multi-bar, per-bar chord) a user attached to a strum pattern, preset or custom.';


--
-- Name: COLUMN user_pattern_progressions.synced_beats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_pattern_progressions.synced_beats IS 'Pattern rhythm (StepValue[][]) this sequence was last reconciled with. Null for rows written before the reconcile prompt; those are backfilled on first open.';


--
-- Name: COLUMN user_pattern_progressions.follows_pattern; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_pattern_progressions.follows_pattern IS 'False once the player declined to follow the pattern. Null means still following.';


--
-- Name: COLUMN user_pattern_progressions.sync_notice_dismissed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_pattern_progressions.sync_notice_dismissed IS 'True once the player dismissed the standing "not following the pattern" notice. Null means show it.';


--
-- Name: user_strum_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_strum_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pattern_id text NOT NULL,
    name text NOT NULL,
    beats jsonb NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bars jsonb,
    bpm smallint,
    meter jsonb,
    CONSTRAINT user_strum_patterns_bpm_range CHECK (((bpm IS NULL) OR ((bpm >= 40) AND (bpm <= 220))))
);


--
-- Name: COLUMN user_strum_patterns.bars; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_strum_patterns.bars IS 'Multi-bar pattern: [{beats, chord}]. Null for legacy single-bar rows; beats stays in sync with bars[0].beats.';


--
-- Name: COLUMN user_strum_patterns.bpm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_strum_patterns.bpm IS 'Default tempo in BPM (40-220). Null for legacy rows; the client falls back to 80.';


--
-- Name: COLUMN user_strum_patterns.meter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_strum_patterns.meter IS 'Time signature as [top, bottom], e.g. [4,4] or [6,8]. Null for rows written before meters existed; those read back as [4,4].';


--
-- Name: user_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_visits (
    user_id uuid NOT NULL,
    kind text NOT NULL,
    target text NOT NULL,
    count integer DEFAULT 1 NOT NULL,
    last_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_visits_count_check CHECK ((count > 0)),
    CONSTRAINT user_visits_kind_check CHECK ((kind = ANY (ARRAY['strum'::text, 'tab'::text, 'chord'::text, 'book'::text]))),
    CONSTRAINT user_visits_target_check CHECK (((char_length(target) >= 1) AND (char_length(target) <= 200)))
);


--
-- Name: TABLE user_visits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_visits IS 'How many times a player opened each strum pattern, tab, chord and book; Home lists the most opened.';


--
-- Name: book_chapters book_chapters_book_id_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_chapters
    ADD CONSTRAINT book_chapters_book_id_index_key UNIQUE (book_id, index);


--
-- Name: book_chapters book_chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_chapters
    ADD CONSTRAINT book_chapters_pkey PRIMARY KEY (id);


--
-- Name: book_chunks book_chunks_chapter_id_page_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_chunks
    ADD CONSTRAINT book_chunks_chapter_id_page_index_key UNIQUE (chapter_id, page, index);


--
-- Name: book_chunks book_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_chunks
    ADD CONSTRAINT book_chunks_pkey PRIMARY KEY (id);


--
-- Name: book_exercises book_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_exercises
    ADD CONSTRAINT book_exercises_pkey PRIMARY KEY (id);


--
-- Name: book_notes book_notes_chapter_id_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_notes
    ADD CONSTRAINT book_notes_chapter_id_index_key UNIQUE (chapter_id, index);


--
-- Name: book_notes book_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_notes
    ADD CONSTRAINT book_notes_pkey PRIMARY KEY (id);


--
-- Name: book_pages book_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_pages
    ADD CONSTRAINT book_pages_pkey PRIMARY KEY (book_id, page);


--
-- Name: book_service_alembic_version book_service_alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_service_alembic_version
    ADD CONSTRAINT book_service_alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: chord_requests chord_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chord_requests
    ADD CONSTRAINT chord_requests_pkey PRIMARY KEY (id);


--
-- Name: chord_voicings chord_voicings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chord_voicings
    ADD CONSTRAINT chord_voicings_pkey PRIMARY KEY (id);


--
-- Name: chords chords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chords
    ADD CONSTRAINT chords_pkey PRIMARY KEY (id);


--
-- Name: exercise_logs exercise_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_logs
    ADD CONSTRAINT exercise_logs_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: practice_logs practice_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_logs
    ADD CONSTRAINT practice_logs_pkey PRIMARY KEY (id);


--
-- Name: routine_exercises routine_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_exercises
    ADD CONSTRAINT routine_exercises_pkey PRIMARY KEY (id);


--
-- Name: routines routines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);


--
-- Name: shared_items shared_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_items
    ADD CONSTRAINT shared_items_pkey PRIMARY KEY (id);


--
-- Name: user_books user_books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_books
    ADD CONSTRAINT user_books_pkey PRIMARY KEY (id);


--
-- Name: user_chord_voicings user_chord_voicings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chord_voicings
    ADD CONSTRAINT user_chord_voicings_pkey PRIMARY KEY (id);


--
-- Name: user_favourite_fingerpick_patterns user_favourite_fingerpick_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favourite_fingerpick_patterns
    ADD CONSTRAINT user_favourite_fingerpick_patterns_pkey PRIMARY KEY (user_id, pattern_id);


--
-- Name: user_favourite_chords user_favourite_chords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favourite_chords
    ADD CONSTRAINT user_favourite_chords_pkey PRIMARY KEY (user_id, root, suffix);


--
-- Name: user_favourite_patterns user_favourite_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favourite_patterns
    ADD CONSTRAINT user_favourite_patterns_pkey PRIMARY KEY (id);


--
-- Name: user_favourite_patterns user_favourite_patterns_user_pattern_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favourite_patterns
    ADD CONSTRAINT user_favourite_patterns_user_pattern_unique UNIQUE (user_id, pattern_id);


--
-- Name: user_fingerpick_patterns user_fingerpick_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_fingerpick_patterns
    ADD CONSTRAINT user_fingerpick_patterns_pkey PRIMARY KEY (user_id, pattern_id);


--
-- Name: user_last_pattern user_last_pattern_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_last_pattern
    ADD CONSTRAINT user_last_pattern_pkey PRIMARY KEY (user_id, tool);


--
-- Name: user_pattern_progressions user_pattern_progressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pattern_progressions
    ADD CONSTRAINT user_pattern_progressions_pkey PRIMARY KEY (id);


--
-- Name: user_strum_patterns user_strum_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_strum_patterns
    ADD CONSTRAINT user_strum_patterns_pkey PRIMARY KEY (id);


--
-- Name: user_visits user_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_visits
    ADD CONSTRAINT user_visits_pkey PRIMARY KEY (user_id, kind, target);


--
-- Name: book_chunks_tsv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX book_chunks_tsv_idx ON public.book_chunks USING gin (tsv);


--
-- Name: book_exercises_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX book_exercises_chapter_idx ON public.book_exercises USING btree (chapter_id, page);


--
-- Name: shared_items_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_items_expires_idx ON public.shared_items USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: shared_items_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_items_owner_idx ON public.shared_items USING btree (owner_id, created_at DESC);


--
-- Name: user_books_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_books_owner_idx ON public.user_books USING btree (user_id, created_at DESC);


--
-- Name: user_chord_voicings_user_chord_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_chord_voicings_user_chord_idx ON public.user_chord_voicings USING btree (user_id, root, suffix);


--
-- Name: user_pattern_progressions_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_pattern_progressions_owner_idx ON public.user_pattern_progressions USING btree (user_id, pattern_id, order_index);


--
-- Name: user_visits_top_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_visits_top_idx ON public.user_visits USING btree (user_id, count DESC, last_at DESC);


--
-- Name: book_chapters book_chapters_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_chapters
    ADD CONSTRAINT book_chapters_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.user_books(id) ON DELETE CASCADE;


--
-- Name: book_chunks book_chunks_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_chunks
    ADD CONSTRAINT book_chunks_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.book_chapters(id) ON DELETE CASCADE;


--
-- Name: book_exercises book_exercises_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_exercises
    ADD CONSTRAINT book_exercises_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.book_chapters(id) ON DELETE CASCADE;


--
-- Name: book_notes book_notes_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_notes
    ADD CONSTRAINT book_notes_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.book_chapters(id) ON DELETE CASCADE;


--
-- Name: book_pages book_pages_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_pages
    ADD CONSTRAINT book_pages_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.user_books(id) ON DELETE CASCADE;


--
-- Name: chord_requests chord_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chord_requests
    ADD CONSTRAINT chord_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: chord_voicings chord_voicings_chord_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chord_voicings
    ADD CONSTRAINT chord_voicings_chord_id_fkey FOREIGN KEY (chord_id) REFERENCES public.chords(id) ON DELETE CASCADE;


--
-- Name: exercise_logs exercise_logs_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_logs
    ADD CONSTRAINT exercise_logs_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE SET NULL;


--
-- Name: exercise_logs exercise_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_logs
    ADD CONSTRAINT exercise_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: exercises exercises_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: practice_logs practice_logs_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_logs
    ADD CONSTRAINT practice_logs_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE SET NULL;


--
-- Name: practice_logs practice_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_logs
    ADD CONSTRAINT practice_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: routine_exercises routine_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_exercises
    ADD CONSTRAINT routine_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE RESTRICT;


--
-- Name: routine_exercises routine_exercises_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_exercises
    ADD CONSTRAINT routine_exercises_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE;


--
-- Name: routines routines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: shared_items shared_items_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_items
    ADD CONSTRAINT shared_items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_books user_books_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_books
    ADD CONSTRAINT user_books_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_chord_voicings user_chord_voicings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chord_voicings
    ADD CONSTRAINT user_chord_voicings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_favourite_fingerpick_patterns user_favourite_fingerpick_patterns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favourite_fingerpick_patterns
    ADD CONSTRAINT user_favourite_fingerpick_patterns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_favourite_chords user_favourite_chords_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favourite_chords
    ADD CONSTRAINT user_favourite_chords_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_favourite_patterns user_favourite_patterns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favourite_patterns
    ADD CONSTRAINT user_favourite_patterns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_fingerpick_patterns user_fingerpick_patterns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_fingerpick_patterns
    ADD CONSTRAINT user_fingerpick_patterns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_last_pattern user_last_pattern_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_last_pattern
    ADD CONSTRAINT user_last_pattern_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_pattern_progressions user_pattern_progressions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pattern_progressions
    ADD CONSTRAINT user_pattern_progressions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_strum_patterns user_strum_patterns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_strum_patterns
    ADD CONSTRAINT user_strum_patterns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_visits user_visits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_visits
    ADD CONSTRAINT user_visits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chord_voicings Public read chord_voicings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read chord_voicings" ON public.chord_voicings FOR SELECT USING (true);


--
-- Name: chords Public read chords; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read chords" ON public.chords FOR SELECT USING (true);


--
-- Name: user_favourite_fingerpick_patterns Users can manage their own favourites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own favourites" ON public.user_favourite_fingerpick_patterns USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_favourite_chords own favourite chords are deletable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own favourite chords are deletable" ON public.user_favourite_chords FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_favourite_chords own favourite chords are insertable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own favourite chords are insertable" ON public.user_favourite_chords FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_favourite_chords own favourite chords are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own favourite chords are readable" ON public.user_favourite_chords FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_favourite_patterns Users can manage their own favourites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own favourites" ON public.user_favourite_patterns USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_fingerpick_patterns Users can manage their own patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own patterns" ON public.user_fingerpick_patterns USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_strum_patterns Users can manage their own patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own patterns" ON public.user_strum_patterns USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_last_pattern Users manage own last pattern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own last pattern" ON public.user_last_pattern USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: chord_requests anyone can report a missing chord; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone can report a missing chord" ON public.chord_requests FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: user_visits insert own visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own visits" ON public.user_visits FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_visits read own visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own visits" ON public.user_visits FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_visits update own visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own visits" ON public.user_visits FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: book_chapters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.book_chapters ENABLE ROW LEVEL SECURITY;

--
-- Name: book_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.book_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: book_exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.book_exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: book_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.book_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: book_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.book_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: book_chapters book_service owns the rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "book_service owns the rows" ON public.book_chapters TO book_service USING (true) WITH CHECK (true);


--
-- Name: book_chunks book_service owns the rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "book_service owns the rows" ON public.book_chunks TO book_service USING (true) WITH CHECK (true);


--
-- Name: book_exercises book_service owns the rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "book_service owns the rows" ON public.book_exercises TO book_service USING (true) WITH CHECK (true);


--
-- Name: book_notes book_service owns the rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "book_service owns the rows" ON public.book_notes TO book_service USING (true) WITH CHECK (true);


--
-- Name: book_pages book_service owns the rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "book_service owns the rows" ON public.book_pages TO book_service USING (true) WITH CHECK (true);


--
-- Name: user_books book_service owns the rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "book_service owns the rows" ON public.user_books TO book_service USING (true) WITH CHECK (true);


--
-- Name: chord_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chord_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: chord_voicings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chord_voicings ENABLE ROW LEVEL SECURITY;

--
-- Name: chords; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chords ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pattern_progressions delete own progressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own progressions" ON public.user_pattern_progressions FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: shared_items delete own shared items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own shared items" ON public.shared_items FOR DELETE TO authenticated USING ((auth.uid() = owner_id));


--
-- Name: exercise_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pattern_progressions insert own progressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own progressions" ON public.user_pattern_progressions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: shared_items insert own shared items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own shared items" ON public.shared_items FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));


--
-- Name: user_chord_voicings own voicings are deletable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own voicings are deletable" ON public.user_chord_voicings FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_chord_voicings own voicings are insertable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own voicings are insertable" ON public.user_chord_voicings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_chord_voicings own voicings are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own voicings are readable" ON public.user_chord_voicings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_chord_voicings own voicings are updatable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own voicings are updatable" ON public.user_chord_voicings FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: practice_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practice_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pattern_progressions read own progressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own progressions" ON public.user_pattern_progressions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: shared_items read shared item by id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read shared item by id" ON public.shared_items FOR SELECT TO authenticated, anon USING (true);


--
-- Name: routine_exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routine_exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: routines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pattern_progressions update own progressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own progressions" ON public.user_pattern_progressions FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_books; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

--
-- Name: user_chord_voicings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_chord_voicings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_favourite_fingerpick_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_favourite_fingerpick_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: user_favourite_chords; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_favourite_chords ENABLE ROW LEVEL SECURITY;

--
-- Name: user_favourite_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_favourite_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: user_fingerpick_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_fingerpick_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: user_last_pattern; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_last_pattern ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pattern_progressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_pattern_progressions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_strum_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_strum_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_logs users can manage their own exercise_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can manage their own exercise_logs" ON public.exercise_logs USING ((auth.uid() = user_id));


--
-- Name: user_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_visits ENABLE ROW LEVEL SECURITY;


--
-- Name: exercises users can manage their own exercises; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can manage their own exercises" ON public.exercises USING ((auth.uid() = user_id));


--
-- Name: practice_logs users can manage their own practice_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can manage their own practice_logs" ON public.practice_logs USING ((auth.uid() = user_id));


--
-- Name: routine_exercises users can manage their own routine_exercises; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can manage their own routine_exercises" ON public.routine_exercises USING ((routine_id IN ( SELECT routines.id
   FROM public.routines
  WHERE (routines.user_id = auth.uid()))));


--
-- Name: routines users can manage their own routines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can manage their own routines" ON public.routines USING ((auth.uid() = user_id));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO book_service;


--
-- Name: FUNCTION record_visit(p_kind text, p_target text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_visit(p_kind text, p_target text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_visit(p_kind text, p_target text) TO authenticated;
GRANT ALL ON FUNCTION public.record_visit(p_kind text, p_target text) TO service_role;


--
-- Name: TABLE book_chapters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.book_chapters TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.book_chapters TO book_service;


--
-- Name: TABLE book_chunks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.book_chunks TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.book_chunks TO book_service;


--
-- Name: TABLE book_exercises; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.book_exercises TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.book_exercises TO book_service;


--
-- Name: TABLE book_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.book_notes TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.book_notes TO book_service;


--
-- Name: TABLE book_pages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.book_pages TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.book_pages TO book_service;


--
-- Name: TABLE book_service_alembic_version; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.book_service_alembic_version TO anon;
GRANT ALL ON TABLE public.book_service_alembic_version TO authenticated;
GRANT ALL ON TABLE public.book_service_alembic_version TO service_role;


--
-- Name: TABLE chord_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chord_requests TO anon;
GRANT ALL ON TABLE public.chord_requests TO authenticated;
GRANT ALL ON TABLE public.chord_requests TO service_role;


--
-- Name: TABLE chord_voicings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chord_voicings TO anon;
GRANT ALL ON TABLE public.chord_voicings TO authenticated;
GRANT ALL ON TABLE public.chord_voicings TO service_role;


--
-- Name: TABLE chords; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chords TO anon;
GRANT ALL ON TABLE public.chords TO authenticated;
GRANT ALL ON TABLE public.chords TO service_role;


--
-- Name: TABLE exercise_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.exercise_logs TO anon;
GRANT ALL ON TABLE public.exercise_logs TO authenticated;
GRANT ALL ON TABLE public.exercise_logs TO service_role;


--
-- Name: TABLE exercises; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.exercises TO anon;
GRANT ALL ON TABLE public.exercises TO authenticated;
GRANT ALL ON TABLE public.exercises TO service_role;


--
-- Name: TABLE practice_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.practice_logs TO anon;
GRANT ALL ON TABLE public.practice_logs TO authenticated;
GRANT ALL ON TABLE public.practice_logs TO service_role;


--
-- Name: TABLE routine_exercises; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routine_exercises TO anon;
GRANT ALL ON TABLE public.routine_exercises TO authenticated;
GRANT ALL ON TABLE public.routine_exercises TO service_role;


--
-- Name: TABLE routines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routines TO anon;
GRANT ALL ON TABLE public.routines TO authenticated;
GRANT ALL ON TABLE public.routines TO service_role;


--
-- Name: TABLE shared_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_items TO anon;
GRANT ALL ON TABLE public.shared_items TO authenticated;
GRANT ALL ON TABLE public.shared_items TO service_role;


--
-- Name: TABLE user_books; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_books TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_books TO book_service;


--
-- Name: TABLE user_chord_voicings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_chord_voicings TO anon;
GRANT ALL ON TABLE public.user_chord_voicings TO authenticated;
GRANT ALL ON TABLE public.user_chord_voicings TO service_role;


--
-- Name: TABLE user_favourite_fingerpick_patterns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_favourite_fingerpick_patterns TO anon;
GRANT ALL ON TABLE public.user_favourite_fingerpick_patterns TO authenticated;
GRANT ALL ON TABLE public.user_favourite_fingerpick_patterns TO service_role;


--
-- Name: TABLE user_favourite_chords; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_favourite_chords TO anon;
GRANT ALL ON TABLE public.user_favourite_chords TO authenticated;
GRANT ALL ON TABLE public.user_favourite_chords TO service_role;


--
-- Name: TABLE user_favourite_patterns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_favourite_patterns TO anon;
GRANT ALL ON TABLE public.user_favourite_patterns TO authenticated;
GRANT ALL ON TABLE public.user_favourite_patterns TO service_role;


--
-- Name: TABLE user_fingerpick_patterns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_fingerpick_patterns TO anon;
GRANT ALL ON TABLE public.user_fingerpick_patterns TO authenticated;
GRANT ALL ON TABLE public.user_fingerpick_patterns TO service_role;


--
-- Name: TABLE user_last_pattern; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_last_pattern TO anon;
GRANT ALL ON TABLE public.user_last_pattern TO authenticated;
GRANT ALL ON TABLE public.user_last_pattern TO service_role;


--
-- Name: TABLE user_pattern_progressions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_pattern_progressions TO anon;
GRANT ALL ON TABLE public.user_pattern_progressions TO authenticated;
GRANT ALL ON TABLE public.user_pattern_progressions TO service_role;


--
-- Name: TABLE user_strum_patterns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_strum_patterns TO anon;
GRANT ALL ON TABLE public.user_strum_patterns TO authenticated;
GRANT ALL ON TABLE public.user_strum_patterns TO service_role;


--
-- Name: TABLE user_visits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_visits TO anon;
GRANT ALL ON TABLE public.user_visits TO authenticated;
GRANT ALL ON TABLE public.user_visits TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict guitarpal

