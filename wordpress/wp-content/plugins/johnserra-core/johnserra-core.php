<?php
/**
 * Plugin Name: John Serra Site Core
 * Description: Content model and headless REST extensions for johnserra.com.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * Author: John Serra
 * License: GPL-2.0-or-later
 * Text Domain: johnserra-core
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'JOHNSERRA_CORE_VERSION', '0.1.0' );
define( 'JOHNSERRA_CORE_FILE', __FILE__ );
define( 'JOHNSERRA_CORE_DIR', plugin_dir_path( __FILE__ ) );

require_once JOHNSERRA_CORE_DIR . 'includes/class-content-model.php';
require_once JOHNSERRA_CORE_DIR . 'includes/class-acf.php';
require_once JOHNSERRA_CORE_DIR . 'includes/class-translations.php';

add_action(
	'plugins_loaded',
	static function (): void {
		JohnSerra\Core\Content_Model::register();
		JohnSerra\Core\ACF::register();
		JohnSerra\Core\Translations::register();
	}
);

register_activation_hook(
	__FILE__,
	static function (): void {
		JohnSerra\Core\Content_Model::register_content_types();
		flush_rewrite_rules();
	}
);

register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );
