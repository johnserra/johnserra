# Digital Twin project-page publishing package (archive)

This package records the copy prepared for [WordPress draft 135](https://backend.johnserra.com/wp-admin/post.php?post=135&action=edit) on September 14, 2026. The draft body, English locale, summary, excerpt, four tags, and project details were checked after reopening the editor. John later published the [Digital Twin project page](https://johnserra.com/projects/digital-twin-assistant); its public route returned HTTP 200 on September 24, 2026. The live WordPress page is authoritative if its final copy differs from these archived preparation files.

At the draft handoff, the intended slug was `digital-twin`, but the published slug is `digital-twin-assistant`. The English caption file returned HTTP 200 with `text/vtt` content type on September 24, 2026. Playback and the WordPress indexing state were not rechecked in this archive update.

## Files

- `project.en.mdx`: editable draft copy with project metadata. Its publication date was intentionally omitted at preparation time. Its `status: Live` describes the project, not the draft's former publication state.
- `project.en.html`: rendered body for the WordPress editor's HTML/code view. The project template supplies the page title and summary, so the body starts with the introduction rather than a second H1.
- `../../../public/digital-twin/demo-2026-09-14.en.vtt`: timed English descriptions of the silent screen recording. Captions summarize the on-screen conversation; the existing linked transcript retains the full original answers. The English citation still supplies the player’s poster image.

## WordPress project fields

| Field | Prepared value |
| --- | --- |
| Content type | Project (`js_project`) |
| Publication status at handoff | Draft; the English page was later published |
| Title | Digital Twin: A Project You Can Talk To |
| Proposed slug at handoff | `digital-twin` |
| Locale | English (`en`) |
| Summary and excerpt | An English and Turkish AI assistant that helps visitors explore my work, ask follow-up questions, and check the sources behind its answers. |
| Project status | Live |
| GitHub URL | `https://github.com/johnserra/johnserra` |
| Live URL | `https://johnserra.com` |
| Suggested tags | AI, Product Development, Evaluation, Multilingual |
| Published public path | `https://johnserra.com/projects/digital-twin-assistant` |
| Featured image | Optional; none selected for this draft |

The site builds its page description from the Summary field. At handoff, the prepared summary was entered there and in the excerpt, and WordPress assigned the content identity. The September 14 date in the copy identified verification results, not the page's publication date.

## Original publishing handoff

The original handoff called for pasting `project.en.html` into a WordPress Project draft, previewing the page and listing card, checking the embedded WebM player and source links, preserving the caption track, and confirming indexing after publication. It documented no MP4 fallback. Those were preparation and release checks, not open instructions to publish this archived copy again.

The live site uses WordPress content. Adding a file to `content/en/projects` alone is not a CMS publication. The repository importer is a bulk publishing tool that uses WordPress status `publish`; it was not used for this draft handoff.

The caption asset is `public/digital-twin/demo-2026-09-14.en.vtt`; its root-relative URL keeps requests on the page's origin. The archived HTML includes a default English `<track>`. The recording has one VP8 video stream and no audio stream; the captions describe visuals rather than transcribe speech.

This package contains English copy only. The Turkish project URL redirected to `/tr/projeler/digital-twin-assistant` and returned HTTP 404 on September 24, 2026; this archive does not establish a published Turkish edition.

## Editorial decisions and evidence

The page leads with visitor questions and explains source retrieval and verification in ordinary language. Technical terms, deployment IDs, issue numbers, and internal failure details remain in the linked engineering material. No visitor counts, hiring results, revenue, time savings, or general accuracy percentage are claimed.

The current technical references are `docs/digital-twin-case-study.md` and `evals/production/2026-09-14-followups/README.md`. The text preserves the distinction between the three targeted follow-up checks and the earlier six-question evaluation. It also retains the limitations of AI verification, broad answers, mixed-source questions, and conversation persistence.
