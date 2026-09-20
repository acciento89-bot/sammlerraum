Object.assign(process.env, { NODE_ENV: "test" });
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/sammlerraum_test";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.UPLOADS_DIR = "/tmp/sammlerraum-test-uploads";
process.env.LOG_LEVEL = "error";
process.env.NEXT_PUBLIC_APP_ORIGIN = "http://localhost:3000";
