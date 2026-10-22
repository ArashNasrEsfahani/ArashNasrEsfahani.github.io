# Arash NasrEsfahani · personal website

Source for my personal website, live at **[arashnasresfahani.github.io](https://arashnasresfahani.github.io)**.
The MISE project page lives in [`MISE/`](MISE/) and is served at
[arashnasresfahani.github.io/MISE/](https://arashnasresfahani.github.io/MISE/).

## Stack

Plain HTML, CSS and a little JavaScript; no build step, no framework. GitHub Pages serves it as is.

- **Type:** EB Garamond throughout.
- **Colours:** notebook white, ink and one deep, light blue (`#355c96`); dark mode follows the system setting.
- **Phone first:** the top bar always fits, every link and button is at least 44 px tall, no sideways scrolling.
- **The Space Eagle:** a small companion (one of my childhood inventions) that flies, flames on, to a perch near
  what you are reading: beside the portrait, then beside each section heading, then by the notebook button at the
  end, including the corner of each Recent work picture. It sways with the scroll, leans towards a nearby mouse, can be dragged anywhere (it flies home when let go), hops and wiggles while it waits, and leaves exhaust puffs and landing dust. Tap it for Launch and for the inventions notebook, a lined-paper page where the drawing flips to show the
  inside and launches. With reduced motion it simply sits on each perch.
- **Accessibility and search:** skip link, visible focus, `prefers-reduced-motion`, Open Graph cards, JSON-LD
  `WebSite` and `Person` (the site name is just "Arash NasrEsfahani"), `sitemap.xml`, `robots.txt`.

## Structure

```
index.html      # all content and meta
style.css       # design tokens at the top, then layout
script.js       # the Space Eagle companion, its menu and the inventions notebook; the footer year
favicon.svg
CV_2026.pdf     # downloadable CV
assets/         # portrait, the two Space Eagle drawings, and work/ (pictures for Recent work)
MISE/           # MISE project page
sitemap.xml
robots.txt
```

## Local preview

```bash
python -m http.server 8000   # then visit http://localhost:8000
```

## Updating content

- **CV:** replace `CV_2026.pdf` (the top bar, intro links and experience note point to it).
- **Recent work, papers, experience:** edit the matching `<section>` in `index.html`; pictures are 1600x1000 JPEGs in `assets/work/` (the product page in a browser frame plus a floating card).
- **The Space Eagle's perches:** any `<span class="perch">` in the page; it lands on the one nearest what you are reading (the first one when the page opens).
- **Colours, fonts, spacing:** the tokens live in `:root` at the top of `style.css`.
