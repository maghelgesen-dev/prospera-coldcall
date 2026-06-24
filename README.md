[build]
  publish = "."
  functions = "netlify/functions"

[[redirects]]
  from = "/api/claude"
  to = "/.netlify/functions/claude"
  status = 200
  force = true

[[redirects]]
  from = "/api/tts"
  to = "/.netlify/functions/tts"
  status = 200
  force = true

[[redirects]]
  from = "/api/login"
  to = "/.netlify/functions/login"
  status = 200
  force = true

[[redirects]]
  from = "/api/save-session"
  to = "/.netlify/functions/save-session"
  status = 200
  force = true

[[redirects]]
  from = "/api/list-sessions"
  to = "/.netlify/functions/list-sessions"
  status = 200
  force = true

[[redirects]]
  from = "/api/get-session"
  to = "/.netlify/functions/get-session"
  status = 200
  force = true
