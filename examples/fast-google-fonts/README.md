# Fast Google Fonts

Significantly improves performance of Google Fonts:

* Rewrites the HTML and puts the browser-specific Google Fonts CSS directly in the HTML (eliminating the round trips for fetching the CSS and improving overall page rendering performance).
* Proxies the font files through the same domain as the page, eliminating the round-trips to connect to Google's servers and allowing HTTP/2 priorities to work correctly.
* Adds preload hints to the HTML to load the font files before layout.

The code also provides an example of how to do streaming HTML rewriting effectively in a Cloudflare Worker.

## Testing

For testing purposes it also supports turning features off through query parameters added to the page URL:

* ```cf-worker=bypass``` disables all rewriting. i.e. ```https://www.example.com/?cf-worker=bypass```
* ```cf-preload=disable``` disables font preloading. i.e. ```https://www.example.com/?cf-preload=disable```

## License

BSD 3-Clause licensed. See the LICENSE file for details.