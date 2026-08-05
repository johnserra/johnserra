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

	public static function is_supported_post_type( string $post_type ): bool {
		return in_array( $post_type, self::SUPPORTED_POST_TYPES, true );
	}
}
