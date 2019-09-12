/**
 * allowing this to be customizable is nice.
 */
function handleNotFound(event) {
	// TODO: make this configurable; default 404.html
	return Response.redirect(newDocsOverview, 301)
}