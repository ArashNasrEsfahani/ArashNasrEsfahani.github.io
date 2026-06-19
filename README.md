# Arash NasrEsfahani · Personal Academic Website

Source for my personal academic website, live at
**[arashnasresfahani.github.io](https://arashnasresfahani.github.io)**.

A fast, single-page portfolio highlighting my research interests, publications,
experience, and projects in AI, human-computer interaction, and human-robot
interaction.

## Stack

Plain, dependency-free **HTML5 + CSS3 + vanilla JavaScript**, with no build step
and no framework. It deploys straight to GitHub Pages.

- **Type:** Fraunces (display), Hanken Grotesk (body), IBM Plex Mono (data/labels)
- **Design:** light theme, single deep-teal accent, faint coordinate dot-grid hero
- **JS:** progressive enhancement only (scroll-reveal animations and sticky-nav
  scrollspy). The page is fully readable with JavaScript disabled.
- **SEO/accessibility:** Open Graph + Twitter cards, JSON-LD `Person` schema,
  `sitemap.xml`, `robots.txt`, skip link, visible focus styles, and
  `prefers-reduced-motion` support.

## Structure

```
index.html      # all content + meta
style.css       # design system + layout
script.js       # reveals, scrollspy, sticky nav
favicon.svg     # monogram favicon
CV_2026.pdf     # downloadable CV
assets/         # portrait + supporting files
sitemap.xml     # search-engine sitemap
robots.txt
```

## Local preview

Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000   # then visit http://localhost:8000
```

## Updating content

- **CV:** replace `CV_2026.pdf` (links in `index.html` and the footer point to it).
- **Publications / news / projects:** edit the matching `<section>` in `index.html`.
- **Colors / fonts / spacing:** the design tokens live in `:root` at the top of `style.css`.
