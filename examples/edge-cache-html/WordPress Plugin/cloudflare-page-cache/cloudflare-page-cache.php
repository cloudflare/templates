<?php
/*
Plugin Name:  Cloudflare Page Cache
Plugin URI:   https://github.com/cloudflare/worker-examples
Description:  Cache HTML pages on the Cloudflare CDN
Version:      20181212
Author:       Patrick Meenan
Author URI:   https://www.webpagetest.org/
License:      MIT
License URI:  https://opensource.org/licenses/MIT
Text Domain:  cloudflare-page-cache
Domain Path:  /languages
*/
defined( 'ABSPATH' ) or die( 'No script kiddies please!' );

$cloudflare_page_cache_needs_purge = FALSE;

// Add the response header to cache the page
function cloudflare_page_cache_add_headers() {
  global $cloudflare_page_cache_needs_purge;
  if ( !$cloudflare_page_cache_needs_purge && !is_user_logged_in() ) {
    header( 'x-HTML-Edge-Cache: cache,bypass-cookies=wp-|wordpress|comment_|woocommerce_' );
  }
}
add_action( 'send_headers', 'cloudflare_page_cache_add_headers' );

// Add the response header to purge the cache. send_headers isn't always called
// so set it immediately when something changes.
function cloudflare_page_cache_purge() {
  global $cloudflare_page_cache_needs_purge;
  if (!$cloudflare_page_cache_needs_purge) {
    $cloudflare_page_cache_needs_purge = TRUE;
    header( 'x-HTML-Edge-Cache: purgeall' );
  }
}

// Callbacks that something changed
function cloudflare_page_cache_init_action() {
	static $done = false;
	if ( $done ) {
		return;
  }
	// Post ID is received
	add_action( 'wp_trash_post', 'cloudflare_page_cache_purge1', 0 );
	add_action( 'publish_post', 'cloudflare_page_cache_purge1', 0 );
	add_action( 'edit_post', 'cloudflare_page_cache_purge1', 0 );
	add_action( 'delete_post', 'cloudflare_page_cache_purge1', 0 );
	add_action( 'publish_phone', 'cloudflare_page_cache_purge1', 0 );
	// Coment ID is received
	add_action( 'trackback_post', 'cloudflare_page_cache_purge2', 99 );
	add_action( 'pingback_post', 'cloudflare_page_cache_purge2', 99 );
	add_action( 'comment_post', 'cloudflare_page_cache_purge2', 99 );
	add_action( 'edit_comment', 'cloudflare_page_cache_purge2', 99 );
	add_action( 'wp_set_comment_status', 'cloudflare_page_cache_purge2', 99, 2 );
	// No post_id is available
	add_action( 'switch_theme', 'cloudflare_page_cache_purge1', 99 );
	add_action( 'edit_user_profile_update', 'cloudflare_page_cache_purge1', 99 );
	add_action( 'wp_update_nav_menu', 'cloudflare_page_cache_purge0' );
	add_action( 'clean_post_cache', 'cloudflare_page_cache_purge1' );
	add_action( 'transition_post_status', 'cloudflare_page_cache_post_transition', 10, 3 );
	$done = true;
}
add_action( 'init', 'cloudflare_page_cache_init_action' );

function cloudflare_page_cache_purge0() {
  cloudflare_page_cache_purge();
}
function cloudflare_page_cache_purge1( $param1 ) {
  cloudflare_page_cache_purge();
}
function cloudflare_page_cache_purge2( $param1, $param2="" ) {
  cloudflare_page_cache_purge();
}
function cloudflare_page_cache_post_transition( $new_status, $old_status, $post ) {
  global $cloudflare_page_cache_needs_purge;
  if ( $new_status != $old_status ) {
    cloudflare_page_cache_purge();
  }
}
