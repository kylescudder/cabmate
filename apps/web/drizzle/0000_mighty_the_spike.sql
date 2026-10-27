CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"cargo" text NOT NULL,
	"source_city" text,
	"destination_city" text,
	"income" double precision,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telemetry_rollup_minute" (
	"user_id" uuid NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"avg_speed_kph" real,
	"max_speed_kph" real,
	"distance_km" double precision,
	"samples" integer,
	CONSTRAINT "telemetry_rollup_minute_user_id_bucket_pk" PRIMARY KEY("user_id","bucket")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"fuel_capacity_litres" real,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telemetry" (
	"time" timestamp with time zone NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"speed_kph" real NOT NULL,
	"rpm" real NOT NULL,
	"gear" integer NOT NULL,
	"fuel_litres" real NOT NULL,
	"odometer_km" double precision NOT NULL,
	"truck_damage" real NOT NULL,
	"cargo_damage" real NOT NULL,
	"pos_x" double precision NOT NULL,
	"pos_z" double precision NOT NULL,
	"heading" real NOT NULL,
	CONSTRAINT "telemetry_session_id_time_pk" PRIMARY KEY("session_id","time")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"api_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_name_unique" UNIQUE("name"),
	CONSTRAINT "users_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_rollup_minute" ADD CONSTRAINT "telemetry_rollup_minute_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_session_idx" ON "jobs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "telemetry_user_time_idx" ON "telemetry" USING btree ("user_id","time");--> statement-breakpoint
CREATE INDEX "telemetry_time_idx" ON "telemetry" USING btree ("time");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_user_truck_idx" ON "vehicles" USING btree ("user_id","make","model");