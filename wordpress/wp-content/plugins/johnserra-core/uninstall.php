<?php
/**
 * Data is intentionally retained on uninstall.
 *
 * Removing site content or ACF metadata automatically would make rollback and
 * incident recovery unsafe. A separately reviewed migration must delete data.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
