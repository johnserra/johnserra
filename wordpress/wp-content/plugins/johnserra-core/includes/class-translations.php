<?php

namespace JohnSerra\Core;

use WP_Error;
use WP_Post;
use WP_REST_Request;
use WP_REST_Response;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Translations {
	private const REST_NAMESPACE = 'js/v1';
	private const REST_ROUTE     = '/translation';
	private const META_LOCALE    = 'locale';
	private const META_GROUP_ID  = 'translation_group_id';
	private const META_PEER      = 'translation_peer';
	private const META_LEGACY_KEY = 'legacy_source_key';
	private const LOCALES        = array( 'en', 'tr' );

	private static bool $syncing = false;

	public static function register(): void {
		add_action( 'acf/save_post', array( self::class, 'assign_translation_group' ), 20 );
		add_action( 'rest_api_init', array( self::class, 'register_rest_route' ) );
		add_filter( 'acf/validate_value/key=' . ACF::FIELD_TRANSLATION_PEER, array( self::class, 'validate_peer' ), 10, 4 );

		foreach ( Content_Model::SUPPORTED_POST_TYPES as $post_type ) {
			add_filter( "rest_{$post_type}_collection_params", array( self::class, 'add_locale_collection_param' ) );
			add_filter( "rest_{$post_type}_query", array( self::class, 'filter_collection_by_locale' ), 10, 2 );
		}
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public static function add_locale_collection_param( array $params ): array {
		$params['js_locale'] = array(
			'description'       => __( 'Filter content by the John Serra locale field.', 'johnserra-core' ),
			'type'              => 'string',
			'enum'              => self::LOCALES,
			'sanitize_callback' => 'sanitize_key',
			'validate_callback' => static fn( $value ): bool => in_array( $value, self::LOCALES, true ),
		);
		$params['js_legacy_source_key'] = array(
			'description'       => __( 'Find content by its exact migration source key.', 'johnserra-core' ),
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_text_field',
			'validate_callback' => static fn( $value ): bool => is_string( $value ) && strlen( $value ) <= 255,
		);

		return $params;
	}

	/**
	 * @param array<string, mixed> $args
	 * @return array<string, mixed>
	 */
	public static function filter_collection_by_locale( array $args, WP_REST_Request $request ): array {
		$locale = (string) $request->get_param( 'js_locale' );
		$meta_query   = isset( $args['meta_query'] ) && is_array( $args['meta_query'] ) ? $args['meta_query'] : array();

		if ( in_array( $locale, self::LOCALES, true ) ) {
			$meta_query[] = array(
				'key'     => self::META_LOCALE,
				'value'   => $locale,
				'compare' => '=',
			);
		}

		$legacy_source_key = (string) $request->get_param( 'js_legacy_source_key' );
		if ( '' !== $legacy_source_key ) {
			$meta_query[] = array(
				'key'     => self::META_LEGACY_KEY,
				'value'   => $legacy_source_key,
				'compare' => '=',
			);
		}

		if ( empty( $meta_query ) ) {
			return $args;
		}

		$args['meta_query'] = $meta_query;

		return $args;
	}

	public static function register_rest_route(): void {
		\register_rest_route(
			self::REST_NAMESPACE,
			self::REST_ROUTE,
			array(
				'methods'             => 'GET',
				'callback'            => array( self::class, 'resolve_translation' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'content_id' => array(
						'description'       => __( 'Source WordPress content ID.', 'johnserra-core' ),
						'type'              => 'integer',
						'required'          => true,
						'minimum'           => 1,
						'sanitize_callback' => 'absint',
						'validate_callback' => static fn( $value ): bool => is_numeric( $value ) && (int) $value > 0,
					),
					'locale' => array(
						'description'       => __( 'Target locale.', 'johnserra-core' ),
						'type'              => 'string',
						'required'          => true,
						'enum'              => self::LOCALES,
						'sanitize_callback' => 'sanitize_key',
						'validate_callback' => static fn( $value ): bool => in_array( $value, self::LOCALES, true ),
					),
				),
			)
		);
	}

	/**
	 * @return WP_REST_Response|WP_Error
	 */
	public static function resolve_translation( WP_REST_Request $request ) {
		$content_id   = (int) $request->get_param( 'content_id' );
		$target_locale = (string) $request->get_param( 'locale' );
		$source        = get_post( $content_id );

		if ( ! $source instanceof WP_Post || ! self::is_public_source( $source ) ) {
			return new WP_Error( 'js_source_not_found', __( 'Published source content was not found.', 'johnserra-core' ), array( 'status' => 404 ) );
		}

		$group_id = self::get_field_value( self::META_GROUP_ID, $source->ID );
		if ( ! self::is_uuid( $group_id ) ) {
			return new WP_Error( 'js_translation_group_missing', __( 'The source has no valid translation group.', 'johnserra-core' ), array( 'status' => 404 ) );
		}

		$query = new \WP_Query(
			array(
				'post_type'              => $source->post_type,
				'post_status'            => 'publish',
				'posts_per_page'         => 2,
				'no_found_rows'          => true,
				'ignore_sticky_posts'    => true,
				'orderby'                => 'ID',
				'order'                  => 'ASC',
				'update_post_meta_cache' => true,
				'update_post_term_cache' => false,
				'meta_query'             => array(
					'relation' => 'AND',
					array(
						'key'     => self::META_GROUP_ID,
						'value'   => $group_id,
						'compare' => '=',
					),
					array(
						'key'     => self::META_LOCALE,
						'value'   => $target_locale,
						'compare' => '=',
					),
				),
			)
		);

		if ( 0 === count( $query->posts ) ) {
			return new WP_Error( 'js_translation_not_found', __( 'No published translation was found.', 'johnserra-core' ), array( 'status' => 404 ) );
		}

		if ( count( $query->posts ) > 1 ) {
			return new WP_Error( 'js_translation_ambiguous', __( 'Multiple published translations match this locale and group.', 'johnserra-core' ), array( 'status' => 409 ) );
		}

		$translation = $query->posts[0];

		return new WP_REST_Response(
			array(
				'id'                   => $translation->ID,
				'type'                 => $translation->post_type,
				'slug'                 => $translation->post_name,
				'locale'               => $target_locale,
				'translation_group_id' => $group_id,
				'link'                 => self::frontend_path( $translation, $target_locale ),
				'modified_gmt'         => get_post_modified_time( 'c', true, $translation ),
			),
			200
		);
	}

	/**
	 * @param mixed $valid
	 * @param mixed $value
	 * @param mixed $field
	 * @param mixed $input
	 * @return mixed
	 */
	public static function validate_peer( $valid, $value, $field, $input ) {
		unset( $field, $input );

		if ( true !== $valid || empty( $value ) ) {
			return $valid;
		}

		$post_id = function_exists( 'acf_get_form_data' ) ? absint( acf_get_form_data( 'post_id' ) ) : 0;
		$peer_id = absint( $value );
		$post    = get_post( $post_id );
		$peer    = get_post( $peer_id );

		if ( ! $peer instanceof WP_Post || ( $post instanceof WP_Post && $post->ID === $peer->ID ) ) {
			return __( 'Choose another valid content item as the translation.', 'johnserra-core' );
		}

		if ( ! Content_Model::is_supported_post_type( $peer->post_type ) || ( $post instanceof WP_Post && $post->post_type !== $peer->post_type ) ) {
			return __( 'Translations must use the same supported content type.', 'johnserra-core' );
		}

		$peer_peer_id = absint( self::get_field_value( self::META_PEER, $peer->ID ) );
		if ( $peer_peer_id && $peer_peer_id !== $post_id ) {
			return __( 'The selected content is already paired with another translation. Unpair it first.', 'johnserra-core' );
		}

		$post_locale = function_exists( 'acf_get_form_data' ) && isset( $_POST['acf'][ ACF::FIELD_LOCALE ] ) ? sanitize_key( wp_unslash( $_POST['acf'][ ACF::FIELD_LOCALE ] ) ) : ( $post instanceof WP_Post ? self::get_field_value( self::META_LOCALE, $post->ID ) : '' ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- ACF validates its own save nonce.
		$peer_locale = self::get_field_value( self::META_LOCALE, $peer->ID );

		if ( $post_locale && $peer_locale && $post_locale === $peer_locale ) {
			return __( 'Translations must use different locales.', 'johnserra-core' );
		}

		return $valid;
	}

	/** @param int|string $post_id */
	public static function assign_translation_group( $post_id ): void {
		$post_id = absint( $post_id );

		if ( self::$syncing || ! $post_id || wp_is_post_autosave( $post_id ) || wp_is_post_revision( $post_id ) ) {
			return;
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post || ! Content_Model::is_supported_post_type( $post->post_type ) ) {
			return;
		}

		self::$syncing = true;

		try {
			$peer_id  = absint( self::get_field_value( self::META_PEER, $post_id ) );
			$group_id = self::get_field_value( self::META_GROUP_ID, $post_id );
			$detached = self::detach_inbound_peers( $post_id, $peer_id );

			if ( $peer_id ) {
				$peer = get_post( $peer_id );
				if ( $peer instanceof WP_Post && $peer->post_type === $post->post_type && $peer->ID !== $post->ID ) {
					$peer_group_id = self::get_field_value( self::META_GROUP_ID, $peer_id );
					$group_id      = self::is_uuid( $peer_group_id ) ? $peer_group_id : ( self::is_uuid( $group_id ) ? $group_id : wp_generate_uuid4() );

					self::update_field_value( ACF::FIELD_TRANSLATION_GROUP_ID, self::META_GROUP_ID, $group_id, $peer_id );
					self::update_field_value( ACF::FIELD_TRANSLATION_PEER, self::META_PEER, $post_id, $peer_id );
				}
			}

			if ( ! $peer_id && $detached ) {
				$group_id = wp_generate_uuid4();
			}

			if ( ! self::is_uuid( $group_id ) ) {
				$group_id = wp_generate_uuid4();
			}

			self::update_field_value( ACF::FIELD_TRANSLATION_GROUP_ID, self::META_GROUP_ID, $group_id, $post_id );
		} finally {
			self::$syncing = false;
		}
	}

	private static function detach_inbound_peers( int $post_id, int $keep_peer_id ): bool {
		$query = new \WP_Query(
			array(
				'post_type'              => Content_Model::SUPPORTED_POST_TYPES,
				'post_status'            => 'any',
				'posts_per_page'         => -1,
				'fields'                 => 'ids',
				'no_found_rows'          => true,
				'ignore_sticky_posts'    => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
				'post__not_in'           => $keep_peer_id ? array( $keep_peer_id ) : array(),
				'meta_query'             => array(
					array(
						'key'     => self::META_PEER,
						'value'   => (string) $post_id,
						'compare' => '=',
					),
				),
			)
		);

		foreach ( $query->posts as $old_peer_id ) {
			$old_peer_id = absint( $old_peer_id );
			self::update_field_value( ACF::FIELD_TRANSLATION_PEER, self::META_PEER, '', $old_peer_id );
			self::update_field_value( ACF::FIELD_TRANSLATION_GROUP_ID, self::META_GROUP_ID, wp_generate_uuid4(), $old_peer_id );
		}

		return ! empty( $query->posts );
	}

	private static function is_public_source( WP_Post $post ): bool {
		return 'publish' === $post->post_status && Content_Model::is_supported_post_type( $post->post_type );
	}

	private static function get_field_value( string $name, int $post_id ): string {
		$value = function_exists( 'get_field' ) ? get_field( $name, $post_id, false ) : get_post_meta( $post_id, $name, true );

		return is_scalar( $value ) ? (string) $value : '';
	}

	/** @param int|string $value */
	private static function update_field_value( string $field_key, string $meta_key, $value, int $post_id ): void {
		if ( function_exists( 'update_field' ) ) {
			update_field( $field_key, $value, $post_id );
			return;
		}

		update_post_meta( $post_id, $meta_key, $value );
	}

	private static function is_uuid( string $value ): bool {
		return 1 === preg_match( '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value );
	}

	private static function frontend_path( WP_Post $post, string $locale ): string {
		$prefix = 'en' === $locale ? '' : '/' . $locale;

		if ( 'post' === $post->post_type ) {
			return $prefix . '/blog/' . $post->post_name;
		}

		if ( Content_Model::PROJECT_POST_TYPE === $post->post_type ) {
			return $prefix . '/projects/' . $post->post_name;
		}

		return $prefix . '/' . $post->post_name;
	}
}
