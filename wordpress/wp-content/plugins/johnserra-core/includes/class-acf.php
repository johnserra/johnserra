<?php

namespace JohnSerra\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
final class ACF {
	public const FIELD_LOCALE               = 'field_js_locale';
	public const FIELD_TRANSLATION_GROUP_ID = 'field_js_translation_group_id';
	public const FIELD_TRANSLATION_PEER     = 'field_js_translation_peer';

	public static function register(): void {
		add_filter( 'acf/settings/save_json', array( self::class, 'json_save_path' ) );
		add_filter( 'acf/settings/load_json', array( self::class, 'json_load_paths' ) );
		add_action( 'admin_notices', array( self::class, 'missing_acf_notice' ) );
	}

	public static function json_save_path( string $path ): string {
		unset( $path );

		return JOHNSERRA_CORE_DIR . 'acf-json';
	}

	/**
	 * @param array<int, string> $paths Existing ACF JSON load paths.
	 * @return array<int, string>
	 */
	public static function json_load_paths( array $paths ): array {
		$plugin_path = JOHNSERRA_CORE_DIR . 'acf-json';

		if ( ! in_array( $plugin_path, $paths, true ) ) {
			$paths[] = $plugin_path;
		}

		return $paths;
	}

	public static function missing_acf_notice(): void {
		if ( ! current_user_can( 'activate_plugins' ) || function_exists( 'acf_get_field_groups' ) ) {
			return;
		}

		printf(
			'<div class="notice notice-error"><p>%s</p></div>',
			esc_html__( 'John Serra Site Core requires Advanced Custom Fields. Activate ACF to load the content fields.', 'johnserra-core' )
		);
	}
}
