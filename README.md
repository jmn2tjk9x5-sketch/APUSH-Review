# APUSH Full Review

Static APUSH review app with:

- people and events reference pages
- Quizizz-style practice
- drag-and-drop timeline rounds
- a master timeline
- AMSCO period progress tracking
- Supabase-ready auth and cloud sync
- local fallback mode when Supabase is not configured

## Files

- `index.html`: app shell
- `styles.css`: full UI styles
- `data.js`: APUSH people/events content
- `app.js`: UI logic, timeline, quizizz, progress dashboard
- `supabase.js`: auth + persistence wrapper
- `supabase-schema.sql`: tables + RLS policies
- `supabase-config.example.js`: example client config

## Run locally

Because the app uses ES modules, serve it with a local web server instead of opening the HTML file directly.

Example:

```bash
cd /Users/evanbinsky/Desktop/Python/APUSHFullReview
python3 -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080
```

## GitHub Pages

This app is static and can be hosted on GitHub Pages.

If you are **not** using Supabase yet, it will still work in local-storage mode.

### VS Code publish flow

If you want to push this with the easiest possible VS Code flow:

1. Open the folder `APUSHFullReview` in VS Code.
2. Open the Source Control tab.
3. If prompted, choose **Publish to GitHub**.
4. Make the repo public if you want GitHub Pages.
5. After GitHub creates the repo, go to GitHub repo `Settings -> Pages`.
6. Set Pages to deploy from the `main` branch and the repo root.

Because `index.html` is already at the project root, GitHub Pages will pick it up cleanly.

## Supabase setup

1. Create a Supabase project.
2. In the SQL editor, run `supabase-schema.sql`.
3. Copy `supabase-config.example.js` to `supabase-config.js`.
4. Replace the placeholder values with your project URL and anon key.
5. Add this line in `index.html` before `app.js`:

```html
<script src="./supabase-config.js"></script>
```

6. Enable Email auth in Supabase if you want magic-link sign in.

## Current progress model

Each Quizizz answer records:

- `content_title`
- `amsco_period`
- `mode`
- `question_type`
- `correct`
- `created_at`

The Progress page rolls this up into:

- AMSCO period mastery
- question-type accuracy
- recent attempts

## Notes

- Without Supabase config, sign-in works in local demo mode and attempts are stored in `localStorage`.
- With Supabase config, the same UI writes to the `question_attempts` table.
