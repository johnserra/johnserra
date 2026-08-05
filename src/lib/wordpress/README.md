# WordPress content adapter

Server-only access to the WordPress REST API. Public UI code consumes normalized `WordPressContentItem` values rather than raw WordPress responses.

## Environment

```text
WORDPRESS_API_URL=https://cms.example.com/wp-json/
```

The URL must end at the WordPress REST root. A trailing slash is optional.

Published reads are anonymous. Draft preview and importer credentials are added by their respective phases and must remain server-only.

## Cache tags

- `wp:content` invalidates every CMS-backed read.
- `wp:{collection}:{locale}` invalidates a localized collection.
- `wp:item:{wordpressId}` invalidates an item or translation lookup.
- `wp:translations` invalidates translation maps.

The publishing webhook should invalidate the narrow tags first and reserve `wp:content` for recovery or schema-wide changes.

## Required WordPress contract

- ACF fields are exposed as `acf` in REST responses.
- Collections accept `js_locale=en|tr`.
- Projects are available at `/wp/v2/projects`.
- Translation resolution is available at `/js/v1/translation`.
- Only published content is used outside draft mode.
