// Blog configuration
// This file is in .gitignore to protect Supabase credentials

const BLOG_CONFIG = {
  // Session duration (7 days by default)
  sessionDuration: 7 * 24 * 60 * 60 * 1000,

  // Supabase configuration
  // Get these values from: https://supabase.com → Your Project → Settings → API
  supabase: {
    url: 'https://bxsnmjxngirjdzqtzgnc.supabase.co',  // TODO: Replace with your Project URL
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c25tanhuZ2lyamR6cXR6Z25jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMDU3NTcsImV4cCI6MjA4MzY4MTc1N30.C2SZoQc19BYREcYhfMcuwEwczX7fuW_LuL1d0RS0LcA'  // TODO: Replace with your anon public key
  }
};
