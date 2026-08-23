<?php

namespace JohnSerra\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
final class Content_Model {
	public const PROJECT_POST_TYPE = 'js_project';

	/** @var list<string> */
	public const SUPPORTED_POST_TYPES = array( 'post', 'page', self::PROJECT_POST_TYPE );

	public static function register(): void {
		add_action( 'init', array( self::class, 'register_content_types' ) );
		add_filter( 'pre_wp_unique_post_slug', array( self::class, 'allow_cross_locale_slug' ), 10, 6 );
	}

	public static function register_content_types(): void {
		register_post_type(
			self::PROJECT_POST_TYPE,
			array(
				'labels' => array(
					'name'                  => __( 'Projects', 'johnserra-core' ),
					'singular_name'         => __( 'Project', 'johnserra-core' ),
					'add_new_item'          => __( 'Add New Project', 'johnserra-core' ),
					'edit_item'             => __( 'Edit Project', 'johnserra-core' ),
					'new_item'              => __( 'New Project', 'johnserra-core' ),
					'view_item'             => __( 'View Project', 'johnserra-core' ),
					'search_items'          => __( 'Search Projects', 'johnserra-core' ),
					'not_found'             => __( 'No projects found.', 'johnserra-core' ),
					'not_found_in_trash'    => __( 'No projects found in Trash.', 'johnserra-core' ),
					'all_items'             => __( 'All Projects', 'johnserra-core' ),
					'item_published'        => __( 'Project published.', 'johnserra-core' ),
					'item_updated'          => __( 'Project updated.', 'johnserra-core' ),
				),
				'public'              => true,
				'publicly_queryable'  => false,
				'exclude_from_search' => true,
				'show_ui'             => true,
				'show_in_menu'        => true,
				'show_in_rest'        => true,
				'rest_base'           => 'projects',
				'menu_icon'           => 'dashicons-portfolio',
				'has_archive'         => false,
				'rewrite'             => false,
				'supports'            => array(
					'title',
					'editor',
					'excerpt',
					'thumbnail',
					'revisions',
					'custom-fields',
				),
				'taxonomies'          => array( 'post_tag' ),
				'show_in_nav_menus'   => false,
			)
		);

		register_taxonomy_for_object_type( 'post_tag', self::PROJECT_POST_TYPE );
	}

	/**
	 * Permit the same slug when every conflicting record belongs to another locale.
	 *
	 * @param string|null $override_slug Pre-filtered slug override.
	 * @param mixed       $post_id WordPress post ID.
	 */
	public static function allow_cross_locale_slug(
		$override_slug,
		$slug,
		$post_id,
		$post_status,
		$post_type,
		$post_parent
	) {
		unset( $post_status, $post_parent );
		$post_id   = absint( $post_id );
		$slug      = (string) $slug;
		$post_type = (string) $post_type;

		if ( null !== $override_slug || ! self::is_supported_post_type( $post_type ) ) {
			return $override_slug;
		}

		$locale = (string) get_post_meta( $post_id, 'locale', true );
		if ( ! in_array( $locale, array( 'en', 'tr' ), true ) ) {
			return null;
		}

		$conflicts = get_posts(
			array(
				'name'           => $slug,
				'post_type'      => $post_type,
				'post_status'    => array( 'publish', 'future', 'draft', 'pending', 'private' ),
				'post__not_in'   => array( $post_id ),
				'posts_per_page' => -1,
			)
		);

		foreach ( $conflicts as $conflict ) {
			if ( $locale === (string) get_post_meta( $conflict->ID, 'locale', true ) ) {
				return null;
			}
		}

		return $slug;
	}

	public static function is_supported_post_type( string $post_type ): bool {
		return in_array( $post_type, self::SUPPORTED_POST_TYPES, true );
	}
}
